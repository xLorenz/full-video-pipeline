#!/usr/bin/env python3
"""
generate_voiceover_pocket.py

Optional pocket-tts voiceover engine. Mirrors the CLI shape of
generate_voiceover.py (edge-tts) so the orchestrator can swap engines
purely via `steps.5_voiceover_generation.command_template` in
pipeline_config.json — no orchestrator code changes required.

Key differences vs edge-tts:
  - CPU-bound (PyTorch)            : network-bound speeds don't apply
  - Forced sequential              : model uses ~2 cores; parallelism would
                                     push past 1 GB on a t3.micro. We
                                     therefore ignore `voiceover.concurrency`
                                     and always run one scene at a time.
  - No SSML / rate / volume / pitch: flags kept only for hash-compat
  - Streaming to disk              : uses generate_audio_stream() and writes
                                     WAV chunks directly to disk, so the
                                     full scene's PCM is never in RAM.
  - Quantized by default           : load_model(quantize=True) → runtime
                                     memory ~234 MB vs 450 MB baseline.
                                     Quality delta is indistinguishable
                                     (WER ~0.022 ±0.032, range crosses zero).

OOM defenses (any one alone is sufficient in normal operation):
  1. Stream-to-disk generation (no full-audio tensor in memory)
  2. quantize=True (halves runtime memory, no quality loss)
  3. Voice state loaded once and reused across all scenes
  4. Forced concurrency=1 (no parallel model invocations)
  5. RAM floor pre-check (refuses to start if model won't fit)
     + mid-run pulse check (stops early, leaves scenes resumable via
     the same idempotent-skip mechanism as the edge-tts path)

Idempotency: identical to edge-tts. A scene is skipped if its MP3 exists
and `voiceover_hash` in scenes.json matches the recomputed hash. The hash
is computed from (text, voice, rate, volume, pitch) using the same
`pl.hash_voiceover` so a swap of engines regenerates all scenes (intended
— different audio), and an unchanged script on re-run skips everything.

Voice catalog (named only in v1; cloning deferred):
  alba, anna, azelma, bill_boerst, caro_davy, charles, cosette, eponine,
  eve, fantine, george, jane, jean, javert, marius, mary, michael, paul,
  peter_yearsley, stuart_bell, vera       (English)
  giovanni (it), lola (es), juergen (de), rafael (pt), estelle (fr)
Catalog: https://huggingface.co/kyutai/tts-voices

Usage:
    python generate_voiceover_pocket.py <video_dir> [--voice alba]
        [--language english] [--no-quantize]
"""

import argparse
import json
import os
import re
import struct
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


# Quantized model footprint from Kyutai's own x86 benchmark, plus a
# safety margin for Python/PyTorch runtime overhead (≈300 MB) and a WAV
# stream buffer (~10 MB). Below this free-RAM threshold we refuse to start.
QUANTIZED_MODEL_MB = 234
SAFETY_MARGIN_MB = 300
MIN_FREE_FOR_POCKET_MB = QUANTIZED_MODEL_MB + SAFETY_MARGIN_MB  # 534 MB


def parse_voiceover_md(filepath: str) -> list:
    """Parse VOICEOVER.md; return [{"id": 1, "text": "..."}, ...].

    Same delimiter format as generate_voiceover.py — duplicated here (no
    shared parser in _pipeline_lib) to keep the pocket-tts wrapper standalone
    and avoid touching _pipeline_lib, edge-tts, or any shared surface.
    """
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


def update_scene_in_scenes_json(video_dir_path, scene_id, audio_rel, duration, voice_hash):
    """Atomically update one scene's voiceover fields. Same shape as
    generate_voiceover.py::update_scene_in_scenes_json."""
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


def available_ram_mb() -> float:
    try:
        import psutil
        return psutil.virtual_memory().available / (1024 * 1024)
    except ImportError:
        return float("inf")  # can't measure → don't block


