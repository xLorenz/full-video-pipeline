# Rolling digit counter

Each digit column in a number **rolls** through random digits (slot-machine reel style), then locks onto its target digit, settling left-to-right with a small per-column stagger. Built for **topic-agnostic high-energy number reveals** — subscriber counts, scores, prices that "tick into place," any beat where interpolating to a final numerand should feel mechanical and satisfying rather than linear.

## When to use

Reach for this when your scene's `visual_notes` says something like:
- "the count rolls in like a slot machine"
- a number that should arrive with **mechanical punch** (not ease-out math)
- a "drumroll" reveal where each digit snaps independently
- score / rank / count that lands like a scoreboard

Don't use it for: a single number whose count-up itself is the visual interest (`count-up-stat` interpolates 0→target smoothly; this template rolls random glyphs and SNAPS to target — different feel). Use it when the AMOUNT of motion should read as "the mechanism is real."


## Holds & visual design notes

- **Real scrolling reels, not modulo-flicker.** Each column is a vertical
  strip of digits `0..9` repeated 4×; the strip translates continuously
  past a fixed one-cell window. `spinRateHz` is the peak reel speed in
  cells/sec; the strip **decelerates** (ease-out-cubic) into its target
  glyph's rest position over `rollSeconds`. Reads as a real slot reel
  slowing into the lock — not a 3-cell vibrate-bounce.
- **Sub-cell spring overshoot after land.** Once a column's reel reaches
  its target glyph's rest position, a damped spring (damping 14,
  stiffness 220) drives a single small overshoot (~6% of one cell)
  past rest, then settles back. Amplitude is clamped so the
  neighboring digit's descender never crosses the recessed frame
  hairline — the locked digit bobs a hair then locks. Set
  `springLand: false` for a no-overshoot hard land (Price-is-Right
  tick).
- **Velocity-driven motion blur.** The CSS blur radius is proportional
  to the instantaneous reel velocity (px/frame), computed per-frame
  from the eased scroll position. The blur ramps up during the
  `headstartFrames` pre-roll (so frame-0 isn't a snap from 0 to peak
  blur), peaks at the start of the scroll, and dies naturally as the
  strip decelerates — no manual "clear blur at land frame" cut.
  Scale the effect with `motionBlurScale` (default 1).
- **Per-column lock accent.** At each column's land frame, the recessed
  top/bottom hairlines flash from the muted `frameColor` toward the
  `accentColor` over a ~17-frame sin arc, then settle back. This is the
  one accent moment per column — the "lock click." Disable with
  `lockAccent: false` for a flat digital readout.
- **`mono` font by default.** Tabular numerals keep the digits aligned
  in a column — the whole slot-machine reading depends on it. If you
  set `valueFontRole: "heading"`, your heading font MUST also keep
  `font-variant-numeric: tabular-nums` (the template applies it
  automatically, but it has no effect unless the loaded font supports
  tabular figures).
- **Per-column stagger (small).** `perColumnStagger: 0.15` (fraction
  of `rollSeconds`) — column 0 lands slightly before column N-1,
  reading left-to-right. Range caps at 0.5 (set higher and the roll is
  too uneven).
- **Built-in breath, honored.** `holdAfterLandFrames` (default
  24 ≈ 0.8s @ 30fps) is the recommended minimum scene budget AFTER the
  last column lands. The template **does not** fade the value/label
  out at any point — the locked number IS the scene. Once landed it
  stays at full opacity for the remainder of the composition; the
  host scene's `<Sequence>` + transition drives the exit, not the
  template. `holdAfterLandFrames` is a sentinel for "your scene needs
  at least this long after land to read the lock before cutting."
- **No decorative halo.** The single accent lives on the prefix/suffix
  (e.g. `$`, `+`), the thousand separator, AND the per-column
  lock-accent hairline flash — keeping the digits themselves crisp.
  Set `accentColor` to override; falls back to `theme.accent`.
- **Recessed reel frame.** The template draws top + bottom inset
  hairlines on each column window, plus a subtle left/right bevel —
  visually an inset metal reel, not a flat slab. Set `extras.frameColor`
  to override; falls back to `theme.gridLine`.
- **`fps` aware.** `rollSeconds`, `spinRateHz`, the spring's
  `durationInFrames`, and the lock-accent pulse width all derive from
  `useVideoConfig().fps`, so 24/60 deliverables pace identically to
  the 30fps preview.
