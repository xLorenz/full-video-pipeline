# Full Video Pipeline

Autonomous YouTube video production pipeline for AI agents. Takes a topic idea and produces a fully rendered video with voiceover, visuals, and audio — end to end. Linux-only.

## What It Does

1. **Topic Selection** — Web research to find trending topics in a niche
2. **Research** — Deep information gathering on the chosen topic
3. **Script Writing** — Retention-optimized script with hooks, pattern interrupts, CTAs
4. **Voiceover Writing** — Parseable voiceover text per scene
5. **TTS Generation** — Audio files via edge-tts (free, no API key needed). Idempotent (unchanged scenes are skipped), parallel (config: `voiceover.concurrency`)
6. **Duration Measurement** — Real timing from generated audio
7. **Style Definition** — Visual style guide (colors, fonts, animations) — single source of visual decisions
8. **Remotion Coding** — React-based video compositions per scene. Scenes render **silent video** — voiceover is muxed at stitch time, not baked into scene MP4s
9. **Scene Rendering** — One scene at a time with hardware guardrails. Resumable per-scene (failed scenes track `render_attempts` and `last_render_error`)
10. **Stitching** — Combine silent scene MP4s + concatenated voiceover MP3 into final MP4. One audio pass total

## Optional: Captions

```bash
python3 pipeline.py captions <title>
```

Generates `videos/<title>/<title>.srt` (YouTube sidecar) and populates per-scene `captions` cues in `scenes.json`. To burn captions into the video, set `video.burn_captions: true` in `pipeline_config.json` — the scaffolded Remotion project will then render a `<Captions>` layer from the scene cues. Off by default (preserves render performance).

## Requirements

- Linux
- Node.js 18+
- Python 3.9+
- ffmpeg / ffprobe
- Git

```bash
pip install -r scripts/requirements.txt   # edge-tts, jsonschema, psutil
```

## Quick Start

```bash
# Clone with submodules
git clone --recurse-submodules <repo-url>
cd full-video-pipeline

# Install Python deps
pip install -r scripts/requirements.txt

# Check system readiness
bash scripts/check_system.sh

# Scaffold a new video project
python3 pipeline.py new "my-video-topic"

# Validate scenes/state against schemas (called automatically by `continue`)
python3 pipeline.py validate my-video-topic

# Check pipeline status
python3 pipeline.py status

# Continue to next step
python3 pipeline.py continue "my-video-topic"

# Optional: smoke-render scene 1 (low-res, ~20 frames) after step 8
python3 pipeline.py preview my-video-topic

# Optional: generate captions SRT + populate scene cues (after step 6)
python3 pipeline.py captions my-video-topic
```

## Project Structure

```
full-video-pipeline/
├── SKILL.md                     # Master orchestrator (agent follows this)
├── pipeline.py                  # CLI: new, continue, status, validate, preview, captions
├── pipeline_config.json         # Default settings (voice, render, system limits)
├── package.json                 # npm workspace config
├── scripts/
│   ├── _pipeline_lib.py          # Shared helpers (config, paths, atomic IO, ffprobe, hashing)
│   ├── validate.py               # JSON-schema validation for scenes.json + pipeline_state.json
│   ├── check_system.sh           # Pre-flight resource check
│   ├── generate_voiceover.py     # edge-tts audio generation (idempotent + parallel)
│   ├── measure_durations.py      # ffprobe duration measurement
│   ├── render_scene.py           # Remotion renderer with psutil-based guardrails (Linux)
│   ├── assemble.py               # Efficient single-pass stitching (atomic, codec-safe)
│   ├── generate_captions.py      # SRT sidecar + per-scene caption cues
│   └── requirements.txt          # Python deps
├── remotion-foundation/          # Template for new Remotion projects
│   └── src/components/Captions.tsx  # Optional burned-in caption layer
├── schemas/
│   ├── scenes.schema.json
│   └── pipeline_state.schema.json
├── skills/
│   ├── claude-youtube/           # Script writing reference (submodule)
│   └── remotion-best-practices/  # Remotion coding rules (submodule)
└── videos/
    └── {video-title}/
        ├── SCRIPT.md             # Full script
        ├── VOICEOVER.md          # Parseable voiceover text
        ├── STYLES.md             # Visual style guide
        ├── scenes.json           # Scene data (durations, status, files, hashes, captions)
        ├── pipeline_state.json   # Pipeline progress (per-step attempts + last_error)
        ├── logs/                 # Per-step + per-scene append-only logs
        ├── voiceover_aligned.mp3 # Concatenated voiceover (created by assemble.py)
        ├── {title}.srt           # Optional caption sidecar
        ├── remotion/             # Remotion project (scaffolded per video)
        │   ├── PLAN.md
        │   ├── src/
        │   │   ├── Root.tsx
        │   │   ├── components/MainVideo.tsx
        │   │   ├── lib/{types,config,styles}.ts
        │   │   └── scenes/
        │   └── public/
        ├── voiceover/            # Generated .mp3 files
        ├── scenes/               # Rendered .mp4 scene files (silent video)
        └── versions/            # Final stitched .mp4 videos (atomic writes)
```

