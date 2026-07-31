# Full Video Pipeline

Autonomous YouTube video production pipeline for AI agents. Takes a topic idea and produces a fully rendered video with voiceover, visuals, and audio — end to end. Linux-only.

> **This README is for humans setting up the repo.** The agent-facing
> instructions live in [`SKILL.md`](./SKILL.md) and [`references/`](./references/)
> — that's the source of truth for pipeline behavior. Where this file and
> `SKILL.md` would otherwise say the same thing twice, this file links out
> instead, so there's one place to update.

## What It Does

4 phases (13 internal steps) take a topic idea and produce a fully rendered YouTube video with voiceover, visuals, audio, title/description/tags, and a HyperFrames-rendered thumbnail.

| Phase | Steps | Agent produces | Auto-runs after `complete` |
|-------|-------|----------------|-----------------------------|
| **Phase 1: Research & Script** | 1-3 | `SCRIPT.md` + `scenes.json` (web research + retention-optimized script: hook / pattern interrupts / CTAs) | — |
| **Phase 2: Voiceover** | 4-6 | `VOICEOVER.md` (TTS-ready text per scene) | Step 5 (edge-tts, idempotent + parallel), Step 6 (ffprobe duration measurement) |
| **Phase 3: Visuals & Render** | 7-10 | `STYLES.md` + HyperFrames project (`PLAN.md`, `index.html`, `compositions/scene-NN.html`, `styles/tokens.css`). Scenes render **silent video** — voiceover is muxed at stitch time. | Step 9 (one-scene-at-a-time rendering with hardware guardrails, resumable per-scene), Step 10 (single-pass ffmpeg stitch) |
| **Phase 4: Metadata & Thumbnail** | 11-13 | `TITLE.md` (3 variants), `DESCRIPTION.md` (with chapters/timestamps), `TAGS.md`, `compositions/thumbnail.html` (pure HTML/CSS/GSAP, no AI images) | Step 13 (`npx hyperframes render` + ffmpeg PNG extract → versioned PNG) |

Full per-phase detail (formats, authoring contracts, validation checklists) lives in `references/phase-1-research-script.md` through `references/phase-4-metadata-thumbnail.md`.

The orchestrator advances state one step at a time internally; `SKILL.md` presents them as 4 phases so the agent has a single coherent context per block of creative work. Each creative phase prints a "Follow these instructions:" block referencing external skill files under `skills/` (script writing, HyperFrames composition authoring, SEO, thumbnail design). The orchestrator's trailer also includes a `skills_files` array with the exact paths for the current phase.

> Note: `skills/hyperframes/` (referenced by Phase 3) ships as an empty
> placeholder in this repo layout until the HyperFrames skills bundle is
> populated. The agent falls back to `hyperframes/AGENTS.md` and the inline
> rules in `references/phase-3-visuals-render.md` when those files are
> missing — see "Skill file loading" in `SKILL.md`.

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

# After each creative phase (producing SCRIPT.md, VOICEOVER.md, STYLES.md+hyperframes/,
# TITLE/DESCRIPTION/TAGS+compositions/thumbnail.html), validate + auto-run the next automated steps:
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

Full CLI reference (every subcommand + individual scripts for debugging): `references/helper-scripts.md`.

## Project Structure

Top-level layout and the full per-video output layout are in
[`references/directory-structure.md`](./references/directory-structure.md).

```
full-video-pipeline/
├── SKILL.md              # Agent-facing orchestrator contract
├── references/           # Phase details, config, troubleshooting, directory map
├── pipeline.py            # CLI entry point
├── pipeline_config.json  # Default settings
├── scripts/               # Automated-step implementations (orchestrator-invoked only)
├── hyperframes-foundation/ # Template for new per-video HyperFrames projects
├── schemas/                # scenes.schema.json, pipeline_state.schema.json
├── skills/                 # script writing / SEO / HyperFrames sub-skills
└── videos/{video-title}/   # Per-video working directory and output
```

## Configuration

`pipeline_config.json` supports a three-layer merge: repo-root defaults →
`--config <path>` CLI override → per-video `videos/<title>/pipeline_config.json`
auto-discovery. Full key reference, the complete example config, and the
disk-cleanup (`retention.*`) table are in
[`references/configuration.md`](./references/configuration.md).

List available TTS voices: `edge-tts --list-voices`

## Audio Path (important)

Voiceover is **not** baked into scene MP4s — scenes render silent, and
`assemble.py` muxes the concatenated voiceover onto the concatenated scene
video in a single ffmpeg pass at stitch time. Full rationale is in the
"Audio Path" section of `SKILL.md` (it's called out there rather than here
because the agent needs to know it before Phase 3 composition authoring
begins, not just at stitch time).

## Resuming Interrupted Runs

`python3 pipeline.py run <title>` (or `continue <title>`) resumes an
interrupted pipeline — it validates state against the schemas, finds the
next incomplete step, and either runs the next automated step or prints the
next creative phase's brief. Full resume mechanics, per-step state tracking,
and the error-recovery table are in
[`references/troubleshooting.md`](./references/troubleshooting.md).

`complete --step N` is refused if any earlier step is still pending, unless
you pass `--force` (the gap will be flagged by `audit`/`doctor`).

## Machine-Readable Trailer

Every `continue`/`complete`/`run` invocation ends with a `__PIPELINE_NEXT__`
JSON line for agents that prefer to skip text parsing:

```json
__PIPELINE_NEXT__ {"step":3,"name":"Script Writing","kind":"creative","action":"await_complete","exit":0,"phase":1,"next_cmd":"python3 pipeline.py complete my-video","skills_section":"#phase-1-research--script","skills_files":["skills/claude-youtube/skills/claude-youtube/sub-skills/script.md","skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md"],"expected_artifacts":["SCRIPT.md"]}
```

Field reference is in `references/troubleshooting.md`.

## Logs

Every automated step and every per-scene render appends to a structured log file
under `videos/<title>/logs/`. Step-level files: `step-5.log`, `step-6.log`,
`step-9-scene-{id}.log`, `step-10.log`, `step-13.log`. These are append-only
and survive across runs — useful for post-mortem analysis of overnight failures.

## License

MIT
