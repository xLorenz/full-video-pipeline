#!/usr/bin/env python3
"""
measure_durations.py

Measures the duration of each generated voiceover audio file and updates
scenes.json with the real durations and frame counts.

Usage:
    python measure_durations.py <video_dir>

Arguments:
    video_dir       Path to the video project directory
"""

import json
import math
import os
import subprocess
import sys
from pathlib import Path


def get_audio_duration(filepath: str) -> float:
    """Get duration of audio file in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", filepath],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        pass

    return 0.0


def main():
    if len(sys.argv) < 2:
        print("Usage: python measure_durations.py <video_dir>", file=sys.stderr)
        sys.exit(1)

    video_dir = os.path.abspath(sys.argv[1])
    scenes_path = os.path.join(video_dir, "scenes.json")

    if not os.path.exists(scenes_path):
        print(f"ERROR: scenes.json not found at {scenes_path}", file=sys.stderr)
        sys.exit(1)

    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    fps = data.get("fps", 30)
    updated = 0

    for scene in data.get("scenes", []):
        voiceover_file = scene.get("voiceover_file")
        if not voiceover_file:
            print(f"Scene {scene['id']}: No voiceover_file, skipping")
            continue

        audio_path = os.path.join(video_dir, voiceover_file)
        if not os.path.exists(audio_path):
            print(f"Scene {scene['id']}: Audio file not found at {audio_path}, skipping")
            continue

        duration = get_audio_duration(audio_path)
        if duration <= 0:
            print(f"Scene {scene['id']}: Could not measure duration, skipping")
            continue

        duration_frames = math.ceil(duration * fps)
        scene["actual_duration_seconds"] = round(duration, 3)
        scene["actual_duration_frames"] = duration_frames
        updated += 1

        print(f"Scene {scene['id']}: {duration:.2f}s = {duration_frames} frames @ {fps}fps")

    # Update totals
    total_seconds = sum(
        s.get("actual_duration_seconds", 0) or 0
        for s in data.get("scenes", [])
    )
    data["total_actual_seconds"] = round(total_seconds, 3)

    with open(scenes_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nUpdated {updated}/{len(data.get('scenes', []))} scenes")
    print(f"Total video duration: {total_seconds:.2f}s ({total_seconds/60:.1f}min)")


if __name__ == "__main__":
    main()
