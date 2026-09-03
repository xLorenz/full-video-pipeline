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
| `bend` | `bend/preview/preview.tsx` | PhotoBlock children scrolling on a cube page-fold; paper palette theme override |
| `blaze` | `blaze/preview/preview.tsx` | Pyre PhotoBlock children with procedural fire rising from the bottom, heat distortion + luma darkening |
| `comparison-grid` | `comparison-grid/preview/preview.tsx` | 2×3 matrix with `sequenceOrder: diagonal` |
| `count-up-stat` | `count-up-stat/preview/preview.tsx` | `targetValue: 1_250_000`, `suffix: "+"`, `thousandSeparator: ","` |
| `data-bars` | `data-bars/preview/preview.tsx` | 5 bars with `bar-N` per-element overrides |
| `decrypt-reveal` | `decrypt-reveal/preview/preview.tsx` | Classified-dossier children (monospace) under a shape-matched cipher; traveling decrypt circle reveals content |
| `droplets` | `droplets/preview/preview.tsx` | Night-city children with lit windows; rain trails + refraction + fog over content |
| `flame-wrap` | `flame-wrap/preview/preview.tsx` | TitleCard children (`radius: 28` matches card), bottom-of-frame placement for ~300px flames, rim glow + sparks + smoke |
| `glitch-rip` | `glitch-rip/preview/preview.tsx` | TitleCard children with spring-in headline; glitch bursts slice banded clones with RGB split, hard-cut restore |
| `glyph-rain` | `glyph-rain/preview/preview.tsx` | TerminalCard children with typed-in headline; glyph rain overlays dimmed (0.5) children |
| `kinetic-title-mosaic` | `kinetic-title-mosaic/preview/preview.tsx` | `words: signal/noise/repeat`, `layout: mosaic`, `phrasing: phrase-land`; per-word `variant` + `weightTier`, accent on word-1 |
| `magnify` | `magnify/preview/preview.tsx` | PhotoBlock children with fine detail; scripted cursor path with click ripples + zoom punch |
| `orbit-chip-cloud` | `orbit-chip-cloud/preview/preview.tsx` | 5 chips `vectors/tokens/memory/scheduler/tools`, `chip-1` accent flag, dashed drifting orbit, glowing AGENT node |
| `radial-gauge` | `radial-gauge/preview/preview.tsx` | 78% gauge with gold arc theme override, cap-dot pop on land, label lifted after arc, `value`/`label` element overrides |
| `radial-pulse-rings` | `radial-pulse-rings/preview/preview.tsx` | continuous `ringCount: null`, 6s scanline sweep, 3 radar-contact dots at 24°/150°/277° with cards |
| `right-wrong-card` | `right-wrong-card/preview/preview.tsx` | `leftIsWinner: true`, `stampStyle: "shake"`, per-element text + color override |
| `rolling-digit-counter` | `rolling-digit-counter/preview/preview.tsx` | `targetValue: 1_284_509`, `thousandSeparator: ","`, accent `$` prefix + `+` suffix, `lockAccent` + motion blur |
| `shatter` | `shatter/preview/preview.tsx` | PhotoBlock children; glass-shard tiles lift, tip and refract content beneath |
| `timeline-marker` | `timeline-marker/preview/preview.tsx` | 4 events with `event-3` color override |
| `trend-line` | `trend-line/preview/preview.tsx` | 7-point weekly trend with gold line theme override, gradient area, dot pops, GOAL line, end-value count-up chip |
| `vhs` | `vhs/preview/preview.tsx` | Opaque-background TapeScene children (bezel-color probe); full-frame worn-tape CRT effect over captured DOM |

Each `animation.md` also has further customization recipes.
