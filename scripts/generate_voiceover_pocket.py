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
  1. Deferred model load — pre-flight idempotency check skips model load
     entirely when every scene is unchanged (0.3s no-op re-run vs 30s)
  2. Stream-to-disk generation (no full-audio tensor in memory)
  3. quantize=True (halves runtime memory, no quality loss)
  4. Voice state loaded once and reused across all scenes
  5. Forced concurrency=1 (no parallel model invocations)
  6. RAM floor pre-check (refuses to load the model if it won't fit)
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


def _load_scenes_index(video_dir) -> dict:
    """One-shot read of scenes.json → {scene_id: scene_dict}. Used by the
    pre-flight pass and the all-skip early-return path so we don't
    re-read scenes.json once per scene (the prior shape was N reads).
    """
    scenes_path = os.path.join(video_dir, "scenes.json")
    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {s["id"]: s for s in data.get("scenes", [])}


def scene_is_current(scene, existing_idx, voiceover_dir, voice, rate, volume, pitch) -> bool:
    """Idempotency check ONLY — returns True if the scene's MP3 already
    exists on disk AND the stored voiceover_hash matches the recomputed
    hash. Used both in generate_one (real skip path) and in a pre-flight
    pass that lets us short-circuit model loading when every scene is
    unchanged.

    `existing_idx` is a {scene_id: scene_dict} from a single prior
    _load_scenes_index() call. Passing it in lets callers do ONE read of
    scenes.json across the entire pre-flight pass instead of one per
    scene (12 scenes → 1 read vs 12).

    Why a pre-flight matters: pocket-tts pays ~10-30s + ~700 MB to load
    the model and voice state. If every scene is unchanged, we want to
    skip that overhead entirely. edge-tts has no model load, so the same
    pattern there is essentially free; here it's the difference between
    a 0.3s no-op re-run and a 30s 700MB-spin-up no-op re-run on a
    1 GB t3.micro. So we pre-flight before loading anything.
    """
    mp3_path = os.path.join(voiceover_dir, f"scene-{scene['id']:02d}.mp3")
    if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) == 0:
        return False
    existing = existing_idx.get(scene["id"])
    if not existing:
        return False
    voice_hash = pl.hash_voiceover(scene["text"], voice, rate, volume, pitch)
    return existing.get("voiceover_hash") == voice_hash


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
                 voice, rate, volume, pitch, logpath, min_ram_mb, existing_idx):
    """Generate one scene's MP3 with idempotency + RAM pulse check.

    `existing_idx` is the {scene_id: scene_dict} from a single prior
    _load_scenes_index() call in main() — reused across scenes so we
    avoid one disk read per scene for the skip check + duration log.
    """
    scene_id = scene["id"]
    text = scene["text"]
    wav_file = f"scene-{scene_id:02d}.wav"
    mp3_file = f"scene-{scene_id:02d}.mp3"
    wav_path = os.path.join(voiceover_dir, wav_file)
    mp3_path = os.path.join(voiceover_dir, mp3_file)
    relative_path = f"voiceover/{mp3_file}"
    voice_hash = pl.hash_voiceover(text, voice, rate, volume, pitch)

    # Idempotency check via the shared helper. The decision lives in
    # scene_is_current so main()'s pre-flight pass and generate_one agree.
    if scene_is_current(scene, existing_idx, voiceover_dir,
                        voice, rate, volume, pitch):
        existing = existing_idx.get(scene_id, {})
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
    # Quantize on by default; either CLI flag or per-engine config disables.
    # Expression inverted for readability from the prior form.
    quantize = not (args.no_quantize or vo.get("no_quantize", False))
    # rate/volume/pitch flow through hash_voiceover so idempotency keys
    # are stable across engine swaps; pocket-tts itself ignores them.
    rate = args.rate or vo.get("rate", "+0%")
    volume = args.volume or vo.get("volume", "+0%")
    pitch = args.pitch or vo.get("pitch", "+0Hz")
    # Mid-run pulse check floor: separate from the pre-load floor defined
    # later (MIN_FREE_FOR_POCKET_MB, ~534 MB, used only as a model-load
    # gate). `min_ram_mb` here is the user's operating-system floor — the
    # same key edge-tts uses — and represents the threshold below which
    # we stop the batch rather than risk OOM mid-scene. Default is 200 MB
    # (matches the repo-root config). Using the OS floor here (not the
    # stricter model-load floor) lets scenes proceed down to ~200 MB free
    # so the model's own in-RAM residence doesn't itself trip the alarm.
    min_ram_mb = sys_cfg.get("min_available_ram_mb", 200)

    os.makedirs(voiceover_dir, exist_ok=True)

    scenes = parse_voiceover_md(voiceover_md)
    if not scenes:
        print("ERROR: No scenes found in VOICEOVER.md", file=sys.stderr)
        sys.exit(2)

    print(f"Found {len(scenes)} scenes total")
    print(f"Engine: pocket-tts   Voice: {voice}   Language: {language}")
    print(f"Quantized: {quantize}   Mode: sequential (CPU-bound)")
    print(f"rate/volume/pitch flags IGNORED for pocket-tts (logged for hash-compat)")

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== generate_voiceover_pocket.py run {pl.now_iso()} ===\n")
        logf.write(f"voice={voice} language={language} quantize={quantize} "
                   f"mode=sequential\n")

    # ------------------------------------------------------------------
    # Pre-flight idempotency check on EVERY scene. If every scene is
    # unchanged, we exit 0 WITHOUT importing pocket_tts or loading the
    # model. This is the critical OOM/latency optimization vs the naive
    # "load model first, then check" pattern: on a re-run after a
    # successful generation, pocket-tts would otherwise burn ~10-30s
    # and ~700 MB of RAM just to print "skip" 12 times. The matching
    # edge-tts path is essentially free because edge-tts has no model.
    # ------------------------------------------------------------------
    # One disk read for the whole pre-flight + all-skip path; generate_one
    # receives the same index via argument so it doesn't re-read either.
    existing_idx = _load_scenes_index(video_dir)
    pending = [s for s in scenes
               if not scene_is_current(s, existing_idx, voiceover_dir,
                                       voice, rate, volume, pitch)]
    if not pending:
        free = available_ram_mb()
        msg = (f"All {len(scenes)} scenes unchanged — skipping model load "
               f"and exiting 0. Free RAM: {free:.0f}MB (model NOT loaded).")
        print(msg)
        with open(log_file, "a", encoding="utf-8") as logf:
            logf.write(msg + "\n")
            for s in scenes:
                mp3_name = f"scene-{s['id']:02d}.mp3"
                existing_dur = (existing_idx.get(s["id"], {})
                                .get("actual_duration_seconds")) or 0
                line = f"Scene {s['id']}: skip (unchanged) — {mp3_name} ({existing_dur:.2f}s)"
                logf.write(line + "\n")
                print(line)
        print("\nVoiceover generation complete.")
        print(f"  Generated: 0, Skipped (unchanged): {len(scenes)}, "
              f"Failed: 0, Stopped (RAM): 0")
        return  # exit 0 implicitly

    print(f"{len(pending)} of {len(scenes)} scenes need regeneration; "
          f"loading model.")

    # ------------------------------------------------------------------
    # RAM floor pre-check — only matters if we're about to load the model.
    # Pays nothing when the pre-flight short-circuited above.
    # ------------------------------------------------------------------
    free = available_ram_mb()
    needed = MIN_FREE_FOR_POCKET_MB if quantize else 450 + SAFETY_MARGIN_MB
    if free < needed:
        msg = (f"ERROR: insufficient free RAM for pocket-tts: "
               f"{free:.0f}MB available, need ~{needed}MB "
               f"(model {'234MB quantized' if quantize else '450MB unquantized'} "
               f"+ {SAFETY_MARGIN_MB}MB margin for PyTorch runtime + buffers). "
               f"Options: (a) keep voiceover.no_quantize=false (default, smallest); "
               f"(b) free RAM on the host before re-running; "
               f"(c) move to a box with >=1.5GB free RAM at Step 5; "
               f"(d) switch back to the edge-tts engine "
               f"(set voiceover.engine='edge' and revert "
               f"steps.5_voiceover_generation.command_template in pipeline_config.json).")
        print(msg, file=sys.stderr)
        with open(log_file, "a", encoding="utf-8") as logf:
            logf.write(f"REFUSED {pl.now_iso()}: {msg}\n")
        sys.exit(2)

    print(f"Free RAM at start: {free:.0f}MB (need ~{needed}MB)")

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

    # Load model ONCE, reuse across all scenes that need regeneration.
    # The pre-flight pass above already filtered out unchanged scenes, so
    # every iteration of the loop below does real work.
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
                             voice, rate, volume, pitch, log_file, min_ram_mb,
                             existing_idx)
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
