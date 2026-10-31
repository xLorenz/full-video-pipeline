#!/usr/bin/env python3
"""sfx_catalog.py — the SFX sound registry.

Single source of truth for the sfx/ catalog: sound discovery, config validation,
id/alias resolution, and fuzzy candidates. No other
module hard-codes sound ids, moods, or tags — import from here.

Pipeline rule served: "character certainty by metadata" (moods conformance) and
"100% local / 100% free" (curated catalog, no network).
"""

import difflib
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError, OSError):
    pass

REPO_ROOT = Path(__file__).resolve().parent.parent
SFX_DIR = REPO_ROOT / "sfx"
SOUNDS_DIR = SFX_DIR / "sounds"
ASSETS_DIR = SFX_DIR / "assets"
MANIFEST_PATH = ASSETS_DIR / "manifest.json"
SFX_SCHEMA_PATH = REPO_ROOT / "schemas" / "sfx.schema.json"

CATALOG_VERSION = 11  # v11: +55 imported pack samples (mechanical / video games / wooshes-hits)
                      # v10: samples loudness-matched against the measured voiceover;
                      #      per-cue sample params (duration/fade/offset/gain_db/pitch)
                      # v9: +quiet_signal BGM bed (76 bpm techno); clear_skies moods retuned
                      # v8: +clear_skies BGM asset bed (piano, vendored Salamander samples)
                      # v7: +neon_drop BGM asset bed (looping-tail arrangement)
                      # v6: +3 tone sounds (page_turn, sonar_ping, heartbeat)
                      # v5: all 27 cues moved to the tone engine, Python synth engine removed
                      # v4: +5 tone sounds (success, warning, toggle, bounce, stamp); v3: batch-1 -> tone engine

MOODS = ("serious", "tense", "calm", "neutral", "playful", "humorous", "upbeat", "glitch")
TAGS = ("transition", "emphasis", "impact", "ui", "organic", "riser", "glitch",
        "ambient", "accent")

# Canonical mood list. scenes.schema.json mood / style.mood enum == MOODS − {"glitch"}
# (see PHASE-01 §1.2). `glitch` is a visual-treatment mood reserved for catalog sounds,
# not a video or scene mood. Keep this note and the schema enum in lockstep.

# BGM beds implemented in generate_sfx.py — metadata lives here, recipes there.
# An entry with "asset" is a pre-rendered arrangement bed: the asset's head
# plays once, then [loop_start_seconds, loop_end_seconds) tiles forever.
BGM_TRACKS = {
    "pulse_light":     {"bpm": 112, "moods": ("neutral", "calm", "upbeat"), "energy": "low"},
    "pulse_dark":      {"bpm": 95,  "moods": ("serious", "tense"),          "energy": "mid"},
    "ambient_calm":    {"bpm": None, "moods": ("calm", "serious", "neutral"), "energy": "none"},
    "tension_riser":   {"bpm": None, "moods": ("tense", "serious"),         "energy": "rising"},
    "groove_light":    {"bpm": 116, "moods": ("upbeat", "playful", "neutral"), "energy": "mid"},
    "drone_dark":      {"bpm": None, "moods": ("serious", "tense", "calm"),    "energy": "none"},
    "neon_drop":       {"bpm": 140, "moods": ("serious", "tense", "upbeat"), "energy": "high",
                        "asset": "bgm/neon_drop.wav",
                        "loop_start_seconds": 82.285714285714,
                        "loop_end_seconds": 109.714285714286},
    "clear_skies":     {"bpm": 94.5, "moods": ("playful", "upbeat", "neutral"), "energy": "mid",
                        "asset": "bgm/clear_skies.wav",
                        # 94.5 bpm → one bar = exactly 112,000 samples @ 44.1 kHz, so the
                        # head (32 bars) and the loop (16 bars) land on the sample grid.
                        "loop_start_seconds": 81.26984126984127,
                        "loop_end_seconds": 121.90476190476191},
    "quiet_signal":    {"bpm": 76, "moods": ("upbeat", "tense", "serious"), "energy": "high",
                        "asset": "bgm/quiet_signal.wav",
                        # 76 bpm puts a bar at 139,263.16 samples, so the head (12 bars)
                        # and loop (4 bars) are rounded to the nearest sample.
                        "loop_start_seconds": 37.894739229025,
                        "loop_end_seconds": 50.526326530612},
}


@dataclass
class ParamDef:
    type: str                    # number | boolean | string
    minimum: float | None = None
    maximum: float | None = None
    default: object = None
    description: str = ""


