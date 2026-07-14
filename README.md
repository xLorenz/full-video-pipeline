# Full Video Pipeline

Autonomous YouTube video production pipeline for AI agents. Takes a topic idea and produces a fully rendered video with voiceover, visuals, and audio — end to end. Linux-only.

## What It Does

4 phases (13 internal steps) take a topic idea and produce a fully rendered YouTube video with voiceover, visuals, audio, title/description/tags, and a Remotion-rendered thumbnail.

| Phase | Steps | Agent produces | Auto-runs after `complete` |
|-------|-------|----------------|-----------------------------|
| **Phase 1: Research & Script** | 1-3 | `SCRIPT.md` + `scenes.json` (web research + retention-optimized script: hook / pattern interrupts / CTAs) | — |
| **Phase 2: Voiceover** | 4-6 | `VOICEOVER.md` (TTS-ready text per scene) | Step 5 (edge-tts, idempotent + parallel), Step 6 (ffprobe duration measurement) |
| **Phase 3: Visuals & Render** | 7-10 | `STYLES.md` + Remotion project (`Root.tsx`, `MainVideo.tsx`, `Thumbnail.tsx` stub, `lib/*`, `scenes/SceneXX.tsx`). Scenes render **silent video** — voiceover is muxed at stitch time. | Step 9 (one-scene-at-a-time rendering with hardware guardrails, resumable per-scene), Step 10 (single-pass ffmpeg stitch) |
| **Phase 4: Metadata & Thumbnail** | 11-13 | `TITLE.md` (3 variants), `DESCRIPTION.md` (with chapters/timestamps), `TAGS.md`, `Thumbnail.tsx` (pure Remotion primitives, no AI images) | Step 13 (`npx remotion still` to versioned PNG) |

The orchestrator advances state one step at a time internally; the SKILL.md presents them as 4 phases so the agent has a single coherent context per block of creative work. Each creative phase prints a "Follow these instructions:" block referencing external skill files under `skills/` (script writing, Remotion coding, SEO, thumbnail design). The orchestrator's trailer also includes a `skills_files` array with the exact paths for the current phase.

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

# Override config from a custom JSON (applied before per-video auto-discovery)
python3 pipeline.py --config /path/to/custom.json run "my-video-topic"

# RECOMMENDED: one-shot scaffold + advance (resume-safe — re-run to continue)
python3 pipeline.py run "my-video-topic"

# After each creative phase (producing SCRIPT.md, VOICEOVER.md, STYLES.md+remotion/,
# TITLE/DESCRIPTION/TAGS+Thumbnail.tsx), validate + auto-run the next automated steps:
python3 pipeline.py complete "my-video-topic"

# Continue without auto-chain (runs one step at a time, prints creative briefs):
python3 pipeline.py continue "my-video-topic"

# Validate scenes/state against schemas (called automatically by `continue`/`complete`)
python3 pipeline.py validate my-video-topic

# Check pipeline status
python3 pipeline.py status

# Optional: smoke-render scene 1 (low-res, ~20 frames) after Phase 3
python3 pipeline.py preview my-video-topic

# Optional: generate captions SRT + populate scene cues (after Phase 2)
python3 pipeline.py captions my-video-topic

# Free disk space for a completed video (removes node_modules, old versions, TMPDIR, etc.)
python3 pipeline.py clean my-video-topic
```

> **Note on round trips**: the "4 creative phases" reduction holds when you use
> `complete` to advance (because `complete` auto-runs the automated sub-steps
> within a phase — Steps 5-6, 9-10, 13 — in a single invocation). An agent using
> `continue` exclusively still takes ~13 iterations (one per step). `complete`
> is the speed path; `continue` is the manual / debug path.

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
│   ├── render_thumbnail.py        # Remotion still render for YouTube thumbnail
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
        ├── TITLE.md              # 3 YouTube title variants (Step 11)
        ├── DESCRIPTION.md        # YouTube description with timestamps (Step 11)
        ├── TAGS.md               # 10-15 YouTube tags (Step 11)
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
        │   │   ├── components/Thumbnail.tsx  # Thumbnail composition (Step 12)
        │   │   ├── lib/{types,config,styles}.ts
        │   │   └── scenes/
        │   └── public/
        ├── voiceover/            # Generated .mp3 files
        ├── scenes/               # Rendered .mp4 scene files (silent video)
        └── versions/             # Final stitched .mp4 videos + thumbnail .png
            ├── {title}-v1.mp4
            └── {title}-thumbnail-v1.png
```

