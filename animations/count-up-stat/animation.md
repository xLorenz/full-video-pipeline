# Count-up stat

Big numerical reveal: an integer or decimal number counts from 0 up to its target over `durationSeconds`, with an anticipation breath, a tight spring-entrance pop, a land punch on arrival, a hairline accent underline that draws in with the land, and an optional sub-label that lifts in *after* the number lands. Optional prefix (e.g. `$`) / suffix (e.g. `×`, `%`).

## When to use

Reach for it when your scene's `visual_notes` requires a single large number to be the focal element with an interpolating reveal:
- "X% of viewers..."
- "$Y billion industry"
- "N million subscribers"
- "the planet loses 1 iceberg every Z days"

Don't use it for: multi-number comparisons (use `data-bars`), text-only hooks (use `TextReveal`), or cases where the number appears instantaneously (set `countUp: false` if you need the layout without the count-up). Use it when the **interpolation itself** is the visual interest — the "0 → 1000" moment.

## Choreography (built-in rhythm)

The template composes six beats; the number is the hero, everything around it quiet and disciplined:

1. **Anticipation** (`anticipationFrames`, default 6) — the number sits at `anticipationScale` (0.92), opacity 0. A held breath before the entrance that gives the eye a beat to find the centre and stores energy.
2. **Entrance pop** — spring scale-in settle from `anticipationScale` → 1.0 (damping 18, mass 1, stiffness 140). Tight, no wobble. Real spring beats a synthetic ease-out-back overshoot; the number arrives as a solid object.
3. **Count-up** — ease-out-expo 0 → target across `durationSeconds`. Eases saturate early (expo hits 99% by ~53% of the span), so all land events are keyed to `landFrame` (≈62% through), where the eye reads completion — never to the eased mathematical end. The remaining ~38% crawls silently from 95% → 100%, sub-pixel, imperceptible.
4. **Land punch** (`landPunch`, default true) — once the number visibly lands, a micro scale tap 1.0 → `landPunchScale` (1.02) → 1.0 across `landPunchDurationFrames` (7). Symmetric (ease-in-out cubic). ~2 px on a 200 px number: enough that the eye catches weight without it reading as a bounce.
5. **Accent hairline** (`showAccentLine`, default true) — a 2px accent underline draws under the number as the land punch fires, centred, width = `accentLineWidthPct` (62%) of the value bbox. Grows via `scaleX` 0 → 1 with ease-out-quint so the draw-in slows as it reaches full width. The **one signature element** — restrained, draws once, holds. Sentences the number.
6. **Label reveal** (`labelAfterLand`, default true) — the sub-caption fades + lifts up `16px → 0` over its `duration`, fired from `landFrame + 2` rather than its authored delay. The label reveals *what the number means* — it follows the number's arrival, never competes with the count-up. Callers who want the label up early can pass `labelAfterLand: false` and use the normal `labelTiming.delay`.

## Holds & visual design notes

- **Spring pop, not wobble.** Damping 18 — a damped settle with weight, not a hand-tuned ease-out-back overshoot. The number lands instead of bouncing.
- **Built-in breath.** After the count-up reaches its target, the value sits at the target for `holdAfterCountUpFrames` (default 24 ≈ 0.8s @ 30fps). Strengthen this if the scene is the climax — weaken it only when the number is a transition between beats.
- **No decorative halo.** The number is the focal type — let it breathe. If you want an accent, the `prefix`/`suffix` already provide one in accent color, and the hairline is the one signature decoration.
- **Mono for grouped digits.** Set `valueFontRole: "mono"` when `thousandSeparator` is used; digits align in a column and the stat reads like a finance/data-viz callout.
- **No horizontal jitter on comma boundaries.** The digit span reserves a `min-width` sized to the *final* formatted string, so when the count-up crosses a group boundary (e.g. `999,999` → `1,250,000`), the centre of mass never shifts. No number jitter as commas appear mid-count.
- **`tabular-nums` always.** Even in the heading role (not just mono), the digits use `font-variant-numeric: tabular-nums` so per-character advance doesn't wobble during the count.
- **Type tightening.** Number uses `letter-spacing: -0.02em` (foundational type trick for big numerals); the label is left at `0.01em`.
- **`fps` aware.** All durations derive from `useVideoConfig().fps`, so 24/60 deliverables pace identically to the 30fps preview. The `popForce` extra from earlier releases is removed — the spring's intrinsic damping is the only knob needed.

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
    "valueFontRole": "mono",
    "holdAfterCountUpFrames": 30
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `value` | The big number. When `extras.countUp=true`, the displayed value counts from 0→`targetValue` over `durationSeconds`; the `text` field is ignored in favor of the count-up. | `"0"` |
| `label` | Sub-caption below the number. Empty string by default — set `"hidden": true` to suppress it. | `""` |
| `prefix` | Symbol before the number. Use `extras.prefix` or set this element's `text`; both work, with `extras.prefix` winning. | `""` |
| `suffix` | Symbol after the number. Same precedence as prefix. | `""` |

## `extras.*`

