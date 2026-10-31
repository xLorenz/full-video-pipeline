#!/usr/bin/env python3
"""import_sfx_pack.py — import an external SFX pack into the catalog.

The catalog is data-driven (`sfx/sounds/<id>/config.json` + `sfx/assets/`), so
importing a pack is: transcode each source into a tidy, peak-safe MP3, measure
it, write the catalog entry, register the SHA-256, regenerate CATALOG.md.

Per entry:
  1. probe the source (duration, audio stream, leading silence)
  2. strip leading silence (20 ms pre-roll keeps the attack), trim to
     `max_seconds` with a smooth fade-out so a long clip cannot run over the
     next beat
  3. peak-limit the encode to `--peak-ceiling` dBFS (only ever attenuates)
  4. measure the written asset (loudest 400 ms, peak, integrated LUFS)
  5. write `sfx/sounds/<id>/{config.json,sfx.md}`, upsert `sfx/assets/manifest.json`

Loudness is NOT baked in: the engine matches every sample against the measured
voiceover at mix time (see `sfx/SCHEMA.md`). The importer only records what it
measured, for auditability.

Usage:
  python3 import_sfx_pack.py <src_dir> --plan <plan.json> [--dry-run]
  python3 import_sfx_pack.py <src_dir> --plan <plan.json> --only mc_oof,flash
  python3 import_sfx_pack.py <src_dir> --plan <plan.json> --force
  python3 import_sfx_pack.py <src_dir> --plan <plan.json> --check

Plan format (JSON): {"entries": [{source, id, family, aliases, tags, moods,
default_volume, description, use, avoid, max_seconds?, fade_out?}]}
"""

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_sfx as g          # noqa: E402  (decode + loudness primitives)
import sfx_catalog as sfx         # noqa: E402

REPO_ROOT = sfx.REPO_ROOT
SR = 44100
PRE_ROLL_SECONDS = 0.02        # keep the attack transient when stripping silence
FADE_IN_SECONDS = 0.005        # click guard (encoder/DC step)
DEFAULT_MAX_SECONDS = 8.0
DEFAULT_FADE_OUT = 0.3
DEFAULT_BITRATE = "192k"
ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")


# ---------------------------------------------------------------------------
# ffmpeg helpers
# ---------------------------------------------------------------------------


def _run(cmd):
    # ffmpeg/ffprobe emit UTF-8 regardless of the console codepage; without an
    # explicit encoding Python decodes with cp1252 and dies on non-ASCII bytes.
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def probe(path):
    """-> {"duration", "codec", "sample_rate", "channels"} via ffprobe."""
    r = _run(["ffprobe", "-v", "error", "-select_streams", "a:0",
              "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
              "-of", "json", str(path)])
    if r.returncode != 0:
        raise RuntimeError(f"ffprobe failed on {path}: {r.stderr.strip()[:400]}")
    data = json.loads(r.stdout or "{}")
    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError(f"no audio stream in {path}")
    s = streams[0]
    fmt = data.get("format") or {}
    return {
        "duration": float(fmt.get("duration") or 0.0),
        "codec": s.get("codec_name"),
        "sample_rate": int(s.get("sample_rate") or 0),
        "channels": int(s.get("channels") or 0),
    }


def leading_silence(path, noise_db=-45, min_len=0.05):
    """Seconds of near-silence at the very start of `path` (0.0 when none)."""
    r = _run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
              "-af", f"silencedetect=n={noise_db}dB:d={min_len}", "-f", "null", "-"])
    text = r.stdout + r.stderr
    starts = [float(m) for m in re.findall(r"silence_start:\s*([-\d.]+)", text)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*([-\d.]+)", text)]
    if starts and abs(starts[0]) < 0.01 and ends:
        return max(0.0, ends[0])
    return 0.0


def integrated_lufs(path):
    """Last ebur128 integrated value, or None (short clips never gate)."""
    r = _run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
              "-filter_complex", "ebur128", "-f", "null", "-"])
    vals = re.findall(r"^\s*I:\s*([-\d.]+)\s*LUFS",
                      r.stdout + r.stderr, re.MULTILINE)
    if not vals:
        return None
    v = float(vals[-1])
    return None if v <= -69.9 else v          # -70 is ebur128's init floor, not a level