@dataclass
class SoundDef:
    sound: str
    aliases: tuple
    backend: str                 # "sample" | "tone"
    recipe: str | None = None    # tone only
    asset: str | None = None     # sample only
    tags: tuple = ()
    moods: tuple = ()
    default_volume: float = 0.5
    max_tail_seconds: float = 2.0
    params: dict = field(default_factory=dict)   # {param_name: ParamDef}
    description: str = ""
    path: Path | None = None     # sounds/<id>/
    level: dict = field(default_factory=dict)    # sample only: mode/trim_db/measured


# Sample-backed sounds get these params for free — no per-config boilerplate, and
# hand-written configs inherit them. They shape ONE cue of an asset without a
# re-import (trim/level/pitch), while the asset itself stays pristine.
SAMPLE_PARAMS = {
    "duration": ParamDef(
        type="number", minimum=0.05, maximum=30.0, default=None,
        description="Trim this cue to N seconds (tail fade of `fade` seconds inside "
                    "the window). Omit to play the whole asset."),
    "fade": ParamDef(
        type="number", minimum=0.0, maximum=2.0, default=0.12,
        description="Tail fade length in seconds when `duration` (or `offset`) trims the cue."),
    "offset": ParamDef(
        type="number", minimum=0.0, maximum=30.0, default=0.0,
        description="Skip N seconds into the asset before playing (pick a later hit)."),
    "gain_db": ParamDef(
        type="number", minimum=-24.0, maximum=6.0, default=0.0,
        description="Manual per-cue level nudge applied after automatic loudness matching."),
    "pitch": ParamDef(
        type="number", minimum=0.5, maximum=2.0, default=1.0,
        description="Playback speed/pitch factor (1.0 = original)."),
}


def _load_manifest() -> dict:
    """manifest.json contents; {} when missing, invalid, or not a JSON object."""
    if not MANIFEST_PATH.exists():
        return {}
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def hash_manifest_file(rel_name: str) -> str | None:
    """SHA-256 hex of ASSETS_DIR / rel_name, None on missing file."""
    p = ASSETS_DIR / rel_name
    if not p.exists():
        return None
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_catalog() -> list[str]:
    """Validate every sfx/sounds/<id>/config.json against schema + registry.

    Returns a sorted list of error strings; empty list == catalog OK.
    """
    import jsonschema

    errors = []
    with open(SFX_SCHEMA_PATH, encoding="utf-8") as f:
        schema = json.load(f)
    try:
        manifest_hashes = {e["file"]: e["sha256"]
                           for e in _load_manifest().get("files", [])
                           if isinstance(e, dict) and "file" in e and "sha256" in e}
    except (AttributeError, TypeError):
        return [f"{SFX_SCHEMA_PATH}: malformed manifest.json"]

    if not SOUNDS_DIR.is_dir():
        return [f"{SOUNDS_DIR}: missing catalog directory"]

    import tone_render as _tone
    seen_ids = {}        # id -> config rel path (duplicate ids otherwise silently overwrite)
    seen_aliases = {}    # alias -> canonical id
    for cfg_path in sorted(SOUNDS_DIR.glob("*/config.json")):
        rel = str(cfg_path.relative_to(REPO_ROOT)).replace("\\", "/")
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f"{rel}: invalid JSON — {e}")
            continue
        try:
            jsonschema.validate(cfg, schema)
        except jsonschema.ValidationError as e:
            errors.append(f"{rel}: schema error — {e.message}")
            continue
        sid = cfg.get("sound")
        if sid in seen_ids:
            errors.append(f"{rel}: duplicate sound id '{sid}' (already defined by {seen_ids[sid]})")
        else:
            seen_ids[sid] = rel
        for alias in cfg.get("aliases") or []:
            if alias in seen_ids or alias in seen_aliases:
                other = seen_ids.get(alias) or seen_aliases.get(alias)
                errors.append(f"{rel}: alias '{alias}' collides with '{other}'")
            else:
                seen_aliases[alias] = sid
        if cfg.get("backend") == "tone":
            recipe = cfg.get("recipe")
            if not recipe:
                errors.append(f"{rel}: tone backend requires a 'recipe' name")
            err = _tone.check_recipe_syntax(cfg.get("sound"))
            if err:
                errors.append(err)
        elif cfg.get("backend") == "sample":
            asset = cfg.get("asset")
            actual = hash_manifest_file(asset) if asset else None
            expected = manifest_hashes.get(asset)
            if actual is None or expected is None or actual != expected:
                errors.append(f"{rel}: asset '{asset}' missing or SHA-256 mismatch vs manifest.json")
        for name, pdef in (cfg.get("params") or {}).items():
            if pdef.get("type") == "number":
                lo = pdef.get("minimum")
                hi = pdef.get("maximum")
                if lo is not None and hi is not None and lo > hi:
                    errors.append(f"{rel}: param '{name}' minimum {lo} > maximum {hi}")
            if "default" not in pdef:
                errors.append(f"{rel}: param '{name}' missing default")
    return sorted(errors)


