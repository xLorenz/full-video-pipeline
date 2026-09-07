#!/usr/bin/env python3
"""
generate_transcript.py — Build the word-level voiceover transcript (Step 6 tail).

Merges per-scene timing data into two agent-facing artifacts:

  - videos/<title>/voiceover_timings.json  (machine-readable source of truth)
  - videos/<title>/TRANSCRIPT.md            (human-readable; what the agent opens)

Per-scene timing source (recorded per scene as `source`):
  - "measured"  — voiceover/scene-NN.words.json from Step 5 (edge engine)
                  exists AND its voice_hash matches scenes.json (same audio).
  - "aligned"   — vosk fallback: the scene's MP3 was decoded to 16 kHz mono
                  and recognized with word timestamps, then aligned to the
                  known voiceover text. Used for the pocket engine and for
                  any scene whose sidecar is missing or stale.
  - "estimated" — vosk unavailable (not installed / no model) or alignment
                  failed: `words` is EMPTY. No fake timings are ever emitted;
                  the agent must treat these scenes as scene-total-only.

Word-level only by design: the agent decides which words form a sentence,
caption cue, or highlight. This script never groups words.

Timing math (the agent must use the same):
  - Word start/end are seconds from scene start, rounded to ms.
  - frame = round(t * fps). Scene-relative frames use scene-local times.
  - global_start[N] = sum of scene_padded_duration[0..N-1], where
    scene_padded_duration = ceil(duration * fps) / fps (see
    _pipeline_lib.scene_padded_duration — the exact padding assemble.py
    muxes by). Never use raw TTS durations for cue math.
  - Word end times are clamped to the scene's measured duration.

Always auto-runs as part of Step 6 (after measure_durations.py). Idempotent:
re-running rebuilds both files from current sidecars + durations.

Usage:
    python generate_transcript.py <video_dir>
"""

import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


TIMINGS_FILENAME = "voiceover_timings.json"
TRANSCRIPT_FILENAME = "TRANSCRIPT.md"

NORM_RE = re.compile(r"[^a-z0-9']+")


def normalize_token(tok: str) -> str:
    return NORM_RE.sub("", tok.lower()).strip("'")


def expected_tokens(text: str) -> list:
    """Script words as the agent sees them (whitespace split, original form)."""
    return [t for t in text.split() if t]


def load_sidecar(voiceover_dir: Path, scene_id: int):
    p = voiceover_dir / f"scene-{scene_id:02d}.words.json"
    if not p.is_file():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("words"), list):
        return None
    return data


def resolve_vosk_model(cfg: dict):
    """Return a usable vosk model dir, or None (warning-only, never fatal)."""
    tcfg = (cfg.get("transcript") or {}) if isinstance(cfg, dict) else {}
    candidates = []
    configured = tcfg.get("vosk_model")
    if configured:
        candidates.append(Path(str(configured)))
    candidates.append(pl.REPO_ROOT / "models" / "vosk-model-small-en-us-0.15")
    for c in candidates:
        if not c.is_absolute():
            c = pl.REPO_ROOT / c
        # A valid unzipped vosk model dir contains am/final.mdl (newer) or model.conf.
        if c.is_dir() and ((c / "am" / "final.mdl").exists() or (c / "model.conf").exists()):
            return c
    return None


def vosk_recognize_words(mp3_path: Path, model_dir: Path) -> list:
    """Decode MP3 to 16kHz mono PCM and recognize with word timestamps.

    Returns [{word, start, end, conf}]. Raises on failure.
    """
    from vosk import KaldiRecognizer, Model  # deferred: optional dependency

    model = Model(str(model_dir))
    rec = KaldiRecognizer(model, 16000)
    rec.SetWords(True)
    proc = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3_path),
         "-ar", "16000", "-ac", "1", "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1"],
        capture_output=True, timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {(proc.stderr or b'').decode('utf-8', 'replace')[:300]}")
    pcm = proc.stdout
    words = []
    step = 8000
    for off in range(0, len(pcm), step):
        chunk = pcm[off:off + step]
        if rec.AcceptWaveform(chunk):
            try:
                res = json.loads(rec.Result())
            except json.JSONDecodeError:
                continue
            words.extend(res.get("result", []) or [])
    try:
        final = json.loads(rec.FinalResult())
    except json.JSONDecodeError:
        final = {}
    words.extend(final.get("result", []) or [])
    return words


