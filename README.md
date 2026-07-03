# Full Video Pipeline

Autonomous YouTube video production pipeline for AI agents. Takes a topic idea and produces a fully rendered video with voiceover, visuals, and audio — end to end.

## What It Does

1. **Topic Selection** — Web research to find trending topics in a niche
2. **Research** — Deep information gathering on the chosen topic
3. **Script Writing** — Retention-optimized script with hooks, pattern interrupts, CTAs
4. **Voiceover Writing** — Parseable voiceover text per scene
5. **TTS Generation** — Audio files via edge-tts (free, no API key needed)
6. **Duration Measurement** — Real timing from generated audio
7. **Style Definition** — Visual style guide (colors, fonts, animations) — single source of visual decisions
8. **Remotion Coding** — React-based video compositions per scene
9. **Scene Rendering** — One scene at a time with hardware guardrails
10. **Stitching** — Combine scenes + audio into final MP4

## Requirements

- Node.js 18+
- Python 3.9+
- ffmpeg / ffprobe
- Git

```bash
pip install edge-tts
```

## Quick Start

```bash
# Clone with submodules
git clone --recurse-submodules <repo-url>
cd full-video-pipeline

# Check system readiness
bash scripts/check_system.sh

# Scaffold a new video project
python3 pipeline.py new "my-video-topic"

# Check pipeline status
python3 pipeline.py status

# Continue to next step
python3 pipeline.py continue "my-video-topic"
```

## Project Structure

```
full-video-pipeline/
├── SKILL.md                  # Master orchestrator (agent follows this)
├── pipeline.py               # CLI: new, continue, status
├── pipeline_config.json      # Default settings (voice, render, system limits)
├── package.json              # npm workspace config
├── schemas/
│   ├── scenes.schema.json    # JSON Schema for scenes.json
│   └── pipeline_state.schema.json
├── scripts/
│   ├── check_system.sh       # Pre-flight resource check
│   ├── generate_voiceover.py # edge-tts audio generation
│   ├── measure_durations.py  # ffprobe duration measurement
│   ├── render_scene.sh       # Remotion renderer with guardrails
│   ├── assemble.py           # Efficient single-pass stitching
│   ├── stitch_scene.sh       # Legacy: per-scene video+audio merge
│   └── stitch_final.sh       # Legacy: final scene concatenation
├── remotion-foundation/      # Template for new Remotion projects
├── skills/
│   ├── claude-youtube/       # Script writing reference (submodule)
│   └── remotion-best-practices/ # Remotion coding rules (submodule)
└── videos/
    └── {video-title}/
        ├── SCRIPT.md         # Full script
        ├── VOICEOVER.md      # Parseable voiceover text
        ├── STYLES.md         # Visual style guide
        ├── scenes.json       # Scene data (durations, status, files)
        ├── pipeline_state.json
        ├── voiceover_aligned.mp3  # Concatenated voiceover
        ├── remotion/         # Remotion project (scaffolded per video)
        │   ├── src/
        │   │   ├── Root.tsx  # Single <Composition id="MainVideo">
        │   │   ├── components/
        │   │   │   └── MainVideo.tsx
        │   │   ├── lib/
        │   │   │   ├── types.ts
        │   │   │   ├── config.ts
        │   │   │   └── styles.ts
        │   │   └── scenes/
        │   └── public/
        ├── voiceover/        # Generated .mp3 files
        ├── scenes/           # Rendered .mp4 scene files
        └── versions/         # Final stitched .mp4 videos
```

## Configuration

Edit `pipeline_config.json` to change defaults:

```json
{
  "video": {
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "target_scene_duration_seconds": 10
  },
  "voiceover": {
    "voice": "en-GB-RyanNeural",
    "rate": "+0%",
    "volume": "+0%",
    "pitch": "+0Hz"
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
    "temp_dir": "/home/ubuntu/tmp/remotion"
  }
}
```

List available voices: `edge-tts --list-voices`

## Resource Constraints

Designed for t3.micro (1GB RAM, 500MB available):

| Setting | Why |
|---------|-----|
| `concurrency: 1` | Only 1 Chrome tab at a time |
| `gl_backend: swangle` | Software rendering, no GPU needed |
| `disallow-parallel-encoding` | Prevents rendering + encoding simultaneously |
| `image-format: jpeg` | Faster than PNG |
| `crf: 28` | Smaller files, faster encoding |
| `x264_preset: ultrafast` | Fastest encoding |
| `NODE_OPTIONS=--max-old-space-size=384` | Caps Node.js memory |
| Chrome cleanup between renders | Prevents memory leaks |

## Resuming Interrupted Runs

Use `python3 pipeline.py continue <title>` to resume. The pipeline reads
`pipeline_state.json` and either runs the next automated step (5, 6, 9, 10)
or prints instructions for creative steps (1-4, 7, 8).

Each video tracks progress in `pipeline_state.json`:
- Steps 1-4: creative input required (topic, research, script, voiceover text)
- Steps 5-6: automated (TTS generation, duration measurement)
- Steps 7-8: creative input required (style definition, Remotion coding)
- Steps 9-10: automated (scene rendering, final assembly)

## How the Agent Uses It

The agent loads `SKILL.md` and follows the 10 steps. Each step specifies:

- **Goal**: What to accomplish
- **Action**: Exact commands and instructions
- **Output**: Files produced
- **Validation**: How to verify success

The agent uses its existing tools (read, write, bash, web search) — no special framework required.

## Helper Scripts

```bash
# Pipeline CLI
python3 pipeline.py new "my-video"           # Scaffold project
python3 pipeline.py status                    # Show all projects
python3 pipeline.py status my-video           # Show specific project
python3 pipeline.py continue my-video         # Run next step

# Individual scripts
python3 scripts/generate_voiceover.py videos/my-video/ --voice en-GB-RyanNeural
python3 scripts/measure_durations.py videos/my-video/
bash scripts/render_scene.sh videos/my-video/ 1
python3 scripts/assemble.py videos/my-video/
bash scripts/check_system.sh
```

## License

MIT
