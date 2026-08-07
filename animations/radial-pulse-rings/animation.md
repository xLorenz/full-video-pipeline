# Radial pulse rings

A central **node** sits at canvas center; concentric **rings** emit outward from its edge in a paced pattern, each fading as it expands past the far corner. Optional **radar scanline** sweeps continuously around the canvas (slow 360° rotation with a faint trailing wedge + static radar frame). Optional **radar dots** — contacts placed at angles/radii that **reveal in sweep order** with a title/description card floating radially outside. Optional `node-glyph` and `node-label` render on/around the focal node. Built for **topic-agnostic emphasis** — "the source of X," "the spark that started Y," any beat where one focal point emanates outward. With dots, it becomes a small radar-screen explainer ("here's where three signals come from").

## When to use

Reach for this when your scene's `visual_notes` says something like:
- "pulse rings emit from a focus — like sonar / radar / transmission"
- "the origin point of the trend / event / idea"
- "the heartbeat / cadence" of something
- "signal goes out — the drop spreads"
- any "focal point of energy" reveal where motion expands outward

Don't use it for: charts of ranked data (`data-bars`), a single big number (`count-up-stat`), or multiple focal nodes (`orbit-chip-cloud`). It's specifically for **one** focal node with outward emanation.

## Holds & visual design notes

- **One focal node, by design.** The template renders a single central node — that's the whole point. Multiple focal energies = `orbit-chip-cloud` (which uses the same node as its anchor).
- **Spring only on the node pop.** The rings interpolate with the resolved easing so they ease outward (the "transmission" feel — rings decelerate as they leave, which matches `ringEasing: ease-out-cubic`). The node itself pops in with a real spring settle (damping 12) — it's the "energy source" arriving.
- **Single subtle accent.** A thin accent ring sits *inside* the node (`accent` palette, alpha 0.55). That's the ONE accent — the rings themselves use the `text` color (read as a steady transmission), not the accent. Set `ringGlow: true` only if you genuinely want a vibrant-pulse reading.
- **Radar scanline is opt-in.** `scanline: true` adds a thin sweep line + faint guide circle for a literal radar/sonar feel. Off by default — the bare rings + node already read as pulse/transmission.
- **Built-in breath.** `holdAfterLastEmitFrames` (default 18 ≈ 0.6s @ 30fps) holds the scene after the last ring leaves the frame, so the labeled focal node settles before the cut.
- **`fps` aware.** Emit + gap durations derive from `useVideoConfig().fps`, so 24/60 deliverables pace identically to the 30fps preview.
- **SVG, not CSS.** Rings are SVG `<circle>`s, so the `stroke` decays cleanly without sub-pixel rendering artifacts that CSS box-shadow halos throw.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { RadialPulseRings } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-02-pulse.json";