## Configuration

Edit `pipeline_config.json` to change defaults. The config supports a three-layer merge:

1. **Repo-root** `pipeline_config.json` — defaults
2. **`--config <path>`** CLI flag — override any subset (passed before the subcommand)
3. **Per-video auto-discovery** — `videos/<title>/pipeline_config.json` (enable/disable via `config_files.auto_discover_per_video`)

```json
{
  "skills": {
    "sources": [
      {
        "name": "claude-youtube",
        "path": "skills/claude-youtube/skills/claude-youtube",
        "phases": {
          "1": ["sub-skills/script.md", "references/retention-scripting-guide.md"],
          "4": ["sub-skills/metadata.md", "references/seo-playbook.md",
                 "sub-skills/thumbnail.md", "references/thumbnail-ctr-guide.md"]
        }
      },
      {
        "name": "remotion-best-practices",
        "path": "skills/remotion-best-practices/skills/remotion",
        "phases": {
          "3": ["SKILL.md", "rules/video-layout.md", "rules/calculate-metadata.md",
                "rules/transitions.md", "rules/sequencing.md",
                "rules/compositions.md", "rules/effects.md", "rules/voiceover.md"]
        }
      }
    ]
  },
  "steps": {
    "5_voiceover_generation": {
      "command_template": "python3 scripts/generate_voiceover.py {video_dir} --voice {voiceover.voice}"
    },
    "6_duration_measurement": {
      "command_template": "python3 scripts/measure_durations.py {video_dir}"
    },
    "9_scene_rendering": {
      "command_template": "python3 scripts/render_scene.py {video_dir} {scene_id}"
    },
    "10_stitching": {
      "command_template": "python3 scripts/assemble.py {video_dir}"
    },
    "13_thumbnail_rendering": {
      "command_template": "python3 scripts/render_thumbnail.py {video_dir}"
    }
  },
  "config_files": {
    "auto_discover_per_video": true
  },
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
    "chrome_kill_between_renders": true,
    "post_render_settle_seconds": 5,
    "temp_dir": "/tmp/remotion/{title}"
  },
  "retention": {
    "keep_versions": 2,
    "clean_voiceover_aligned_after_stitch": true,

    "clean_remotion_node_modules_after_step_13": true,
    "clean_preview_after_success": true,
    "reap_remotion_tmpdir_after_render": true,
    "max_log_size_mb": 0,
    "keep_last_n_log_runs": 10,
    "clean_scene_mp4s_after_stitch": false
  }
}
```

The `retention` section controls automatic disk cleanup (all optional, sensible
defaults). Set `max_log_size_mb: 0` to disable log rotation (unlimited). Set
`clean_scene_mp4s_after_stitch: true` to delete per-scene MP4s after a stitch
(saves ~1 GB per video but forfeits re-stitch without re-render).

The `steps.{key}.command_template` strings support `{variable}` substitution:
`{video_dir}`, `{scene_id}`, and any dotted config path (e.g., `{voiceover.voice}`,
`{render.crf}`, `{video.fps}`). Override a template per-video to swap in a different
binary or plugin without touching the orchestrator code.

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

Use `python3 pipeline.py run <title>` (resume-safe: detects existing project
and calls `continue`) or `python3 pipeline.py continue <title>` to resume:

1. Validates `scenes.json` + `pipeline_state.json` against schemas
   (`scripts/validate.py`). Refuses to run automated steps on invalid state.
2. Reads `pipeline_state.json` to find the next incomplete step.
3. Runs the next automated step (5, 6, 9, 10, or 13), or
4. Prints the next creative phase's brief (Steps 1-4, 7, 8, 11, 12) with
   phase number, anchor to SKILL.md, and expected artifacts.
5. Per-step attempts and `last_error` are recorded for forensics.

