# Before-after split

Two-panel divider wipe to reveal a contrast. A vertical or horizontal dividing bar sweeps from one edge to the other, exposing the second panel while labels ride along in each half — perfect for showing a transformation over time or juxtaposing two states.

## When to use

Reach for it when the scene's `visual_notes` is a direct visual contrast between two states:
- "before/after the new update"
- "morning sky vs night sky"
- "1 hour of work vs 4 hours"
- "Earth's ozone — 1950 vs today"

Don't use it for: judgment-style contests with a winner/loser verdict (use `right-wrong-card`), or a continuous timeline of more than two points (use `timeline-marker`).

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { BeforeAfterSplit } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-06-split.json";

export const Scene06: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <BeforeAfterSplit config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-06-split.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "before-label", "text": "1950" },
    { "id": "after-label",  "text": "Today" }
  ],
  "extras": {
    "direction": "vertical",
    "sweepDurationSeconds": 1.5,
    "beforeColor": "#9E9E9E",
    "afterColor": "#10B981",
    "dividerColor": "#FFB300"
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `before-label` | Headline rendered in the FIRST panel (left or top). | `"Before"` |
| `after-label`  | Headline rendered in the SECOND panel (right or bottom). | `"After"` |

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `direction` | enum: `vertical` `horizontal` | `"vertical"` | Whether divider sweeps horizontally (`vertical` divider) or vertically (`horizontal` divider). |
| `sweepDurationSeconds` | number 0.3-8 | `1.2` | Time the divider takes to cross the frame. |
| `dividerStyle` | enum: `line` `gradient` | `"line"` | `"line"` is a solid bar; `"gradient"` adds a multi-stop shadow glow. |
| `dividerColor` | hex string | theme `accent` | The divider's color. |
| `beforeColor` | hex string | theme `danger` | First-panel background. |
| `afterColor` | hex string | theme `success` | Second-panel background. |
| `dividerWidthPx` | number 1-32 | `4` | Divider thickness in pixels. |
| `panelPaddingPx` | number 0-400 | `96` | Padding inside each panel around its label. |
| `labelOpacityDuringSweep` | number 0-1 | `0.6` | Opacity multiplied onto the label during the wipe portion (separate from the 12-frame fade-in). After the sweep, label snaps back to full opacity. |

## Customization recipes

### Horizontal wipe (top = before, bottom = after)
```json
{ "extras": { "direction": "horizontal" } }
```

### Slow, deliberate reveal
```json
{ "extras": { "sweepDurationSeconds": 3.0 } }
```

### Custom verdict colors (e.g. warning vs safe)
```json
{ "extras": { "beforeColor": "#EF4444", "afterColor": "#10B981" } }
```

### Hide labels for a pure visual contrast
```json
{ "elements": [ { "id": "before-label", "hidden": true }, { "id": "after-label", "hidden": true } ] }
```

### Glow divider (for premium feel)
```json
{ "extras": { "dividerStyle": "gradient", "dividerWidthPx": 6, "dividerColor": "#FFD166" } }
```

## Pitfalls

- `direction: "horizontal"` flips the divider axis but NOT the color mapping — `beforeColor` is always top, `afterColor` is always bottom. The names are inherent to direction.
- A very fast sweep (`sweepDurationSeconds < 0.5`) makes the labels jarring; pair with `labelOpacityDuringSweep: 1` to avoid flicker.
- `dividerStyle: "gradient"` with a wide `dividerWidthPx` (>10) can wash the labels on narrow resolutions — use sparingly.
- On the **non-sweep** axis, padding doesn't push the label off-screen because labels are centered; if your label is long it may clip on short resolutions. Shorten the text.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