export const Scene02: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <RadialPulseRings config={config}
      styles={{colors: COLORS, fonts: FONTS}}
      fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-02-pulse.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "node-glyph", "text": "◉" },
    { "id": "node-label", "text": "SIGNAL LIVE" }
  ],
  "extras": {
    "ringCount": 6,
    "ringEmitSeconds": 1.6,
    "ringGapSeconds": 0.5,
    "ringStrokeWidthPx": 3,
    "nodeRadiusPx": 64,
    "nodeGlow": true,
    "nodeLabelPosition": "below",
    "nodeLabelGapPx": 28,
    "scanline": true,
    "scanlineStartSeconds": 0.3,
    "scanlineDurationSeconds": 6,
    "holdAfterLastEmitFrames": 24
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `node-glyph` | A glyph rendered inside the node (e.g. `"◉"`, `"⚡"`, `"✦"`). Use any single unicode character. | `""` (no glyph) |
| `node-label` | A caption rendered above or below the node (per `nodeLabelPosition`). Use short phrases — 1-3 words reads best. | `""` (no label) |

Unmatched ids are ignored silently — a warning is logged at preview time.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `ringCount` | integer 2-30 OR null | `null` | Number of rings emitted. `null` → **continuous** mode: emit at `ringGapSeconds` cadence for the WHOLE scene duration (rings never stop). Integer `N` → emit exactly `N` rings then stop. |
| `ringEmitSeconds` | number 0.5-8 | `3.5` | Time each ring takes to expand+fade (speed applies). |
| `ringGapSeconds` | number 0.05-4 | `1.6` | Time between consecutive ring emissions (speed applies). |
| `ringEasing` | EasingName | `"ease-out-cubic"` | Easing for ring expansion. Cubic-out = rings decelerate outward (transmission feel). |
| `ringStrokeWidthPx` | number 1-32 | `3` | Stroke thickness of each ring. |
| `ringStrokeColor` | hex / null | `theme.text` | Color of the rings. Defaults to `theme.text` (the steady white so the accent stays subtle). |
| `ringStartRadiusPx` | number 0-400 | `60` | Radius at which each ring starts. Sit it just outside the node edge so the gap reads. |
| `ringMaxRadiusPx` | number 100-2000 | canvas diagonal | Radius at which each ring finishes its fade. Defaults to canvas diagonal so rings leave the frame entirely. |
| `ringGlow` | boolean | `false` | Soft halo on each ring. Off by default; rings use `text` color (steady transmission). |
| `ringFadeToCenter` | boolean | `true` | Each ring's stroke uses a `radialGradient` centered on the focal node — inner edge of the stroke is transparent, outer edge opaque. Reads as rings "coming from" the source. |
| `scanlineFadeToTip` | boolean | `true` | The scanline sweep line uses a `linearGradient` — opaque at the center node, fading to transparent at the outer tip. |
| `nodeRadiusPx` | number 8-200 | `56` | Radius of the central node. |
| `nodeFill` | hex / null | `theme.primary` | Node's fill color. |
| `nodeStroke` | hex / null | `theme.text` | Node's outer stroke, only drawn if `nodeStrokeWidthPx > 0`. |
| `nodeStrokeWidthPx` | number 0-16 | `0` | Width of the node's outer stroke. 0 = no stroke. |
| `nodeGlow` | boolean | `true` | Soft halo around the node — the "energy source" reading. Set `false` for a flat node. |
| `nodeLabelPosition` | `"above"` / `"below"` | `"above"` | Where the `node-label` sits relative to the node. |
| `nodeLabelGapPx` | number 0-200 | `24` | Space between the node edge and the label. |
| `scanline` | boolean | `false` | Opt-in radar sweep effect — a thin line rotates continuously around the focal node (360° at one rotation per `scanlineDurationSeconds`), with a faint trailing wedge and a static radar frame (two concentric guide circles + crosshair). |
| `scanlineStartSeconds` | number 0-30 | `0` | When the scanline sweep begins (after `delayOffset`). |
| `scanlineDurationSeconds` | number 0.4-30 | `6` | Period of one full 360° rotation of the sweep line (speed applies). A slow rotation (~6s) reads as a real radar/sonar station; faster (~1-2s) reads as frantic. |
| `scanlineColor` | hex / null | `theme.accent` | Color of the scanline sweep. |
| `scanlineStrokeWidthPx` | number 1-10 | `2` | Stroke thickness of the sweep line. |
| `accentColor` | hex / null | `theme.accent` | Override the accent color used for the subtle inner node ring (and scanline, if `scanlineColor` is null, and radar dots without an explicit `color`). |
| `holdAfterLastEmitFrames` | integer ≥0 | `18` | Built-in breath — the assembled node + label holds for this long after the last ring leaves the frame. (Only meaningful when `ringCount` is an integer; in continuous mode the rings never stop.) |
| `radarDots` | array | `[]` | Radar contact dots. Each item: `{ angle, radius, title, description?, color? }`. The dot reveals when the scanline first sweeps through its `angle` (degrees, 0=right, 90=down, ±180=left, -90=up — matches the sweep convention). After reveal the dot stays lit and a small card (title + description) fades in radially outside the dot, clamped to canvas so it never blocks the dot nor the center. If `scanline: false`, all dots reveal together at `delayOffset`. |

## `radarDots[*]` fields

| key | type | required | notes |
|---|---|---|---|
| `angle` | number (degrees, -180..180) | yes | Match how the user reads the radar. 0 = right, 90 = straight down, ±180 = left, -90 = up. Sweep picks up dots in this rotation order. |
| `radius` | number (px, 8..2000) | yes | Distance from canvas center. Clamped to `[nodeRadiusPx + 12, ringMaxRadiusPx * 0.92]` so the dot sits inside the radar shell. |
| `title` | string (1..80 chars) | yes | Bold heading line of the dot's card. |
| `description` | string (≤280 chars) | no | Muted body line under the title. Empty string → only the title shows. |
| `color` | hex / null | no | Per-dot color. `null` → `theme.accent`. |

## Customization recipes

### Radar / sonar feel — sweeping line
```json
{
  "extras": {
    "scanline": true,
    "scanlineStartSeconds": 0.3,
    "scanlineDurationSeconds": 6,
    "nodeLabelPosition": "below"
  },
  "elements": [
    { "id": "node-glyph", "text": "◉" },
    { "id": "node-label", "text": "SCANNING" }
  ]
}
```

### Heartbeat / pulse — fewer, slower, glow rings
```json
{
  "extras": {
    "ringCount": 3,
    "ringEmitSeconds": 2.2,
    "ringGapSeconds": 0.8,
    "ringGlow": true,
    "ringStrokeColor": "#FF6B6B",
    "nodeRadiusPx": 80,
    "nodeFill": "#3A0B0B"
  },
  "elements": [
    { "id": "node-glyph", "text": "♥" }
  ]
}
```

### Energy spark / drop spreads — quick zap
```json
{
  "extras": {
    "ringCount": 5,
    "ringEmitSeconds": 0.9,
    "ringGapSeconds": 0.18,
    "ringEasing": "ease-out-expo",
    "ringStrokeWidthPx": 4,
    "nodeRadiusPx": 36
  },
  "elements": [
    { "id": "node-glyph", "text": "⚡" }
  ]
}
```

### Calm transmission — single ring at a time
```json
{
  "extras": {
    "ringCount": 4,
    "ringEmitSeconds": 2.0,
    "ringGapSeconds": 1.4,
    "ringEasing": "ease-out-cubic",
    "ringStrokeWidthPx": 2
  }
}
```

### Recolor the rings for a different palette
```json
{
  "theme": { "palette": { "text": "#A0E7E5" } },
  "extras": { "ringStrokeColor": "#A0E7E5" }
}
```

### Radar with three contacts revealed by the sweep
```json
{
  "extras": {
    "scanline": true,
    "scanlineDurationSeconds": 6,
    "ringCount": null,
    "ringEmitSeconds": 3.5,
    "ringGapSeconds": 1.6,
    "radarDots": [
      { "angle": 24,  "radius": 360, "title": "Contact Alpha", "description": "Class A transponder." },
      { "angle": 150, "radius": 420, "title": "Contact Beta",  "description": "Intermittent pulse." },
      { "angle": 277, "radius": 300, "title": "Contact Gamma", "description": "Anomalous cluster." }
    ]
  }
}
```
The dots reveal in sweep order (Alpha around frame 30 @ 30fps with a 0.4s start + 6s rotation, then Beta around frame 95, then Gamma around frame 160). Add more dots at whatever angles/distance you like — they reveal in angle order, not list order.

### Hide the corner "PULSE" stamp
You can't — it's part of the template's quiet reading-cue. Mask it by putting a `<Background>` overlay shape over the bottom-left corner in your scene if you want it gone (rare; it's 16px and 45% opacity by design).

