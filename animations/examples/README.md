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
| `right-wrong-card` | `right-wrong-card/preview/preview.tsx` | `leftIsWinner: true`, `stampStyle: "shake"`, per-element text + color override |
| `data-bars` | `data-bars/preview/preview.tsx` | 5 bars with `bar-N` per-element overrides |
| `count-up-stat` | `count-up-stat/preview/preview.tsx` | `targetValue: 1_250_000`, `suffix: "+"`, `thousandSeparator: ","` |
| `before-after-split` | `before-after-split/preview/preview.tsx` | `direction: vertical`, gradient divider |
| `timeline-marker` | `timeline-marker/preview/preview.tsx` | 4 events with `event-3` color override |
| `comparison-grid` | `comparison-grid/preview/preview.tsx` | 2×3 matrix with `sequenceOrder: diagonal` |

Each `animation.md` also has further customization recipes.