## Configuration

Edit `pipeline_config.json` to change defaults:

```json
{
  "video": {
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "target_scene_duration_seconds": 10,
    "burn_captions": false
  },
  "voiceover": {
    "voice": "en-GB-RyanNeural",
    "rate": "+0%",
    "volume": "+0%",
    "pitch": "+0Hz",
    "concurrency": 3
  },
  "render": {
    "concurrency": 1,
    "gl_backend": "swangle",
    "image_format": "jpeg",
    "jpeg_quality": 80,
    "codec": "h264",
    "x264_preset": "ultrafast",
    "crf": 28,
    "disallow_parallel_encoding": true,
    "timeout_ms": 60000,
    "node_max_old_space_size_mb": 384
  },
  "stitching": {
    "final_codec": "libx264",
    "final_audio_codec": "aac",
    "final_crf": 23
  },
  "system": {
    "min_available_ram_mb": 200,
    "min_available_disk_mb": 500,
    "swap_target_mb": 2048,
    "chrome_kill_between_renders": true,
    "post_render_settle_seconds": 5,
    "temp_dir": "/tmp/remotion"
  }
}
```

List available voices: `edge-tts --list-voices`

## Audio Path (important)

Voiceover is **not** baked into scene MP4s. Scene components render silent video.
At stitch time, `assemble.py` concatenates the per-scene MP3s into one
`voiceover_aligned.mp3`, muxes it onto the concatenated scene MP4s in a single
ffmpeg pass, and writes the result atomically. This:

- Avoids Chrome decoding/syncing audio once per scene (faster renders)
- Keeps a single audio encode pass total (fastest path for low-RAM boxes)
- Requires scene `actual_duration_frames` to match the voiceover durations —
  already enforced by Step 6 (duration measurement).

## Resuming Interrupted Runs

Use `python3 pipeline.py continue <title>` to resume. The pipeline:

1. Validates `scenes.json` + `pipeline_state.json` against the schemas
   (`scripts/validate.py`). Refuses to run automated steps on invalid state.
2. Reads `pipeline_state.json` to find the next incomplete step.
3. Runs the next automated step (5, 6, 9, 10), or
4. Prints instructions for creative steps (1-4, 7, 8).
5. Per-step attempts and `last_error` are recorded for forensics.

Each video tracks progress in `pipeline_state.json`:
- Steps 1-4: creative input required (topic, research, script, voiceover text)
- Steps 5-6: automated (TTS generation [idempotent], duration measurement)
- Steps 7-8: creative input required (style definition, Remotion coding)
- Steps 9-10: automated (resumable scene rendering, atomic stitching)

## Logs

Every automated step and every per-scene render appends to a structured log file
under `videos/<title>/logs/`. Step-level files: `step-5.log`, `step-6.log`,
`step-9-scene-{id}.log`, `step-10.log`. These are append-only and survive across
runs — useful for post-mortem analysis of overnight failures.

## Helper Scripts

```bash
# Pipeline CLI
python3 pipeline.py new "my-video"             # Scaffold project
python3 pipeline.py status my-video            # Show specific project (with attempts column)
python3 pipeline.py continue my-video          # Run next step (validates state first)
python3 pipeline.py validate my-video          # Standalone schema validation
python3 pipeline.py preview my-video           # Smoke-render scene 1
python3 pipeline.py captions my-video          # Generate SRT + populate captions

# Individual scripts
python3 scripts/generate_voiceover.py videos/my-video/ --voice en-GB-RyanNeural
python3 scripts/measure_durations.py videos/my-video/
python3 scripts/render_scene.py videos/my-video/ 1
python3 scripts/assemble.py videos/my-video/
python3 scripts/generate_captions.py videos/my-video/
python3 scripts/validate.py videos/my-video/
bash scripts/check_system.sh
```

## License

MIT