def align_words(expected: list, recognized: list, min_match: float):
    """Align recognized word timings onto the expected script words.

    Returns (words, ratio) where words is [{w, start, end}] in script order.
    Unmatched spans are distributed proportionally by character length within
    the span's anchor times. Raises ValueError if match ratio < min_match.
    """
    exp_norm = [normalize_token(t) for t in expected]
    rec_norm = [normalize_token(r.get("word", "")) for r in recognized]
    if not recognized or not any(rec_norm):
        raise ValueError("empty recognition result")
    sm = difflib.SequenceMatcher(a=exp_norm, b=rec_norm, autojunk=False)
    ratio = sm.ratio()
    if ratio < min_match:
        raise ValueError(f"alignment match ratio {ratio:.2f} < {min_match:.2f}")

    out = [None] * len(expected)

    def rec_span_time(r0, r1):
        """Time span covering recognized indices [r0, r1), falling back to
        neighbor anchors when the block has no recognized words."""
        recs = [recognized[i] for i in range(r0, r1)
                if i < len(recognized) and recognized[i].get("word")]
        if recs:
            return float(recs[0].get("start", 0.0)), float(recs[-1].get("end", 0.0))
        return None

    # Anchor bounds for gap distribution: last known end before, first known start after.
    for tag, i0, i1, j0, j1 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i1 - i0):
                r = recognized[j0 + k]
                out[i0 + k] = {"w": expected[i0 + k],
                               "start": round(float(r.get("start", 0.0)), 3),
                               "end": round(max(float(r.get("end", 0.0)),
                                                float(r.get("start", 0.0))), 3)}
        else:
            span = rec_span_time(j0, j1)
            if span is None:
                # No recognized words in this block — leave for neighbor fill below.
                continue
            t0, t1 = span
            if t1 < t0:
                t1 = t0
            chunk = expected[i0:i1]
            weights = [max(len(t), 1) for t in chunk]
            total_w = sum(weights) or 1
            t = t0
            for idx, tok in enumerate(chunk):
                dur = (weights[idx] / total_w) * max(t1 - t0, 0.0)
                out[i0 + idx] = {"w": tok, "start": round(t, 3),
                                 "end": round(min(t + dur, t1), 3)}
                t += dur

    # Fill any remaining gaps (blocks with no recognized words) from neighbors.
    for i in range(len(out)):
        if out[i] is not None:
            continue
        prev_end = 0.0
        for j in range(i - 1, -1, -1):
            if out[j] is not None:
                prev_end = out[j]["end"]
                break
        next_start = None
        for j in range(i + 1, len(out)):
            if out[j] is not None:
                next_start = out[j]["start"]
                break
        # Find the gap run [i, k) to distribute evenly by char length.
        k = i
        while k < len(out) and out[k] is None:
            k += 1
        gap = expected[i:k]
        if next_start is None:
            next_start = prev_end
        if next_start < prev_end:
            next_start = prev_end
        weights = [max(len(t), 1) for t in gap]
        total_w = sum(weights) or 1
        t = prev_end
        for idx, tok in enumerate(gap):
            dur = (weights[idx] / total_w) * (next_start - prev_end)
            out[i + idx] = {"w": tok, "start": round(t, 3),
                            "end": round(min(t + dur, next_start), 3)}
            t += dur

    # Enforce monotonicity (rounding can create 1ms inversions).
    prev = 0.0
    for w in out:
        if w["start"] < prev:
            w["start"] = round(prev, 3)
        if w["end"] < w["start"]:
            w["end"] = w["start"]
        prev = w["end"]
    return out, ratio