def transcode(src, out, start, duration, fade_out, bitrate, gain_db=0.0):
    """Write one tidy asset: mono, 44.1 kHz, optional fades, peak ceiling."""
    chain = []
    if start <= 0.0:
        # No pre-roll silence to hide the edit: ramp the attack just enough to
        # kill the DC step, short enough to be inaudible on a transient.
        chain.append(f"afade=t=in:st=0:d={FADE_IN_SECONDS:.3f}")
    if fade_out > 0.0:
        fade_out = min(fade_out, duration / 2.0)
        fade_start = max(0.0, duration - fade_out)
        chain.append(f"afade=t=out:st={fade_start:.3f}:d={fade_out:.3f}")
    if abs(gain_db) > 1e-4:
        chain.append(f"volume={gain_db:.2f}dB")
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-y",
           "-ss", f"{start:.4f}", "-t", f"{duration:.4f}", "-i", str(src),
           "-map", "0:a:0", "-vn", "-sn", "-dn",
           "-ac", "1", "-ar", str(SR)]
    if chain:
        cmd += ["-af", ",".join(chain)]
    cmd += ["-c:a", "libmp3lame", "-b:a", bitrate, str(out)]
    r = _run(cmd)
    if r.returncode != 0 or not out.exists():
        raise RuntimeError(f"ffmpeg transcode failed: {r.stderr.strip()[-600:]}")


def measure_asset(path):
    """Measure a written asset the same way the mix engine will see it."""
    samples = g.decode_to_floats(path)
    info = probe(path)
    lufs = integrated_lufs(path)
    return {
        "duration_seconds": round(info["duration"], 3),
        "loudest_400ms_dbfs": round(g.loudest_window_db(samples, SR), 1),
        "true_peak_dbfs": round(g.peak_dbfs(samples), 1),
        "integrated_lufs": None if lufs is None else round(lufs, 1),
    }


# ---------------------------------------------------------------------------
# Catalog writing
# ---------------------------------------------------------------------------


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return re.sub(r"_+", "_", s)