def _param_def_from_config(pdef: dict) -> ParamDef:
    return ParamDef(
        type=pdef.get("type", "number"),
        minimum=pdef.get("minimum"),
        maximum=pdef.get("maximum"),
        default=pdef.get("default"),
        description=pdef.get("description", ""),
    )


def load_sound_defs() -> dict[str, SoundDef]:
    """Return {sound_id: SoundDef}. Skips (WARN to stderr) any invalid entry."""
    defs = {}
    if not SOUNDS_DIR.is_dir():
        return defs
    for cfg_path in sorted(SOUNDS_DIR.glob("*/config.json")):
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"WARN: {cfg_path.name}: invalid JSON — {e}", file=sys.stderr)
            continue
        sound = cfg.get("sound")
        if not sound:
            print(f"WARN: {cfg_path.name}: missing 'sound' id", file=sys.stderr)
            continue
        backend = cfg.get("backend", "tone")
        if backend == "sample":
            params = dict(SAMPLE_PARAMS)
        else:
            params = {}
        params.update({name: _param_def_from_config(p)
                       for name, p in (cfg.get("params") or {}).items()})
        level = cfg.get("level") if isinstance(cfg.get("level"), dict) else {}
        defs[sound] = SoundDef(
            sound=sound,
            aliases=tuple(cfg.get("aliases") or ()),
            backend=backend,
            recipe=cfg.get("recipe"),
            asset=cfg.get("asset"),
            tags=tuple(cfg.get("tags") or ()),
            moods=tuple(cfg.get("moods") or ()),
            default_volume=float(cfg.get("default_volume", 0.5)),
            max_tail_seconds=float(cfg.get("max_tail_seconds", 2.0)),
            params=params,
            description=cfg.get("description", ""),
            path=cfg_path.parent,
            level=level,
        )
    return defs


def resolve_sound(name: str, defs: dict[str, SoundDef] | None = None) -> SoundDef | None:
    """Resolve a cue's `sound` field: exact id, then case-insensitive alias. None if unknown."""
    if not isinstance(name, str):
        return None
    if defs is None:
        defs = load_sound_defs()
    key = name.strip()
    if not key:
        return None
    if key in defs:
        return defs[key]
    lowered = key.lower()
    for sound, d in defs.items():
        if sound.lower() == lowered:
            return d
    for sound, d in defs.items():
        for alias in d.aliases:
            if alias.lower() == lowered:
                return d
    return None


def fuzzy_candidates(name: str, limit: int = 3) -> list[str]:
    """Close matches against ids + aliases (difflib); returns canonical ids only."""
    defs = load_sound_defs()
    ids = list(defs)
    names = ids + [a for d in defs.values() for a in d.aliases]
    matches = difflib.get_close_matches(name.lower(), names, n=limit, cutoff=0.5)
    out, seen = [], set()
    for m in matches:
        for sound, d in defs.items():
            if sound == m or m in d.aliases:
                if sound not in seen:
                    seen.add(sound)
                    out.append(sound)
                break
    return out


def resolve_bgm_track(track: str) -> bool:
    """True if track is a known BGM bed id (case-insensitive, like resolve_sound)."""
    if not isinstance(track, str):
        return False
    lowered = track.strip().lower()
    return any(t.lower() == lowered for t in BGM_TRACKS)


def param_defaults(sound: SoundDef) -> dict:
    """{param_name: default} for every param of the sound."""
    return {name: p.default for name, p in sound.params.items()}


def validate_cue_params(sound: SoundDef, params: dict | None) -> list[str]:
    """Validate cue params against the sound's ParamDefs. Returns error strings."""
    errors = []
    params = params or {}
    known = set(sound.params)
    for k in params:
        if k not in known:
            errors.append(
                f"unknown param '{k}' for sound '{sound.sound}' (known: {', '.join(sorted(known)) or 'none'})"
            )
            continue
        pdef = sound.params[k]
        v = params[k]
        if pdef.type == "number":
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                errors.append(f"param '{k}' = {v!r} is not a number")
                continue
            import math as _math
            if not _math.isfinite(v):
                errors.append(f"param '{k}' = {v!r} must be finite (no NaN/Inf)")
                continue
            if pdef.minimum is not None and v < pdef.minimum:
                errors.append(f"param '{k}' = {v} out of bounds ({pdef.minimum}..{pdef.maximum})")
            if pdef.maximum is not None and v > pdef.maximum:
                errors.append(f"param '{k}' = {v} out of bounds ({pdef.minimum}..{pdef.maximum})")
        elif pdef.type == "boolean" and not isinstance(v, bool):
            errors.append(f"param '{k}' = {v!r} is not a boolean")
        elif pdef.type == "string" and not isinstance(v, str):
            errors.append(f"param '{k}' = {v!r} is not a string")
    return errors


