# Data bars

Horizontal racing-bar visualization for ranked quantities. Bars reveal left-to-right, counting upward in parallel, with staggered opening so each slot appears 6 frames after the previous one (before scaling). Perfect for "who wins this comparison?" beats.

## When to use

Reach for it when the scene's `visual_notes` shows a small set (1-9) of values being compared or ranked against each other:
- "Country X produces Y% of the world's Z — here's how it stacks up against..."
- "the top 5 reasons..."
- "average completion times for each method"
- "what 1000 viewers said about..."

Don't use it for: a single big number (use `count-up-stat`), or a binary right/wrong verdict (use `right-wrong-card`).

## Holds & visual design notes

- **Hidden reflow now works.** Setting `hidden: true` on a bar element collapses its slot — maxVal, layout N, and stack positions all update so sibling bars reflow up. (Earlier releases documented this feature but never implemented it.)
- **No more batch glow.** Earlier releases put a `boxShadow: 0 6px 18px {color}30` halo on *every* bar. Removed — batch entrances ride the motion itself, per the rubric. If you want a single bar to be the *signature* accent (e.g. highlight the winner), set `custom.glow: true` on exactly one bar; everything else stays flat.
- **Per-index color ramp instead of monochrome amber.** Bars without an explicit `color` fall through to a brightness-ranked mix of `theme.secondary → theme.accent` (both bright palette tokens) — the chart reads as ranked data and the largest bar lands on the brighter accent end. Going `primary → secondary` would render the largest bar as flat dark navy against a dark navy background. Override per element with `element.color`, per-ramp anchors with `extras.barRampFrom` / `extras.barRampTo`, or globally with `extras.barColor`.
- **Spring on the land.** Each bar's fill is driven by a single spring (no eased-fill-plus-spring lego); default damping 13 (configurable via `barSpringDamping`) at mass 1 stiffness 100 yields ~6% overshoot that glides smoothly back to the target — the race "rushes to the line," overshoots, and settles without a hard snap. The damped-settling time = π/(ω₀·√(1−ζ²)) drives the leader-halo timing so the pulse lands exactly at the overshoot peak.
- **Leader auto-halo.** The largest-value bar gets a one-shot halo pulse around its landing frame — a single signature accent that expands briefly then retracts, never lingering as a static halo. Disable with `accentLeader: false`; opt a different bar into a permanent halo via `custom.glow: true`.
- **Empty-data guard.** Passing `values: []` or every bar hidden renders a quiet "No data" block instead of a broken blank chart with one zero-width bar labeled "Item 1".
- **Type & value labels tightened.** Bar labels use the heading family at medium weight (categorical names, not body copy). Value labels use tabular numerals so the numbers align vertically.
- **`labelGutterPx` configurable.** The hardcoded 260/280-left constant from earlier releases is now an `extras.labelGutterPx` (default 280); long labels no longer clip on narrow layouts.
- **Built-in breath.** `holdAfterFillFrames` (default 18) holds the filled state so the viewer can compare before the scene cuts. Strengthen to 30+ if this scene is the climax.
- **`fps` aware, `resolveTiming` shared.** All durations derive from `useVideoConfig().fps`; the bar stagger/schedule uses the shared `resolveTiming()` helper so timing matches the SCHEMA resolve-rules exactly.

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
| `barColor` | hex string | theme `primary` | Default bar color used for every slot not overridden via element `color`. When `null` (default), bars take a per-index ramp from `theme.secondary` → `theme.accent` (bright → bright). |
| `barRampFrom` | hex string \| null | theme `secondary` | Anchor color for the smaller bars in the default ramp. Pass `theme.primary` here if you genuinely want the dark end of the ramp on smaller bars. |
| `barRampTo` | hex string \| null | theme `accent` | Anchor color for the larger bars (the leader lands on this). |
| `valueFormat` | enum: `int` `decimals1` `decimals2` `percent` | `"int"` | How `showValueLabels` renders the end-of-bar number. |
| `showValueLabels` | boolean | `true` | Render the trailing numeric label at the end of each bar. Value labels use tabular-numerals so digits align vertically across rows. |
| `lanePaddingPx` | number 0-800 | `140` | Pixels on each side reserved as padding within AbsoluteFill. |
| `labelGutterPx` | number 0-600 | `300` | Width of the left gutter reserved for bar labels. Override higher if your labels are long; lower to widen the bar track. |
| `holdAfterFillFrames` | integer 0-600 | `18` | Hold after the longest bar lands — the breath that lets the viewer compare. Strengthen to 30+ if this is the climax beat. |
| `barSpringDamping` | number 4-30 | `10` | Damping for the bar's landing spring (mass 1, stiffness 60). Default 10 yields ~6% overshoot with a smooth glide-back over ~16 frames. Lower = bouncier (8 ≈ 10%); higher = stiffer (14 ≈ 2%, 16+ = no overshoot). |
| `staggerFrames` | integer 0-30 | `5` | Frames between one bar entering and the next. Lower = tighter race; higher = more dramatic stagger. |
| `fillFrames` | integer 8-90 | `22` | Duration of each bar's width fill. |
| `accentLeader` | boolean | `true` | Auto-halo the largest-value bar once at land. Set `false` to disable and rely on manual `custom.glow` instead. |
| `trackRoundingPx` | number 0-40 | `8` | Corner radius of bars and tracks. |

### Per-element `custom.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `color` | hex string \| null | `null` | Alternative slot for per-bar color; precedence is `element.color` > `custom.color` > `extras.barColor` > per-index ramp. |
| `glow` | boolean | `false` | Opt ONE bar into a quiet elevation accent — typically the winner of the race. **Don't enable on multiple bars** — batch glow reads as cheap. |

## Customization recipes

### Recolor and highlight the winner bar
```json
{
  "elements": [
    { "id": "bar-2", "color": "#00BFA6", "custom": { "glow": true } }
  ]
}
```
The bar 2 fill recolors and gets a quiet elevation accent. All other bars stay flat — one signature accent, not a batch glow.

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
- The template resizes the *width* of each bar proportional to its value vs the maximum (`max(visibleValues)`). Negatives are treated as 0 visually but still count toward `max`; consider clamping yourself if your data has spikes.
- Setting `barColor` to a hex overrides the per-index palette ramp for ALL bars not individually overridden — this is the "give the chart one accent color" path, *not* "set everything to amber every time." The default `null` keeps the ramp.
- The race is the moment. Don't enable `custom: { "glow": true }` on multiple bars — that defeats the single-signature-accent principle and reads as a batch halo.
- Long labels clip with ellipsis; widen `labelGutterPx` (default 280) if your label set needs more room.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
