#!/usr/bin/env python3
"""
assemble.py — Efficient video assembly for the full video pipeline.

Replaces the two-step stitch (per-scene stitch_scene.sh + concat re-encode
stitch_final.sh) with:
  1. Concat all voiceover MP3s -> voiceover_aligned.mp3
  2. Concat all scene MP4 video streams (copy, no re-encode)
  3. Overlay audio on video with -c:v copy -c:a aac (no video re-encode)

Usage:
    python3 assemble.py <video_dir>

Output:
    versions/<title>-v<N>.mp4  (auto-incremented version)
    voiceover_aligned.mp3      (concatenated audio track)
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


def load_config():
    """Load pipeline_config.json."""
    config_path = Path(__file__).resolve().parent.parent / "pipeline_config.json"
    if not config_path.exists():
        return {}
    with open(config_path, "r") as f:
        return json.load(f)


def sanitize_title(title):
    """Convert title to safe filename."""
    safe = title.lower()
    safe = re.sub(r"[^a-z0-9]+", "-", safe)
    safe = safe.strip("-")
    return safe


def run_cmd(cmd, check=True):
    """Run a shell command and stream output."""
    print(f"  $ {cmd}")
    result = subprocess.run(
        cmd, shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    if result.stdout:
        for line in result.stdout.rstrip().split("\n"):
            print(f"  | {line}")
    if check and result.returncode != 0:
        print(f"  ERROR: Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    return result


def verify_scene_videos(scenes_dir, scenes):
    """Verify all scene videos exist and have consistent parameters."""
    errors = []
    for s in scenes:
        sid = s["id"]
        padded = f"{sid:02d}"
        video_file = scenes_dir / f"scene-{padded}.mp4"
        if not video_file.exists():
            errors.append(f"Scene {sid}: video not found at {video_file}")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    # Check first scene for codec parameters (all should match)
    first_video = scenes_dir / f"scene-{scenes[0]['id']:02d}.mp4"
    probe = run_cmd(
        f'ffprobe -v quiet -show_entries stream=codec_name,width,height,r_frame_rate '
        f'-of json "{first_video}"',
        check=False
    )
    if probe.returncode != 0:
        print("  WARNING: Could not probe first scene video, skipping codec check")
        return True

    try:
        probe_data = json.loads(probe.stdout)
        first_stream = probe_data["streams"][0]
        ref_codec = first_stream.get("codec_name")
        ref_width = first_stream.get("width")
        ref_height = first_stream.get("height")
        ref_fps = first_stream.get("r_frame_rate")

        for s in scenes[1:]:
            padded = f"{s['id']:02d}"
            video_file = scenes_dir / f"scene-{padded}.mp4"
            p = run_cmd(
                f'ffprobe -v quiet -show_entries stream=codec_name,width,height,r_frame_rate '
                f'-of json "{video_file}"',
                check=False
            )
            if p.returncode == 0:
                pd = json.loads(p.stdout)
                st = pd["streams"][0]
                if st.get("codec_name") != ref_codec:
                    print(f"  WARNING: Scene {s['id']} codec mismatch: "
                          f"{st.get('codec_name')} != {ref_codec}")
                if st.get("width") != ref_width or st.get("height") != ref_height:
                    print(f"  WARNING: Scene {s['id']} resolution mismatch")
    except (json.JSONDecodeError, KeyError, IndexError):
        print("  WARNING: Could not parse probe data, skipping codec check")

    return True


def find_next_version(versions_dir, safe_title):
    """Find the next available version number."""
    max_version = 0
    pattern = re.compile(rf"^{re.escape(safe_title)}-v(\d+)\.mp4$")
    if versions_dir.exists():
        for f in versions_dir.iterdir():
            m = pattern.match(f.name)
            if m:
                v = int(m.group(1))
                if v > max_version:
                    max_version = v
    return max_version + 1


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 assemble.py <video_dir>")
        sys.exit(1)

    video_dir = Path(sys.argv[1]).resolve()
    if not video_dir.exists():
        print(f"ERROR: Video directory not found: {video_dir}")
        sys.exit(1)

    scenes_json = video_dir / "scenes.json"
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found at {scenes_json}")
        sys.exit(1)

    with open(scenes_json, "r") as f:
        data = json.load(f)

    scenes = data.get("scenes", [])
    if not scenes:
        print("ERROR: No scenes found in scenes.json")
        sys.exit(1)

    video_title = data.get("video_title", video_dir.name)
    safe_title = sanitize_title(video_title)
    scenes_dir = video_dir / "scenes"
    voiceover_dir = video_dir / "voiceover"
    versions_dir = video_dir / "versions"

    print(f"=== Assembling: {video_title} ===")
    print(f"  Scenes: {len(scenes)}")

    # Sort scenes by ID
    scenes = sorted(scenes, key=lambda s: s["id"])

    # Verify scene videos
    print("\n--- Verifying scene videos ---")
    if not verify_scene_videos(scenes_dir, scenes):
        print("ERROR: Scene video verification failed")
        sys.exit(1)
    print("  All scene videos verified.")

    # Create temp directory for intermediate files
    temp_dir = video_dir / ".assemble_tmp"
    temp_dir.mkdir(exist_ok=True)

    try:
        # Step 1: Concat voiceover audio
        print("\n--- Step 1: Concatenating voiceover audio ---")
        audio_concat_list = temp_dir / "audio_concat.txt"
        with open(audio_concat_list, "w") as f:
            for s in scenes:
                padded = f"{s['id']:02d}"
                mp3_file = voiceover_dir / f"scene-{padded}.mp3"
                if mp3_file.exists():
                    f.write(f"file '{mp3_file}'\n")
                else:
                    print(f"  WARNING: Voiceover missing for scene {s['id']}, skipping")

        aligned_audio = video_dir / "voiceover_aligned.mp3"
        run_cmd(
            f'ffmpeg -y -f concat -safe 0 -i "{audio_concat_list}" '
            f'-c copy "{aligned_audio}"'
        )

        if not aligned_audio.exists():
            print("ERROR: Failed to create voiceover_aligned.mp3")
            sys.exit(1)

        audio_size = aligned_audio.stat().st_size / (1024 * 1024)
        print(f"  Created voiceover_aligned.mp3 ({audio_size:.1f} MB)")

        # Step 2: Concat video streams (copy, no re-encode)
        print("\n--- Step 2: Concatenating video streams ---")
        video_concat_list = temp_dir / "video_concat.txt"
        with open(video_concat_list, "w") as f:
            for s in scenes:
                padded = f"{s['id']:02d}"
                mp4_file = scenes_dir / f"scene-{padded}.mp4"
                f.write(f"file '{mp4_file}'\n")

        temp_video = temp_dir / "video_only.mp4"
        run_cmd(
            f'ffmpeg -y -f concat -safe 0 -i "{video_concat_list}" '
            f'-c copy "{temp_video}"'
        )

        if not temp_video.exists():
            print("ERROR: Failed to create temp video")
            sys.exit(1)

        vid_size = temp_video.stat().st_size / (1024 * 1024)
        print(f"  Created temp video ({vid_size:.1f} MB)")

        # Step 3: Merge video + audio
        print("\n--- Step 3: Merging video and audio ---")
        versions_dir.mkdir(exist_ok=True)
        next_version = find_next_version(versions_dir, safe_title)
        output_file = versions_dir / f"{safe_title}-v{next_version}.mp4"

        # Load stitch config for final encoding
        config = load_config()
        final_crf = config.get("stitching", {}).get("final_crf", 23)

        run_cmd(
            f'ffmpeg -y '
            f'-i "{temp_video}" '
            f'-i "{aligned_audio}" '
            f'-c:v copy '
            f'-c:a aac -b:a 192k '
            f'-shortest '
            f'-movflags +faststart '
            f'"{output_file}"'
        )

        if not output_file.exists():
            print("ERROR: Failed to create final video")
            sys.exit(1)

        final_size = output_file.stat().st_size / (1024 * 1024)

        # Get duration
        probe = run_cmd(
            f'ffprobe -v quiet -show_entries format=duration '
            f'-of default=noprint_wrappers=1:nokey=1 "{output_file}"',
            check=False
        )
        duration = probe.stdout.strip() if probe.returncode == 0 else "unknown"

        print(f"\n=== Final video created ===")
        print(f"  Output: {output_file}")
        print(f"  Size: {final_size:.1f} MB")
        print(f"  Duration: {duration}s")
        print(f"  Version: v{next_version}")

    finally:
        # Cleanup temp directory
        import shutil
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
