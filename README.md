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
- Python 3.8+
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

# The pipeline is driven by SKILL.md — load it into your AI agent
# and follow the 10 steps
```

## Project Structure

```
full-video-pipeline/
├── SKILL.md                  # Master orchestrator (agent follows this)
├── pipeline_config.json      # Default settings (voice, render, system limits)
├── package.json              # npm workspace config
├── schemas/
│   ├── scenes.schema.json    # JSON Schema for scenes.json
│   └── pipeline_state.schema.json
├── scripts/
│   ├── check_system.sh       # Pre-flight resource check
│   ├── generate_voiceover.py # edge-tts audio generation
│   ├── measure_durations.py  # ffprobe duration measurement
│   ├── new-video.ps1         # Scaffold a new video project
│   ├── render_scene.sh       # Remotion renderer with guardrails
│   ├── stitch_scene.sh       # Per-scene video+audio merge
│   └── stitch_final.sh       # Final scene concatenation
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
        ├── remotion/         # Remotion project (scaffolded per video)
        │   ├── src/scenes/
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
    "post_render_settle_seconds": 5
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

Each video tracks progress in `pipeline_state.json`. If the pipeline stops:

1. Read `pipeline_state.json` to find the last completed step
2. Resume from the next incomplete step
3. Steps 1-4 are fast to re-do if corrupted
4. Steps 5-6: verify files exist before skipping
5. Steps 7-8: verify project builds before skipping
6. Steps 9-10: re-do from where `render_status != "stitched"`

## How the Agent Uses It

The agent loads `SKILL.md` and follows the 10 steps. Each step specifies:

- **Goal**: What to accomplish
- **Action**: Exact commands and instructions
- **Output**: Files produced
- **Validation**: How to verify success

The agent uses its existing tools (read, write, bash, web search) — no special framework required.

## Helper Scripts

All scripts accept a video directory as the first argument:

```bash
# Scaffold a new video project
powershell scripts/new-video.ps1 -Title "my-video"

# Generate voiceover
python3 scripts/generate_voiceover.py videos/my-video/ --voice en-US-GuyNeural

# Measure durations
python3 scripts/measure_durations.py videos/my-video/

# Render a scene
bash scripts/render_scene.sh videos/my-video/ 1

# Stitch scene with audio
bash scripts/stitch_scene.sh videos/my-video/ 1

# Final concatenation
bash scripts/stitch_final.sh videos/my-video/ v1

# System check
bash scripts/check_system.sh
```

## License

MIT
