# Trend line

Draw-on line chart: the line draws left→right, the gradient area follows under an advancing clip, the data dots pop as the leading edge passes each point, the **last value counts up** in a mono chip beside the final dot (the signature — the trend "lands" as a number), and an optional **goal line** draws in afterwards with an accent tag. Pure SVG, frame-derived, deterministic.

## When to use

Reach for it when the scene's `visual_notes` shows change **over time** — the one chart type the catalog was missing:
- "watch time has doubled since January"
- "how the metric grew quarter over quarter"
- "we hit 50k this month — here's the run-up"
- "the line is pointing up / flattening / turning"
- any beat where a series of values should read as a trajectory

Don't use it for: ranked quantities (`data-bars`), a single number (`count-up-stat` / `radial-gauge`), or two-vs-two comparisons (`right-wrong-card`). Use it when the **draw itself** is the story — the line building left to right IS time passing.

## Holds & visual design notes

- **Draw-on via dash offset, not paths.** The polyline's length is hand-computed (segment sums — no DOM measurement, fully deterministic) and the line reveals through `strokeDasharray`/`strokeDashoffset`. Round caps keep the leading edge a clean dot as it travels.
- **Arc-length pacing.** Data dots pop the frame the leading edge *reaches* them — paced by cumulative segment length, so uneven Y swings don't desync the dot from the line tip.
- **Area follows the line.** The gradient area (line color fading to transparent) reveals under a clip rect that advances with the draw — the area can never "lead" the line.
- **End value — the signature.** Once the line completes, the last value counts up (ease-out-expo) in a bold mono chip **centered above the final dot**. The trend lands as a number. Disable with `endCountUp: false` for pure-line beats.
- **Goal line is the "here's the target" moment.** `showGoal: true` draws a dashed reference line after the series completes, tagged with `goalLabel` **+ the formatted goal value** in accent mono above the line's **left end** (the right end is where the series lands, so a right-side tag would sit on the graphics). When the goal value doesn't fall on a quarter gridline, an accent Y-axis label echoes the value exactly at the line's height, so the line provably sits at its value. One beat, delayed, never competing with the draw.
- **Quiet furniture.** Gridlines use `theme.gridLine` at 0.3 opacity; axis labels are the muted mono/body tones. The line is the only saturated element.
- **Y domain auto-pads.** Default domain = data min/max + 8% pad each side; the goal value is folded into the domain when set. Pin with `yMin`/`yMax` for consistent axis across scenes.
- **Compact labels.** `valueFormat: "compact"` renders `1.2M` / `48k` style axis + end labels (the shadcn-style formatting).
- **Dense series stay legible.** With more than 8 points, x labels step every other slot (last label always shown).
- **Built-in breath.** `holdAfterDrawFrames` (default 24 ≈ 0.8s @ 30fps) holds the landed chart. Strengthen for climax beats.
- **`fps` aware.** Draw, count-up, pops and goal timing derive from `useVideoConfig().fps`; `global.speed` scales the `drawDelayFrames` offset too.
- **Determinism.** All motion from `frame` — no `Math.random`, no DOM measurement, no CSS animations. Frame N renders identically every time.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { TrendLine } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-07-trend.json";

