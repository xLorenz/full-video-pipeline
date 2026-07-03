#!/usr/bin/env python3
"""
generate_voiceover.py

Parses VOICEOVER.md and generates separate MP3 audio files for each scene
using edge-tts. Designed for low-memory environments (sequential processing).

Usage:
    python generate_voiceover.py <video_dir> [--voice en-US-GuyNeural] [--rate +0%]

Arguments:
    video_dir       Path to the video project directory (e.g., videos/my-video/)

Options:
    --voice         edge-tts voice name (default: from pipeline_config.json or en-US-GuyNeural)
    --rate          Speech rate adjustment (default: +0%)
    --volume        Volume adjustment (default: +0%)
    --pitch         Pitch adjustment (default: +0Hz)
"""

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def load_config(video_dir: str) -> dict:
    """Load pipeline_config.json from the project root."""
    config_path = Path(__file__).parent.parent / "pipeline_config.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_voiceover_md(filepath: str) -> list[dict]:
    """
    Parse VOICEOVER.md and extract scene voiceover text.

    Expected format:
        # VOICEOVER
        ---SCENE:1---
        Text for scene 1
        ---END---
        ---SCENE:2---
        Text for scene 2
        ---END---

    Returns list of dicts: [{"id": 1, "text": "..."}, ...]
    """
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    scenes = []
    pattern = r"---SCENE:(\d+)---\s*\n(.*?)---END---"
    matches = re.findall(pattern, content, re.DOTALL)

    for scene_id_str, text in matches:
        scene_id = int(scene_id_str)
        cleaned_text = text.strip()
        if cleaned_text:
            scenes.append({"id": scene_id, "text": cleaned_text})

    return scenes


async def generate_audio(text: str, output_path: str, voice: str, rate: str, volume: str, pitch: str):
    """Generate a single audio file using edge-tts."""
    try:
        import edge_tts
    except ImportError:
        print("ERROR: edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
        sys.exit(1)

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        volume=volume,
        pitch=pitch,
    )
    await communicate.save(output_path)


def get_audio_duration_ffprobe(filepath: str) -> float:
    """Get duration of audio file using ffprobe."""
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

    print(f"WARNING: Could not measure duration for {filepath}", file=sys.stderr)
    return 0.0


def update_scenes_json(video_dir: str, scene_id: int, audio_file: str, duration: float):
    """Update scenes.json with generated voiceover file path."""
    scenes_path = os.path.join(video_dir, "scenes.json")
    if not os.path.exists(scenes_path):
        print(f"WARNING: scenes.json not found at {scenes_path}", file=sys.stderr)
        return

    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for scene in data.get("scenes", []):
        if scene["id"] == scene_id:
            scene["voiceover_file"] = audio_file
            break

    with open(scenes_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


async def main():
    parser = argparse.ArgumentParser(description="Generate voiceover audio files from VOICEOVER.md")
    parser.add_argument("video_dir", help="Path to the video project directory")
    parser.add_argument("--voice", help="edge-tts voice name (default: from config)")
    parser.add_argument("--rate", help="Speech rate (default: +0%%)")
    parser.add_argument("--volume", help="Volume (default: +0%%)")
    parser.add_argument("--pitch", help="Pitch (default: +0Hz)")
    args = parser.parse_args()

    video_dir = os.path.abspath(args.video_dir)
    voiceover_md = os.path.join(video_dir, "VOICEOVER.md")
    voiceover_dir = os.path.join(video_dir, "voiceover")

    if not os.path.exists(voiceover_md):
        print(f"ERROR: VOICEOVER.md not found at {voiceover_md}", file=sys.stderr)
        sys.exit(1)

    # Load config for defaults
    config = load_config(video_dir)
    vo_config = config.get("voiceover", {})

    voice = args.voice or vo_config.get("voice", "en-GB-RyanNeural")
    rate = args.rate or vo_config.get("rate", "+0%")
    volume = args.volume or vo_config.get("volume", "+0%")
    pitch = args.pitch or vo_config.get("pitch", "+0Hz")

    # Create voiceover directory
    os.makedirs(voiceover_dir, exist_ok=True)

    # Parse VOICEOVER.md
    scenes = parse_voiceover_md(voiceover_md)
    if not scenes:
        print("ERROR: No scenes found in VOICEOVER.md", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(scenes)} scenes to generate")
    print(f"Voice: {voice}, Rate: {rate}, Volume: {volume}, Pitch: {pitch}")

    failures = 0
    for scene in scenes:
        scene_id = scene["id"]
        output_file = f"scene-{scene_id:02d}.mp3"
        output_path = os.path.join(voiceover_dir, output_file)
        relative_path = f"voiceover/{output_file}"

        print(f"\nScene {scene_id}: Generating audio...")

        try:
            await generate_audio(scene["text"], output_path, voice, rate, volume, pitch)
        except Exception as e:
            print(f"ERROR: Failed to generate audio for scene {scene_id}: {e}", file=sys.stderr)
            failures += 1
            continue

        if not os.path.exists(output_path):
            print(f"ERROR: Audio file not created at {output_path}", file=sys.stderr)
            failures += 1
            continue

        # Measure duration
        duration = get_audio_duration_ffprobe(output_path)
        file_size = os.path.getsize(output_path)
        print(f"  Generated: {output_path} ({file_size} bytes, {duration:.2f}s)")

        # Update scenes.json
        update_scenes_json(video_dir, scene_id, relative_path, duration)

    print("\nVoiceover generation complete.")
    if failures > 0:
        print(f"\nERROR: {failures}/{len(scenes)} scenes failed to generate", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
