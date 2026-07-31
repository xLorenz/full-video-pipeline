# Count-up stat

Big numerical reveal: an integer or decimal number counts from 0 up to its target value over a configurable duration (`durationSeconds`), with a pop-in intro scale and an optional sub-label below. Optional prefix (e.g. `$`) / suffix (e.g. `×`, `%`).

## When to use

Reach for it when your scene's `visual_notes` requires a single large number to be the focal element with an interpolating reveal:
- "X% of viewers..."
- "$Y billion industry"
- "N million subscribers"
- "the planet loses 1 iceberg every Z days"

Don't use it for: multi-number comparisons (use `data-bars`), text-only hooks (use `TextReveal`), or cases where the number appears instantaneously (set `countUp: false` if you need the layout without the count-up). Use it when the **interpolation itself** is the visual interest — the "0 → 1000" moment.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { CountUpStat } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-03-countup.json";

export const Scene03: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <CountUpStat config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-03-countup.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "value", "delay": 6, "duration": 20 },
    { "id": "label", "text": "subscribers grew by last month", "delay": 28, "duration": 16 }
  ],
  "extras": {
    "targetValue": 1200000,
    "decimals": 0,
    "durationSeconds": 1.4,
    "thousandSeparator": ",",
    "suffix": "",
    "pop": true,
    "popForce": 1.0
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `value` | The big number. When `extras.countUp=true`, the displayed value counts from 0→`targetValue` over `durationSeconds`; the `text` field is ignored in favor of the count-up. | `"0"` |
| `label` | Sub-caption below the number. Empty string by default — leave hidden by setting `"hidden": true` if you want pure numbers. | `""` |
| `prefix` | Symbol before the number. Use `extras.prefix` or set this element's `text`; both work, with `extras.prefix` winning. | `""` |
| `suffix` | Symbol after the number. Same precedence as prefix. | `""` |

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `targetValue` | number | (REQUIRED) | The final value displayed. Required so the count-up has a target. |
| `decimals` | int 0-4 | `0` | Decimal places shown (e.g. `2` for `12.34`). |
| `durationSeconds` | number 0.5-30 | `1.5` | Time the count-up spends interpolating from 0→target. |
| `countUp` | boolean | `true` | Set `false` to show the value immediately (no count-up animation — the slide-in pop is still applied if `pop=true`). |
| `prefix` | string | `""` | e.g. `"$"`, `"¥"`. Rendered in accent color. |
| `suffix` | string | `""` | e.g. `"%"`, `"×"`. Rendered in accent color. |
| `pop` | boolean | `true` | Scale-from-0.6 pop intro on the number. |
| `popForce` | number 0-2 | `1` | Multiplier on `pop` intro stretch. |
| `rowGapPx` | number 0-400 | `24` | Vertical space between number and label. |
| `maxFontPx` | number 8-1000 | `240` | Cap on the resolved font size of the number (prevents overflow when `theme.sizes.scale` is high). |
| `thousandSeparator` | `","`, `"."`, `""` | `""` | Group integer digits every 3. Empty disables grouping. |

## Customization recipes

### Add a `$` prefix and 2-decimal count-up
```json
{
  "extras": { "prefix": "$", "decimals": 2, "targetValue": 1234.56 },
  "theme": { "palette": { "accent": "#FFD166" } }
}
```

### Big number without count-up (instant)
```json
{ "extras": { "countUp": false, "pop": false } }
```

### Slow count-up to feel weighty
```json
{ "extras": { "durationSeconds": 3.5, "popForce": 1.3 } }
```

### Hide the label entirely
```json
{ "elements": [ { "id": "label", "hidden": true } ] }
```

## Pitfalls

- `extras.targetValue` is required. The schema rejects configs that omit it.
- The template treats the resolved font size with a `maxFontPx` cap — bump `theme.sizes.scale` past the cap and the number stays the cap size. Raise `maxFontPx` if you want it bigger.
- `popForce: 2+` makes the intro bounce overshoot; on a dark scene this can clip the top edge. Lower `rowGapPx` or move the label up.
- On longer scenes (`durationSeconds > 4`), the easing finishes mid-scene and the rest of the scene is a static number — consider ending the scene earlier or lowering `countUp` to false.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
