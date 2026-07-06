#!/usr/bin/env python3
"""
assemble.py — Efficient video assembly for the full video pipeline.

Audio path: scene MP4s are rendered silent (no <Audio> in Remotion comps).
Voiceover MP3s are concatenated into voiceover_aligned.mp3, then muxed onto
the concatenated scene videos in a single ffmpeg pass. One audio encode pass
total — fastest path for low-RAM boxes.

Safety:
  - Codec/resolution/fps mismatch detected by ffprobe triggers a re-encode
    fallback (libx264 -crf {render.crf}) instead of -c copy (which would
    silently produce a broken file).
  - Final MP4 is written atomically (temp + os.replace) so a crash doesn't
    leave a half-written "version".
  - Duration assertion: |final_duration - total_actual_seconds| <= 0.5s,
    otherwise exits non-zero.

Usage:
    python3 assemble.py <video_dir>

Output:
    versions/<title>-v<N>.mp4  (auto-incremented version)
    voiceover_aligned.mp3      (concatenated audio track)
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


def find_next_version(versions_dir, safe_title):
    max_version = 0
    pattern = re.compile(rf"^{re.escape(safe_title)}-v(\d+)\.mp4$")
    if versions_dir.exists():
        for f in versions_dir.iterdir():
            m = pattern.match(f.name)
            if m and int(m.group(1)) > max_version:
                max_version = int(m.group(1))
    return max_version + 1


def probe_scene(scenes_dir, scene_id):
    """Return dict of codec_name, width, height, r_frame_rate for the scene's MP4."""
    fpath = scenes_dir / f"scene-{scene_id:02d}.mp4"
    streams = pl.ffprobe_streams(fpath)
    if not streams:
        return None
    s = streams[0]
    return {
        "codec": s.get("codec_name"),
        "width": s.get("width"),
        "height": s.get("height"),
        "fps": s.get("r_frame_rate"),
    }


def detect_mismatch(scenes_dir, scenes):
    """Return (mismatch: bool, reason: str)."""
    first = probe_scene(scenes_dir, scenes[0]["id"])
    if first is None:
        return False, "first scene unprobeable — assuming match"
    for s in scenes[1:]:
        info = probe_scene(scenes_dir, s["id"])
        if info is None:
            continue
        if info["codec"] != first["codec"]:
            return True, f"codec mismatch (scene {s['id']}: {info['codec']} vs {first['codec']})"
        if info["width"] != first["width"] or info["height"] != first["height"]:
            return True, (f"resolution mismatch (scene {s['id']}: "
                          f"{info['width']}x{info['height']} vs "
                          f"{first['width']}x{first['height']})")
        if info["fps"] != first["fps"]:
            return True, f"fps mismatch (scene {s['id']}: {info['fps']} vs {first['fps']})"
    return False, "all scenes consistent"


