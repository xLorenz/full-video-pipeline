# Data bars

Horizontal racing-bar visualization for ranked quantities. Bars reveal left-to-right, counting upward in parallel, with staggered opening so each slot appears 6 frames after the previous one (before scaling). Perfect for "who wins this comparison?" beats.

## When to use

Reach for it when the scene's `visual_notes` shows a small set (1-9) of values being compared or ranked against each other:
- "Country X produces Y% of the world's Z — here's how it stacks up against..."
- "the top 5 reasons..."
- "average completion times for each method"
- "what 1000 viewers said about..."

Don't use it for: a single big number (use `count-up-stat`), or a binary right/wrong verdict (use `right-wrong-card`).

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { DataBars } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-05-bars.json";

export const Scene05: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <DataBars config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-05-bars.json`:
```json
{
  "global": { "speed": 1.0 },
  "extras": {
    "values": [42, 88, 56, 120, 35],
    "labels": ["First", "Second", "Third", "Fourth", "Fifth"],
    "barHeightPx": 64,
    "valueFormat": "int",
    "countUp": true
  },
  "elements": [
    { "id": "bar-0", "text": "Hydrogen" },
    { "id": "bar-1", "text": "Helium" },
    { "id": "bar-3", "color": "#10B981" }
  ]
}
```

## Recognized element ids

| id | Role | Notes |
|---|---|---|
| `bar-0`, `bar-1`, ... `bar-{N-1}` | One entry per data slot (index 0-based). Use `text` to override that bar's label, `color` for the bar fill (overrides `extras.barColor`), `delay`/`duration` for opening timing, `easing` for the bar reveal easing, `hidden: true` to omit the bar (the bar's slot is collapsed and others reflow). |

Unmatched ids (e.g. `bar-9` when only 7 bars exist) are ignored silently.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `values` | number[] | (REQUIRED) | One value per bar. Max 9 entries. |
| `labels` | string[] | (REQUIRED) | One label per bar (same length as `values`). |
| `countUp` | boolean | `true` | Bars animate from 0 to their final width. `false` snaps bars to full width immediately. |
| `topN` | int 1-9 | `8` | Maximum number of bars displayed. Beyond that, extras slots are skipped. |
| `barHeightPx` | number 8-200 | `48` | Bar thickness. |
| `barGapPx` | number 0-80 | `12` | Vertical gap between bars. |
| `barColor` | hex string | theme `accent` | Default bar color used for every slot not overridden via element `color`. |
| `valueFormat` | enum: `int` `decimals1` `decimals2` `percent` | `"int"` | How `showValueLabels` renders the end-of-bar number. |
| `showValueLabels` | boolean | `true` | Render the trailing numeric label at the end of each bar. |
| `lanePaddingPx` | number 0-800 | `120` | Pixels on each side reserved as padding within AbsoluteFill. |

## Customization recipes

### Recolor a specific bar to highlight the winner
```json
{ "elements": [ { "id": "bar-2", "color": "#00FF00" } ] }
```

### Replace the labels without retyping other fields
```json
{
  "elements": [
    { "id": "bar-0", "text": "USA" },
    { "id": "bar-1", "text": "China" },
    { "id": "bar-2", "text": "EU" }
  ]
}
```

### Drop the right-end numeric labels for a cleaner grid look
```json
{ "extras": { "showValueLabels": false } }
```

### Percentage-style bars
```json
{ "extras": { "values": [25, 60, 15], "valueFormat": "percent" } }
```

### Make bars chunkier, fewer per screen
```json
{ "extras": { "barHeightPx": 80, "barGapPx": 18, "topN": 5 } }
```

### Speed up the racing so it feels frantic
```json
{ "global": { "speed": 1.8 } }
```

## Pitfalls

- `values` and `labels` MUST be the same length. The schema rejects mismatched arrays.
- Max 9 bars — if your data has more, the schema rejects it. Filter to the top N before passing in.
- The template resizes the *width* of each bar proportional to its value vs the maximum (`max(values)`). Negatives are treated as 0 visually but still count toward `max`; consider clamping yourself if your data has spikes.
- `barColor` set to a hex overrides the theme.accent for ALL bars not individually overridden.
- Long labels clip with ellipsis; consider shortening the label text or widening the label gutter (currently fixed at 260px — file a PR to make it configurable if needed).

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
