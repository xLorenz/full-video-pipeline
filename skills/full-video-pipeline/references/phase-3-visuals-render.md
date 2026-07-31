# Phase 3: Visuals & Render (Steps 7-10)

**Goal**: Define a consistent visual style, write the HyperFrames composition
HTML for all scenes. Steps 9-10 (scene rendering and stitching) auto-run after
`complete`.

Before starting: re-read the "Audio Path" section in the main `SKILL.md` if
you haven't recently — the silent-scene / mux-at-stitch rule is the single
most common mistake in this phase because it inverts the default pattern in
the general HyperFrames docs.

## Action

### 3a. Verify the HyperFrames project is scaffolded

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
  a stub; you fill it in during Phase 4).
- `styles/tokens.css` — palette + font tokens (single source of truth, mirrors
  STYLES.md).
- `package.json`, `hyperframes.json`, `meta.json`, `assets/.gitkeep`,
  `AGENTS.md`.

If missing, re-run `pipeline.py new "{video-title}"` once.

### 3a-anim. Animation blocks (when to install one from the registry)

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

### 3b. Write `STYLES.md` (Step 7)

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
contract; `tokens.css` is the machine-readable one. They MUST agree — a
mismatch here is what causes the "hardcoded hex" pitfall below.

### 3c. Write `hyperframes/PLAN.md` (start of Step 8)

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

### 3d. Author the HyperFrames compositions (Step 8)

For each scene in `scenes.json`, copy
`compositions/scene-NN.html.example` to `compositions/scene-NN.html` and
customize it. The template uses these 8 placeholders that the orchestrator
already substituted at scaffold time (`pipeline.py new`): `{{VIDEO_ID}}`,
`{{VIDEO_TITLE}}`, `{{SCAFFOLD_TIMESTAMP}}`, `{{HYPERFRAMES_VERSION}}`,
`{{WIDTH}}`, `{{HEIGHT}}`, `{{TOTAL_DURATION}}`, `{{SCENE_LAYERS}}` — your job
in Step 8 is purely to author scene content, not to re-substitute scaffolding
placeholders.

#### Follow these instructions

Follow `skills/hyperframes/skills/hyperframes-core/SKILL.md` instructions
Follow `skills/hyperframes/skills/hyperframes-animation/SKILL.md` instructions
Follow `skills/hyperframes/skills/hyperframes-keyframes/SKILL.md` instructions
Follow `skills/hyperframes/skills/hyperframes-registry/SKILL.md` instructions
Follow the on-disk `hyperframes/AGENTS.md` instructions

> **If any `skills/hyperframes/...` file above doesn't exist**, that bundle
> hasn't been populated in this checkout — this is a known gap, not something
> you did wrong. Don't stall and don't invent what you imagine those files
> would say. Fall back to `hyperframes/AGENTS.md` plus the contracts and
> pre-render checks in this file, which are written to be sufficient on
> their own, and note in your Step 8 output that the bundle was missing so
> whoever runs this pipeline knows to populate `skills/hyperframes/`.

**Use these contracts (Phase 3-internal MUSTs):**

- Each scene's `data-duration` on the `data-composition-id` root MUST equal the
  scene's `actual_duration_seconds` from `scenes.json` (within ±0.05s). This
  is what keeps rendered video length in sync with the voiceover it'll be
  muxed against at stitch time.
- Each scene composition root MUST declare `data-composition-id="scene-NN"`,
  `data-width`, `data-height`, `data-start="0"`, and `data-duration`.
- Every timed element (background, headline, subtitle, captions, etc.) MUST have:
  - `class="clip"`
  - `data-start`, `data-duration`, `data-track-index` (unique per parallel track)
- Animation MUST use a GSAP timeline registered as
  `window.__timelines["scene-NN"] = tl` with `paused: true`. The orchestrator's
  render loop seeks this timeline deterministically — no `Date.now()`,
  `Math.random()`, network fetch, or other non-deterministic logic. Anything
  non-deterministic makes the render non-reproducible across retries, which
  breaks the idempotency the whole pipeline relies on.
- Each scene MUST render **SILENT video only** — do NOT add
  `<audio src=".../voiceover/...mp3">` for the voiceover. The pipeline muxes
  voiceover post-render via `assemble.py`. SFX/BGM that you genuinely want
  baked in are still allowed via `<audio>` (rare).
- Implement the visual treatment from `visual_notes` in `scenes.json`.
- Follow the style system from STYLES.md / `tokens.css` — use
  `var(--color-primary)` and friends; do NOT hardcode hex codes.

**Optional captions layer**: see `references/phase-2-voiceover.md` for how to
wire the `#scene-captions` div when captions are enabled.

**Output**: `STYLES.md` + `hyperframes/PLAN.md` + one
`compositions/scene-NN.html` per scene + updated `styles/tokens.css` mirroring
the STYLES.md palette. `index.html` and `compositions/thumbnail.html` stay as
scaffolded until Step 9 (which injects `data-composition-src` mounting divs)
and Phase 4 (which fills in `thumbnail.html`).

## Pre-render self-check (run yourself before `complete`)

```bash
cd videos/{video-title}/hyperframes
npm run lint         # structural HTML lint
npx hyperframes compositions --json   # list compositions — every scene-NN must appear
npm run check        # optional: stricter runtime + layout + motion + contrast gate
```

You should see every `compositions/scene-NN.html` listed in the compositions
output. Fix any errors before continuing — the orchestrator will re-run the
lint gate before Step 9 renders and will fail the entire run if anything is
broken. Running this yourself first is faster than discovering it after
`complete` kicks off a batch render.

> NOTE: check `hyperframes.cli_version` in `pipeline_config.json` (or run
> `npx hyperframes --version`) against the docs for the pinned CLI — as of
> `0.7.61`, there is no `--frames=N-M` flag, so per-scene rendering always
> renders the full composition. This is why each scene is its own
> sub-composition rather than a `<Sequence>` in a single root. **If this
> project's pinned version has changed, re-verify this constraint** — it's
> tied to the specific CLI version, not a permanent limitation.

## Common Pitfalls (Phase 3-specific)

- Adding a voiceover `<audio>` tag to a scene — see Audio Path in `SKILL.md`.
- Hardcoding hex colors instead of `var(--color-primary)` — breaks the
  STYLES.md ↔ tokens.css contract.
- Editing an installed registry block's source instead of reinstalling or
  hand-authoring — breaks future `npx hyperframes add` upgrades.
- Using `Date.now()`, `Math.random()`, or `fetch()` inside a scene — breaks
  deterministic, idempotent re-renders.
- `data-duration` slightly off from `actual_duration_seconds` — causes audio
  drift once voiceover is muxed at stitch time; keep within ±0.05s.

## Validation (Phase 3)

This is a fast self-check mirroring `schemas/scenes.schema.json`; it isn't a
substitute for `complete`'s own validation.

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

## When done

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
