# Orbit chip cloud

N labelled pill chips **tangentially catch up** with their slots on an elliptical orbit around a central **focal node** — and the orbit itself **spins continuously from frame 0**, never waiting for the chips to assemble. Each chip arrives along the orbit's tangent (its direction of motion), offset behind its slot, then damps into its rendezvous as a damped spring settles — at which point it just rides the orbit's steady turn. The orbit path is rendered behind the chips as three stacked SVG ellipses (a faint always-visible baseline ring, a draw-on sweep that grows around the perimeter with the chip reveal, and a marching-dash pattern that fades in once the chips merge and quietly slides along the path). The focal node pops last via a damped spring — the signature accent moment.

## When to use

Reach for this when your scene's `visual_notes` says something like:
- "the four pillars orbit around one core value"
- "these N elements all connect to the source"
- "the satellites of one main idea"
- "the cloud of related concepts"
- any "1 + N relationships" reveal where the **focal node** is the topic and the chips are sub-themes

Don't use it for: ranked data (`data-bars`), multiple focal energies (`radial-pulse-rings` is the *single* source emanating outward; this template is *multiple* satellites steady on an orbit). Use it for a calm relationship map.

## Holds & visual design notes

- **One focal, by design.** The focal node sits at canvas center (offset down only when the heading block reserves the top strip); the chips orbit. Set `nodeFill` to the accent color by default — the focal carries the brand's one accent, and the chips read in `theme.primary` / `theme.surface` (steady navy, not the accent).
- **The canvas is filled.** The component's `AbsoluteFill` paints `theme.background` (default `#0A1220`) on its own — earlier releases left black void around the orbit. The chip pill surface is `theme.surface` (default `#14202E`), distinct enough from the scene bg that pills read against it without borders.
- **The orbit path is the signature — three stacked layers.** The orbit ellipse is rendered as three SVG ellipses, all with `pathLength={1}` (so dash math normalizes to the ellipse perimeter independent of QSize):
  1. **Baseline ring** — a near-invisible SOLID muted stroke that gives the orbit geometry from the first chip arrival; alpha rises with `pathRevealT` so the ring is never ahead of the chips.
  2. **Draw-on sweep** — a single growing SOLID dash (`dasharray="${t} ${1-t}"` with `strokeDashoffset` rotating the start to chip-0's angle) grows around the perimeter 0→100% as the chips fly in. The literal reveal moment: the orbit "draws itself."
  3. **Marching dashes** — the visible `onN/offN` dashed pattern fades in as reveal completes (alpha 0→0.7 at `pathRevealT ≥ 0.85`), then march-tracks at `orbitDashDriftPxPerSec` (default 6 px/s — reads as a slow IC band of motion). When pre-settle, this layer is invisible; once settled, it quietly slides along the path so the orbit never reads as frozen.
  The orbit's *path* signals "orbit" — no need for a corner-stamp badge.
- **Connectors draw ON, post-chip.** Earlier releases drew every connector line always-on at 50% alpha — five hairline crosses through the focal that read as visual noise. Connectors now DRAW ON after their chip lands (animated `strokeDasharray`): the path is *constructed* in front of you. `connectorsDrawOn: false` restores the always-on look if you genuinely want it.
- **Springs on chips + node.** Each chip reveals with a damped spring (damping 14, stiffness 130, duration = `revealSeconds` * fps). During the spring's 0→1 phase, the chip slides tangentially from its `chipArrivalOffsetPx` (default 110px) catch-up offset into its slot; at `s = 1` it has merged and rides the orbit. The focal node pops with a damped spring (damping 16, stiffness 140) AFTER the last chip lands — the accent moment.
- **Per-chip accent labels.** Setting `custom.accent: true` on a chip element renders that chip's label in the accent color — the "this one is special" pillar. (Accent chips keep their case; only `custom.mono: true` uppercases + adds `theme.fonts.mono` + tabular-nums, which reads as a "data chip.") Combine `mono` + `accent` for an emphasized numeric pillar.
- **The orbit spins continuously from frame 0.** There is no separate "post-assembly sweep" phase — the orbit is *already turning* when the first chip arrives, and each chip merges into a slot that is itself moving. Set `orbitDegreesPerSec` to dial the spin rate: `9` deg/s = slow contemplative drift (full lap every 40s, great for calm relationship maps); `24` deg/s = moderate (lap in 15s); `0` = static orbit (chips land and stay put — for logo-style reveals). Negative values spin the other way.
- **Chip arrival is tangential, not radial.** Each chip enters offset along the orbit's tangent and catches up with its rendezvous — `chipArrivalTangent: "behind"` (default) puts the chip trailing in the orbit's direction of motion (chip catches up; reads as arrival); `"ahead"` puts it leading (the orbit catches up to the chip). The chip's arrival motion is therefore *in the orbit's flow direction* — the chip physically "joins the moving train", not just pops onto a frozen ring and waits for everyone to assemble.
- **Built-in breath.** `holdAfterLandFrames` (default 18 ≈ 0.6s @ 30fps) — the assembled cloud holds for this long after the node settles (note: the orbit keeps spinning during this hold, since spin is independent of chip-arrival timing).
- **`fps` aware.** `revealSeconds` and `chipsStaggerSeconds` derive from `useVideoConfig().fps`; `orbitDegreesPerSec` is in degrees-per-second so the spin rate is the same regardless of fps.
- **SVG orbit, HTML chips.** The orbital guide ellipse + connectors + node are SVG so the orbit radius is precise at any canvas size. Chips are HTML overlays so the project fonts render correctly without SVG `<text>` font-loading headaches.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { OrbitChipCloud } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-04-orbit.json";

export const Scene04: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <OrbitChipCloud config={config}
      styles={{colors: COLORS, fonts: FONTS}}
      fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-04-orbit.json`:
```json
{
  "global": { "speed": 1.0 },
  "extras": {
    "chips": ["ORIGIN", "FORCE", "OUTPUT", "RULE", "BODY"],
    "revealSeconds": 0.95,
    "orbitDegreesPerSec": 9,
    "orbitRadiusXPx": 720,
    "orbitRadiusYPx": 360,
    "nodeRadiusPx": 76,
    "nodeLabel": "CORE",
    "holdAfterLandFrames": 30
  }
}
```

## Recognized element ids

| id pattern | Role |
|---|---|
| `chip-0`, `chip-1`, ... up to `chip-(N-1)` | One per chip, by index. `text` overrides the chip label; `color` overrides the chip's pill *background* (NOT text — set `chipTextColor` to override the text color globally, or per-chip via `custom.accent` to render the label in the accent color); `custom.connector: true/false` opts the chip in/out of the radial connector line; `custom.mono: true` opts the chip's label into `theme.fonts.mono` + `tabular-nums` (numeric labels); `custom.weight: number` overrides the per-chip font weight. |

Unmatched ids are ignored silently.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `chips` | string[] | (REQUIRED) | Chip labels. Schema rejects configs that omit this. 1 ≤ N ≤ 12. |
| `eyebrow` | string \| null | `null` | Small mono-uppercase eyebrow line above the title (e.g. `"ARCHITECTURE"`). |
| `title` | string \| null | `null` | Headline above the cloud (e.g. `"What makes an agent"`). |
| `subtitle` | string \| null | `null` | Body-text supporting line below the title. |
| `chipsStaggerSeconds` | number 0-3 | `0.10` | Offset between consecutive chip reveals, in seconds (speed applies). |
| `revealSeconds` | number 0.4-5 | `0.95` | Time over which chips fly in and the orbit path draws ON (speed applies). |
| `orbitStartAngleDeg` | number -180 to 180 | `-90` (top) | Where chip-0 starts on the orbit. `-90` = top of canvas, `0` = right, `90` = bottom. |
| `orbitDegreesPerSec` | number -360 to 360 | `8` | CONTINUOUS angular velocity of the orbit. Spins from frame 0 onward at this rate. 9 deg/s = slow CCW drift (lap every 40s); 24 deg/s = moderate (lap in 15s); 0 = static orbit (chips land and stay). Negative = CW. |
| `orbitRadiusXPx` | number 80-2000 | canvas.width × 0.38 | Orbit's horizontal radius. |
| `orbitRadiusYPx` | number 80-2000 | canvas.height × 0.36 | Orbit's vertical radius. Equal X/Y = a circle; unequal = an ellipse (default reads as a wide oval). |
| `orbitStroke` | hex / null | theme `muted` | Color of the orbit path ellipse. Once-off if `orbitStrokeWidthPx` is 0. |
| `orbitStrokeWidthPx` | number 0-4 | `1` | Stroke width of the orbit path. 0 = no orbit path drawn. |
| `orbitDashOnPx` | number 0-40 | `4` | Length of each dash in the orbit path. 0 with `orbitDashOffPx > 0` = dotted. Both 0 = solid. |
| `orbitDashOffPx` | number 0-40 | `8` | Gap between dashes. |
| `orbitDashDriftPxPerSec` | number -60 to 60 | `6` | Post-reveal dash marching speed (pixels/second). 0 = locked dash. `+6` = top-down drift; `-6` = inverted. |
| `chipHeightPx` | number 28-200 | `56` | Default chip pill height. |
| `chipPaddingXPx` | number 12-80 | `32` | Horizontal padding inside each chip; long labels widen the pill (chips size BY CONTENT, not fixed width). |
| `chipPaddingYPx` | number 4-40 | `14` | Vertical padding inside each chip. |
| `chipFill` | hex / null | theme `primary` OR `surface` | Default chip pill background. Per-chip via element `color`. |
| `chipTextColor` | hex / null | theme `text` | Chip label color. Override per-chip via `custom.accent: true` (renders the label in the accent color). |
| `chipStroke` | hex / null | theme `gridLine` | Chip border, only used if `chipStrokeWidthPx > 0`. |
| `chipStrokeWidthPx` | number 0-8 | `0` | Stroke border thickness; 0 = no border (chips read by fill contrast). |
| `chipRadiusPx` | number 0-100 | `chipHeightPx / 2` | Border radius. Default = perfect pill. Increase for a softer pill. |
| `chipFontWeight` | integer 100-900 | `600` | Default font weight for chip labels (semibold-ish). |
| `chipFontSizeScale` | number 0.3-1.5 | `0.42` | Chip label font size as a fraction of `chipHeightPx` (e.g. 0.42 of 56 = ~24px). |
| `chipArrivalTangent` | `"behind"` / `"ahead"` | `"behind"` | Chip arrival direction along the orbit's tangent. `"behind"` = chip starts offset TRAILING the orbit's motion and catches up (reads as arrival into the flow). `"ahead"` = chip starts LEADING the orbit (reads as the orbit catching up). |
| `chipArrivalOffsetPx` | number 0-400 | `110` | How far along the tangent the chip starts its catch-up. Larger = more dramatic catch-up sweep. 0 = chips pop in exactly at their slot (no tangential slide; orbit-only motion). |
| `chipTextShadow` | boolean | `false` | Subtle accent drop-shadow on chip labels when landed. Adds a faint glow without making the pills shouty. |
| `nodeRadiusPx` | number 10-200 | `70` | Focal node circle radius. |
| `nodeFill` | hex / null | theme `accent` | Focal node fill. Defaults to the accent — one signature accent. |
| `nodeGlow` | boolean | `true` | Soft halo + drop-shadow around the focal node. Set `false` for a flat node. |
| `nodeLabel` | string | `""` | Caption rendered UNDER the node (HTML overlay, smaller than chip labels by default). |
| `nodeLabelColor` | hex / null | theme `text` | Node label color. |
| `nodeLabelFontPx` | number 12-200 | `24` | Node label font size. |
| `connectors` | boolean | `true` | Draw faint radial connector lines from each chip to the center. Per-chip via `custom.connector`. |
| `connectorColor` | hex / null | theme `muted` | Color of the connector lines (drawn at 65% alpha). |
| `connectorWidthPx` | number 1-4 | `1` | Stroke width of the connector lines. |
| `connectorsDrawOn` | boolean | `true` | Connectors draw ON *after* their chip lands (animated stroke-dasharray), instead of always-on. Truer to the path-encodes-relationship idea. Set `false` to restore the always-on look. |
| `accentColor` | hex / null | theme `accent` | Override for the accent color. The node fill and per-chip accent labels fall back to this when set. |
| `surfaceColor` | hex / null | theme `surface` / `#14202E` | Override for the chip pill surface. Default surfaces pair with `#0A1220` backgrounds. |
| `sceneBg` | hex / null | theme `background` | Override the scene background the AbsoluteFill paints. Defaults to theme so the canvas is never left black-void even when no `<Background>` wraps this template. |
| `holdAfterLandFrames` | integer ≥0 | `18` | Built-in breath — the assembled cloud holds for this long after the focal node settles. |

## Customization recipes

### Architecture pillars — heading + accent label on one chip
```json
{
  "extras": {
    "chips": ["vectors", "tokens", "memory", "scheduler", "tools"],
    "eyebrow": "ARCHITECTURE",
    "title": "What makes an agent",
    "subtitle": "Five pillars orbit a single core.",
    "nodeLabel": "AGENT"
  },
  "elements": [{ "id": "chip-1", "custom": { "accent": true } }]
}
```
The first chip after the title gets an accent-colored label — the pillar you're calling out as the special one.

### Calm relationship map — 5 chips, slow 9°/s spin
```json
{
  "extras": {
    "chips": ["BODY", "MIND", "SLEEP", "EAT", "MOVE"],
    "orbitDegreesPerSec": 9,
    "nodeLabel": "WELLNESS"
  }
}
```

### Stellar hub — 4 chips, dashed orbit zero spin (logo-style)
```json
{
  "extras": {
    "chips": ["origin", "force", "rule", "code"],
    "orbitDegreesPerSec": 0,
    "orbitDashOnPx": 4,
    "orbitDashOffPx": 8,
    "orbitDashDriftPxPerSec": 6,
    "nodeRadiusPx": 80,
    "nodeGlow": true
  },
  "theme": { "palette": { "accent": "#00D9A3" } }
}
```
The orbit's dashed path becomes the signature — slowly marching dashes around an otherwise static assembly.

### Moderate sustained turn — 6 chips, 15°/s sustained spin
```json
{
  "extras": {
    "chips": ["a", "b", "c", "d", "e", "f"],
    "orbitDegreesPerSec": 15,
    "chipArrivalOffsetPx": 160,
    "revealSeconds": 1.1
  }
}
```
Larger chip-offsets + 15°/s spin read as a contemplative but clearly-moving cloud — good for a longer reveal where the orbit's turn IS the scene's pace.

### No connectors — a clean cloud
```json
{ "extras": { "connectors": false } }
```

### Hide one chip's connector (per-chip)
```json
{
  "elements": [ { "id": "chip-2", "custom": { "connector": false } } ]
}
```

### Always-on connectors (legacy look)
```json
{ "extras": { "connectorsDrawOn": false } }
```

### Recolor one chip's pill (highlight a winner)
```json
{
  "elements": [ { "id": "chip-3", "color": "#00D9A3" } ]
}
```
Note — `color` overrides the chip's PILL background (not its text). To recolor just the text in the accent, use `custom.accent: true` instead.

### Override a chip's label + render with mono numerics
```json
{
  "elements": [
    { "id": "chip-0", "text": "01 ORIGIN", "custom": { "mono": true, "weight": 700 } }
  ]
}
```

### Diagonal ellipse (tall) — wide Y radius
```json
{ "extras": { "orbitRadiusXPx": 320, "orbitRadiusYPx": 420 } }
```

### Reverse orbit drift (clockwise vs counter-clockwise)
```json
{ "extras": { "orbitDashDriftPxPerSec": -6 } }
```

## Pitfalls

- **`extras.chips` is required.** Schema rejects configs that omit it.
- **Chips size by content + padding**, not a fixed width. Long labels widen the pill — there's no clamp. Truncate long labels manually or use shorter synonyms (a long first chip will crowd the orbit's top).
- **`orbitRadiusX` / `Y` should fit your canvas with chip width/padding.** At 1920×1080, `orbitRadiusX: 720` keeps chips in frame with 80px+ margin to spare; increase to push chips toward the edge.
- **`orbitDegreesPerSec` > 30** can read as fanciful for calm briefs (chip labels get hard to read while moving fast). 9–18 deg/s is the sweet spot; 36+ deg/s is logo-reveal territory. Above 90 deg/s, the chips are essentially a blur — use only if you'd also reduce `chipCount` and shorten the camera hold.
- **`chipArrivalOffsetPx > 250`** can push chips outside the canvas edge for chips near the orbit's extremes. The chip's tangential offset is in the direction of orbit motion, so a chip starting "behind" its slot at +9°/sec with offset 250 will start 250px in the catch-up direction — verify visually before shipping dramatic offsets.
- **Many chips (>6)** crowd the orbit — connector lines tangle, label collision risk grows. For 8+ concepts, consider `comparison-grid` or split into two scenes.
- **Chip `color` overrides fill, not text.** Setting `color` to the accent will *paint the whole chip the accent color* — usually wrong. To accent a chip's label, use `custom.accent: true`; to accent its pill, keep `color` for the body fill but add a per-chip stroke (`chipStrokeWidthPx > 0` with the chip border overridden via `chipStroke`).
- **Node fill = accent = chip accent label.** If you set `nodeFill` to `null`, it falls through to `theme.accent`. If you set a chip to `custom.accent: true`, the label uses the *same* accent — that's the point (one accent color).
- **`chipRadiusPx` defaults to `chipHeightPx / 2`** (perfect pill). Override only if you want a less-rounded shape (square-ish pills feel sub-brand, can clash with broadcast typography).
- **`sceneBg` overrides the canvas fill.** If you wrap this template in a `<Background>` in your scene, the `<Background>` sits behind but the AbsoluteFill still paints its own `theme.background` on top — set `sceneBg: "transparent"` if you want the host's `<Background>` to show through.
- **The orbit path is three stacked ellipses** (baseline ring + draw-on sweep + marching dashes — see the visual design notes). Disable the path entirely with `orbitStrokeWidthPx: 0`. To kill the marching dashes but keep the static dashed pattern, set `orbitDashDriftPxPerSec: 0`. To get a *solid* orbit ring (no dashes), set both `orbitDashOnPx: 0` and `orbitDashOffPx: 0` — the draw-on sweep layer is also disabled in that case (a solid ring needs no sweep).

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
