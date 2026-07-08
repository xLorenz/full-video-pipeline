#!/usr/bin/env python3
"""
measure_durations.py

Measures the duration of each generated voiceover audio file and updates
scenes.json with real durations and frame counts. Idempotent: re-measures
every scene every run (cheap validation pass), recomputes totals, writes
atomically.

Usage:
    python measure_durations.py <video_dir>
"""

import math
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


def main():
    if len(sys.argv) < 2:
        print("Usage: python measure_durations.py <video_dir>", file=sys.stderr)
        sys.exit(2)
    video_dir = os.path.abspath(sys.argv[1])
    scenes_path = os.path.join(video_dir, "scenes.json")

    if not os.path.exists(scenes_path):
        print(f"ERROR: scenes.json not found at {scenes_path}", file=sys.stderr)
        sys.exit(2)

    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    fps = data.get("fps", 30)
    updated = 0

    log_file = pl.log_path(Path(video_dir).name, 6)
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== measure_durations.py run {pl.now_iso()} ===\n")

    for scene in data.get("scenes", []):
        voiceover_file = scene.get("voiceover_file")
        if not voiceover_file:
            print(f"Scene {scene['id']}: No voiceover_file, skipping")
            continue
        audio_path = os.path.join(video_dir, voiceover_file)
        if not os.path.exists(audio_path):
            print(f"Scene {scene['id']}: Audio file not found at {audio_path}, skipping")
            continue
        duration = pl.get_audio_duration(audio_path)
        if duration <= 0:
            print(f"Scene {scene['id']}: Could not measure duration, skipping")
            continue
        duration_frames = math.ceil(duration * fps)
        # Guarantee minimum 1 frame for very short scenes
        duration_frames = max(1, duration_frames)
        scene["actual_duration_seconds"] = round(duration, 3)
        scene["actual_duration_frames"] = duration_frames
        updated += 1
        msg = (f"Scene {scene['id']}: {duration:.2f}s = "
               f"{duration_frames} frames @ {fps}fps")
        print(msg)
        with open(log_file, "a", encoding="utf-8") as logf:
            logf.write(msg + "\n")

    total_seconds = sum(
        s.get("actual_duration_seconds", 0) or 0
        for s in data.get("scenes", [])
    )
    data["total_actual_seconds"] = round(total_seconds, 3)

    pl.save_scenes_full(video_dir, data)

    scenes_total = len(data.get("scenes", []))
    print(f"\nUpdated {updated}/{scenes_total} scenes")
    print(f"Total video duration: {total_seconds:.2f}s ({total_seconds/60:.1f}min)")
    if updated < scenes_total:
        print("ERROR: partial measurement — some scenes were skipped", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
