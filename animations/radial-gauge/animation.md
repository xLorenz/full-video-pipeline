# Radial gauge

Arc gauge with a **count-up in the center**: the arc sweeps from 12 o'clock to `targetValue / gaugeMax`, the number counts to the same value on the SAME eased timeline (they arrive together), a land punch taps the number, the **cap dot** pops at the arc's leading edge (the signature), and the label lifts in after. Optional 4-quadrant segmented variant (the "four quarters" gauge look). SVG only — crisp at any scale, frame-exact.

## When to use

Reach for it when the scene's `visual_notes` asks for a single "how full / how complete" fraction as the focal visual:
- "X% of users have done Y"
- "the battery is at Z%"
- "we've covered 3 of 4 quadrants"
- "confidence is at 78%"
- "progress toward the goal" beats

Don't use it for: a bare number without a ring (use `count-up-stat`), multi-number comparisons (`data-bars`), or a percentage that should just read as text. Use it when the **sweep itself** is the visual interest — the ring filling IS the statement.

## Holds & visual design notes

- **Number and needle on one timeline.** The arc sweep and the count-up share a single eased progress (`arcEasing`, default ease-out-expo) over `[value.delay, value.delay + durationSeconds]` — the number and the arc arrive together, the eye tracking the arc's final creep into the target. Land events fire at the sweep end, the arc's literal arrival.
- **Cap dot — the signature.** A filled dot the size of the arc stroke pops on a tight spring at the leading edge the frame the sweep completes. The one accent moment after the sweep. Automatically off when `segments: 4` (quadrants already punctuate themselves).
- **Track is quiet.** The full-circle track renders in `trackColor` (falls back to `theme.gridLine`) at 0.55 opacity — a frame for the arc, never a second accent. `showTrack: false` removes it entirely.
- **Arc is the accent.** Defaults to `theme.accent`; recolor via `arcColor` (or the theme). The prefix/suffix render in the same color so the gauge reads as one system.
- **Segmented variant.** `segments: 4` draws four quarter-arcs with 3° gaps (the "quadrant gauge" look); the sweep fills them in sequence — each quarter fills 0→100% of its own span as global progress crosses it.
- **`mono` for separators.** `valueFontRole: "mono"` keeps thousand-separated digits aligned in the center (JetBrains Mono fallback).
- **No horizontal jitter on comma boundaries.** The digit span reserves its final width so `999,999 → 1,000,000` never shifts the center of mass mid-count.
- **Built-in breath.** `holdAfterLandFrames` (default 24 ≈ 0.8s @ 30fps) holds the landed gauge so the brain registers the value before the cut. Strengthen for climax beats.
- **`fps` aware.** Sweep duration, springs and label timing derive from `useVideoConfig().fps`; 24/60 deliverables pace identically to the 30fps preview.
- **Determinism.** All motion from `frame` via `interpolate`/`spring` — frame N renders identically every time.
- **Theme sizing.** `theme.sizes.scale` scales the ring (`ringSizePx`) and the font sizes together.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { RadialGauge } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-06-gauge.json";

