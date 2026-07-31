---
name: full-video-pipeline
description: >
  End-to-end autonomous YouTube video production pipeline. Researches topics,
  writes retention-optimized scripts, generates voiceover audio, builds
  HyperFrames video compositions, renders scenes, stitches the final video,
  generates YouTube title/description/tags, and renders a HyperFrames-only
  thumbnail (no AI images). Use whenever the user asks to make or create a
  YouTube video, script a video, research a video topic, generate a
  voiceover, render HyperFrames scenes, or produce a YouTube
  thumbnail/title/description/tags. Driven by `pipeline.py run` /
  `pipeline.py continue` per an explicit execution protocol — the agent
  never manually advances state. Designed for resource-constrained
  environments (500MB RAM, no GPU).
license: MIT
compatibility: >
  Linux, macOS, or WSL. Requires Node.js 18+, Python 3.9+, ffmpeg/ffprobe,
  and git.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - WebSearch
  - Glob
  - Grep
metadata:
  trigger_examples:
    - "make a video"
    - "create a youtube video"
    - "video pipeline"
    - "autonomous video"
    - "research and script"
    - "render video"
    - "youtube thumbnail"
    - "video metadata"
---

# Full Video Pipeline — Autonomous YouTube Video Production

> 4 phases take a topic idea and produce a fully rendered YouTube video with
> voiceover, visuals, audio, title/description/tags, and a HyperFrames-generated
> thumbnail. Each phase has one creative block (you do the work) followed by
> automated steps (the orchestrator runs them).

## How this file is organized

This file is the **orchestrator contract**: the loop you follow, the rules
that apply everywhere, and an index into the phase details. It's deliberately
kept lean. The full format specs, templates, and validation checklists for
each phase live under `references/` and are meant to be read **when you reach
that phase** — not all at once up front. Don't pre-load Phase 3's reference
file while you're still on Phase 1; the whole point of splitting these out is
to keep your working context to what the current step actually needs.

| Need | Go to |
|------|-------|
| What to produce in Phase 1 (research + script) | `references/phase-1-research-script.md` |
| What to produce in Phase 2 (voiceover) | `references/phase-2-voiceover.md` |
| What to produce in Phase 3 (visuals + render) | `references/phase-3-visuals-render.md` |
| What to produce in Phase 4 (metadata + thumbnail) | `references/phase-4-metadata-thumbnail.md` |
| Config keys, retention/disk-cleanup flags | `references/configuration.md` |
| Something failed | `references/troubleshooting.md` |
| "Where does file X live" | `references/directory-structure.md` |
| Full CLI command reference | `references/helper-scripts.md` |

## Prerequisites

Before running the pipeline, verify system readiness:

```bash
bash scripts/check_system.sh
pip install -r scripts/requirements.txt   # edge-tts, jsonschema, psutil
```

If pre-flight fails, resolve issues before proceeding. Required tools:
- Linux, macOS, or WSL (the pipeline runs on any POSIX system)
- `node` + `npm` (for HyperFrames)
- `python3` + `pip` (for edge-tts and helper scripts; `pip install -r scripts/requirements.txt`)
- `ffmpeg` + `ffprobe` (for audio/video processing)
- `git` (for cloning skill references)

## Execution Protocol (READ FIRST — DO NOT SKIP)

The pipeline is driven by **one entry point** and **two commands**:

| Command | Use |
|---------|-----|
| `python3 pipeline.py run <title>` | **Recommended one-shot**: scaffold (if dir absent) and print Phase 1 brief. Safe to re-run — resumes an existing project. |
| `python3 pipeline.py continue <title>` | Print the next pending step's brief (creative) or run one automated step. |
| `python3 pipeline.py complete <title>` | After producing a creative phase's artifacts, validate them, advance state, and **auto-run all consecutive automated steps** in one invocation. |

### The inviolable loop

