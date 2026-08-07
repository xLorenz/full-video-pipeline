# Phase 3: Visuals & Render (Steps 7-10)

**Goal**: Define a consistent visual style, write the Remotion project code for
all scenes. Steps 9-10 (scene rendering and stitching) auto-run after `complete`.

Reminder from the main SKILL.md: scenes render **silent video only** — voiceover
is muxed in at stitch time. Don't add `<Audio>` for the voiceover in any
`SceneXX.tsx`; see "Audio Path" in the main file for why.

## Action

### 3a. Verify the Remotion project is scaffolded

The Remotion project is scaffolded by `pipeline.py run`/`new`. Verify it exists:

```bash
ls videos/{video-title}/remotion/src/Root.tsx
```

It should contain **two** compositions — `MainVideo` and `Thumbnail` — along
with `MainVideo.tsx`, `Thumbnail.tsx` stub, `SceneMap.generated.ts`,
`lib/config.ts`, `lib/styles.ts`, shared components (`Background`, `TextReveal`,
`StatReveal`, `Captions`), and installed npm dependencies. If missing, re-run
`pipeline.py new "{video-title}"` once.

The scaffold also publishes animation templates (if any exist in
`animations/`) into `remotion/src/components/animations/`. Templates are
data-driven reusable animations; see the next section.

### 3a-anim. Animation templates (when to use one)

The repo ships an `animations/` directory with a catalog of **hard-to-hand-code**
animation templates (judge-style right/wrong cards, racing data bars, count-up
stats, before/after splits, timelines, comparison grids). Each is a Remotion
component you customize via **JSON config — never by editing the `.tsx`**.

Use a template when a scene's `visual_notes` describes a complex,
multi-element, multi-property animation that you couldn't trivially one-shot
by composing `Background`/`TextReveal`/`StatReveal` yourself. Trivial hooks,
title cards, and single-text reveals are faster to hand-author — leave
templates for the gap in between.

To use one:

1. Read `animations/README.md` (the master catalog) and pick from the table.
2. Open that template's `animation.md` — it lists every recognized element
   id, the `extras.*` keys, copy-paste snippets, and customization recipes.
