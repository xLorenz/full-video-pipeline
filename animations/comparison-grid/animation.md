# Comparison grid

Rows × cols matrix of cells that tumble in via an X-axis flip (visible cards "drop in face-on"). When `headerRow: true`, the top row renders as a bolder accent-colored header with an accent rule UNDER the row. Optional `eyebrow` + `title` + `subtitle` sit above the matrix; an optional `winnerRow` reveals an accent rail on the row's left edge after the matrix settles — the signature beat that draws the eye to the result. Cells can arrive row-major, diagonal, or spiral order.

## When to use

Reach for it when the scene's `visual_notes` shows a structured table or matrix that should be introduced in a visually satisfying way:
- "X options compared across Y dimensions"
- a pros/cons grid
- "which tier has what?" feature matrix
- a quick pros/cons 2×N reveal

Don't use it for: a free-form comparison with two/three named entities (`right-wrong-card` or `timeline-marker`), or a single statistic (`count-up-stat`).

## Holds & visual design notes

- **Scene background is now filled.** The component sets `backgroundColor: sceneBg` on its own `AbsoluteFill` so the whole canvas is filled with `theme.background` (default `#0A1220`) — earlier releases left black margins around the container only.
- **Optional heading block above the matrix.** `eyebrow` + `title` + `subtitle` render in the reserved top 16% of the canvas; an accent underline slides out 28% of the heading's width as the title lands. The grid below sits in the remaining 64% so it never collides with the title.
- **Spring on the flip.** Each cell lands via Remotion's `spring({damping: 14, mass: 1, stiffness: 120})` — a damped settle replaces the synchronized wave of identical ease-out-back overshoots that read as "templated CSS reveal." Stagger still produces rhythm, but each card settles its own way.
- **`headerEmphasis: "none"` is the NEW default.** The header row renders as accent-colored text with an accent **rule UNDER the header row** spanning the full grid width — reads as a real table header, not a banner. `"fill"` (legacy, accent background + body text), `"border"` (accent top border), and `"both"` are still available.
- **`headerRowRatio: 0.7`.** Header row is 70% the height of a body row — the banner is shorter than its data rows, giving body cells room to breathe without the header dominating.
- **`accentLandFlash` (default true).** A brief accent top-edge bloom fires 8 frames after each cell lands — sells the flip landing without making the grid shouty.
- **`winnerRow` signature beat.** After the matrix settles, an accent rail grows from the row's left edge + the row's text brightens from muted to accent over `winnerRowDurationFrames` (default 14 frames). Use this to spotlight the recommended tier / winner option.
- **Default palette away from amber-on-near-black.** `accentColor` falls through to `theme.primary` instead of `#FFB300` — the amber-on-`#0A1220` combo was the archetypal AI-default look. Default cell border is a subtle `rgba(255,255,255,0.05)` hairline, not the near-black `#1A2744` broadsheet rule. Set `cellBorderless: true` to drop body borders entirely.
- **Per-cell mono support.** Set `custom.mono: true` on an element to render its text with `theme.fonts.mono` and `tabular-nums` — perfect for numeric cells in a comparison grid. `custom.weight` overrides the per-cell font weight.
- **Per-column widths + alignment.** `columnWidths: number[]` weights column widths (e.g. `[0.85, 1, 1, 1]` for a narrow option column with three equal data columns); `columnAlign: ("left"|"center"|"right")[]` per-column text alignment — left-aligned labels, right-aligned numbers.
- **`rowSeparators` (default false).** Optional faint hairlines between body rows spanning the full grid width.
- **`fps` aware.** Flip duration and stagger derive from `useVideoConfig().fps`; 24/60 deliverables pace identically to the 30fps preview.

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
| `cell-0-0`, `cell-0-1`, ... `cell-(R-1)-(C-1)` | One per matrix cell, by row then column. Use `text` to override that cell's label, `color` to set the cell text color, `delay`/`duration`/`easing` for per-cell timing overrides. Set `custom.mono: true` to render the cell's text with `theme.fonts.mono` + `tabular-nums` (great for numeric cells). Set `custom.weight: number` to override the cell's font weight. |

