#!/usr/bin/env python3
"""
generate_voiceover.py

Parses VOICEOVER.md and generates separate MP3 audio files for each scene
using edge-tts. Idempotent + parallel-safe.

Idempotency: a scene's MP3 is skipped if both (a) the file already exists
and (b) the stored voiceover_hash matches the current (text, voice, rate,
volume, pitch) tuple. The hash is recomputed from VOICEOVER.md content, so
editing the script and re-running will regenerate only the changed scenes.

Parallel: scenes are generated concurrently up to `voiceover.concurrency`
(default 3) using asyncio.Semaphore. edge-tts is network-bound, not
memory-bound, so this typically reduces step-5 wall time 2-3x without
materially increasing memory.

Usage:
    python generate_voiceover.py <video_dir> [--voice en-GB-RyanNeural] [--rate +0%]
                                       [--volume +0%] [--pitch +0Hz] [--concurrency N]
"""

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


def parse_voiceover_md(filepath: str) -> list:
    """Parse VOICEOVER.md; return [{"id": 1, "text": "..."}, ...]."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    pattern = r"---SCENE:(\d+)---\s*\n(.*?)---END---"
    matches = re.findall(pattern, content, re.DOTALL)
    scenes = []
    for scene_id_str, text in matches:
        scene_id = int(scene_id_str)
        cleaned_text = text.strip()
        if cleaned_text:
            scenes.append({"id": scene_id, "text": cleaned_text})
    return scenes


async def generate_audio(text, output_path, voice, rate, volume, pitch):
    try:
        import edge_tts
    except ImportError:
        print("ERROR: edge-tts not installed. Run: pip install edge-tts",
              file=sys.stderr)
        sys.exit(2)
    communicate = edge_tts.Communicate(
        text=text, voice=voice, rate=rate, volume=volume, pitch=pitch,
    )
    await communicate.save(output_path)


def update_scene_in_scenes_json(video_dir_path, scene_id, audio_rel, duration, voice_hash):
    """Atomically update one scene's voiceover fields."""
    scenes_path = Path(video_dir_path) / "scenes.json"
    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for s in data.get("scenes", []):
        if s["id"] == scene_id:
            s["voiceover_file"] = audio_rel
            s["voiceover_hash"] = voice_hash
            if duration is not None:
                s["actual_duration_seconds"] = round(duration, 3)
            break
    pl.save_scenes_full(video_dir_path, data)


async def generate_one(scene, voiceover_dir, video_dir, voice, rate, volume, pitch,
                       sem, logpath):
    scene_id = scene["id"]
    text = scene["text"]
    output_file = f"scene-{scene_id:02d}.mp3"
    output_path = os.path.join(voiceover_dir, output_file)
    relative_path = f"voiceover/{output_file}"
    voice_hash = pl.hash_voiceover(text, voice, rate, volume, pitch)

    # Idempotency check: skip if file exists and hash matches.
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        scenes_path = os.path.join(video_dir, "scenes.json")
        with open(scenes_path, "r", encoding="utf-8") as f:
            existing = next((s for s in json.load(f).get("scenes", [])
                            if s["id"] == scene_id), None)
        if existing and existing.get("voiceover_hash") == voice_hash:
            existing_dur = existing.get("actual_duration_seconds") or 0
            msg = (f"Scene {scene_id}: skip (unchanged) — "
                   f"{output_file} ({existing_dur:.2f}s)")
            print(msg)
            with open(logpath, "a", encoding="utf-8") as logf:
                logf.write(msg + "\n")
            return ("skipped", scene_id, voice_hash)

    async with sem:
        msg = f"Scene {scene_id}: generating audio..."
        print(msg)
        with open(logpath, "a", encoding="utf-8") as logf:
            logf.write(msg + "\n")
        try:
            await generate_audio(text, output_path, voice, rate, volume, pitch)
        except Exception as e:
            # One retry after backoff (edge-tts is flaky on network)
            print(f"  WARN: first attempt failed ({e}); retrying in 5s...")
            await asyncio.sleep(5)
            await generate_audio(text, output_path, voice, rate, volume, pitch)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            err = f"ERROR: Audio file not created at {output_path}"
            print(err)
            with open(logpath, "a", encoding="utf-8") as logf:
                logf.write(err + "\n")
            return ("failed", scene_id, voice_hash)

        duration = pl.get_audio_duration(output_path)
        size = os.path.getsize(output_path)
        msg = (f"Scene {scene_id}: generated {output_file} "
               f"({size} bytes, {duration:.2f}s)")
        print(msg)
        with open(logpath, "a", encoding="utf-8") as logf:
            logf.write(msg + "\n")
        update_scene_in_scenes_json(video_dir, scene_id, relative_path,
                                    duration, voice_hash)
        return ("generated", scene_id, voice_hash)