def write_wav_header(f, sample_rate: int, num_channels: int = 1, bits_per_sample: int = 16):
    """Write a 44-byte canonical WAV header. `data` chunk length is
    initially zero and rewritten at close via finalize_wav_data_len()."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    f.write(b"RIFF")
    f.write(struct.pack("<I", 0))              # RIFF chunk size (patch on close)
    f.write(b"WAVE")
    f.write(b"fmt ")
    f.write(struct.pack("<IHHIIHH", 16, 1, num_channels, sample_rate,
                        byte_rate, block_align, bits_per_sample))
    f.write(b"data")
    f.write(struct.pack("<I", 0))              # data size (patch on close)


def finalize_wav_lengths(f, data_bytes: int):
    """Rewrite RIFF/data chunk sizes after the stream completes."""
    riff_size = 36 + data_bytes
    f.seek(4)
    f.write(struct.pack("<I", riff_size))
    f.seek(40)
    f.write(struct.pack("<I", data_bytes))


def stream_to_wav(model, voice_state, text: str, wav_path: str) -> int:
    """Generate audio via generate_audio_stream(), writing 16-bit PCM
    chunks directly to a WAV file. Returns total bytes written.

    This is the principal OOM defense: the full audio tensor for the
    scene is never materialized in Python — we hand each chunk to the
    file as it arrives. A 10s scene at 24kHz mono 16-bit is ~480 KB on
    disk; peak RAM during generation is whatever one chunk occupies
    (typically a few KB of PCM).
    """
    import numpy as np  # delayed; numpy is a torch dep but kept lazy
    total_samples = 0
    with open(wav_path, "wb") as f:
        write_wav_header(f, model.sample_rate)
        for chunk in model.generate_audio_stream(voice_state, text):
            # chunk is a 1D float32 torch.Tensor in [-1, 1]; convert to int16 PCM
            pcm = (chunk.clamp(-1.0, 1.0).numpy() * 32767.0).astype(np.int16)
            f.write(pcm.tobytes())
            total_samples += pcm.shape[0]
        finalize_wav_lengths(f, total_samples * 2)  # 2 bytes per int16 sample
    return total_samples


def encode_mp3(wav_path: str, mp3_path: str) -> None:
    """ffmpeg WAV → MP3. -qscale:a 4 ≈ 165-185 kbps, audibly transparent
    for voiceover and well within YouTube recommendations."""
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
         "-codec:a", "libmp3lame", "-qscale:a", "4", mp3_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {result.stderr.strip()}")


def generate_one(model, voice_state, scene, voiceover_dir, video_dir,
                 voice, rate, volume, pitch, logpath, min_ram_mb):
    """Generate one scene's MP3 with idempotency + RAM pulse check."""
    scene_id = scene["id"]
    text = scene["text"]
    wav_file = f"scene-{scene_id:02d}.wav"
    mp3_file = f"scene-{scene_id:02d}.mp3"
    wav_path = os.path.join(voiceover_dir, wav_file)
    mp3_path = os.path.join(voiceover_dir, mp3_file)
    relative_path = f"voiceover/{mp3_file}"
    voice_hash = pl.hash_voiceover(text, voice, rate, volume, pitch)

    # Idempotency check: skip if file exists and hash matches (same as edge-tts).
    if os.path.exists(mp3_path) and os.path.getsize(mp3_path) > 0:
        scenes_path = os.path.join(video_dir, "scenes.json")
        with open(scenes_path, "r", encoding="utf-8") as f:
            existing = next((s for s in json.load(f).get("scenes", [])
                             if s["id"] == scene_id), None)
        if existing and existing.get("voiceover_hash") == voice_hash:
            existing_dur = existing.get("actual_duration_seconds") or 0
            msg = (f"Scene {scene_id}: skip (unchanged) — "
                   f"{mp3_file} ({existing_dur:.2f}s)")
            print(msg)
            with open(logpath, "a", encoding="utf-8") as logf:
                logf.write(msg + "\n")
            return ("skipped", scene_id, voice_hash)

    msg = f"Scene {scene_id}: generating audio (pocket-tts)..."
    print(msg)
    with open(logpath, "a", encoding="utf-8") as logf:
        logf.write(msg + "\n")

    try:
        stream_to_wav(model, voice_state, text, wav_path)
    except Exception as e:
        err = f"  ERROR: pocket-tts failed on scene {scene_id}: {e}"
        print(err)
        with open(logpath, "a", encoding="utf-8") as logf:
            logf.write(err + "\n")
        # clean up any partial WAV so retry isn't tainted
        if os.path.exists(wav_path):
            os.remove(wav_path)
        return ("failed", scene_id, voice_hash)

    try:
        encode_mp3(wav_path, mp3_path)
    except Exception as e:
        err = f"  ERROR: ffmpeg encode failed on scene {scene_id}: {e}"
        print(err)
        with open(logpath, "a", encoding="utf-8") as logf:
            logf.write(err + "\n")
        if os.path.exists(wav_path):
            os.remove(wav_path)
        return ("failed", scene_id, voice_hash)

    # Remove the intermediate WAV now that the MP3 is on disk.
    if os.path.exists(wav_path):
        os.remove(wav_path)

    if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) == 0:
        err = f"  ERROR: MP3 not created at {mp3_path}"
        print(err)
        with open(logpath, "a", encoding="utf-8") as logf:
            logf.write(err + "\n")
        return ("failed", scene_id, voice_hash)

    duration = pl.get_audio_duration(mp3_path)
    size = os.path.getsize(mp3_path)
    msg = (f"Scene {scene_id}: generated {mp3_file} "
           f"({size} bytes, {duration:.2f}s)")
    print(msg)
    with open(logpath, "a", encoding="utf-8") as logf:
        logf.write(msg + "\n")
    update_scene_in_scenes_json(video_dir, scene_id, relative_path,
                                duration, voice_hash)

    # RAM pulse check — stop early rather than OOM mid-render.
    free = available_ram_mb()
    if free < min_ram_mb:
        warn = (f"  WARN: free RAM {free:.0f}MB dropped below "
                f"{min_ram_mb}MB after scene {scene_id}; "
                f"stopping run. Already-generated scenes are intact "
                f"and will be skipped on re-run (idempotent).")
        print(warn)
        with open(logpath, "a", encoding="utf-8") as logf:
            logf.write(warn + "\n")
        return ("stopped", scene_id, voice_hash)

    return ("generated", scene_id, voice_hash)