## Pitfalls

- **`ringEmitSeconds` × `ringCount` × `ringGapSeconds` should fit your scene.** Total animation length ≈ `ringGap * (ringCount - 1) + ringEmit`. If your scene is shorter than this, rings cut mid-air — usually fine, but check.
- **Don't set `ringGlow: true` AND `ringCount > 8`.** That's a lot of SVG drop-shadows per frame; render slows ~30%. Glow is one-ring-with-glow, not "every ring lit." Reserve glow for accent pieces.
- **`scanline: true` doubles the SVG work.** Use it for one scene, not the whole opener. The sweep itself is light; the faint guide circle is also light. The cost is the alpha blending on top of the rings.
- **`nodeGlow: false` + dark palette reads as flat.** Unless your brief is brutal-minimal, leave it `true` — the halo is what tells the viewer "this node is the energy source."
- **`ringMaxRadiusPx` capped at 2000.** Beyond that the rings leave any practical canvas; the cap exists so authors don't accidentally consume unbounded SVG rendering cost.
- **Continuous mode (`ringCount: null`) emits rings for the whole scene.** At a 1.6s gap on a 12s scene that's ~8 rings on screen; the SVG cost scales linearly with concurrent visible rings. Setting `ringGapSeconds` above ~2s keeps the ring count always ≤ 4 visible — light.
- **`radarDots` only auto-reveal when `scanline: true`.** Without the sweep, every dot reveals together at `delayOffset` — use this mode if you want a fixed "detections at rest" shot.
- **Card clamping**: if a dot is near the canvas edge, the card center is clamped to inside the 40px margin. The card may end up visually closer to the dot's cluster rather than radially outside it — that's intentional, top priority is "don't overflow the frame."
- **Glyph + label both empty → the template renders just the rings + node circle**, which reads as a quiet radar bubble. Fine if that's the brief.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