def catalog_version() -> int:
    return CATALOG_VERSION


# ---------------------------------------------------------------------------
# CATALOG.md — generated, never hand-edited (an importer can add 55 rows)
# ---------------------------------------------------------------------------

CATALOG_MD_PATH = SFX_DIR / "CATALOG.md"
TAG_ORDER = ("transition", "impact", "emphasis", "riser", "ui", "glitch",
             "organic", "ambient", "accent")


def _primary_tag(d):
    known = [t for t in TAG_ORDER if t in d.tags]
    return known[0] if known else (d.tags[0] if d.tags else "zzz")


def _table_rows(defs):
    rows = []
    for d in sorted(defs, key=lambda x: (TAG_ORDER.index(_primary_tag(x))
                                         if _primary_tag(x) in TAG_ORDER else 99,
                                         x.sound)):
        moods = ", ".join(d.moods)
        tags = ", ".join(d.tags)
        line = d.description.strip().replace("|", "\\|")
        rows.append(f"| `{d.sound}` | {moods} | {tags} | {line} |")
    return rows


def catalog_markdown() -> str:
    """Whole CATALOG.md, derived from the configs (deterministic, sorted)."""
    defs = load_sound_defs()
    tone = [d for d in defs.values() if d.backend == "tone"]
    samp = [d for d in defs.values() if d.backend == "sample"]
    beds = len(BGM_TRACKS)
    out = [
        "# SFX Catalog",
        "",
        "Every sound in `sfx/sounds/` — "
        f"**{len(defs)} entries** ({len(tone)} synthesized, {len(samp)} samples).",
        "Generated: `python scripts/sfx_catalog.py --write-catalog-md` "
        "(never hand-edit). Pick by tag + mood, then read the sound's `sfx.md`.",
        "",
        f"**Engine note (catalog v{CATALOG_VERSION}):** `backend: \"tone\"` renders on the",
        "Tone.js/WebAudio engine (`sfx/sounds/<id>/recipe.mjs`, batched into one `node`",
        "invocation, seeded per cue, byte-identical per cue). `backend: \"sample\"` plays a",
        "bundled MP3 (decoded via ffmpeg, SHA-256 pinned in `assets/manifest.json`).",
        f"Both are mixed under the {beds} BGM beds at stitch time. Sample levels are matched",
        "to the measured voiceover at mix time, so `default_volume` sets relative prominence,",
        "never an absolute dB value (law in [`SCHEMA.md`](./SCHEMA.md)).",
        "",
        "## Synthesized (`tone`)",
        "",
        "| Sound | Moods | Tags | One-line |",
        "|---|---|---|---|",
    ]
    out += _table_rows(tone)
    out += [
        "",
        "## Samples (`sample`)",
        "",
        "| Sound | Moods | Tags | One-line |",
        "|---|---|---|---|",
    ]
    out += _table_rows(samp)
    out += ["", "## By tag", ""]
    by_tag = {}
    for d in sorted(defs.values(), key=lambda x: x.sound):
        for t in d.tags:
            by_tag.setdefault(t, []).append(d.sound)
    for tag in list(TAG_ORDER) + sorted(set(by_tag) - set(TAG_ORDER)):
        names = by_tag.get(tag)
        if not names:
            continue
        out.append(f"- `{tag}` ({len(names)}) — " + ", ".join(f"`{n}`" for n in names))
    aliases = sorted((a, d.sound) for d in defs.values() for a in d.aliases)
    out += ["", "## Aliases", "", "| Alias | Sound |", "|---|---|"]
    out += [f"| `{a}` | `{s}` |" for a, s in aliases]
    out += [""]
    return "\n".join(out)


def write_catalog_md() -> Path:
    tmp = CATALOG_MD_PATH.with_name(CATALOG_MD_PATH.name + ".tmp")
    tmp.write_text(catalog_markdown(), encoding="utf-8")
    tmp.replace(CATALOG_MD_PATH)
    return CATALOG_MD_PATH


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Validate the sfx/ catalog")
    ap.add_argument("--write-catalog-md", action="store_true",
                    help="Regenerate sfx/CATALOG.md from the sound configs")
    args = ap.parse_args()
    errs = validate_catalog()
    if errs:
        for e in errs:
            print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
    if args.write_catalog_md:
        print(f"wrote {write_catalog_md()}")
    print(f"catalog OK: {len(load_sound_defs())} sounds, v{CATALOG_VERSION}")