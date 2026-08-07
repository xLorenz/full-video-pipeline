# Timeline marker

Horizontal runway with milestones (dots) dropping in sequence along the track, each with a label and optional caption. Markers stagger their arrival by `staggerSeconds`; even-indexed markers place their label above the track, odd-indexed place theirs below (alternating).

## When to use

Reach for it when the scene's `visual_notes` describes a sequence of 2-12 events presented in order:
- "1950 → 1975 → 2000 → today" history snapshot
- "the 6 stages of X"
- "release roadmap milestones"
- A multi-step process or chain of cause/effect events

Don't use it for: comparisons between two states (use `before-after-split`), single-time events (use `count-up-stat`), or visualizations with quantitative values (use `data-bars`).

## Holds & visual design notes

- **Land-and-lock motion is the signature.** Earlier releases used a hard `interpolate(-200, 0)` linear drop for the marker translate and a flat dot. Now each marker:
  1. falls from above via a damped spring (`damping: 11, mass: 1, stiffness: 130`);
  2. pops on contact via a faster micro-spring (`stiffness: 240`, `mass: 0.6`) that squashes the dot from 1.4 → 1.0 — the marker presses into the rail before locking;
  3. emits a translucent **ring** that expands outward from the contact point and fades (`dotRingOnLand`, default on);
  4. sends a **luminance ripple along the rail** — an ellipse-background band centered at the dot's x, sliding outward horizontally and fading (`trackRippleOnLand`, default on);
  5. fades its **label up only after the dot has settled** (`dropSpring > 0.55`), so the eye reads the *mark*, then the *meaning*;
  6. hangs a small **eyebrow tick** between the dot and the label so the label reads as hung *off of* the dot, not floating free.
- **Per-event color and per-event icon.** `element.color` overrides per-dot (falling back to `dotColor`/`theme.text`); `ev.icon` overrides the global `iconGlyph` fallback. Note: **color emoji glyphs ignore the per-dot `color`** — they always render in their own palette. Use a monochrome glyph like `✦`, `◉`, `★`, or a numeric id if you want the icon to honor the rail color and read as brand-consistent.
- **Ambient focus pulse.** After a marker locks, the focal event (`focusPulse`, default `"last"` → the "now" of the chronology) keeps a slow 3.2-s breathing halo so the timeline reads as having a focal point. Set `focusPulse: "none"` to disable, or pass an integer index to focus a different event.
- **Material rail.** The track is no longer a flat CSS bar: a faint inner-highlight stripe (`trackInnerHighlight`, default on) sits at the top edge so the rail reads as a struck line on paper. A **leading-edge luminance band** (`trackLeadingGlow`, default on) rides the head of the left→right sweep, fading out as the rail completes — so the sweep feels like the rail being drawn rather than a clip-rect reveal. Opt into a soft halo across the whole track via `trackGlow: true` when the brief calls for a light strip; off by default so batch markers ride the drop motion, not the glow.
- **Built-in breath.** `holdAfterLastMarkerFrames` (default 18) holds the assembled timeline so the viewer can read it before the scene cuts.
- **Empty-events guard.** `events: []` renders a quiet "No events" placeholder instead of a silent blank track.
- **Foreground label rides the sweep.** The optional `foregroundLabel` now fades up *with* the track sweep (rather than a cold 0–16-frame fade from earlier releases) with a small upward drift eased to the sweep curve, so the title settles exactly as the rail locks into place.
- **No generic text-shadows.** The `0 4px 18px` shadow on the foreground label and the `0 2px 10px` shadow on the marker label from earlier releases are gone — they read as templated. Foreground label gets `-0.02em` letter-spacing; marker labels get `-0.01em`; a single eyebrow-tick in the dot's color hangs the label off the contact point.
- **`fps` aware.** All timing derives from `useVideoConfig().fps`; trackSweep, drop dur, stagger, ring, ripple, and the focus-pulse cycle all scale to the project fps.

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
      { "label": "2024", "caption": "Starship", "icon": "✦" }
    ],
    "staggerSeconds": 0.3,
    "elements": [ { "id": "event-3", "color": "#00BFA6" } ]
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
| `trackColor` | hex / null | theme `primary` | Track bar color. |
| `trackHeightPx` | number 1-32 | `4` | Track thickness. |
| `trackInnerHighlight` | boolean | `true` | A 1-2px lighter top edge so the track reads as a struck rail rather than a flat CSS bar. |
| `trackLeadingGlow` | boolean | `true` | Soft luminance ride at the leading edge of the sweep (fades out as the rail completes). Lower-cost than `trackGlow`. |
| `trackGlow` | boolean | `false` | Opt-in soft halo on the whole track. Off by default — batch markers ride the motion, not the glow. |
| `dotColor` | hex / null | theme `text` | Marker dot color — used as the fallback for any event without a per-element `color` override. |
| `dotRadiusPx` | number 4-80 | `18` | Dot radius (Diameter = 2x). |
| `dotRingOnLand` | boolean | `true` | Translucent ring expands outward from the contact point at land and fades. |
| `trackRippleOnLand` | boolean | `true` | Luminance band travels outward along the rail from each landing dot. |
| `focusPulse` | `"last"` / `"none"` / number | `"last"` | Which event keeps a slow ambient breathing halo after locking (the focal point of the chronology). Pass an integer index, `"last"` for the most recent event, or `"none"` to disable. |
| `labelColor` | hex / null | theme `text` | Marker label color. |
| `markerDropDurationSeconds` | number 0.2-4 | `0.6` | Drop-in duration per marker (spring settle length). |
| `staggerSeconds` | number 0-6 | `0.4` | Interval between markers landing. |
| `iconGlyph` | string | `""` | Backup glyph rendered INSIDE any dot whose event doesn't set its own `icon` (per-event `ev.icon` wins). Color-emoji chars ignore the per-dot `color` — prefer monochrome glyphs (`✦`, `◉`, `★`) if you want the icon to read in the rail color. |
| `foregroundLabel` | string | `""` | Optional title rendered centered above the track; rides the sweep curve when fading in. |
| `foregroundLabelColor` | hex / null | theme `text` | Foreground label color. |
| `trackSweepSeconds` | number 0.2-3 | `0.8` | Length of the track's left→right grow-in. Set to `0.2` if you want the track to be present when markers begin dropping. |
| `holdAfterLastMarkerFrames` | integer 0-600 | `18` | Built-in breath — the assembled timeline holds for this many frames after the last marker lands. |

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

### Drop a different glyph per event
```json
{ "extras": { "dotRadiusPx": 26, "events": [
  { "label": "Idea", "icon": "✦" },
  { "label": "Launch", "icon": "★" },
  { "label": "Scale", "icon": "◉" }
] } }
```
Use a monochrome glyph (✦, ★, ◉, •, ►) so the icon renders in the rail color and reads as brand-consistent. Color-emoji glyphs (`🚀`, `🧠`) ignore the per-dot `color` and render in their own palette — fine if that's your brand intent, distracting otherwise. Set `extras.iconGlyph` to a backup glyph applied to any event that doesn't set its own.

### Recolor a specific event AND make it the focal point
```json
{
  "elements": [ { "id": "event-3", "color": "#00BFA6" } ],
  "extras": { "focusPulse": "last" }
}
```
Per-event color overrides `extras.dotColor` / `theme.text` for that dot only — and `"last"` (the default) keeps a slow breathing halo on the most-recent event, useful to call out "now" on a history timeline. Set `focusPulse: 0` to focus the *first* event instead, or `"none"` to disable.

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