def asset_relpath(entry, fmt):
    return f"pack/{slug(entry['family'])}/{entry['id']}.{fmt}"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def upsert_manifest(rel, digest):
    data = sfx._load_manifest() or {"version": 2, "files": []}
    files = [e for e in data.get("files", []) if e.get("file") != rel]
    files.append({"file": rel, "sha256": digest})
    files.sort(key=lambda e: e["file"])
    data["files"] = files
    data.setdefault("version", 2)
    tmp = sfx.MANIFEST_PATH.with_name(sfx.MANIFEST_PATH.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(sfx.MANIFEST_PATH)


def write_config(entry, measured, asset):
    """config.json for an imported sample. `level.mode` stays auto."""
    cfg = {
        "sound": entry["id"],
        "aliases": [a for a in (entry.get("aliases") or []) if a != entry["id"]],
        "backend": "sample",
        "asset": asset,
        "source": entry["source"],
        "tags": list(entry["tags"]),
        "moods": list(entry["moods"]),
        "default_volume": round(float(entry["default_volume"]), 2),
        "max_tail_seconds": round(max(0.5, min(measured["duration_seconds"], 4.0)), 2),
        "params": {},
        "description": entry["description"].strip(),
        "level": {
            "mode": "auto",
            "trim_db": round(float(entry.get("trim_db") or 0.0), 1),
            "measured": {
                k: measured[k] for k in (
                    "duration_seconds", "integrated_lufs", "true_peak_dbfs",
                    "loudest_400ms_dbfs") if measured.get(k) is not None
            },
        },
    }
    out = sfx.SOUNDS_DIR / entry["id"] / "config.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cfg, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return out, cfg


def write_manual(cfg, entry, measured):
    """sfx.md — the manual an agent reads instead of listening."""
    dur = measured["duration_seconds"]
    lead = float(entry.get("_trimmed_from") or 0.0)
    origin = f"{dur:.2f} s, mono 44.1 kHz MP3"
    if lead > 0:
        origin += f", trimmed from {lead:.2f} s with a fade-out"
    use = entry.get("use") or []
    avoid = entry.get("avoid") or []
    name = entry["id"]
    lines = [
        f"# {name}",
        "",
        f"{cfg['description']}",
        "",
        f"Moods: {', '.join(cfg['moods'])}",
        "",
        f"Sample (`{cfg['asset']}`, {origin}). Imported from the pack: "
        f"`{entry['source']}`.",
        "",
        "## When to use",
    ]
    lines += [f"- {u}" for u in use] or ["- a literal, matching on-screen moment"]
    lines += ["", "## When NOT to use"]
    lines += [f"- {a}" for a in avoid] or ["- as filler between beats"]
    lines += [
        "",
        "## Parameters",
        "Sample playback — the engine matches this sound's loudness to the measured",
        "voiceover automatically, so `volume` sets relative prominence only:",
        "",
        "| param | default | meaning |",
        "|---|---|---|",
        "| `duration` | whole file | trim to N seconds (tail fades over `fade`) |",
        "| `fade` | 0.12 | tail fade length in seconds when trimmed |",
        "| `offset` | 0.0 | skip N seconds in (pick a later hit) |",
        "| `gain_db` | 0.0 | manual level nudge after matching |",
        "| `pitch` | 1.0 | playback speed/pitch factor (2.0 = octave up, half length) |",
        "",
        "## Examples",
        f'{{ "sound": "{name}", "when": "beat:reveal", "volume": {cfg["default_volume"]:.2f} }}',
    ]
    if dur > 2.5:
        lines.append(
            f'{{ "sound": "{name}", "when": "beat:reveal", '
            f'"params": {{ "duration": 1.5, "fade": 0.3 }} }}')
    out = sfx.SOUNDS_DIR / name / "sfx.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# Import driver
# ---------------------------------------------------------------------------


def load_plan(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    entries = data["entries"] if isinstance(data, dict) else data
    seen = {}
    errors = []
    for e in entries:
        for key in ("source", "id", "family", "tags", "moods",
                    "default_volume", "description"):
            if key not in e:
                errors.append(f"entry {e.get('id') or e.get('source')}: missing '{key}'")
        if not ID_RE.match(e.get("id") or ""):
            errors.append(f"entry {e.get('id')!r}: id must match {ID_RE.pattern}")
        if e["id"] in seen:
            errors.append(f"entry {e['id']}: duplicate id")
        seen[e["id"]] = e
        bad_tags = set(e.get("tags") or []) - set(sfx.TAGS)
        if bad_tags:
            errors.append(f"entry {e['id']}: unknown tags {sorted(bad_tags)}")
        bad_moods = set(e.get("moods") or []) - set(sfx.MOODS)
        if bad_moods:
            errors.append(f"entry {e['id']}: unknown moods {sorted(bad_moods)}")
        v = float(e.get("default_volume", -1))
        if not 0.0 <= v <= 1.0:
            errors.append(f"entry {e['id']}: default_volume {v} outside 0..1")
    if errors:
        print("PLAN ERRORS:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(2)
    return entries


def check_alias_collisions(entries):
    """Ids/aliases must not shadow a different existing catalog entry."""
    defs = sfx.load_sound_defs()
    plan_ids = {e["id"] for e in entries}
    existing_aliases = {a: d.sound for d in defs.values() for a in d.aliases}
    plan_aliases = {}
    errors = []
    for e in entries:
        existing = defs.get(e["id"])
        if existing is not None and existing.asset and not str(existing.asset).startswith("pack/"):
            errors.append(f"{e['id']}: id already used by a bundled asset ({existing.asset})")
        for alias in e.get("aliases") or []:
            if alias == e["id"]:
                continue
            if alias in plan_aliases and plan_aliases[alias] != e["id"]:
                errors.append(f"{e['id']}: alias '{alias}' duplicates {plan_aliases[alias]}")
            plan_aliases.setdefault(alias, e["id"])
            if alias in plan_ids and alias != e["id"]:
                errors.append(f"{e['id']}: alias '{alias}' is another plan entry's id")
            elif alias in defs and alias not in plan_ids:
                errors.append(f"{e['id']}: alias '{alias}' is already a catalogued sound")
            if alias in existing_aliases and existing_aliases[alias] != e["id"]:
                errors.append(f"{e['id']}: alias '{alias}' is already an alias of "
                              f"'{existing_aliases[alias]}'")
    return errors


def import_entry(entry, src_root, args, defs_before):
    src = src_root / entry["source"]
    if not src.exists():
        raise FileNotFoundError(f"source missing: {src}")
    info = probe(src)
    lead = leading_silence(src)
    start = max(0.0, lead - PRE_ROLL_SECONDS)
    max_seconds = float(entry.get("max_seconds") or args.max_seconds)
    avail = max(0.05, info["duration"] - start)
    duration = min(avail, max_seconds)
    trimmed = duration < avail - 0.01
    if trimmed:
        fade_out = float(entry.get("fade_out") or args.fade_out)
    else:
        # Never fade the body of a short one-shot; give longer tails a gentle
        # 80 ms landing so the encoder's last frames cannot ring.
        fade_out = 0.08 if duration > 0.6 else 0.0

    rel = asset_relpath(entry, args.format)
    out = sfx.ASSETS_DIR / rel
    out.parent.mkdir(parents=True, exist_ok=True)

    # Peak-limit the SOURCE (attenuate only) so lossy encoding cannot clip.
    src_peak = g.peak_dbfs(g.decode_to_floats(src))
    gain_db = min(0.0, args.peak_ceiling - src_peak)

    if args.dry_run:
        print(f"  [dry-run] {entry['id']:<18} {entry['source']:<55} "
              f"lead={lead:5.2f}s dur={duration:5.2f}s fade={fade_out:4.2f}s "
              f"gain={gain_db:+5.1f}dB -> {rel}")
        return {"id": entry["id"], "asset": rel, "dry_run": True}

    tmp = Path(tempfile.mkdtemp(prefix="sfximport_"))
    try:
        transcode(src, out, start, duration, fade_out, args.bitrate, gain_db)
        measured = measure_asset(out)
        if measured["true_peak_dbfs"] > args.peak_ceiling + 0.2:
            # lossy overshoot — re-encode once with the measured correction
            extra = args.peak_ceiling - measured["true_peak_dbfs"]
            transcode(src, out, start, duration, fade_out, args.bitrate, gain_db + extra)
            measured = measure_asset(out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    entry["_trimmed_from"] = round(avail, 2) if trimmed else 0.0
    cfg_path, cfg = write_config(entry, measured, rel)
    md_path = write_manual(cfg, entry, measured)
    upsert_manifest(rel, sha256_file(out))
    entry.pop("_trimmed_from", None)

    old = defs_before.get(entry["id"])
    action = "updated" if old is not None else "added"
    size_kb = out.stat().st_size / 1024
    print(f"  {action:<8} {entry['id']:<18} {measured['duration_seconds']:5.2f}s "
          f"L400={measured['loudest_400ms_dbfs']:6.1f} pk={measured['true_peak_dbfs']:5.1f} "
          f"{size_kb:6.0f} KB  {rel}")
    return {"id": entry["id"], "asset": rel, "config": str(cfg_path), "md": str(md_path),
            "measured": {k: v for k, v in measured.items()}}


def status_of(entry, args):
    cfg_path = sfx.SOUNDS_DIR / entry["id"] / "config.json"
    rel = asset_relpath(entry, args.format)
    asset = sfx.ASSETS_DIR / rel
    if not cfg_path.exists() or not asset.exists():
        return "missing"
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return "corrupt"
    if cfg.get("asset") != rel or cfg.get("source") != entry["source"]:
        return "stale"
    return "ok"


def main():
    ap = argparse.ArgumentParser(description="Import an SFX pack into the catalog")
    ap.add_argument("src_dir", help="Pack root directory")
    ap.add_argument("--plan", required=True, help="Curation plan JSON")
    ap.add_argument("--format", default="mp3", choices=["mp3", "wav"])
    ap.add_argument("--bitrate", default=DEFAULT_BITRATE)
    ap.add_argument("--max-seconds", type=float, default=DEFAULT_MAX_SECONDS,
                    help="Hard cap per asset (long clips are trimmed with a fade)")
    ap.add_argument("--fade-out", type=float, default=DEFAULT_FADE_OUT,
                    help="Fade-out length when a clip is trimmed")
    ap.add_argument("--peak-ceiling", type=float, default=-1.0,
                    help="dBFS the encoded asset must stay under (attenuate only)")
    ap.add_argument("--only", default="", help="Comma-separated ids to import")
    ap.add_argument("--force", action="store_true", help="Re-import entries that exist")
    ap.add_argument("--dry-run", action="store_true", help="Show the plan, write nothing")
    ap.add_argument("--check", action="store_true",
                    help="Report plan status (ok/missing/stale) and exit")
    ap.add_argument("--no-catalog-md", action="store_true",
                    help="Do not regenerate sfx/CATALOG.md")
    args = ap.parse_args()

    src_root = Path(args.src_dir).resolve()
    if not src_root.is_dir():
        print(f"ERROR: pack directory not found: {src_root}")
        sys.exit(2)
    entries = load_plan(args.plan)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        unknown = only - {e["id"] for e in entries}
        if unknown:
            print(f"ERROR: --only ids not in plan: {sorted(unknown)}")
            sys.exit(2)
        entries = [e for e in entries if e["id"] in only]

    collisions = check_alias_collisions(entries)
    if collisions:
        print("PLAN COLLISIONS:")
        for err in collisions:
            print(f"  - {err}")
        sys.exit(2)

    if args.check:
        counts = {}
        for e in entries:
            st = status_of(e, args)
            counts[st] = counts.get(st, 0) + 1
            if st != "ok":
                print(f"  {st:<8} {e['id']:<18} {e['source']}")
        print("status: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
        sys.exit(0 if counts.get("missing", 0) + counts.get("stale", 0)
                 + counts.get("corrupt", 0) == 0 else 1)

    defs_before = sfx.load_sound_defs()
    print(f"Importing {len(entries)} sounds from {src_root} -> sfx/assets/pack/")
    done, skipped, failed = [], [], []
    for entry in entries:
        st = status_of(entry, args)
        if st == "ok" and not args.force:
            skipped.append(entry["id"])
            continue
        try:
            done.append(import_entry(entry, src_root, args, defs_before))
        except Exception as exc:                      # noqa: BLE001 — report, keep going
            failed.append((entry["id"], str(exc)))
            print(f"  FAILED   {entry['id']:<18} {exc}")

    if not args.dry_run and not args.no_catalog_md:
        written = sfx.write_catalog_md()
        print(f"  regenerated {written.relative_to(REPO_ROOT)}")
    if not args.dry_run:
        print(f"\n  imported {len(done)}, skipped {len(skipped)} (already present, --force to redo), "
              f"failed {len(failed)}")
        if done:
            print("  next: python scripts/sfx_catalog.py && "
                  "python scripts/export_sfx_preview.py --catalog")
    if failed:
        print("FAILURES:")
        for sid, msg in failed:
            print(f"  - {sid}: {msg}")
        sys.exit(1)


if __name__ == "__main__":
    main()