Unmatched ids are ignored silently.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `rows` | int 1-6 | (REQUIRED) | Number of matrix rows (including the header row if `headerRow: true`). |
| `cols` | int 1-6 | (REQUIRED) | Number of matrix columns. |
| `cells` | string[][] | `[]` | Default labels by row. Each `cells[r]` is a list of `cols` strings. Empty if you set every label via `elements[].text` overrides. |
| `eyebrow` | string \| null | `null` | Small mono-uppercase eyebrow line above the title (e.g. `"COMPARE"`). |
| `title` | string \| null | `null` | Headline above the matrix (e.g. `"Pick your plan"`). |
| `subtitle` | string \| null | `null` | Body-text subtitle line below the title. |
| `sequenceOrder` | `rowMajor` `diagonal` `spiral` | `"diagonal"` | Order in which cells flip in. |
| `flipDurationSeconds` | number 0.2-2 | `0.42` | Per-cell flip duration. |
| `staggerSeconds` | number 0-3 | `0.07` | Interval between consecutive cells (in sequence order). |
| `cellGapPx` | number 0-80 | `8` | Pixel gap between cells. |
| `cellBackground` | hex / null | theme `background` | Default cell background. With `headerEmphasis: "fill"` the header row uses `theme.accent` instead. |
| `cellBorder` | hex / null | theme `gridLine` | Border around each body cell — default is a subtle 5%-white hairline. Set `cellBorderless: true` to drop body borders entirely. |
| `cellRadiusPx` | number 0-60 | `10` | Cell border radius. |
| `cellPaddingPx` | number 0-200 | `24` | Cell padding for body rows. |
| `headerCellPaddingPx` | number 0-200 | `16` | Cell padding for the header row (tighter since header cells use a larger font). |
| `headerRowRatio` | number 0.3-1.5 | `0.7` | Header row height as a fraction of a body row height. `0.7` = header is 70% the height of body rows (banner-like); `1` = uniform. |
| `flipEasing` | EasingName | `ease-out-cubic` | Per-cell flip easing (drives text-reveal opacity timing); the spring drives the actual rotateX. |
| `headerRow` | boolean | `false` | First row renders as the banner-row. |
| `headerEmphasis` | `none` `fill` `border` `both` | `"none"` | ONE emphasis channel for the header. `"none"` (default — accent text + accent rule UNDER the header row); `"fill"` (accent background + body text — legacy); `"border"` (accent top border on body background); `"both"` (rare). |
| `accentLandFlash` | boolean | `true` | Brief accent top-edge bloom when each cell lands. |
| `rowSeparators` | boolean | `false` | Faint hairlines between body rows, spanning the full grid width. |
| `winnerRow` | int 0-5 \| null | `null` | Index of a body row to spotlight after the matrix settles. An accent rail grows from the row's left edge + the row's text brightens from muted to accent over `winnerRowDurationFrames`. |
| `winnerRowDurationFrames` | int 4-120 | `14` | Duration of the winner-row reveal, in frames. |
| `cellBorderless` | boolean | `false` | Drop all body-cell borders. The grid reads by fills + spacing. |
| `postFlipHoldFrames` | integer 0-600 | `18` | Built-in breath — the assembled matrix holds for this long after the last cell lands. |
| `containerWidthPct` | number 50-100 | `88` | Grid container width, as percent of scene canvas. |
| `containerHeightPct` | number 30-100 | `64` | Grid container height, as percent of scene canvas AFTER the heading block is reserved. |
| `columnWidths` | number[] \| null | `null` | Relative width weights per column (e.g. `[0.85, 1, 1, 1]` for a narrow option column with three equal data columns). Falls back to all-equal when null or mismatched-length. |
| `columnAlign` | `("left"\|"center"\|"right")[]` \| null | `null` (center) | Per-column text alignment (e.g. `["left","right","right"]` for left-aligned labels and right-aligned numbers). |

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
  { "id": "cell-1-0", "color": "#00BFA6" },
  { "id": "cell-2-0", "color": "#00BFA6" }
] }
```

### Minimal grid — no borders, body cells only
```json
{ "extras": { "cellBorderless": true, "headerRow": false } }
```
The grid reads by spacing + fill contrast only.

### Switch the header emphasis to a top-border style
```json
{ "extras": { "headerRow": true, "headerEmphasis": "border" } }
```
Header cells stay on the body background but gain an accent top border — quieter than an accent fill.

### Spotlight a winner row after the matrix settles
```json
{ "extras": {
    "rows": 4, "cols": 3,
    "eyebrow": "COMPARE",
    "title": "Pick your plan",
    "headerRow": true,
    "winnerRow": 2,
    "winnerRowDurationFrames": 18
} }
```
After the last cell lands, an accent rail grows along row 2's left edge and that row's text brightens from muted to accent — the signature "this is the one" beat.

### Per-column widths + alignment (numeric tables)
```json
{ "extras": {
    "rows": 4, "cols": 4,
    "headerRow": true,
    "columnWidths": [0.85, 1, 1, 1],
    "columnAlign": ["left", "right", "right", "right"]
}, "elements": [
    { "id": "cell-1-1", "text": "$0",   "custom": { "mono": true } },
    { "id": "cell-1-2", "text": "$20",  "custom": { "mono": true } },
    { "id": "cell-1-3", "text": "$99",  "custom": { "mono": true } }
] }
```
A narrow left-aligned option column with three equal right-aligned numeric columns rendered with the mono font + tabular-nums.

### Slower, theatrical drop-in with a long breath
```json
{ "extras": { "flipDurationSeconds": 0.8, "staggerSeconds": 0.2, "postFlipHoldFrames": 36 } }
```

## Pitfalls

- `cells` MUST be `rows` arrays of length `cols` if provided. The template falls back to empty strings if any index is missing — schema doesn't strictly enforce matching length but templates will render blank cells. Validate your data.
- 36 cells max (6×6). Beyond that resolution suffers and ordering becomes noise.
- `flipEasing: "ease-in-back"` makes cells *undershoot* (cards appear from below then snap up) — works great for `spiral` order but can clash with `rowMajor`.
- `headerRow: true` overrides `cellBackground` for row 0 when `headerEmphasis: "fill"` — non-header rows still use `cellBackground`. With `headerEmphasis: "none"` (default) or `"border"`, header keeps the body background.
- Default body-cell border is a subtle 5%-white hairline. If your palette already provides strong fill contrast (e.g. all-dark mode), consider `cellBorderless: true` for a cleaner surface.
- The flip *rotateX* is driven by a spring (damping 14, stiffness 120). If the settle feels too soft for a high-energy opener, raise `flipDurationSeconds` and lower `staggerSeconds` together — don't try to "speed up" the settle by easing, since the spring owns the rotate.
- Reducing `staggerSeconds < 0.04` makes many cards land simultaneously and the `sequenceOrder` becomes indistinguishable.
- `winnerRow` indexes the ROW as written into `cells`/elements (row 0 is the header if `headerRow: true` — pass `winnerRow: 1` to spotlight the first body row, `2` for the second, etc.). Headers cannot be winners.
- `columnWidths` and `columnAlign` must match `cols`. If they don't, the template falls back to equal-width / center alignment silently — check your output.
- The component fills the scene with `theme.background` (default `#0A1220`) on its own `AbsoluteFill`. Don't wrap it in a `<Background>` that fills with a different color unless you want that exact override.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
