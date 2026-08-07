# Animation examples

Each template ships with a runnable preview at `<template>/preview/preview.tsx`. Those previews are the canonical examples — the JSON config you find in each `PREVIEW_DEFAULT_PROPS.config` block is a copy-pasteable starting point you can drop straight into a per-video `scene-assets/scene-NN-<template>.json`.

To render every preview locally, in a scaffolded video project:

```bash
# 1. Publish templates to the per-video project
python3 scripts/publish_animations.py videos/<title>

# 2. Set the preview flag in pipeline_state.json
#   (any text editor — add `animations_preview_requested: true` to the top level)

# 3. Run continue (Step 9 will invoke the preview step before rendering scenes)
python3 pipeline.py continue <title>
```

Previews land in `videos/<title>/.animation-previews/preview-<template>.mp4`, plus a `summary.json` listing which templates succeeded or failed.

## Where to look for example configs

| Template | Example config location | What it exercises |
|---|---|---|
| `bar-code-scan` | `bar-code-scan/preview/preview.tsx` | 5 bars GPU/CPU/NET/DISK/RAM with per-bar `value` + `width` overrides, glowing scanline with count-up |
| `before-after-split` | `before-after-split/preview/preview.tsx` | `direction: vertical`, gradient divider |
| `comparison-grid` | `comparison-grid/preview/preview.tsx` | 2×3 matrix with `sequenceOrder: diagonal` |
| `count-up-stat` | `count-up-stat/preview/preview.tsx` | `targetValue: 1_250_000`, `suffix: "+"`, `thousandSeparator: ","` |
| `data-bars` | `data-bars/preview/preview.tsx` | 5 bars with `bar-N` per-element overrides |
| `kinetic-title-mosaic` | `kinetic-title-mosaic/preview/preview.tsx` | `words: signal/noise/repeat`, `layout: mosaic`, `phrasing: phrase-land`; per-word `variant` + `weightTier`, accent on word-1 |
| `orbit-chip-cloud` | `orbit-chip-cloud/preview/preview.tsx` | 5 chips `vectors/tokens/memory/scheduler/tools`, `chip-1` accent flag, dashed drifting orbit, glowing AGENT node |
| `radial-pulse-rings` | `radial-pulse-rings/preview/preview.tsx` | continuous `ringCount: null`, 6s scanline sweep, 3 radar-contact dots at 24°/150°/277° with cards |
| `right-wrong-card` | `right-wrong-card/preview/preview.tsx` | `leftIsWinner: true`, `stampStyle: "shake"`, per-element text + color override |
| `rolling-digit-counter` | `rolling-digit-counter/preview/preview.tsx` | `targetValue: 1_284_509`, `thousandSeparator: ","`, accent `$` prefix + `+` suffix, `lockAccent` + motion blur |
| `timeline-marker` | `timeline-marker/preview/preview.tsx` | 4 events with `event-3` color override |

Each `animation.md` also has further customization recipes.