export const Scene07: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <TrendLine config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-07-trend.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "title", "text": "WATCH TIME / WEEK" },
    { "id": "label", "text": "minutes per active viewer" }
  ],
  "extras": {
    "points": [12, 24, 18, 33, 41, 38, 52],
    "labels": ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL"],
    "yMin": 0,
    "yMax": 60,
    "showGoal": true,
    "goalValue": 50,
    "goalLabel": "GOAL",
    "endCountUp": true,
    "valueFormat": "int",
    "holdAfterDrawFrames": 30
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `title` | Heading centered above the chart. Optional — omit or `"hidden": true` for a bare chart. | `""` |
| `label` | Sub-caption centered below the chart. Optional. | `""` |

Unmatched ids are ignored silently — a warning is logged at preview time.

## `extras.*`

### Data
| Key | Type | Default | Description |
|---|---|---|---|
| `points` | number[] 2-24 | (REQUIRED) | The series values, in time order. The line draws through them left→right. |
| `labels` | string[] 2-24 | `[]` | X-axis category labels (one per point). Longer arrays are truncated to `points` length. |
| `yMin` / `yMax` | number / null | `null` | Pin the Y domain. `null` → auto (data range + 8% pad, goal folded in). |
| `valueFormat` | `int` `decimals1` `decimals2` `percent` `compact` | `"int"` | Format for gridline labels and the end-value count-up. `compact` renders `1.2M` / `48k`. |

### Draw
| Key | Type | Default | Description |
|---|---|---|---|
| `drawSeconds` | number 0.5-8 | `1.8` | Time the line takes to draw left→right. |
| `drawEasing` | easingName | `"ease-out-cubic"` | Easing of the draw. Linear reads "machine-scan"; cubic reads "reveal". |
| `drawDelayFrames` | integer 0-120 | `10` | Frames before the draw starts (scaled by `global.speed`, offset by `global.delayOffset`). |
| `showArea` | boolean | `true` | Gradient area fill under the line (advances with the draw). |
| `areaOpacity` | number 0-1 | `0.32` | Peak opacity of the gradient at the line. |
| `showDots` | boolean | `true` | Data dots on the line. |
| `dotPop` | boolean | `true` | Dots spring in as the leading edge passes. `false` → dots present from the start (use with `showDots: false`-style flat looks). |
| `dotSizePx` | number 2-32 | `10` | Data dot diameter. |
| `lineWidthPx` | number 2-24 | `6` | Stroke width of the line. |

### Furniture
| Key | Type | Default | Description |
|---|---|---|---|
| `showGrid` | boolean | `true` | Four interior horizontal gridlines (25/50/75/100% of the domain). |
| `xLabels` | boolean | `true` | Category labels under the axis. |
| `yLabels` | boolean | `true` | Value labels on the gridlines (mono). |
| `lineColor` | hex / null | `null` | Line, dots, area and end chip color. `null` → `theme.accent`. |
| `gridColor` | hex / null | `null` | Gridlines + axis labels. `null` → `theme.gridLine`. |

### Signature beats
| Key | Type | Default | Description |
|---|---|---|---|
| `showGoal` | boolean | `false` | Draw the dashed goal/reference line after the series completes. |
| `goalValue` | number / null | `null` | The value the goal line sits at. Ignored when `showGoal` is false. |
| `goalLabel` | string | `"GOAL"` | Tag rendered above the left end of the goal line, followed by the formatted goal value (accent mono). Skip the appended value by including it in `goalLabel` itself. |
| `endCountUp` | boolean | `true` | The last point's value counts up beside the final dot once the line completes. |
| `endCountUpSeconds` | number 0.3-6 | `0.9` | Duration of the end-value count-up. |
| `holdAfterDrawFrames` | integer ≥0 | `24` | Sentinel — recommended minimum scene budget AFTER the line completes. The template does NOT fade out; the host scene composes out. |
| `labelAfterDraw` | boolean | `true` | Hold the sub-caption until the line completes. `false` reverts to the authored `label.delay`. |

## Customization recipes

### Goal vs actual ("we're still short")
```json
{
  "extras": { "showGoal": true, "goalValue": 50, "goalLabel": "TARGET", "valueFormat": "int" }
}
```

### Compact big numbers
```json
{
  "extras": { "points": [120000, 240000, 310000, 420000, 610000], "valueFormat": "compact" }
}
```

### Pure line, no decorations
```json
{
  "extras": { "showArea": false, "showDots": false, "showGoal": false, "endCountUp": false, "showGrid": false, "xLabels": false, "yLabels": false },
  "elements": [ { "id": "label", "hidden": true } ]
}
```

### Slower, weightier draw for a climax beat
```json
{
  "extras": { "drawSeconds": 3.2, "drawEasing": "ease-in-out", "holdAfterDrawFrames": 40 }
}
```

### Fixed axis so the rise reads against a constant ceiling
```json
{ "extras": { "yMin": 0, "yMax": 100, "valueFormat": "percent" } }
```

## Pitfalls

- `extras.points` is required and must have **2-24** values. Fewer than 2 renders a quiet `NO DATA` block.
- `labels` longer than `points` are truncated; shorter arrays just leave those slots unlabeled. Keep them equal-length for a clean axis.
- The chart occupies a fixed 1920×1080 layout (title ~top 84, chart band y 250-860, labels below). If your composition is 9:16, this template does not reflow — pair it with a 16:9 background or crop the composition.
- `valueFormat: "percent"` appends `%` to raw values — it does NOT convert fractions to percents. Pass already-percentage numbers (e.g. `points: [24, 51]`).
- With `drawEasing: "ease-in-out"` the line pauses at both ends — great for long beats, dead-feeling for short ones. Keep `ease-out-cubic` (or `linear`) for snappy 1.5-2s draws.
- The end-value chip sits centered above the last dot, the goal tag above the line's left end — they never crowd each other. With the last value near the domain top the chip can rise above the chart band; pad the domain or drop `endCountUp` for that layout.
- The template does NOT fade the chart out at end-of-life — compose out via the host scene's `<Sequence>` + transition.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