3. Drop a per-scene config at `videos/<title>/remotion/src/scene-assets/scene-NN-<template>.json` (or inline an
   object literal if it's short).
4. Use the one-line import in your `SceneXX.tsx`:
   ```tsx
   import { RightWrongCard } from "../components/animations";
   import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
   import config from "../scene-assets/scene-04-rightwrong.json";

   export const Scene04: React.FC<{ scene: SceneTiming }> = () => (
     <AbsoluteFill>
       <Background backgroundColor={COLORS.background} />
       <RightWrongCard config={config}
                       styles={{colors: COLORS, fonts: FONTS}}
                       fontSizes={FONT_SIZES} />
     </AbsoluteFill>
   );
   ```
5. Don't edit files under `remotion/src/components/animations/` on a
   per-video basis — the next scaffold silently re-publishes the repo-root
   template over your edits, and you'll lose the change without any error.
   If a template's behavior doesn't fit, copy the template folder from the
   repo-root `animations/` directory into a new folder and customize that
   copy instead.

**Previewing a template (the one exception to "don't hand-edit `pipeline_state.json`")**:
when you've added or customized templates and want to visually verify them,
write `"animations_preview_requested": true` into `pipeline_state.json`
before running `complete` for Step 8. This is a request flag, not a
step-tracking field — Step 9 reads it, renders a 3-second stub of every
published template into `videos/<title>/.animation-previews/` before the
scene render loop, and clears the flag. Preview render failures are
non-fatal diagnostics, not blockers. Every other key in `pipeline_state.json`
(`current_step`, `attempts`, `last_error`, `render_status`, etc.) is still
orchestrator-owned — inspect those with `pipeline.py status`, don't write
them.

**Theme**: `lib/styles.ts` stays the single source of truth for palette/fonts.
Templates read it via the shared helper; per-instance `theme.palette` /
`theme.fonts` overrides win per-key, but you keep the styles.ts defaults
canonical.

**Full reference**: `animations/README.md`, `animations/CATALOG.md`,
`animations/SCHEMA.md`, and each template's `animation.md`.

### 3b. Write `STYLES.md` (Step 7)

Define a single visual style that fits the content AND is CTR-compatible.

**Rules (CTR palette — also reused in Phase 4):**

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

## Palette (machine-readable)
<!-- render_thumbnail.py reads this block first; falls back to ## Color Palette above. -->
<!-- Recognised labels: Primary, Secondary, Accent, Background, Text, Surface, Alert, Cool. -->
Primary: #HEXCODE
Secondary: #HEXCODE
Accent: #HEXCODE
Background: #HEXCODE
Text: #HEXCODE

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

### 3c. Write `remotion/PLAN.md` (start of Step 8)

Before any code, write the per-video Remotion rebuild plan:

```markdown
# Implementation Plan

## Configuration
- FPS: {from scenes.json}
- Resolution: {width}x{height}
- Total duration: {total_actual_seconds}s = {total_frames} frames

## Shared Components
- [List reusable components to create]

## Scenes
### Scene 1: {title}
- Duration: {actual_duration_frames} frames
- Visual: {visual_notes from scenes.json}
- Audio: voiceover/scene-01.mp3 (muted — muxed at stitch)
- Key elements: [what needs to animate]
- Transition in: {transition_in}
- Transition out: {transition_out}

### Scene 2: ...

## Style Reference
{Key points from STYLES.md}
```

### 3d. Write the Remotion code (Step 8)

#### Follow these instructions

Follow `skills/remotion-best-practices/skills/remotion/SKILL.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/video-layout.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/calculate-metadata.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/transitions.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/sequencing.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/compositions.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/effects.md` instructions
Follow `skills/remotion-best-practices/skills/remotion/rules/voiceover.md` instructions

**Contracts specific to this pipeline (these two break the automated steps, not just style):**

- `MainVideo.tsx` imports `SCENE_MAP` from `src/scenes/SceneMap.generated.ts`.
  The orchestrator **auto-generates** that file in Step 9 from `scenes.json` —
  you only write the individual `src/scenes/SceneXX.tsx` files. Don't edit
  `SceneMap.generated.ts` by hand; it's overwritten on every Step 9 run.
- Both `MainVideo` and `Thumbnail` compositions register in `Root.tsx` via
  `<Composition>`. The lint gate checks this via `remotion compositions` —
  missing either fails the gate before rendering even starts.

Each `SceneXX.tsx` should:
- Match its `actual_duration_frames` exactly (voiceover sync depends on this — see "Audio Path")
- Render silent video only for the voiceover track (background music/SFX via `<Audio>` is fine)
- Implement the visual treatment from `visual_notes` in `scenes.json`
- Follow the style system from STYLES.md

**Optional:** Render `<Captions cues={scene.captions} fps={fps} />` from
`remotion-foundation` when `scene.showCaptions` is true — only active if
`video.burn_captions: true` in `pipeline_config.json`.

**Output**: `STYLES.md` + complete Remotion project (`remotion/PLAN.md`, `Root.tsx`
kept from scaffold, `MainVideo.tsx` kept from scaffold, `Thumbnail.tsx` kept as stub
until Phase 4, `lib/config.ts`, `lib/styles.ts`, `scenes/SceneXX.tsx`).

## Pre-render self-check (run yourself before `complete`)

```bash
cd videos/{video-title}/remotion
npm run lint && npx tsc --noEmit && npx remotion compositions src/Root.tsx
```

You should see both `MainVideo` and `Thumbnail` in the compositions output. Fix
any errors before continuing — the orchestrator runs this same gate before Step 9
renders and will fail the entire run if anything is broken.

> Note about MainVideo.tsx import contract: if Step 9 fails with a
> "MainVideo.tsx must import SceneMap.generated.ts" error, your scaffold is
> out of date — copy a fresh `MainVideo.tsx` from `remotion-foundation/src/components/MainVideo.tsx`.

## Validation (Phase 3)

- `src/Root.tsx` exists and exports `RemotionRoot` with the `MainVideo` AND
  `Thumbnail` compositions (both scaffolded; do not remove either).
- `src/components/MainVideo.tsx` exists, imports `SceneMap` from
  `SceneMap.generated.ts`, and uses Sequence-based scene loading.
- `src/components/Thumbnail.tsx` exists (scaffolded stub — agent fills it in
  Phase 4).
- Each scene has a corresponding `SceneXX.tsx` file. Scene count matches
  `scenes.json` scene count.
- Frame durations match `actual_duration_frames` from `scenes.json`.
- No CSS transitions or animations used. All animations use `interpolate()` or
  `spring()`.
- Every scene in `scenes.json` has non-empty `visual_notes` referencing specific
  palette colors from STYLES.md.
- `npm run lint`, `tsc --noEmit`, and `remotion compositions` all pass.

## When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates the expected artifacts exist (`remotion/PLAN.md`,
`Root.tsx`, `MainVideo.tsx`, `Thumbnail.tsx`, `lib/config.ts`, `lib/styles.ts`),
marks Steps 7-8 done, then **auto-runs**:

- **Step 9 (Scene Rendering)**: Regenerates `SceneMap.generated.ts` from
  `scenes.json`, runs the lint/typecheck/compositions gate, then renders each
  scene one at a time via `render_scene.py` with hardware guardrails via
  `psutil` (RAM/disk checks, orphaned-Chrome cleanup). A failed scene records
  `render_attempts += 1` and `last_render_error`, **does NOT abort the batch**
  — the orchestrator records the failure and continues. Re-running `complete`
  skips already-rendered scenes and retries only failures. Per-scene logs in
  `videos/<title>/logs/step-9-scene-{id}.log`.
- **Step 10 (Stitching)**: Runs `assemble.py` — concatenates per-scene MP3s
  into `voiceover_aligned.mp3`, concatenates scene MP4 video streams (copy, no
  re-encode), muxes audio on video (single ffmpeg pass, `-c:v copy -c:a aac`),
  auto-increments version `versions/{title}-v1.mp4`, `v2`, etc.

The chain stops at the Phase 4 brief (Step 11 is creative). If Step 9 partial-fails
(some scenes fail), `complete` exits 1 with `fix_and_continue`. To retry just the
failed scenes: `pkill -f chrome`, wait 30s, re-run `pipeline.py continue <title>`
(Step 9 is resumable per-scene via `render_status: "rendered"`). For persistent
OOM, reduce `node_max_old_space_size_mb` or video resolution in `pipeline_config.json`.