- **Determinism.** All reel motion is computed from `frame` via
  `interpolate` + `spring` — no `Math.random()` and no `Date.now()`.
  Frame N renders identically every time (Remotion rule, audit-ready).
- **Corner stamp is opt-in.** The small `◷ ROLL` badge in the
  bottom-right (the reading-cue that says "this is a slot-machine")
  now defaults to OFF; turn it on with `showStamp: true` if the scene
  needs the contextual cue. The host scene can also mask it with an
  overlay if desired.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { RollingDigitCounter } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-03-roll.json";

export const Scene03: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <RollingDigitCounter config={config}
      styles={{colors: COLORS, fonts: FONTS}}
      fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-03-roll.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "label", "text": "subscribers unlocked", "delay": 32, "duration": 16 }
  ],
  "extras": {
    "targetValue": 1234567,
    "thousandSeparator": ",",
    "rollSeconds": 1.6,
    "spinRateHz": 14,
    "valueFontRole": "mono",
    "maxFontPx": 200,
    "holdAfterLandFrames": 28
  }
}
```

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `value` | The big number. The displayed value is driven by `extras.targetValue`; this element's `text` is **ignored**. Use this id only to override the **color** of the digits, or for a `size.fontSize` cap via `maxFontPx`. | (driven by `targetValue`) |
| `label` | Sub-caption below the number. Hide with `"hidden": true` for pure-number scenes. | `""` |
| `prefix` | Symbol rendered before the number, painted in accent. e.g. `"$"`, `"#"`. | `""` |
| `suffix` | Symbol rendered after the number, painted in accent. e.g. `"%"` (`×` or `+` for impact). | `""` |

Unmatched ids are ignored silently — a warning is logged at preview time.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `targetValue` | number | (REQUIRED) | The final value displayed — the digits roll to this. |
| `decimals` | int 0-4 | `0` | Decimal places shown. |
| `thousandSeparator` | `""`, `","`, `"."` | `""` | Group integer digits every 3. Use `","` with `valueFontRole: "mono"` so digits stay aligned. |
| `rollSeconds` | number 0.4-6 | `1.6` | Total roll duration. The last column lands at `rollSeconds`; earlier columns stagger earlier. |
| `spinRateHz` | number 4-30 | `12` | Peak reel speed in cells/sec; the strip decelerates from this down to 0 across the roll window. |
| `headstartFrames` | integer 0-120 | `6` | Pre-roll frames where the reel is already spinning before scroll-deceleration begins (so the eye registers reel motion before slowing). |
| `perColumnStagger` | number 0-0.5 | `0.15` | Stagger (as a fraction of `rollSeconds`) at which consecutive columns land. 0 = all columns land simultaneously. |
| `motionBlurScale` | number 0-3 | `1` | Multiplier on the velocity-driven CSS blur. 0 = flat (digital scoreboard); 2-3 = softer mechanical blur. |
| `motionBlur` | number 0-20 | `4` | **Deprecated alias** — mapped to `motionBlurScale = motionBlur / 4` when `motionBlurScale` is absent. Prefer `motionBlurScale`. |
| `springLand` | boolean | `true` | Each column snap is a damped spring (damping 14, ~6% overshoot above rest, clamped so neighbor digit never crosses the hairline). Set `false` for a hard ease-out snap (less weight, more "tick-tock"). |
| `valueFontRole` | `"heading"` / `"mono"` | `"mono"` | Font family to resolve from `theme.fonts`. Mono keeps digits aligned in a column — important for the slot-machine reading. |
| `rowGapPx` | number 0-400 | `24` | Space between the number and the label below. |
| `maxFontPx` | number 8-1000 | `260` | Cap on the resolved digit font size, to prevent overflow when `theme.sizes.scale` is high. |
| `containerWidthPct` | number 30-100 | `70` | The number container's width as % of canvas width. |
| `frameColor` | hex / null | `theme.gridLine` | The recessed reel-frame hairline color above/below each column window. |
| `accentColor` | hex / null | `theme.accent` | Color used for the prefix/suffix + thousands separator + the per-column lock-accent hairline flash. |
| `lockAccent` | boolean | `true` | The transient top/bottom accent hairline pulse at each column's land frame. Set `false` for a flat digital readout with no per-column punctuation. |
| `showStamp` | boolean | `false` | Opt-in `◷ ROLL` corner stamp. Off by default — enable only when the scene needs the reading-cue. |
| `label` | string / null | `null` | Shortcut for the label element's text. The `elements[]` `id: "label"` override wins if both are set. |
| `holdAfterLandFrames` | integer ≥0 | `24` | Sentinel — the recommended minimum scene budget AFTER the last column lands before a cut. The template does NOT auto-fade; the scene composes out. |

## Customization recipes

### Price reveal — 2-decimal dollar roll
```json
{
  "extras": { "targetValue": 499.99, "decimals": 2 },
  "elements": [ { "id": "prefix", "text": "$" } ]
}
```

### Score / count with a "+" suffix
```json
{
  "extras": { "targetValue": 5280, "thousandSeparator": "," },
  "elements": [ { "id": "suffix", "text": "+" } ]
}
```

### Calmer institutional beat — slow roll, no blur, hard snap
```json
{
  "extras": {
    "rollSeconds": 2.4,
    "spinRateHz": 8,
    "motionBlurScale": 0,
    "headstartFrames": 0,
    "springLand": false,
    "lockAccent": true,
    "holdAfterLandFrames": 36
  }
}
```

### Frantic scoreboard — fast spin, high blur, big snap
```json
{
  "extras": {
    "rollSeconds": 0.8,
    "spinRateHz": 22,
    "motionBlurScale": 2.0,
    "headstartFrames": 3,
    "lockAccent": true,
    "perColumnStagger": 0.05
  }
}
```

### Single-digit answer (e.g. "the verdict is 7")
```json
{ "extras": { "targetValue": 7, "decimals": 0, "rollSeconds": 1.0 } }
```

### Recolor only the digits (e.g. green for success)
```json
{
  "theme": { "palette": { "text": "#10B981" } },
  "elements": [ { "id": "value", "color": "#10B981" } ]
}
```

### Pure numeric, no label, with the `◷ ROLL` reading-cue stamp
```json
{
  "extras": { "showStamp": true },
  "elements": [
    { "id": "label", "hidden": true }
  ]
}
```
The stamp is OFF by default. Enable `showStamp: true` only when the
viewer needs the contextual "this is a slot-machine" cue.

## Pitfalls

- **`extras.targetValue` is required.** Schema rejects configs that omit it. Set 0 if you want an all-zero roll (still looks like a slot machine).
- **`valueFontRole: "heading"` requires a tabular-numerals heading font.** Without tabular figures, digits in a column widen/narrow per-glyph and the slot-machine reading breaks. Default to `"mono"`.
- **`perColumnStagger >= 0.5` makes long rolls.** The last column's land frame can exceed `rollSeconds`, lengthening the scene. Stay under 0.3 for snappy beats.
- **`motionBlurScale > 2.5` can read as a smear.** The velocity-driven blur smears the digit glyph — the column reads as a blur instead of a reel. Stay under 2 unless the brief is intentionally atmospheric.
- **`spinRateHz > 24` may exceed monitor refresh during preview** but renders correctly. Visible at 12-18 typically; >22 reads frantic.
- **Negative or NaN `targetValue`** is not currently guarded: the integer part loses the leading `-` (you wire up a `prefix: "-"` element if needed), and `NaN` renders blank (the empty-cell fallback shows a single 0 cell). Validate your config upstream.
- **`springLand: true` with `perColumnStagger: 0`** makes all columns spring in simultaneously, which can overshoot identically and read as a CSS animation. Use a tiny stagger (default 0.15) so each column settles its own way.
- **The template does NOT fade the value out at end-of-life.** Once the last column lands, the locked number stays at full opacity for the remainder of the scene. Don't expect the template to time-out — compose out via the host scene's `<Sequence>` + transition. If you set `durationInFrames` on your composition to `lastColumnLandFrame + holdAfterLandFrames`, your scene ends neatly on the held number; if longer, the number just keeps being shown (which is usually what a "score reveal" climax wants).
- **`headstartFrames` matters for short rolls.** On a `rollSeconds: 0.6` beat, set `headstartFrames: 0` or the scroll-deceleration window is too short for the eye to register the pre-spin. On a `rollSeconds: 3+` beat, the default 6 reads invisibly (which is the point).

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
