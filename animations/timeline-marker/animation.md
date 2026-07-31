# Timeline marker

Horizontal runway with milestones (dots) dropping in sequence along the track, each with a label and optional caption. Markers stagger their arrival by `staggerSeconds`; even-indexed markers place their label above the track, odd-indexed place theirs below (alternating).

## When to use

Reach for it when the scene's `visual_notes` describes a sequence of 2-12 events presented in order:
- "1950 → 1975 → 2000 → today" history snapshot
- "the 6 stages of X"
- "release roadmap milestones"
- A multi-step process or chain of cause/effect events

Don't use it for: comparisons between two states (use `before-after-split`), single-time events (use `count-up-stat`), or visualizations with quantitative values (use `data-bars`).

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { TimelineMarker } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-07-timeline.json";

export const Scene07: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <TimelineMarker config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-07-timeline.json`:
```json
{
  "global": { "speed": 1.0 },
  "extras": {
    "foregroundLabel": "How we got here",
    "events": [
      { "label": "1957", "caption": "Sputnik" },
      { "label": "1969", "caption": "Apollo 11" },
      { "label": "1998", "caption": "ISS" },
      { "label": "2024", "caption": "Starship" }
    ],
    "staggerSeconds": 0.3
  }
}
```

## Recognized element ids

| id pattern | Role |
|---|---|
| `event-0`, `event-1`, ... `event-{N-1}` | One per `extras.events[i]`. Use `text` to override that event's label, `color` for the dot color, `delay` to override the auto-staggered start, `easing` for the drop-in curve. |

Unmatched ids are ignored silently.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `events` | array (REQUIRED) | — | 1-12 events. Each has `label` (REQUIRED string), optional `time` (number for relative positioning along the track), optional `icon` (string), optional `caption` (string). |
| `trackColor` | hex / null | theme `accent` | Track bar color. |
| `trackHeightPx` | number 1-32 | `4` | Track thickness. |
| `dotColor` | hex / null | theme `text` | Marker dot color. |
| `dotRadiusPx` | number 4-80 | `18` | Dot radius (Diameter = 2x). |
| `labelColor` | hex / null | theme `text` | Marker label color. |
| `markerDropDurationSeconds` | number 0.2-4 | `0.6` | Drop-in duration per marker. |
| `staggerSeconds` | number 0-6 | `0.4` | Interval between markers landing. |
| `iconGlyph` | string | `""` | Glyph rendered INSIDE every dot (e.g. `"!"`, `"★"`). Empty = no icon. |
| `foregroundLabel` | string | `""` | Optional title rendered centered above the track. |
| `foregroundLabelColor` | hex / null | theme `text` | Foreground label color. |

## Customization recipes

### Position events by their `time` field instead of evenly
```json
{ "extras": { "events": [
  { "label": "A", "time": 1 },
  { "label": "B", "time": 2 },
  { "label": "C", "time": 9 }
] } }
```
Markers are placed at their relative position — C will be much further right than B.

### Drop a star into every dot
```json
{ "extras": { "iconGlyph": "★", "dotRadiusPx": 28 } }
```

### Recolor a specific event (e.g. the present)
```json
{ "elements": [ { "id": "event-3", "color": "#10B981" } ] }
```

### Rename individual event labels
```json
{ "elements": [
  { "id": "event-0", "text": "Genesis" },
  { "id": "event-1", "text": "Growth" }
] }
```

### Hide the foreground label
```json
{ "extras": { "foregroundLabel": "" } }
```

## Pitfalls

- `extras.events` is required. Schema rejects empty/missing.
- Max 12 events — more crowding the track and labels overlap. If you genuinely need more, request a new template or split across two scenes.
- Long labels (>10 characters) can collide on a small scene duration — shorten them or shorten `staggerSeconds` so multiple markers aren't in the air at once.
- The alternating label position (above/below) is automatic — there's no override. Pair long ones with shorter ones so neither row gets crowded.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
