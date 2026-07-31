# Directory Structure

## Repo layout

```
full-video-pipeline/
├── SKILL.md                     # Orchestrator contract (agent follows this)
├── references/                  # Phase details, config, troubleshooting (this directory)
├── pipeline.py                  # CLI: new, run, continue, complete, status, validate, preview, captions, clean
├── pipeline_config.json         # Default settings (voice, render, system limits)
├── package.json                 # npm workspace config
├── scripts/
│   ├── _pipeline_lib.py          # Shared helpers (config, paths, atomic IO, ffprobe, hashing)
│   ├── validate.py               # JSON-schema validation for scenes.json + pipeline_state.json
│   ├── check_system.sh           # Pre-flight resource check
│   ├── generate_voiceover.py     # edge-tts audio generation (idempotent + parallel)
│   ├── measure_durations.py      # ffprobe duration measurement
│   ├── render_scene.py           # HyperFrames renderer with psutil-based guardrails (Linux)
│   ├── assemble.py               # Efficient single-pass stitching (atomic, codec-safe)
│   ├── render_thumbnail.py       # HyperFrames render + ffmpeg PNG extract for YouTube thumbnail
│   ├── generate_captions.py      # SRT sidecar + per-scene caption cues
│   └── requirements.txt          # Python deps
├── hyperframes-foundation/         # Template for new HyperFrames projects
│   ├── index.html                  # Root composition (aggregates per-scene sub-comps)
│   ├── compositions/
│   │   ├── scene-NN.html.example   # Per-scene sub-composition template
│   │   └── thumbnail.html         # Phase 4 thumbnail composition stub
│   ├── styles/tokens.css           # palette + font tokens (single source of truth)
│   ├── package.json                # pinned hyperframes CLI scripts (dev/lint/check/render)
│   ├── hyperframes.json            # registry config for `npx hyperframes add`
│   ├── meta.json, AGENTS.md, .gitignore, assets/.gitkeep
├── schemas/
│   ├── scenes.schema.json
│   └── pipeline_state.schema.json
├── skills/
│   ├── claude-youtube/           # Script writing reference (submodule)
│   └── hyperframes/              # HyperFrames skills bundle (populate before Phase 3 needs it —
│                                  # see "Skill file loading" in SKILL.md for the fallback if it's absent)
└── videos/
    └── {video-title}/            # See "Per-video layout" below
```

## Per-video layout

```
videos/{video-title}/
├── SCRIPT.md            # Phase 1: full retention-optimized script
├── VOICEOVER.md          # Phase 2: parseable voiceover text per scene
├── STYLES.md            # Phase 3: visual style guide
├── TITLE.md              # Phase 4: 3 YouTube title variants
├── DESCRIPTION.md        # Phase 4: YouTube description with timestamps
├── TAGS.md               # Phase 4: 10-15 YouTube tags
├── scenes.json          # Structured scene data (durations, status, files, hashes, visual_notes, captions)
├── pipeline_state.json  # Pipeline progress (per-step attempts + last_error)
├── voiceover_aligned.mp3  # Concatenated voiceover (created by assemble.py)
├── {title}.srt           # Optional caption sidecar
├── hyperframes/         # HyperFrames project (scaffolded per video)
│   ├── index.html       # Root composition (aggregates per-scene sub-comps via data-composition-src)
│   ├── PLAN.md          # Authoring plan before writing scenes (Step 8)
│   ├── compositions/
│   │   ├── scene-01.html          # One per scene (agent authors in Step 8)
│   │   ├── scene-02.html
│   │   ├── ...
│   │   ├── scene-NN.html.example  # Scaffold template (do NOT render — copy to scene-NN.html first)
│   │   ├── thumbnail.html         # Phase 4 thumbnail composition (filled in Step 12)
│   │   └── components/            # Optional: blocks installed via `npx hyperframes add`
│   ├── styles/
│   │   └── tokens.css             # palette + font tokens (mirrors STYLES.md)
│   ├── assets/                    # local images / b-roll / non-voiceover audio
│   ├── hyperframes.json           # registry config for `npx hyperframes add`
│   ├── package.json               # pinned hyperframes CLI scripts (lint, check, render, dev)
│   └── meta.json                  # project id + scaffold timestamp
├── voiceover/           # Generated .mp3 files
├── scenes/              # Rendered .mp4 scene files (silent video)
├── logs/                # Per-step + per-scene append-only logs
└── versions/             # Final stitched .mp4 + thumbnail .png
    ├── {title}-v1.mp4
    └── {title}-thumbnail-v1.png
```