The dramatically faster path is `python3 pipeline.py complete <title>` after
each creative phase — this validates your artifacts, advances state, and
**auto-runs all consecutive automated steps in a single invocation**
(Steps 5-6 after Phase 2's voiceover text; Steps 9-10 after Phase 3's Remotion
code; Step 13 after Phase 4's Thumbnail.tsx), stopping at the next creative
phase brief or "All steps complete!". This collapses 8 creative round trips
into 4.

Each video tracks progress in `pipeline_state.json`:
- Steps 1-4: creative input required (topic, research, script, voiceover text)
- Steps 5-6: automated (TTS generation [idempotent], duration measurement)
- Steps 7-8: creative input required (style definition, Remotion coding)
- Steps 9-10: automated (resumable scene rendering, atomic stitching)
- Steps 11-12: creative input required (metadata, thumbnail composition)
- Step 13: automated (thumbnail still render, idempotent via versioning)

`complete --step N` is refused if any earlier step is still pending, unless
you pass `--force` (the gap will be flagged by `audit`/`doctor`).

Pass `--config <path>` before the subcommand to override any subset of the
pipeline configuration. This is useful for CI/CD, multi-environment deployments,
or A/B testing render settings without modifying the repo-root config.

## Machine-Readable Trailer

Every `continue`/`complete`/`run` invocation ends with a `__PIPELINE_NEXT__`
JSON line for agents that prefer to skip text parsing:

```json
__PIPELINE_NEXT__ {"step":3,"name":"Script Writing","kind":"creative","action":"await_complete","exit":0,"phase":1,"next_cmd":"python3 pipeline.py complete my-video","skills_section":"#phase-1-research--script","skills_files":["skills/claude-youtube/skills/claude-youtube/sub-skills/script.md","skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md"],"expected_artifacts":["SCRIPT.md"]}
```

Fields: `step` (0 for terminal), `kind` (`creative`/`automated`/`done`),
`action` (`await_complete`/`run_continue`/`fix_and_continue`/`use_continue`/`noop`/`done`),
`phase` (1-4, 0 for terminal), `next_cmd` (exact command to run next),
`skills_section` (SKILL.md anchor), `skills_files` (skill file paths for the phase),
`expected_artifacts` (files to produce).

## Logs

Every automated step and every per-scene render appends to a structured log file
under `videos/<title>/logs/`. Step-level files: `step-5.log`, `step-6.log`,
`step-9-scene-{id}.log`, `step-10.log`, `step-13.log`. These are append-only
and survive across runs — useful for post-mortem analysis of overnight failures.

## Helper Scripts

```bash
# Pipeline CLI
python3 pipeline.py --config custom.json run "my-video"  # With config override (any subcommand)
python3 pipeline.py run "my-video"                 # One-shot: scaffold + advance (resume-safe)
python3 pipeline.py new "my-video"                 # Scaffold project only
python3 pipeline.py continue my-video              # Run next step (validates state first)
python3 pipeline.py complete my-video              # Validate current creative phase + auto-run next automated steps
python3 pipeline.py complete my-video --step 7    # Complete a specific step (refused if earlier steps pending)
python3 pipeline.py complete my-video --step 7 --force  # Out-of-order override (audit/doctor will flag)
python3 pipeline.py status my-video                # Show specific project (with attempts column)
python3 pipeline.py validate my-video              # Standalone schema validation
python3 pipeline.py validate my-video --step 6     # Step-specific requirements
python3 pipeline.py preview my-video               # Smoke-render scene 1
python3 pipeline.py captions my-video              # Generate SRT + populate captions
python3 pipeline.py audit my-video                # Audit for violations
python3 pipeline.py doctor my-video                # System + project diagnostics
python3 pipeline.py clean my-video                 # Free disk space (all safe-to-delete items)

# Individual scripts (orchestrator runs these for you — only call manually for debugging)
python3 scripts/generate_voiceover.py videos/my-video/ --voice en-GB-RyanNeural
python3 scripts/measure_durations.py videos/my-video/
python3 scripts/render_scene.py videos/my-video/ 1
python3 scripts/assemble.py videos/my-video/
python3 scripts/generate_captions.py videos/my-video/
python3 scripts/render_thumbnail.py videos/my-video/
python3 scripts/validate.py videos/my-video/
bash scripts/check_system.sh
```

## License

MIT