```text
1. Run: python3 pipeline.py run <title>                  # or `continue <title>` if resuming
2. READ the output. It prints a phase brief with phases like:
   (a) "All steps complete!"                            → STOP. You are done.
   (b) "Phase N: <n> — Step Nn: <n>" + rules      → Do the work (web search,
                                                           write files, author
                                                           HyperFrames compositions).
                                                           Then run `complete`.
   (c) The orchestrator already auto-ran an automated   → Verify success, then GO TO 1.
       step after a creative `complete`.
   (d) "FAILED" / "VALIDATION FAILED"                   → READ the error, fix the named
                                                          file, then GO TO 1.
```

After you finish a creative phase's work, run `python3 pipeline.py complete <title>`.
`complete` validates your artifacts, advances state, then **auto-runs all consecutive
automated steps** (Steps 5-6 after Phase 2; Steps 9-10 after Phase 3; Step 13 after
Phase 4) in one invocation. You do NOT call `continue` between phases — `complete`
both validates AND drives the next automated steps, ending at the next creative phase
brief (or "All steps complete!").

### Hard rules (non-negotiable)

These aren't arbitrary — each one exists because the orchestrator does work
around that step that you can't replicate by hand, and skipping it produces
state the rest of the pipeline can't trust.

- **Never manually invoke** `render_scene.py`, `assemble.py`, `render_thumbnail.py`,
  `generate_voiceover.py`, or `measure_durations.py` yourself. The orchestrator runs
  them with idempotency checks, lint gates, atomic writes, and per-step logging that
  you would bypass — a manual run can silently desync `scenes.json` from what's
  actually on disk.
- **Never edit `pipeline_state.json` by hand.** It's the orchestrator's source of
  truth for what's actually completed; a hand-edit can make it advance past a step
  that never really succeeded. Use `python3 pipeline.py status <title>` to inspect it.
- **Always let the orchestrator validate.** After every creative phase your
  output is re-checked against the JSON schemas before the next automated step
  is allowed to run. If validation fails, fix the offending file (SCRIPT.md,
  scenes.json, etc.) and re-run `complete`.
- **One phase at a time.** Do not pre-load references or start writing code for
  Phase 3 while still on Phase 1. Run `continue`/`complete`, see what phase is
  requested, do only that phase's work, then proceed. (This also keeps your
  context focused — see "How this file is organized" above.)
- **`complete --step N` is refused if earlier steps are still pending**, unless
  you pass `--force`. Don't skip ahead — the contracts between phases matter
  (e.g. Phase 3 depends on exact durations that only exist once Phase 2's
  Step 6 has run).

### Skill file loading

Each creative phase prints a "Follow these instructions:" block listing skill
files under `skills/` with the detailed rules for script writing, HyperFrames
composition authoring, SEO metadata, and thumbnail design. Paths are configured
in `pipeline_config.json` under `skills.sources` (see `references/configuration.md`)
and can be overridden per video via `videos/<title>/pipeline_config.json`.

**If a listed skill file doesn't exist** (e.g. the `skills/hyperframes/` bundle
referenced by Phase 3 hasn't been populated in this checkout yet): don't stall
or fabricate its contents. Fall back, in order, to (1) the on-disk
`hyperframes/AGENTS.md` in the scaffolded project, and (2) the inline rules in
that phase's `references/phase-N-*.md` file — both are written to be
sufficient on their own. Note in your output which skill files were missing so
the person running the pipeline knows the bundle still needs populating.

### The 4 phases

| Phase | Steps | You produce | Auto-runs after `complete` |
|-------|-------|-------------|----------------------------|
| Phase 1: Research & Script | 1-3 | `SCRIPT.md`, `scenes.json` | (none — Step 4 is creative) |
| Phase 2: Voiceover | 4-6 | `VOICEOVER.md` | Steps 5, 6 |
| Phase 3: Visuals & Render | 7-10 | `STYLES.md`, HyperFrames project (`PLAN.md`, `index.html`, `compositions/scene-NN.html`, `styles/tokens.css`) | Steps 9, 10 |
| Phase 4: Metadata & Thumbnail | 11-13 | `TITLE.md`, `DESCRIPTION.md`, `TAGS.md`, `compositions/thumbnail.html` | Step 13 |

