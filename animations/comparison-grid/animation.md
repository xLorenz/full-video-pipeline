# Comparison grid

Rows × cols matrix of cells that tumble in via an X-axis flip (visible cards "drop in face-on"). When `headerRow: true`, the top row renders as a bolder accent-colored header. Cells can arrive row-major, diagonal, or spiral order.

## When to use

Reach for it when the scene's `visual_notes` shows a structured table or matrix that should be introduced in a visually satisfying way:
- "X options compared across Y dimensions"
- a pros/cons grid
- "which tier has what?" feature matrix
- a quick pros/cons 2×N reveal

Don't use it for: a free-form comparison with two/three named entities (`right-wrong-card` or `timeline-marker`), or a single statistic (`count-up-stat`).

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { ComparisonGrid } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-08-grid.json";

export const Scene08: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <ComparisonGrid config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-08-grid.json`:
```json
{
  "global": { "speed": 1.0 },
  "extras": {
    "rows": 3, "cols": 3,
    "cells": [
      ["Tier",   "Speed",  "Cost"],
      ["Free",   "Slow",   "$0"],
      ["Pro",    "Fast",   "$20"]
    ],
    "headerRow": true,
    "sequenceOrder": "diagonal"
  }
}
```

## Recognized element ids

| id pattern | Role |
|---|---|
| `cell-0-0`, `cell-0-1`, ... `cell-(R-1)-(C-1)` | One per matrix cell, by row then column. Use `text` to override that cell's label, `color` to set the cell text color, `delay`/`duration`/`easing` per-cell timing overrides. |

Unmatched ids are ignored silently.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `rows` | int 1-6 | (REQUIRED) | Number of matrix rows. |
| `cols` | int 1-6 | (REQUIRED) | Number of matrix columns. |
| `cells` | string[][] | `[]` | Default labels by row. Each `cells[r]` is a list of `cols` strings. Empty if you set every label via `elements[].text` overrides. |
| `sequenceOrder` | `rowMajor` `diagonal` `spiral` | `"rowMajor"` | Order in which cells flip in. |
| `flipDurationSeconds` | number 0.2-2 | `0.4` | Per-cell flip duration. |
| `staggerSeconds` | number 0-3 | `0.08` | Interval between consecutive cells (in sequence order). |
| `cellGapPx` | number 0-80 | `16` | Pixel gap between cells. |
| `cellBackground` | hex / null | theme `background` | Default cell background. Header row uses theme `accent` instead. |
| `cellBorder` | hex / null | theme `gridLine` | Border around each cell. |
| `cellRadiusPx` | number 0-60 | `16` | Cell border radius. |
| `cellPaddingPx` | number 0-200 | `28` | Cell padding (text margin). |
| `flipEasing` | EasingName | `ease-out-back` | Per-cell flip easing. |
| `headerRow` | boolean | `false` | First row renders as banner-row (large accent background, accent-text border, larger font). |

## Customization recipes

### Spiral-in reveal (visual aristocracy)
```json
{ "extras": { "sequenceOrder": "spiral" } }
```

### No header — a uniform 4×4 grid of cost comparisons
```json
{ "extras": { "rows": 4, "cols": 4, "headerRow": false } }
```

### Override a single cell's text (e.g. badge a specific result)
```json
{ "elements": [ { "id": "cell-1-2", "text": "★ Best" } ] }
```

### Recolor a column of cells to spotlight winners
```json
{ "elements": [
  { "id": "cell-1-0", "color": "#10B981" },
  { "id": "cell-2-0", "color": "#10B981" }
] }
```

### Slower, theatrical drop-in
```json
{ "extras": { "flipDurationSeconds": 0.8, "staggerSeconds": 0.2 } }
```

## Pitfalls

- `cells` MUST be `rows` arrays of length `cols` if provided. The template falls back to empty strings if any index is missing — schema doesn't strictly enforce matching length but templates will render blank cells. Validate your data.
- 36 cells max (6×6). Beyond that resolution suffers and ordering becomes noise.
- `flipEasing: "ease-in-back"` makes cells *undershoot* (cards appear from below then snap up) — works great for `spiral` order but can clash with `rowMajor`.
- `headerRow: true` overrides `cellBackground` for row 0 — non-header rows still use `cellBackground`.
- Reducing `staggerSeconds < 0.04` makes many cards land simultaneously and the `sequenceOrder` becomes indistinguishable.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