def clamp_words(words: list, duration: float) -> list:
    dur = round(max(duration, 0.0), 3)
    prev = 0.0
    for w in words:
        w["start"] = max(0.0, min(round(float(w["start"]), 3), dur))
        w["end"] = max(w["start"], min(round(float(w["end"]), 3), dur))
        if w["start"] < prev:
            w["start"] = round(prev, 3)
            if w["end"] < w["start"]:
                w["end"] = w["start"]
        prev = w["end"]
    return words


def atomic_write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        pl.atomic_replace(Path(tmp), path)
    except BaseException:
        try:
            Path(tmp).unlink(missing_ok=True)
        except OSError:
            pass
        raise


def build_transcript_md(title: str, fps: int, scenes_out: list) -> str:
    lines = [f"# TRANSCRIPT — {title}",
             "",
             f"Word-level voiceover timings, {len(scenes_out)} scenes @ {fps} fps.",
             "Times are seconds from scene start; `frame = round(t * fps)`.",
             "Global times add the scene's `global_start` (sum of prior padded",
             "durations — the exact padding the stitcher muxes by, so global time",
             "== video timeline). `source` per scene: `measured` (edge-tts word",
             "boundaries, ms-accurate) | `aligned` (vosk fallback, ~word-accurate)",
             "| `estimated` (no timings — words list empty, use scene totals only).",
             ""]
    for s in scenes_out:
        lines.append(f"## Scene {s['id']} — {s['audio_file']} — "
                     f"{s['duration']:.3f}s (padded {s['padded_duration']:.3f}s) — "
                     f"global {s['global_start']:.3f}s — {s['source']}")
        lines.append("")
        if not s["words"]:
            lines.append("_No word timings (estimated) — sync to scene totals only._")
            lines.append("")
            continue
        lines.append("| # | word | start | end | frames |")
        lines.append("|---|------|-------|-----|--------|")
        for n, w in enumerate(s["words"], start=1):
            lines.append(f"| {n} | {w['w']} | {w['start']:.3f} | {w['end']:.3f} | "
                         f"{w['start_frame']}–{w['end_frame']} |")
        lines.append("")
    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_transcript.py <video_dir>", file=sys.stderr)
        sys.exit(2)
    video_dir = Path(sys.argv[1]).resolve()
    scenes_path = video_dir / "scenes.json"
    if not scenes_path.is_file():
        print(f"ERROR: scenes.json not found at {scenes_path}", file=sys.stderr)
        sys.exit(2)

    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = sorted((s for s in data.get("scenes", []) if isinstance(s, dict)
                     and isinstance(s.get("id"), int)), key=lambda s: s["id"])
    if not scenes:
        print("ERROR: no scenes in scenes.json", file=sys.stderr)
        sys.exit(2)

    fps = int(data.get("fps") or 30)
    title = data.get("video_title", video_dir.name)
    cfg = pl.load_config(video_dir=video_dir)
    tcfg = (cfg.get("transcript") or {}) if isinstance(cfg, dict) else {}
    try:
        min_match = float(tcfg.get("align_min_match", 0.5))
    except (TypeError, ValueError):
        min_match = 0.5

    voiceover_dir = video_dir / "voiceover"
    log_file = pl.log_path(video_dir.name, 6)

    def log(msg):
        print(msg)
        try:
            with open(log_file, "a", encoding="utf-8") as lf:
                lf.write(msg + "\n")
        except OSError:
            pass

    log(f"\n=== generate_transcript.py run {pl.now_iso()} ===")

    # Resolve the vosk model lazily — only when a scene actually needs alignment.
    model_dir = None
    model_probed = False

    def need_model():
        nonlocal model_dir, model_probed
        if model_probed:
            return model_dir
        model_probed = True
        try:
            import vosk  # noqa: F401
        except ImportError:
            log("Transcript: vosk not installed — scenes without measured timings "
                "will be 'estimated' (pip install -r scripts/requirements-transcript.txt)")
            return None
        model_dir = resolve_vosk_model(cfg)
        if model_dir is None:
            log("Transcript: no vosk model found (models/vosk-model-small-en-us-0.15) — "
                "scenes without measured timings will be 'estimated'. "
                "Download from https://alphacephei.com/vosk/models and unzip under models/.")
        else:
            log(f"Transcript: vosk model at {model_dir}")
        return model_dir

    scenes_out = []
    global_t = 0.0
    for s in scenes:
        sid = s["id"]
        text = s.get("voiceover_text") or ""
        rel = (s.get("voiceover_file") or "").strip()
        duration = float(s.get("actual_duration_seconds") or 0.0)
        if not rel or duration <= 0:
            print(f"ERROR: Scene {sid}: missing voiceover_file/duration — run Steps 5-6 first",
                  file=sys.stderr)
            sys.exit(1)
        padded = pl.scene_padded_duration(s, fps)
        words, source = [], "estimated"

        # Path 1: measured sidecar from Step 5 (hash must match current audio).
        side = load_sidecar(voiceover_dir, sid)
        if (side and side.get("source") == "measured"
                and side.get("voice_hash") == s.get("voiceover_hash")
                and isinstance(side.get("words"), list) and side["words"]):
            ok = all(isinstance(w, dict) and "w" in w and "start" in w and "end" in w
                     for w in side["words"])
            if ok:
                words = [{"w": str(w["w"]), "start": float(w["start"]),
                          "end": float(w["end"])} for w in side["words"]]
                source = "measured"

        # Path 2: vosk alignment fallback.
        if source != "measured" and text.strip():
            md = need_model()
            if md is not None:
                mp3 = video_dir / rel
                try:
                    rec = vosk_recognize_words(mp3, md)
                    aligned, ratio = align_words(expected_tokens(text), rec, min_match)
                    words = aligned
                    source = "aligned"
                    log(f"Scene {sid}: vosk-aligned {len(words)} words "
                        f"(match {ratio:.2f}) from {len(rec)} recognized")
                except Exception as e:
                    log(f"Scene {sid}: vosk alignment failed ({e}) — marking estimated")
                    words, source = [], "estimated"
            else:
                log(f"Scene {sid}: no measured sidecar, no vosk model — estimated")

        if source == "measured":
            log(f"Scene {sid}: measured timings ({len(words)} words)")
        elif source == "estimated":
            log(f"Scene {sid}: estimated (no word timings)")

        words = clamp_words(words, duration)
        for w in words:
            w["global_start"] = round(global_t + w["start"], 3)
            w["global_end"] = round(global_t + w["end"], 3)
            w["start_frame"] = int(round(w["start"] * fps))
            w["end_frame"] = int(round(w["end"] * fps))

        scenes_out.append({
            "id": sid, "text": text, "audio_file": rel,
            "duration": round(duration, 3), "padded_duration": round(padded, 3),
            "global_start": round(global_t, 3), "source": source, "words": words,
        })
        global_t += padded

    payload = {"video_title": title, "fps": fps, "generated_at": pl.now_iso(),
               "scenes": scenes_out}
    atomic_write_text(video_dir / TIMINGS_FILENAME,
                      json.dumps(payload, indent=2, ensure_ascii=False))
    atomic_write_text(video_dir / TRANSCRIPT_FILENAME,
                      build_transcript_md(title, fps, scenes_out))

    n_measured = sum(1 for s in scenes_out if s["source"] == "measured")
    n_aligned = sum(1 for s in scenes_out if s["source"] == "aligned")
    n_estimated = sum(1 for s in scenes_out if s["source"] == "estimated")
    n_words = sum(len(s["words"]) for s in scenes_out)
    log(f"Transcript complete: {n_words} words across {len(scenes_out)} scenes "
        f"(measured={n_measured} aligned={n_aligned} estimated={n_estimated})")
    log(f"  JSON: {video_dir / TIMINGS_FILENAME}")
    log(f"  MD:   {video_dir / TRANSCRIPT_FILENAME}")


if __name__ == "__main__":
    main()
