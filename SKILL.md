---
name: full-video-pipeline
description: >
  End-to-end autonomous YouTube video production pipeline. Researches topics,
  writes retention-optimized scripts, generates voiceover audio, builds HyperFrames
  video compositions, renders scenes, stitches the final video, generates YouTube
  title/description/tags, and renders a HyperFrames-only thumbnail (no AI images).
  Driven by `pipeline.py run` / `pipeline.py continue` per an explicit execution
  protocol — agent never manually advances state. Designed for resource-constrained
  environments (500MB RAM, no GPU).
triggers:
  - "make a video"
  - "create a youtube video"
  - "video pipeline"
  - "autonomous video"
  - "research and script"
  - "render video"
  - "youtube thumbnail"
  - "video metadata"
tools:
  - Read
  - Write
  - Edit
  - Bash
  - WebSearch
  - Glob
  - Grep
---

# Full Video Pipeline — Autonomous YouTube Video Production

> 4 phases take a topic idea and produce a fully rendered YouTube video with
> voiceover, visuals, audio, title/description/tags, and a HyperFrames-generated
> thumbnail. Each phase has one creative block (you do the work) followed by
> automated steps (the orchestrator runs them).

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
   (b) "Phase N: <name> — Step Nn: <name>" + rules      → Do the work (web search,
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

- **Never manually invoke** `render_scene.py`, `assemble.py`, `render_thumbnail.py`,
  `generate_voiceover.py`, or `measure_durations.py` yourself. The orchestrator runs
  them with idempotency checks, lint gates, atomic writes, and per-step logging that
  you would bypass.
- **Never edit `pipeline_state.json` by hand.** Treat it as read-only state.
  Use `python3 pipeline.py status <title>` to inspect it.
- **Always let the orchestrator validate.** After every creative phase your
  output is re-checked against the JSON schemas before the next automated step
  is allowed to run. If validation fails, fix the offending file (SCRIPT.md,
  scenes.json, etc.) and re-run `complete`.
- **One phase at a time.** Do not pre-load references or start writing code for
  Phase 3 while still on Phase 1. Run `continue`/`complete`, see what phase is
  requested, do only that phase's work, then proceed.
- **`complete --step N` is refused if earlier steps are still pending**, unless
  you pass `--force`. Don't skip ahead — the contracts between phases matter.

### Skill file loading

Each creative phase prints a "Follow these instructions:" block listing the skill files you
must read for that phase's rules. These files live under `skills/` and contain the detailed
rules for script writing, HyperFrames composition authoring, SEO metadata, and thumbnail design. The paths
are configured in `pipeline_config.json` under `skills.sources` and can be overridden per
video via `videos/<title>/pipeline_config.json`.

### The 4 phases

| Phase | Steps | You produce | Auto-runs after `complete` |
|-------|-------|-------------|----------------------------|
| Phase 1: Research & Script | 1-3 | `SCRIPT.md`, `scenes.json` | (none — Step 4 is creative) |
| Phase 2: Voiceover | 4-6 | `VOICEOVER.md` | Steps 5, 6 |
| Phase 3: Visuals & Render | 7-10 | `STYLES.md`, HyperFrames project (`PLAN.md`, `index.html`, `compositions/scene-NN.html`, `styles/tokens.css`) | Steps 9, 10 |
| Phase 4: Metadata & Thumbnail | 11-13 | `TITLE.md`, `DESCRIPTION.md`, `TAGS.md`, `compositions/thumbnail.html` | Step 13 |

> Steps 1 and 2 produce in-context decisions/notes (no files). `complete` for
> those steps only runs the schema gate and advances state.

## Audio Path (IMPORTANT — overrides HyperFrames skill defaults)

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

## Optional: Captions

After Phase 2 (`complete` auto-runs Steps 5-6), you can generate captions:

```bash
python3 pipeline.py captions <title>
```

This produces `videos/<title>/<title>.srt` (YouTube sidecar) and populates
per-scene `captions` cues in `scenes.json`. To burn captions into the video,
set `video.burn_captions: true` in `pipeline_config.json` — the scaffolded
`compositions/scene-NN.html.example` ships a gated `#scene-captions` layer
that the agent wires up per scene when `showCaptions` is true. Off by default
to preserve render performance.

## Configuration

Defaults are in `pipeline_config.json`. Override per-video as needed:
- `video.fps`, `video.width`, `video.height` — composition settings
- `video.burn_captions` — render `<Captions>` layer when scene has cues (default `false`)
- `voiceover.voice` — edge-tts voice name (list voices: `edge-tts --list-voices`)
- `render.*` — rendering guardrails (concurrency, codec, memory limits)
- `system.*` — resource thresholds
- `retention.*` — disk cleanup flags (see "Disk Cleanup" below)
- `skills.sources` — skill file paths per phase (each entry has `name`, `path`, `phases` mapping)
- `steps.{step_key}.command_template` — plugin escape hatch for automated step commands
- `config_files.auto_discover_per_video` — enable/disable per-video config discovery (default `true`)

---

## Phase 1: Research & Script (Steps 1-3)

**Goal**: Pick a topic, research it, write a retention-optimized script with
discrete ~10-second scenes structured as `SCRIPT.md` + `scenes.json`.

### Action

1. (Step 1) If a topic isn't given, perform 3-5 web searches in the requested
   niche. Select a topic specific enough to fill 3-10 minutes (not "technology",
   not "the 3rd screw on the iPhone 15 camera"). State the chosen topic clearly.
2. (Step 2) Perform 5-10 targeted web searches on the topic. Visit and extract
   key information from top results. Compile: key facts, statistics, expert
   quotes, examples, counterarguments, timeline, current state, future outlook.
   Verify critical claims with at least 2 sources. Keep notes in your context.
3. (Step 3) Adapt the research into scene-based format (~10s per scene) and write
   `SCRIPT.md` + `scenes.json` per the rules and templates below.

### Follow these instructions:

Follow skills/claude-youtube/skills/claude-youtube/sub-skills/script.md instructions
Follow skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md instructions

### SCRIPT.md format

```markdown
# Script: {Video Title}

## Scene 1: [Title] (~10s)
**Script:** [What appears on screen / narration context]
**Voiceover:** [Exact words to be spoken — short sentences, contractions]
**Transition:** [cut|fade|wipe|slide]

## Scene 2: [Title] (~10s)
...

<!-- Retention artifacts at end of SCRIPT.md -->
## Pattern Interrupt Log
- Scene 3: [CAMERA CHANGE] — 0:30
- Scene 7: [UNEXPECTED STAT] — 1:15
Average interval: 45s (target ≤90s)

## Retention Risk Map
- Risk 1: Scene 5 dense stats → mitigation: visual reveal
- Risk 2: ...
```

### scenes.json format

Must satisfy `schemas/scenes.schema.json`. Initialize every scene with:
`actual_duration_seconds: null`, `actual_duration_frames: null`,
`render_status: "pending"`, `voiceover_file: null`, `voiceover_hash: null`.

```json
{
  "video_title": "my-video",
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "scenes": [
    {
      "id": 1,
      "title": "Hook — Grab",
      "script_text": "[full narration + visual context]",
      "voiceover_text": "[exact words TTS will speak]",
      "target_duration_seconds": 5,
      "actual_duration_seconds": null,
      "actual_duration_frames": null,
      "render_status": "pending",
      "voiceover_file": null,
      "voiceover_hash": null,
      "visual_notes": "",
      "transition_in": "cut",
      "transition_out": "fade"
    }
  ],
  "total_estimated_seconds": 0
}
```

> `scenes.json` is scaffolded empty by `pipeline.py run`/`new` — you populate
> the `scenes` array. `complete` validates `SCRIPT.md` exists; `scenes.json`
> is verified by schema + downstream steps.

### Validation (Phase 1)

- Every scene has: `id`, `title`, `script_text`, `voiceover_text`,
  `target_duration_seconds`.
- Total estimated duration matches target length (within 10%).
- Hook has all 3 elements (grab, promise, stakes) — derivable from titles.
- Pattern interrupts every 3-5 scenes (the Pattern Interrupt Log proves it).
- Mid-CTA present around 25% mark. Retention re-hook around 60% mark.
- Script reads as natural spoken language, not written prose.

### When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `SCRIPT.md` exists, validates `scenes.json` + state against
the JSON schemas, marks Steps 1-3 done, and prints the Phase 2 brief (no
auto-run — Phase 2 starts with a creative Step 4).

---

## Phase 2: Voiceover (Steps 4-6)

**Goal**: Extract TTS-ready text into `VOICEOVER.md`. Steps 5-6 (audio generation
and duration measurement) auto-run after `complete`.

### Action

1. Read `SCRIPT.md`.
2. Extract the "Voiceover:" line from each scene.
3. Write `VOICEOVER.md` per the format below.

### Use these rules:

- Every scene from `scenes.json` has a corresponding `---SCENE:N---` block.
- No empty voiceover blocks.
- Text is clean — no stage directions, no markdown formatting, just spoken words.
- Scene count in VOICEOVER.md matches scenes.json scene count.

### VOICEOVER.md format

```markdown
# VOICEOVER
---SCENE:1---
[Exact voiceover text for scene 1 — what TTS will speak]
---END---
---SCENE:2---
[Exact voiceover text for scene 2]
---END---
```

### Validation (Phase 2)

- Scene count in VOICEOVER.md == `scenes.json` scene count.
- Every block has non-empty text.

### When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `VOICEOVER.md` exists, marks Step 4 done, then **auto-runs**:

- **Step 5 (Voiceover Generation)**: Runs `generate_voiceover.py` — parses
  VOICEOVER.md delimiters, computes a SHA-256 `voiceover_hash` per scene from
  `(text, voice, rate, volume, pitch)`, **skips** any scene whose MP3 exists AND
  matches the stored hash (idempotent — editing VOICEOVER.md only regenerates
  changed scenes), generates MP3s concurrently (config: `voiceover.concurrency`),
  retries failed scenes once after 5s backoff, updates `scenes.json`.
- **Step 6 (Duration Measurement)**: Runs `measure_durations.py` — uses ffprobe
  on each MP3, computes `actual_duration_frames = ceil(duration * fps)`, updates
  `scenes.json` with real values. **Do NOT proceed to Phase 3 until Step 6
  succeeds — all HyperFrames compositions depend on exact durations.**

The chain stops at the Phase 3 brief (Step 7 is creative). If Step 5 or 6 fails,
`complete` emits `fix_and_continue` and exits 1 — fix the issue and re-run
`complete` (idempotent — unchanged scenes are skipped).

---

## Phase 3: Visuals & Render (Steps 7-10)

**Goal**: Define a consistent visual style, write the HyperFrames composition
HTML for all scenes. Steps 9-10 (scene rendering and stitching) auto-run after
`complete`.

### Action

#### 3a. Verify the HyperFrames project is scaffolded

The HyperFrames project is scaffolded by `pipeline.py run`/`new`. Verify it
exists:

```bash
ls videos/{video-title}/hyperframes/index.html
ls videos/{video-title}/hyperframes/compositions/scene-NN.html.example
ls videos/{video-title}/hyperframes/styles/tokens.css
ls videos/{video-title}/hyperframes/compositions/thumbnail.html
```

The scaffold contains:

- `index.html` — root composition (the "MainVideo" equivalent). Aggregates
  per-scene sub-compositions via `data-composition-src` mounting divs injected
  by `run_step_9` at render time.
- `compositions/scene-NN.html.example` — **template** for per-scene
  sub-compositions. Copy to `compositions/scene-01.html`,
  `compositions/scene-02.html`, … for each scene in `scenes.json`.
- `compositions/thumbnail.html` — Phase 4 thumbnail composition (scaffolded as
  a stub; agent fills it in Phase 4).
- `styles/tokens.css` — palette + font tokens (single source of truth, mirrors
  STYLES.md).
- `package.json`, `hyperframes.json`, `meta.json`, `assets/.gitkeep`,
  `AGENTS.md`.

If missing, re-run `pipeline.py new "{video-title}"` once.

#### 3a-anim. Animation blocks (when to install one from the registry)

The repo no longer ships a curated `animations/` directory. Instead, install
animation blocks **on demand** from the HyperFrames registry when a scene
calls for a hard-to-hand-code effect (kinetic transition, chart, social
overlay, count-up stat, comparison grid, before/after split, etc.).

**Install a block when a scene's `visual_notes` describes a complex,
multi-element, multi-property animation that you couldn't trivially one-shot
by composing HTML + CSS + a GSAP `fromTo` yourself.** Trivial hooks, title
cards, single-text reveals, and one-shot transitions are faster to hand-author
— leave registry blocks for the gap in between.

To use one:

1. Browse the catalog (machine-readable):
   ```bash
   cd videos/{video-title}/hyperframes
   npx hyperframes catalog --json
   ```
   Or browse the live catalog at https://hyperframes.heygen.com/catalog/blocks/
2. Install the block:
   ```bash
   npx hyperframes add <block-name> --no-clipboard
   ```
   The block lands under `compositions/` or `compositions/components/`. The
   CLI prints a paste-snippet you include in your `scene-NN.html`.
3. Paste the snippet into the appropriate scene file, override its declared
   variables as needed (per the block's `data-composition-variables`), and
   wire any GSAP timeline registration onto `window.__timelines["scene-NN"]`.
4. **Never edit an installed block's source.** If it doesn't fit, install a
   different block or hand-author the effect. (Editing an installed block
   breaks upgrades and diverges your project from the catalog.)

**Theme**: `styles/tokens.css` is the single source of truth for palette and
fonts. Read tokens via CSS custom properties (`var(--color-primary)` etc.) in
your scene HTML — do NOT hardcode hex values in `scene-NN.html` files except
where you intentionally want to override the token for one scene.

**Full reference**: the Phase-3 skills bundle (planned under `skills/hyperframes/`,
Step 10) documents every block-discovery and wiring pattern. The on-disk
`AGENTS.md` in each scaffolded project also summarizes the rules.

#### 3b. Write `STYLES.md` (Step 7)

Define a single visual style that fits the content AND is CTR-compatible.

**Use these rules (CTR palette — also reused in Phase 4):**

- Color palette: 3-5 hex codes. 2-3 primary colors; viewer decides in <1 second.
- High-contrast pairings so a ≤3-word text overlay will read at 168×94px on mobile
  (Phase 4 thumbnail reuses this palette — choose CTR-safe now or fix later).
- Negative space: 30-40% of frame area. One clear focal point.
- Typography: 1-2 font families. Bold weights for overlays/captions. Must be
  Google Fonts or web-safe.
- Background treatment: gradients, solid, or patterns.
- Animation character: smooth, snappy, minimal, or bold — pick one.

**STYLES.md format:**

```markdown
# Visual Style Guide

## Color Palette
- Primary: #HEXCODE — [usage]
- Secondary: #HEXCODE — [usage]
- Accent: #HEXCODE — [usage]
- Background: #HEXCODE — [usage]
- Text: #HEXCODE — [usage]

## Typography
- Headlines: [Font Name], [size]px, [weight]
- Body: [Font Name], [size]px, [weight]
- Captions: [Font Name], [size]px, [weight]

## Background
[Description of background treatment]

## Animation Style
[Description: e.g., "Smooth 0.5s ease-out transitions, subtle scale effects"]

## Layout Rules
- Safe margins: [X]px sides, [Y]px top/bottom
- Text alignment: [center/left/right]
- Element spacing: [X]px

## Scene Visual Template
[Description of the default visual structure for a scene]
```

Then update `scenes.json` with `visual_notes` for each scene based on the style.
Each scene's `visual_notes` should specify colors (from palette), animations,
layout, and element positions — detailed enough for Step 8 to implement directly.

**Also** mirror the palette and font choices into
`hyperframes/styles/tokens.css` — set the CSS custom properties
(`--color-primary`, `--color-secondary`, `--color-accent`, `--color-background`,
`--color-text`, `--color-muted`, `--font-headline`, `--font-body`, etc.) so every
`scene-NN.html` file can `var(--…)` them. STYLES.md is the human-readable
contract; `tokens.css` is the machine-readable one. They MUST agree.

#### 3c. Write `hyperframes/PLAN.md` (start of Step 8)

Before any code, write the per-video HyperFrames authoring plan:

```markdown
# Implementation Plan

## Configuration
- FPS: {from scenes.json}
- Resolution: {width}x{height}
- Total duration: {total_actual_seconds}s

## Shared elements
- [List reusable tokens / blocks you'll install from the registry]

## Scenes
### Scene 1: {title}
- Duration: {actual_duration_seconds}s
- Visual: {visual_notes from scenes.json}
- Audio: voiceover/scene-01.mp3 (muted — muxed at stitch)
- Key elements: [what needs to animate]
- Transition in: {transition_in}
- Transition out: {transition_out}

### Scene 2: ...

## Style Reference
{Key points from STYLES.md}
```

#### 3d. Author the HyperFrames compositions (Step 8)

For each scene in `scenes.json`, copy
`compositions/scene-NN.html.example` to `compositions/scene-NN.html` and
customize it. The template uses these 8 placeholders that the orchestrator
already substituted at scaffold time (`pipeline.py new`): `{{VIDEO_ID}}`,
`{{VIDEO_TITLE}}`, `{{SCAFFOLD_TIMESTAMP}}`, `{{HYPERFRAMES_VERSION}}`,
`{{WIDTH}}`, `{{HEIGHT}}`, `{{TOTAL_DURATION}}`, `{{SCENE_LAYERS}}` — your job
in Step 8 is purely to author scene content, not to re-substitute scaffolding
placeholders.

#### Follow these instructions:

Follow skills/hyperframes/skills/hyperframes-core/SKILL.md instructions
Follow skills/hyperframes/skills/hyperframes-animation/SKILL.md instructions
Follow skills/hyperframes/skills/hyperframes-keyframes/SKILL.md instructions
Follow skills/hyperframes/skills/hyperframes-registry/SKILL.md instructions
Follow the on-disk `hyperframes/AGENTS.md` instructions

**Use these contracts (Phase 3-internal MUSTs):**

- Each scene's `data-duration` on the `data-composition-id` root MUST equal the
  scene's `actual_duration_seconds` from `scenes.json` (within ±0.05s).
- Each scene composition root MUST declare `data-composition-id="scene-NN"`,
  `data-width`, `data-height`, `data-start="0"`, and `data-duration`.
- Every timed element (background, headline, subtitle, captions, etc.) MUST have:
  - `class="clip"`
  - `data-start`, `data-duration`, `data-track-index` (unique per parallel track)
- Animation MUST use a GSAP timeline registered as
  `window.__timelines["scene-NN"] = tl` with `paused: true`. The orchestrator's
  render loop seeks this timeline deterministically — no `Date.now()`,
  `Math.random()`, network fetch, or other non-deterministic logic.
- Each scene MUST render **SILENT video only** — do NOT add
  `<audio src=".../voiceover/...mp3">` for the voiceover. The pipeline muxes
  voiceover post-render via `assemble.py`. SFX/BGM that you genuinely want
  baked in are still allowed via `<audio>` (rare).
- Implement the visual treatment from `visual_notes` in `scenes.json`.
- Follow the style system from STYLES.md / `tokens.css` — use
  `var(--color-primary)` and friends; do NOT hardcode hex codes.

**Optional captions layer**: the template ships a `#scene-captions` div gated
by the `showCaptions` variable. Render it only when `scene.showCaptions: true`
in `scenes.json` AND `video.burn_captions: true` in `pipeline_config.json`.
Feed it cues from the scene's `captions` array via GSAP — one `tl.add()` per
cue, hiding/showing `#caption-text` and setting its `textContent`.

**Output**: `STYLES.md` + `hyperframes/PLAN.md` + one
`compositions/scene-NN.html` per scene + updated `styles/tokens.css` mirroring
the STYLES.md palette. `index.html` and `compositions/thumbnail.html` stay as
scaffolded until Step 9 (which injects `data-composition-src` mounting divs)
and Phase 4 (which fills in `thumbnail.html`).

### Pre-render self-check (run yourself before `complete`)

```bash
cd videos/{video-title}/hyperframes
npm run lint         # structural HTML lint
npx hyperframes compositions --json   # list compositions — every scene-NN must appear
npm run check        # optional: stricter runtime + layout + motion + contrast gate
```

You should see every `compositions/scene-NN.html` listed in the compositions
output. Fix any errors before continuing — the orchestrator will re-run the
lint gate before Step 9 renders and will fail the entire run if anything is
broken.

> NOTE: HyperFrames v0.7.61 has no `--frames=N-M` flag. Per-scene rendering
> always renders the full composition. This is why each scene is its own
> sub-composition rather than a `<Sequence>` in a single root.

### Validation (Phase 3)

- `hyperframes/PLAN.md` exists.
- `styles/tokens.css` exists and declares every palette/font token referenced
  by STYLES.md.
- `index.html` exists (scaffolded root).
- For each scene in `scenes.json`, `compositions/scene-NN.html` exists.
- Each `compositions/scene-NN.html` has:
  - A `data-composition-id="scene-NN"` root with `data-width`, `data-height`,
    `data-start`, `data-duration` matching `actual_duration_seconds` (±0.05s)
  - Every timed child has `class="clip"`, `data-start`, `data-duration`,
    `data-track-index`
  - A GSAP timeline registered on `window.__timelines["scene-NN"]` with
    `paused: true`
  - No `<audio>` reference to `voiceover/*.mp3`
  - No `Date.now()`, `Math.random()`, `fetch()`, or external network URLs
- Every scene in `scenes.json` has non-empty `visual_notes` referencing
  specific palette colors from STYLES.md.
- `npm run lint` and `npx hyperframes compositions --json` pass; every
  scene composition appears in the compositions output.

### When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates the expected artifacts exist (`hyperframes/PLAN.md`,
`index.html`, `compositions/scene-NN.html` for each scene, `styles/tokens.css`),
marks Steps 7-8 done, then **auto-runs**:

- **Step 9 (Scene Rendering)**: Injects per-scene `data-composition-src`
  mounting divs into `index.html` (so the root can preview the assembled
  video), runs the lint gate (`npx hyperframes lint --json` +
  `npx hyperframes compositions --json`), then renders each scene composition
  independently via `scripts/render_scene.py`:
  `npx hyperframes render -c compositions/scene-NN.html --output scenes/scene-NN.mp4
  --variables-file props.json`. Hardware guardrails via `psutil` (RAM/disk
  checks, orphaned-Chrome cleanup). A failed scene records
  `render_attempts += 1` and `last_render_error`, **does NOT abort the
  batch** — the orchestrator records the failure and continues. Re-running
  `complete` skips already-rendered scenes and retries only failures.
  Per-scene logs in `videos/<title>/logs/step-9-scene-{id}.log`.
- **Step 10 (Stitching)**: Runs `assemble.py` — concatenates per-scene MP3s
  into `voiceover_aligned.mp3`, concatenates scene MP4 video streams (copy, no
  re-encode), muxes audio on video (single ffmpeg pass, `-c:v copy -c:a aac`),
  auto-increments version `versions/{title}-v1.mp4`, `v2`, etc.

The chain stops at the Phase 4 brief (Step 11 is creative). If Step 9 partial-fails
(some scenes fail), `complete` exits 1 with `fix_and_continue`. To retry just the
failed scenes: `pkill -f chrome`, wait 30s, re-run `pipeline.py continue <title>`
(Step 9 is resumable per-scene via `render_status: "rendered"`). For persistent
OOM, reduce `render.workers` or video resolution in `pipeline_config.json`.

---

## Phase 4: Metadata & Thumbnail (Steps 11-13)

**Goal**: Generate YouTube metadata (title, description, tags) and fill in the
`compositions/thumbnail.html` HyperFrames composition. Step 13 (thumbnail PNG
render) auto-runs after `complete`.

### Action

#### 4a. Write `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` (Step 11)

Read `scenes.json` for accurate chapter timestamps based on cumulative
`actual_duration_seconds`. Read the stitched MP4 output path from `versions/`.

#### Follow these instructions:

Follow skills/claude-youtube/skills/claude-youtube/sub-skills/metadata.md instructions
Follow skills/claude-youtube/skills/claude-youtube/references/seo-playbook.md instructions

```markdown
# Title Variants

1. **Search-optimized:** [keyword-forward title]
2. **Browse-optimized:** [curiosity/emotional title]
3. **Hybrid:** [balanced title]
```

```markdown
# Description

[Hook — first 2 lines work as ad copy]

## Timestamps
0:00 Intro
0:32 [Chapter 1]
...

## [Body — 200-350 words, keyword 2-4x]

## Resources
- [Link 1]
- [Link 2]

## Channel
[Boilerplate]

#hashtags #here #at #bottom
```

```markdown
# Tags
exact keyword, variation 1, variation 2, long-tail 1, broad term 1, channel name
```

#### 4b. Fill in `compositions/thumbnail.html` (Step 12)

Compose the thumbnail entirely of HyperFrames primitives — HTML elements, CSS
gradients, GSAP timelines. **NO AI image generation** (no NanoBanana,
Midjourney, DALL-E, etc.).

#### Follow these instructions:

Follow skills/claude-youtube/skills/claude-youtube/sub-skills/thumbnail.md instructions
Follow skills/claude-youtube/skills/claude-youtube/references/thumbnail-ctr-guide.md instructions

> **Back-ref: Phase 3 §CTR palette (your STYLES.md).** The palette you chose in
> Phase 3 was CTR-safe for mobile legibility at 168×94px. **Reuse it** — do NOT
> introduce new colors. If the palette would fail the mobile-legibility check
> for the specific text overlay you planned, that is a Phase 7 palette bug — go
> back and fix STYLES.md before continuing, then re-run `complete`.

- **MUST**: design for 1920×1080 even though 1280×720 is the YouTube minimum.
- **MUST**: thumbnail adds NEW info — never duplicates the title text.
- **MUST NOT**: use `fetch()` or external URLs. `<img>` / `<picture>` only for
  local assets in `hyperframes/assets/`.
- Compose `compositions/thumbnail.html` as a single standalone composition. Its
  root needs `data-composition-id="thumbnail"`, `data-width="1920"`,
  `data-height="1080"`, `data-start="0"`, `data-duration="1"` (arbitrary short
  duration — the orchestrator renders exactly one frame).
- Read the title/subtitle/palette via the same variable mechanism the scene
  templates use (`data-composition-variables` + `--variables-file`), or simply
  hardcode the per-video copy directly in the HTML (Phase 4 authoring is
  content-bound by design).
- Follow the same `class="clip"` / `data-start` / `data-duration` /
  `data-track-index` rules and the GSAP-on-`window.__timelines["thumbnail"]`
  contract as scene compositions.

```html
<template id="thumbnail-template">
  <div data-composition-id="thumbnail"
       data-width="1920" data-height="1080"
       data-start="0" data-duration="1">
    <div id="thumb-background" class="clip" data-start="0" data-duration="1"
         data-track-index="0"
         style="position: absolute; inset: 0;
                background: var(--color-background, #0b0f1a);"></div>
    <!-- ...your overlay composition... -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      (function () {
        const tl = gsap.timeline({ paused: true });
        /* optional one-shot reveal — the renderer captures frame 0 only */
        window.__timelines = window.__timelines || {};
        window.__timelines["thumbnail"] = tl;
      })();
    </script>
  </div>
</template>
```

**Verify before `complete`:**

```bash
cd videos/{video-title}/hyperframes
npm run lint
npx hyperframes compositions --json   # must list every scene-NN AND thumbnail
```

### Validation (Phase 4)

- All 3 title variants under 100 chars. Primary keyword in first 40 chars of each.
- Description under 5000 chars. Primary keyword in first 25 words. Chapters
  start at 0:00 with ≥3 entries.
- Tags under 500 chars total. Hashtags in description body (not in title).
- First 2 description lines work as standalone ad copy.
- No AI-generated image assets in `compositions/thumbnail.html`. No `fetch()` /
  external URLs.
- `compositions/thumbnail.html` root declares `data-composition-id="thumbnail"`,
  `data-width="1920"`, `data-height="1080"`. Text overlay ≤3 words. Palette
  colors reused from STYLES.md / `tokens.css`.
- `npm run lint` passes. The `thumbnail` composition appears in
  `npx hyperframes compositions --json` output.

### When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` exist,
marks Steps 11-12 done, then **auto-runs**:

- **Step 13 (Thumbnail Rendering)**: Runs `lint_gate` then
  `render_thumbnail.py`. Reads `TITLE.md` (or falls back to `scenes.json
  video_title`) for the title text, reads `STYLES.md` for the color palette,
  builds a variables JSON, renders a 1-frame 1920×1080 MP4 via
  `npx hyperframes render -c index.html --fps 1 --quality 100`, then extracts
  the PNG via `ffmpeg -i thumb.mp4 -frames:v 1 thumb.png`. Writes
  `versions/{title}-thumbnail-v{N}.png` (auto-incremented). Per the
  `retention.clean_remotion_node_modules_after_step_13` config flag (default
  `true`), `hyperframes/node_modules/` (if present) is cleaned after Step 13
  success.

If Step 13 fails, check `videos/<title>/logs/step-13.log`. Ensure
`compositions/thumbnail.html` exists, declares `data-composition-id="thumbnail"`,
and passes the lint gate. Re-run `complete` to retry.

If all steps complete, `complete` prints:
`All steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.`

---

## Disk Cleanup

The pipeline accumulates files across runs. Retention is controlled by the
`retention` key in `pipeline_config.json` (all optional, sensible defaults):

| Flag | Default | Effect |
|------|---------|--------|
| `keep_versions` | `2` | Keep only the N most recent MP4 + thumbnail PNG versions |
| `clean_voiceover_aligned_after_stitch` | `true` | Delete `voiceover_aligned.mp3` after stitch succeeds |
| `clean_remotion_node_modules_after_step_13` | `true` | Delete `hyperframes/node_modules/` (if present) after the final step completes. Key name retained for backward-compat. |
| `clean_preview_after_success` | `true` | Delete `.preview/` after a successful smoke preview |
| `reap_remotion_tmpdir_after_render` | `true` | Delete the per-video temp dir after each render (saves disk, forfeits bundle-cache speed). Key name retained for backward-compat. |
| `clean_scene_mp4s_after_stitch` | `false` | Delete `scenes/*.mp4` after stitch — **re-stitch requires re-render** |
| `max_log_size_mb` | `0` | Rotate logs when they exceed this size (0 = unlimited, no rotation) |
| `keep_last_n_log_runs` | `10` | Keep at most this many rotated log archives |

To force-clean a completed video (respects `keep_versions` and
`clean_scene_mp4s_after_stitch`; clears everything else unconditionally):

```bash
python3 pipeline.py clean <title>
```

## Error Recovery

| Error | Recovery |
|-------|----------|
| `edge-tts` network failure | Step 5 retries each scene once after 5s backoff. Re-run `complete` — unchanged scenes skipped (idempotent). |
| HyperFrames render OOM | Scene's `last_render_error` records the OOM. `render_attempts` incremented. Kill Chrome (`pkill -f chrome`), wait 60s, re-run `continue` to retry just that scene. If persistent, reduce `render.workers` or video resolution in `pipeline_config.json`. |
| HyperFrames render timeout | Increase `render.timeout_ms` in config, or simplify the scene's visual complexity. |
| ffmpeg stitch failure | `assemble.py` validates inputs first; on codec/resolution mismatch across scenes it falls back to re-encoding. Re-run `complete`. |
| Disk full | Run `rm -rf videos/{title}/hyperframes/node_modules` to free space, or `python3 pipeline.py clean <title>`. |
| Schema validation fails | `complete` refuses to advance. Run `python3 pipeline.py validate <title>` to see violations and fix the offending JSON. |
| Lint gate fails before render | Fix HTML/lint errors in the HyperFrames project (`cd videos/<title>/hyperframes && npm run lint`). The `npx hyperframes compositions --json` gate must also pass — every `scene-NN.html` must appear in its output. |
| Metadata step fails | `complete` re-runs the creative Step 11. Check `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` are present and valid. |
| Thumbnail composition fails lint | Fix `compositions/thumbnail.html`. Remove any AI image references and external URL fetches. Verify `data-composition-id="thumbnail"`. |
| Thumbnail render fails | Check logs in `videos/<title>/logs/step-13.log`. Ensure `compositions/thumbnail.html` exists and passes `npx hyperframes compositions --json`. |
| `complete --step N` refused | Earlier steps incomplete — pass `--force` only if you understand the gap will be flagged by `audit`/`doctor`. |

State forensics: each step's `pipeline_state.json` entry carries `attempts`,
`last_error`, and `last_attempt_at`. Scene-level failures record `render_attempts`
and `last_render_error` per scene in `scenes.json`. The `__PIPELINE_NEXT__` JSON
trailer at the end of every command output is machine-readable — it includes
`step`, `kind`, `action`, `phase`, `next_cmd`, `skills_section`, `skills_files`,
`expected_artifacts`.

## Resuming Interrupted Pipelines

Use `python3 pipeline.py run <title>` (resume-safe: detects existing project and
calls `continue`) or `python3 pipeline.py continue <title>` to resume:

1. Validates `scenes.json` + `pipeline_state.json` against schemas (`validate.py`).
   Refuses to run automated steps on invalid state.
2. Reads `pipeline_state.json` to find the next incomplete step.
3. Runs the next automated step (5, 6, 9, 10, or 13), or
4. Prints the next creative phase's brief (Steps 1-4, 7, 8, 11, 12).
5. Per-step attempts and `last_error` recorded for forensics.

Each video tracks progress in `pipeline_state.json`:
- Steps 1-4: creative input required (topic, research, script, voiceover text)
- Steps 5-6: automated (TTS generation [idempotent], duration measurement)
- Steps 7-8: creative input required (style definition, HyperFrames composition authoring)
- Steps 9-10: automated (resumable scene rendering, atomic stitching)
- Steps 11-12: creative input required (metadata, thumbnail composition)
- Step 13: automated (thumbnail render, idempotent via versioning)

## Directory Structure

```
videos/{video-title}/
├── SCRIPT.md            # Phase 1: full retention-optimized script
├── VOICEOVER.md         # Phase 2: parseable voiceover text per scene
├── STYLES.md            # Phase 3: visual style guide
├── TITLE.md             # Phase 4: 3 YouTube title variants
├── DESCRIPTION.md       # Phase 4: YouTube description with timestamps
├── TAGS.md              # Phase 4: 10-15 YouTube tags
├── scenes.json          # Structured scene data (durations, status, files, hashes, visual_notes)
├── pipeline_state.json  # Pipeline progress (per-step attempts + last_error)
├── voiceover_aligned.mp3  # Concatenated voiceover (created by assemble.py)
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
└── versions/            # Final stitched .mp4 + thumbnail .png
    ├── {title}-v1.mp4
    └── {title}-thumbnail-v1.png
```

## Helper Scripts

```bash
# Pipeline CLI
python3 pipeline.py --config custom.json run "my-video"  # Override config (any subcommand)
python3 pipeline.py run "my-video"             # One-shot: scaffold (if absent) + advance
python3 pipeline.py new "my-video"             # Scaffold project only
python3 pipeline.py continue my-video          # Run next step (creative brief or automated)
python3 pipeline.py complete my-video          # Validate current creative phase + auto-run next automated steps
python3 pipeline.py status my-video            # Show specific project (with attempts column)
python3 pipeline.py status                     # Show all projects
python3 pipeline.py validate my-video          # Standalone schema validation
python3 pipeline.py validate my-video --step 6 # Step-specific requirements
python3 pipeline.py preview my-video           # Smoke-render scene 1
python3 pipeline.py captions my-video          # Generate SRT + populate captions
python3 pipeline.py audit my-video            # Audit for violations
python3 pipeline.py doctor my-video            # System + project diagnostics
python3 pipeline.py clean my-video            # Free disk space (all safe-to-delete items)
python3 pipeline.py complete my-video --step 7 --force  # Out-of-order override (use with care)
```
