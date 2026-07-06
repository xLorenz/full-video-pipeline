#!/usr/bin/env python3
"""
generate_captions.py — Generate an SRT sidecar + per-scene caption cues data.

Reads scenes.json. For each scene, splits its `voiceover_text` on sentence
boundaries (`. ! ?`) and emits CUEs with start/end times distributed
proportionally across the scene's `actual_duration_seconds`. Coarse but
free — works well enough for production-quality captions you can refine in
YouTube's editor.

Writes:
  - videos/{title}/{safe_title}.srt       (YouTube sidecar)
  - Updates scenes.json with per-scene `captions` array.

Usage:
    python3 scripts/generate_captions.py <video_dir>
"""

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
MAX_CHARS_PER_CUE = 100


def split_into_cues(text: str) -> list:
    """Split voiceover text into caption cues by sentence, capping length."""
    sentences = [s.strip() for s in SENTENCE_RE.split(text.strip()) if s.strip()]
    cues = []
    buf = ""
    for s in sentences:
        candidate = (buf + " " + s).strip() if buf else s
        if len(candidate) <= MAX_CHARS_PER_CUE:
            buf = candidate
        else:
            if buf:
                cues.append(buf)
            # If a single sentence is longer than the cap, hard-split at words
            if len(s) > MAX_CHARS_PER_CUE:
                words = s.split()
                chunk = ""
                for w in words:
                    if len(chunk) + 1 + len(w) <= MAX_CHARS_PER_CUE:
                        chunk = (chunk + " " + w).strip()
                    else:
                        if chunk:
                            cues.append(chunk)
                        chunk = w
                buf = chunk
            else:
                buf = s
    if buf:
        cues.append(buf)
    return cues or [text.strip()]


def build_scene_cues(scene):
    """Return list of {start, end, text} (times relative to scene start)."""
    total = scene.get("actual_duration_seconds") or 0
    text = scene.get("voiceover_text") or ""
    if total <= 0 or not text.strip():
        return []
    cues = split_into_cues(text)
    # Distribute by character length so long cues get more time.
    weights = [max(len(c), 1) for c in cues]
    total_w = sum(weights)
    out = []
    t = 0.0
    for cue, w in zip(cues, weights):
        dur = (w / total_w) * total
        out.append({
            "start": round(t, 3),
            "end": round(min(t + dur, total), 3),
            "text": cue,
        })
        t += dur
    return out


def srt_timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h = ms // 3_600_000
    m = (ms % 3_600_000) // 60_000
    s = (ms % 60_000) // 1000
    mm = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{mm:03d}"


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/generate_captions.py <video_dir>", file=sys.stderr)
        sys.exit(2)
    video_dir = Path(sys.argv[1]).resolve()
    scenes_path = video_dir / "scenes.json"
    if not scenes_path.exists():
        print(f"ERROR: scenes.json not found at {scenes_path}", file=sys.stderr)
        sys.exit(2)

    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = sorted(data.get("scenes", []), key=lambda s: s["id"])
    if not scenes:
        print("ERROR: no scenes in scenes.json", file=sys.stderr)
        sys.exit(2)

    safe_title = pl.sanitize_title(data.get("video_title", video_dir.name))
    srt_path = video_dir / f"{safe_title}.srt"

    # Build per-scene cues; collect global SRT entries
    global_t = 0.0
    srt_entries = []
    for s in scenes:
        cues = build_scene_cues(s)
        s["captions"] = cues
        scene_dur = s.get("actual_duration_seconds") or 0
        for cue in cues:
            srt_entries.append({
                "start": global_t + cue["start"],
                "end":   global_t + min(cue["end"], scene_dur),
                "text":  cue["text"],
            })
        global_t += scene_dur

    # Write SRT
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, e in enumerate(srt_entries, start=1):
            f.write(f"{i}\n")
            f.write(f"{srt_timestamp(e['start'])} --> {srt_timestamp(e['end'])}\n")
            f.write(f"{e['text']}\n\n")

    data["captions_srt_path"] = f"{safe_title}.srt"
    pl.save_scenes_full(video_dir, data)

    print(f"Captions generated: {len(srt_entries)} cues across {len(scenes)} scenes")
    print(f"  SRT: {srt_path}")
    print(f"  Updated scenes.json with per-scene `captions`")


if __name__ == "__main__":
    main()