export const Scene06: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <RadialGauge config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-06-gauge.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "label", "text": "of viewers finished the demo", "delay": 30, "duration": 16 }
  ],
  "extras": {
    "targetValue": 78,
    "gaugeMax": 100,
    "suffix": "%",
    "durationSeconds": 1.6,
    "capDot": true,
    "holdAfterLandFrames": 30
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `value` | The number in the center. When `extras.countUp=true`, the displayed value counts 0→`targetValue` on the same eased timeline as the arc sweep; the `text` field is ignored. Use this id only to override **color** or font size. | `"0"` |
| `label` | Sub-caption inside the ring below the number. Empty string by default — set `"hidden": true` to suppress. | `""` |
| `prefix` | Symbol before the number, painted in the arc color. e.g. `"$"`. | `""` |
| `suffix` | Symbol after the number, painted in the arc color. e.g. `"%"`. | `""` |

Unmatched ids are ignored silently — a warning is logged at preview time.

## `extras.*`

### Sweep & value
| Key | Type | Default | Description |
|---|---|---|---|
| `targetValue` | number | (REQUIRED) | The final value displayed — the number counts to this and the arc sweeps to `targetValue / gaugeMax`. |
| `gaugeMax` | number | `100` | The denominator. The arc's full circle = `gaugeMax`. Clamp: `targetValue > gaugeMax` renders a full circle. |
| `decimals` | int 0-4 | `0` | Decimal places shown (e.g. `2` for `12.34`). |
| `durationSeconds` | number 0.5-30 | `1.6` | Time the sweep + count-up spend interpolating to the target. |
| `countUp` | boolean | `true` | `false` renders the arc + number at full value instantly (the pop and land punch still apply). |
| `showValue` | boolean | `true` | `false` renders the gauge without the central number — pure ring beat. |
| `prefix` | string | `""` | Symbol before the number, painted in the arc color. |
| `suffix` | string | `""` | Symbol after the number, painted in the arc color. |
| `thousandSeparator` | `","`, `"."`, `""` | `""` | Group integer digits every 3. Use with `valueFontRole: "mono"` for alignment. |
| `valueFontRole` | `"heading"` / `"mono"` | `"heading"` | Font family for the central number. |
| `maxFontPx` | number 8-1000 | `200` | Cap on the resolved number font size (prevents overflow on high `theme.sizes.scale`). |
| `rowGapPx` | number 0-400 | `24` | Space between the number and the label inside the ring. |
| `arcEasing` | easingName | `"ease-out-cubic"` | Easing of the sweep + count-up timeline. Cubic keeps the needle visibly moving through most of the sweep and lands number + arc TOGETHER at the end. `"ease-out-expo"` gives the count-up "crawl into the final digit" stall — great for numbers, weak for gauges (the arc seems to stop ~20 frames early). |

### Gauge geometry
| Key | Type | Default | Description |
|---|---|---|---|
| `ringSizePx` | number 120-1200 | `560` | Diameter of the gauge (scaled by `theme.sizes.scale`). |
| `strokeWidthPx` | number 8-160 | `44` | Arc/track thickness. |
| `segments` | `1` / `4` | `1` | `4` renders the quadrant gauge: four quarter-arcs with 3° gaps, filled in sequence. Disables `capDot`. |
| `showTrack` | boolean | `true` | Draw the faint full-circle track under the arc. |
| `capDot` | boolean | `true` | Pop the accent dot at the arc's leading edge on land (ignored when `segments: 4`). |
| `arcColor` | hex / null | `null` | Arc color. `null` → `theme.accent`. |
| `trackColor` | hex / null | `null` | Track color. `null` → `theme.gridLine`. |

### Entrance
| Key | Type | Default | Description |
|---|---|---|---|
| `pop` | boolean | `true` | Spring scale-in settle on the number (damping 18, mass 1). |
| `anticipationFrames` | integer 0-120 | `6` | Held breath before the pop — number at `anticipationScale`, opacity 0. |
| `anticipationScale` | number 0.1-1 | `0.92` | Scale the number rests at during anticipation. |

### Land
| Key | Type | Default | Description |
|---|---|---|---|
| `landPunch` | boolean | `true` | Micro scale tap on the number the frame the arc completes (1 → `landPunchScale` → 1). |
| `landPunchScale` | number 1-1.5 | `1.02` | Peak of the tap. ~2% reads as weight; >5% reads as bounce. |
| `landPunchDurationFrames` | integer 1-60 | `7` | Length of the tap out-and-back. |
| `holdAfterLandFrames` | integer ≥0 | `24` | Sentinel — the recommended minimum scene budget AFTER the arc completes. The template does NOT fade out; the host scene composes out. |

### Label
| Key | Type | Default | Description |
|---|---|---|---|
| `labelAfterLand` | boolean | `true` | Hold the label until 2 frames after the arc completes. `false` reverts to the authored `label.delay`. |

## Customization recipes

### Quadrant gauge ("3 of 4 done")
```json
{
  "extras": { "targetValue": 3, "gaugeMax": 4, "segments": 4, "suffix": "", "capDot": false },
  "elements": [ { "id": "label", "text": "of 4 phases complete" } ]
}
```

### Money gauge with a dollar prefix
```json
{
  "extras": { "targetValue": 842000, "gaugeMax": 1000000, "prefix": "$", "thousandSeparator": ",", "valueFontRole": "mono", "maxFontPx": 150 }
}
```

### Recolor the arc to success green
```json
{ "extras": { "arcColor": "#10B981" } }
```

### Smaller, thinner, faster
```json
{
  "extras": { "ringSizePx": 380, "strokeWidthPx": 28, "durationSeconds": 1.1 }
}
```

### Ring only, no number
```json
{
  "extras": { "showValue": false, "targetValue": 62 },
  "elements": [ { "id": "label", "text": "capacity used" } ]
}
```

## Pitfalls

- `extras.targetValue` is required. The schema rejects configs that omit it.
- `targetValue > gaugeMax` renders a full circle (progress clamps at 1). If the arc should read "over target", raise `gaugeMax` or flip the framing.
- `capDot` is ignored when `segments: 4` — quadrants already punctuate their own ends; a flying dot on top reads as noise.
- `valueFontRole: "mono"` requires a mono font in `theme.fonts` (or `FONTS.mono` in styles.ts); falls back to JetBrains Mono.
- The template does NOT fade the gauge out at end-of-life — compose out via the host scene's `<Sequence>` + transition. If your composition ends exactly at `sweepEnd + holdAfterLandFrames`, the scene ends on the held, fully-landed gauge.
- The label can overflow the ring if it's long — keep it under ~24 characters or reduce `ringSizePx`... the label clamps to 62% of the ring width (ellipsis may apply).

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