### Count-up
| Key | Type | Default | Description |
|---|---|---|---|
| `targetValue` | number | (REQUIRED) | The final value displayed. Required so the count-up has a target. |
| `decimals` | int 0-4 | `0` | Decimal places shown (e.g. `2` for `12.34`). |
| `durationSeconds` | number 0.5-30 | `1.5` | Time the count-up spends interpolating from 0→target. |
| `countUp` | boolean | `true` | Set `false` to show the value immediately (no count-up — the spring pop is still applied if `pop=true`). |
| `thousandSeparator` | `","`, `"."`, `""` | `""` | Group integer digits every 3. Empty disables grouping. |
| `valueFontRole` | `"heading"`, `"mono"` | `"heading"` | When a thousand separator is used, switch to `"mono"` to keep digits aligned in a column. Falls back to `theme.fonts.mono` if your styles.ts defines one. |
| `holdAfterCountUpFrames` | integer 0-600 | `24` | Built-in breath after the number lands. The template renders the static target value for this long before the scene should cut — let the brain register it. |

### Entrance
| Key | Type | Default | Description |
|---|---|---|---|
| `pop` | boolean | `true` | Spring scale-in settle on the number (damping 18, mass 1). |
| `anticipationFrames` | integer 0-120 | `6` | Held breath before the entrance pop — number sits at `anticipationScale`, opacity 0. |
| `anticipationScale` | number 0.1-1 | `0.92` | Scale the number rests at during anticipation. |

### Land
| Key | Type | Default | Description |
|---|---|---|---|
| `landPunch` | boolean | `true` | Micro scale tap once the number visibly lands (1 → `landPunchScale` → 1). |
| `landPunchScale` | number 1-1.5 | `1.02` | Peak of the land tap. ~2% reads as weight; >5% reads as bounce. |
| `landPunchDurationFrames` | integer 1-60 | `7` | Length of the land tap out-and-back. |

### Accent hairline (the signature)
| Key | Type | Default | Description |
|---|---|---|---|
| `showAccentLine` | boolean | `true` | Draw the hairline accent under the number on land. The one piece of decoration outside the number itself. |
| `accentLineDelayFrames` | integer 0-600 | `0` | Extra delay after the land frame before the hairline starts drawing. |
| `accentLineDurationFrames` | integer 1-600 | `18` | Length of the draw-in. Ease-out-quint so the draw slows as it lands. |
| `accentLineWidthPct` | number 0-100 | `62` | Width of the hairline as a % of the resolved font-size (proxy for the number bbox). |
| `accentLineThicknessPx` | number 1-40 | `2` | Hairline thickness in pixels. |

### Label
| Key | Type | Default | Description |
|---|---|---|---|
| `labelAfterLand` | boolean | `true` | Hold the label until `landFrame + 2` so it follows the number's arrival instead of competing with the count-up. `false` reverts to the authored `label.delay`. |

### Layout
| Key | Type | Default | Description |
|---|---|---|---|
| `prefix` | string | `""` | e.g. `"$"`, `"¥"`. Rendered in accent color. |
| `suffix` | string | `""` | e.g. `"%"`, `"×"`. Rendered in accent color. |
| `rowGapPx` | number 0-400 | `24` | Vertical space between number and label (split between the accent gap + label gap). |
| `maxFontPx` | number 8-1000 | `240` | Cap on the resolved font size of the number (prevents overflow when `theme.sizes.scale` is high). |

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
{ "extras": { "countUp": false, "pop": false, "showAccentLine": false } }
```

### Slow count-up to feel weighty
```json
{ "extras": { "durationSeconds": 3.5, "holdAfterCountUpFrames": 45 } }
```

### Mono digits for a thousand-separated value
```json
{ "extras": { "thousandSeparator": ",", "valueFontRole": "mono" } }
```

### Hide the label entirely
```json
{ "elements": [ { "id": "label", "hidden": true } ] }
```

### Drop the accent line + land punch for a stripped-back stat (no signature)
```json
{ "extras": { "showAccentLine": false, "landPunch": false } }
```

### Earlier label (override `labelAfterLand` — label rises with the authored `label.delay`)
```json
{ "extras": { "labelAfterLand": false } }
```

## Pitfalls

- `extras.targetValue` is required. The schema rejects configs that omit it.
- The template treats the resolved font size with a `maxFontPx` cap — bump `theme.sizes.scale` past the cap and the number stays the cap size. Raise `maxFontPx` if you want it bigger.
- The `pop` spring is damped at 18. If you find the settle too soft or too hard for your scene pacing, set `pop: false` and place your own intro animation around the template — the template won't override it.
- On longer scenes (`durationSeconds > 4`), the easing finishes mid-scene and the rest of the scene is a static number — consider ending the scene earlier (use `extras.holdAfterCountUpFrames` to deliberate it) or lowering `countUp` to false.
- `valueFontRole: "mono"` requires `mono` in `theme.fonts` (or your `FONTS.mono` in styles.ts). If absent, it falls back to `"JetBrains Mono"` — ensure that font is loaded, or override `theme.fonts.mono` in your config.
- The hairline uses `theme.palette.secondary` as its accent color — override `theme.palette.secondary` to recolor it (or set `showAccentLine: false` to drop it entirely).

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