def check_ram_floor(min_ram_mb):
    """Abort parallel gather if system RAM drops below the floor."""
    try:
        import psutil
        avail = psutil.virtual_memory().available / (1024 * 1024)
        return avail >= min_ram_mb
    except ImportError:
        return True


async def main():
    parser = argparse.ArgumentParser(description="Generate voiceover audio from VOICEOVER.md")
    parser.add_argument("video_dir", help="Path to the video project directory")
    parser.add_argument("--voice", help="edge-tts voice name")
    parser.add_argument("--rate", help="Speech rate (e.g. +0%)")
    parser.add_argument("--volume", help="Volume (e.g. +0%)")
    parser.add_argument("--pitch", help="Pitch (e.g. +0Hz)")
    parser.add_argument("--concurrency", type=int,
                        help="Max concurrent edge-tts requests (default: from config or 3)")
    args = parser.parse_args()

    video_dir = os.path.abspath(args.video_dir)
    voiceover_md = os.path.join(video_dir, "VOICEOVER.md")
    voiceover_dir = os.path.join(video_dir, "voiceover")
    log_file = pl.log_path(Path(video_dir).name, 5)

    if not os.path.exists(voiceover_md):
        print(f"ERROR: VOICEOVER.md not found at {voiceover_md}", file=sys.stderr)
        sys.exit(2)

    cfg = pl.load_config()
    vo = cfg.get("voiceover", {})
    sys_cfg = cfg.get("system", {})
    voice = args.voice or vo.get("voice", "en-GB-RyanNeural")
    rate = args.rate or vo.get("rate", "+0%")
    volume = args.volume or vo.get("volume", "+0%")
    pitch = args.pitch or vo.get("pitch", "+0Hz")
    concurrency = args.concurrency or vo.get("concurrency", 3)
    min_ram_mb = sys_cfg.get("min_available_ram_mb", 200)

    os.makedirs(voiceover_dir, exist_ok=True)

    scenes = parse_voiceover_md(voiceover_md)
    if not scenes:
        print("ERROR: No scenes found in VOICEOVER.md", file=sys.stderr)
        sys.exit(2)
    print(f"Found {len(scenes)} scenes to generate")
    print(f"Voice: {voice}, Rate: {rate}, Volume: {volume}, Pitch: {pitch}, "
          f"Concurrency: {concurrency}")
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== generate_voiceover.py run {pl.now_iso()} ===\n")
        logf.write(f"voice={voice} rate={rate} volume={volume} "
                   f"pitch={pitch} concurrency={concurrency}\n")

    sem = asyncio.Semaphore(concurrency)
    tasks = [generate_one(s, voiceover_dir, video_dir, voice, rate, volume, pitch,
                          sem, log_file) for s in scenes]
    results = await asyncio.gather(*tasks)

    # Memory guard during the gather — note this only catches AFTER all tasks finish
    # (gather is non-preemptive). For real-time abort, generate_one would need to
    # poll. Given concurrency default of 3 and edge-tts payloads being tens of KB,
    # this edge is rare; documented in plan as known limitation.
    if not check_ram_floor(min_ram_mb):
        print(f"WARN: Available RAM dropped below {min_ram_mb}MB during generation.")

    generated = sum(1 for r in results if r[0] == "generated")
    skipped = sum(1 for r in results if r[0] == "skipped")
    failed = sum(1 for r in results if r[0] == "failed")

    print("\nVoiceover generation complete.")
    print(f"  Generated: {generated}, Skipped (unchanged): {skipped}, Failed: {failed}")
    if failed > 0:
        print(f"ERROR: {failed}/{len(scenes)} scenes failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