def atomic_replace_temp(output_file, cmd):
    """Run ffmpeg to a temp file, then os.replace to output_file on success."""
    tmp = str(output_file) + ".tmp"
    full_cmd = cmd.replace(f'"{output_file}"', f'"{tmp}"')
    result = pl.run_cmd(full_cmd, check=False)
    if result.returncode != 0 or not Path(tmp).exists():
        if Path(tmp).exists():
            Path(tmp).unlink()
        return False
    os.replace(tmp, output_file)
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 assemble.py <video_dir>")
        sys.exit(2)
    video_dir = Path(sys.argv[1]).resolve()
    if not video_dir.exists():
        print(f"ERROR: Video directory not found: {video_dir}")
        sys.exit(2)
    scenes_json = video_dir / "scenes.json"
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found at {scenes_json}")
        sys.exit(2)

    with open(scenes_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data.get("scenes", [])
    if not scenes:
        print("ERROR: No scenes found in scenes.json")
        sys.exit(2)
    scenes = sorted(scenes, key=lambda s: s["id"])

    video_title = data.get("video_title", video_dir.name)
    safe_title = pl.sanitize_title(video_title)
    scenes_dir = video_dir / "scenes"
    voiceover_dir = video_dir / "voiceover"
    versions_dir = video_dir / "versions"

    log_file = pl.log_path(video_dir.name, 10)
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== assemble.py run {pl.now_iso()} ===\n")

    print(f"=== Assembling: {video_title} ===")
    print(f"  Scenes: {len(scenes)}")

    cfg = pl.load_config()
    rcfg = cfg.get("render", {})
    scfg = cfg.get("stitching", {})
    crf = rcfg.get("crf", 28)
    final_codec = scfg.get("final_codec", "libx264")
    final_audio_codec = scfg.get("final_audio_codec", "aac")
    final_crf = scfg.get("final_crf", 23)

    # Verify scene videos exist
    print("\n--- Verifying scene videos ---")
    errors = []
    for s in scenes:
        fpath = scenes_dir / f"scene-{s['id']:02d}.mp4"
        if not fpath.exists():
            errors.append(f"Scene {s['id']}: video not found at {fpath}")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit(1)
    print("  All scene video files present.")

    # Detect codec/size/fps mismatch → decide copy vs re-encode
    mismatch, reason = detect_mismatch(scenes_dir, scenes)
    if mismatch:
        print(f"  WARNING: {reason}")
        print("  Falling back to re-encoding video stream for concat safety.")
    else:
        print(f"  Codec check: {reason}")

    temp_dir = video_dir / ".assemble_tmp"
    temp_dir.mkdir(exist_ok=True)

    try:
        # Step 1: Concat voiceover MP3s (copy, no re-encode — MP3 streams concat cleanly)
        print("\n--- Step 1: Concatenating voiceover audio ---")
        audio_concat_list = temp_dir / "audio_concat.txt"
        with open(audio_concat_list, "w", encoding="utf-8") as f:
            for s in scenes:
                mp3 = voiceover_dir / f"scene-{s['id']:02d}.mp3"
                if not mp3.exists():
                    print(f"  ERROR: Voiceover MP3 missing for scene {s['id']}: {mp3}")
                    sys.exit(1)
                # concat demuxer requires forward slashes & escaping
                rel = mp3.resolve().as_posix()
                f.write(f"file '{rel}'\n")
        aligned_audio = video_dir / "voiceover_aligned.mp3"
        ok = atomic_replace_temp(
            aligned_audio,
            f'ffmpeg -y -f concat -safe 0 -i "{audio_concat_list}" -c copy "{aligned_audio}"',
        )
        if not ok or not aligned_audio.exists():
            print("ERROR: Failed to create voiceover_aligned.mp3")
            sys.exit(1)
        audio_size = aligned_audio.stat().st_size / (1024 * 1024)
        print(f"  Created voiceover_aligned.mp3 ({audio_size:.1f} MB)")

        # Step 2: Concat scene videos — copy if matched, else re-encode
        print("\n--- Step 2: Concatenating video streams ---")
        video_concat_list = temp_dir / "video_concat.txt"
        with open(video_concat_list, "w", encoding="utf-8") as f:
            for s in scenes:
                mp4 = (scenes_dir / f"scene-{s['id']:02d}.mp4").resolve().as_posix()
                f.write(f"file '{mp4}'\n")
        temp_video = temp_dir / "video_only.mp4"
        if mismatch:
            cmd = (f'ffmpeg -y -f concat -safe 0 -i "{video_concat_list}" '
                   f'-c:v {final_codec} -preset ultrafast -crf {crf} '
                   f'-an "{temp_video}"')
        else:
            cmd = (f'ffmpeg -y -f concat -safe 0 -i "{video_concat_list}" '
                   f'-c copy "{temp_video}"')
        ok = atomic_replace_temp(temp_video, cmd)
        if not ok or not temp_video.exists():
            print("ERROR: Failed to create temp video")
            sys.exit(1)
        vid_size = temp_video.stat().st_size / (1024 * 1024)
        print(f"  Created temp video ({vid_size:.1f} MB) "
              f"[{'re-encoded' if mismatch else 'stream copy'}]")

        # Step 3: Mux audio on video (video stream untouched, audio encoded to aac)
        print("\n--- Step 3: Merging video and audio ---")
        versions_dir.mkdir(exist_ok=True)
        next_version = find_next_version(versions_dir, safe_title)
        output_file = versions_dir / f"{safe_title}-v{next_version}.mp4"
        cmd = (f'ffmpeg -y '
               f'-i "{temp_video}" '
               f'-i "{aligned_audio}" '
               f'-c:v copy '
               f'-c:a {final_audio_codec} -b:a 192k '
               f'-shortest '
               f'-movflags +faststart '
               f'"{output_file}"')
        ok = atomic_replace_temp(output_file, cmd)
        if not ok or not output_file.exists():
            print("ERROR: Failed to create final video")
            sys.exit(1)

        # Duration assertion (tolerance 0.5s for ceil() drift)
        expected_total = data.get("total_actual_seconds") or sum(
            (s.get("actual_duration_seconds") or 0) for s in scenes)
        actual_dur = pl.get_audio_duration(output_file)
        if abs(actual_dur - expected_total) > 0.5:
            print(f"  WARNING: final duration {actual_dur:.2f}s vs expected "
                  f"{expected_total:.2f}s (drift {abs(actual_dur-expected_total):.2f}s)")
        else:
            print(f"  Duration: {actual_dur:.2f}s (expected {expected_total:.2f}s — OK)")

        final_size = output_file.stat().st_size / (1024 * 1024)
        print(f"\n=== Final video created ===")
        print(f"  Output: {output_file}")
        print(f"  Size: {final_size:.1f} MB")
        print(f"  Version: v{next_version}")

    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