def main():
    parser = argparse.ArgumentParser(
        description="Generate voiceover audio from VOICEOVER.md using pocket-tts "
                    "(optional engine; default pipeline engine is edge-tts).")
    parser.add_argument("video_dir", help="Path to the video project directory")
    parser.add_argument("--voice", help="Named pocket-tts voice (e.g. alba, michael)")
    parser.add_argument("--language",
                        help="pocket-tts language model (default: english). "
                             "Non-English *_24l variants are heavier and not "
                             "recommended for t3.micro.")
    parser.add_argument("--no-quantize", action="store_true",
                        help="Disable int8 quantization (default: quantized). "
                             "Not recommended on low-RAM boxes; doubles runtime "
                             "memory with no measurable quality gain.")
    parser.add_argument("--rate", help="IGNORED by pocket-tts (kept for hash-compat)")
    parser.add_argument("--volume", help="IGNORED by pocket-tts (kept for hash-compat)")
    parser.add_argument("--pitch", help="IGNORED by pocket-tts (kept for hash-compat)")
    parser.add_argument("--concurrency", help="IGNORED (pocket-tts is CPU-bound; "
                                              "forced sequential)")
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
    voice = args.voice or vo.get("voice", "alba")
    language = args.language or vo.get("language", "english")
    quantize = (not args.no_quantize) and (not vo.get("no_quantize", False))
    # rate/volume/pitch flow through hash_voiceover so idempotency keys
    # are stable across engine swaps; pocket-tts itself ignores them.
    rate = args.rate or vo.get("rate", "+0%")
    volume = args.volume or vo.get("volume", "+0%")
    pitch = args.pitch or vo.get("pitch", "+0Hz")
    min_ram_mb = sys_cfg.get("min_available_ram_mb", MIN_FREE_FOR_POCKET_MB)

    os.makedirs(voiceover_dir, exist_ok=True)

    scenes = parse_voiceover_md(voiceover_md)
    if not scenes:
        print("ERROR: No scenes found in VOICEOVER.md", file=sys.stderr)
        sys.exit(2)

    # Pre-flight RAM check. The quantized model needs ~234 MB; we add a
    # generous safety margin for Python/PyTorch runtime + buffers. If free
    # RAM is below this we refuse to start — better to fail cleanly than
    # OOM mid-render and waste the partial work.
    free = available_ram_mb()
    needed = MIN_FREE_FOR_POCKET_MB if quantize else 450 + SAFETY_MARGIN_MB
    if free < needed:
        msg = (f"ERROR: insufficient free RAM for pocket-tts: "
               f"{free:.0f}MB available, need ~{needed}MB "
               f"(model {QUANTIZED_MODEL_MB if quantize else 450}MB + "
               f"{SAFETY_MARGIN_MB}MB margin). "
               f"Tip: set voiceover.no_quantize=False (default) and "
               f"system.min_available_ram_mb <= {needed}, or use the "
               f"edge-tts engine instead.")
        print(msg, file=sys.stderr)
        with open(log_file, "a", encoding="utf-8") as logf:
            logf.write(f"\n=== generate_voiceover_pocket.py REFUSED {pl.now_iso()} ===\n")
            logf.write(msg + "\n")
        sys.exit(2)

    print(f"Found {len(scenes)} scenes to generate")
    print(f"Engine: pocket-tts   Voice: {voice}   Language: {language}")
    print(f"Quantized: {quantize}   Mode: sequential (CPU-bound)")
    print(f"rate/volume/pitch flags IGNORED for pocket-tts (logged for hash-compat)")
    print(f"Free RAM at start: {free:.0f}MB (need ~{needed}MB)")

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== generate_voiceover_pocket.py run {pl.now_iso()} ===\n")
        logf.write(f"voice={voice} language={language} quantize={quantize} "
                   f"mode=sequential\n")

    # ------------------------------------------------------------------
    # Lazy import — keeps pocket-tts as an optional dependency. If it's
    # missing we exit cleanly with install instructions, exactly as
    # generate_voiceover.py does for a missing edge-tts.
    # ------------------------------------------------------------------
    try:
        from pocket_tts import TTSModel
    except ImportError:
        print("ERROR: pocket-tts not installed. "
              "Run: pip install -r scripts/requirements-pocket.txt",
              file=sys.stderr)
        with open(log_file, "a", encoding="utf-8") as logf:
            logf.write("ABORT: pocket-tts ImportError\n")
        sys.exit(2)

    # Load model ONCE, reuse across all scenes. This is the single expensive
    # operation; the command_template only fires once per `complete` call so
    # paying 10-30s here for the whole video is fine. The voice state is
    # also loaded once and reused (preset name → KV-cache dict).
    print("Loading pocket-tts model (this may take 10-30s on first run, "
          "including one-time download of model weights)...")
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"load_model start {pl.now_iso()}\n")
    model = TTSModel.load_model(language=language, quantize=quantize)
    print(f"Model loaded. Sample rate: {model.sample_rate}. "
          f"Free RAM: {available_ram_mb():.0f}MB")

    voice_state = model.get_state_for_audio_prompt(voice)
    print(f"Voice state for '{voice}' loaded.")

    results = []
    for scene in scenes:
        result = generate_one(model, voice_state, scene, voiceover_dir, video_dir,
                             voice, rate, volume, pitch, log_file, min_ram_mb)
        results.append(result)
        if result[0] == "stopped":
            break  # RAM pressure; halt gracefully

    # Drop model + voice state references and prompt GC before reporting.
    # On small boxes this returns ~250 MB to the OS before downstream steps
    # (e.g. ffmpeg encoding) fire.
    del voice_state
    del model
    try:
        import gc
        gc.collect()
    except Exception:
        pass

    generated = sum(1 for r in results if r[0] == "generated")
    skipped = sum(1 for r in results if r[0] == "skipped")
    failed = sum(1 for r in results if r[0] == "failed")
    stopped = sum(1 for r in results if r[0] == "stopped")

    print("\nVoiceover generation complete.")
    print(f"  Generated: {generated}, Skipped (unchanged): {skipped}, "
          f"Failed: {failed}, Stopped (RAM): {stopped}")
    if failed > 0:
        print(f"ERROR: {failed}/{len(scenes)} scenes failed", file=sys.stderr)
        sys.exit(1)
    if stopped > 0:
        # Non-fatal: scenes already generated are on disk + registered in
        # scenes.json with their hashes. Re-running `complete` will skip
        # them and resume from where we stopped.
        print(f"WARN: stopped early due to RAM pressure. "
              f"Re-run `pipeline.py complete <title>` to resume.",
              file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