> Steps 1 and 2 produce in-context decisions/notes (no files). `complete` for
> those steps only runs the schema gate and advances state.

Full details for each phase — action steps, exact file formats, authoring
contracts, and validation checklists — are in the linked `references/` file.
Open it when the orchestrator hands you that phase's brief.

## Audio Path (IMPORTANT — overrides HyperFrames skill defaults, applies across Phases 2-3)

Voiceover is **NOT** baked into scene MP4s. Scene compositions render **silent**
video only — do NOT add `<audio src=".../voiceover/...mp3">` to a scene's HTML.
At stitch time, `scripts/assemble.py` concatenates the per-scene MP3s into one
`voiceover_aligned.mp3` and muxes it onto the concatenated scene MP4s in a
single ffmpeg pass. This:

- Avoids Chrome decoding/syncing audio once per scene (faster renders)
- Keeps exactly one audio encode pass total (fastest path for low-RAM boxes)
- Relies on `actual_duration_seconds` matching voiceover durations (enforced by Step 6)

The HyperFrames skills bundle may document `<audio>` / voiceover patterns.
Those are **superseded for this pipeline** — render silent, mux at stitch.
This is called out here (not just in Phase 3) because it needs to be known
*before* Step 8 composition authoring begins, and it's the rule agents are
most likely to import by habit from the general HyperFrames docs.

## Optional: Captions

After Phase 2 (`complete` auto-runs Steps 5-6), you can generate captions:

```bash
python3 pipeline.py captions <title>
```

This produces the SRT sidecar and populates per-scene caption cues. See
`references/phase-2-voiceover.md` for the full format and how to wire cues
into a scene composition in Phase 3.

## Configuration

Defaults live in `pipeline_config.json`; a three-layer merge (repo defaults →
`--config` flag → per-video `pipeline_config.json`) lets you override per run
or per video. Common keys you'll touch while authoring: `video.fps/width/height`,
`voiceover.voice`, `render.*`, `retention.*`. Full key reference, the retention
(disk cleanup) table, and the `steps.*.command_template` plugin mechanism are
in `references/configuration.md`.

## Common Pitfalls

Cross-cutting mistakes agents make on this pipeline, gathered from all phases:

- **Calling a script directly instead of through `pipeline.py`.** Even for
  "just this one scene" — see Hard Rules above.
- **Adding a voiceover `<audio>` tag to a scene composition.** See Audio Path
  above; this is the single most common Phase 3 mistake because it's the
  default pattern in the general HyperFrames docs.
- **Hardcoding hex colors in `scene-NN.html`** instead of reading
  `var(--color-primary)` etc. from `tokens.css`. Breaks the STYLES.md ↔
  tokens.css contract and makes the thumbnail's CTR-palette reuse (Phase 4)
  inconsistent with the video.
- **Running `complete` before `npm run lint` / `npx hyperframes compositions --json`
  pass locally.** The orchestrator re-runs the same lint gate before Step 9 and
  will fail the whole batch — catching it yourself first is faster.
- **Treating the Phase-N validation checklists as the full spec.** They're a
  fast self-check mirroring the JSON schemas (`schemas/scenes.schema.json`,
  `schemas/pipeline_state.schema.json`); `complete` is still the authority.
  If a checklist and a schema ever disagree, the schema wins — flag the
  mismatch rather than working around it.

## When you're done

`complete` after Phase 4's Step 13 prints:
`All steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.`

For anything that fails along the way, see `references/troubleshooting.md`
(error recovery table, resuming an interrupted run, and state forensics).
