# Before-after split

Two-panel divider wipe to reveal a contrast. The **before** panel fills the canvas at frame 0; the **after** panel is revealed through a soft gradient wipe that sweeps from one edge to the other. The wipe carries motion: a soft perpendicular gradient light trails the divider, a tiny contact dot glows at the divider's outer edge, and labels are anchored to the divider edge — the "before" label retreats as its panel is eroded, the "after" label rises in as its panel is exposed. Optional per-side numeric aside ("8 cm" / "30 cm") sits above the headline.

## When to use

Reach for it when the scene's `visual_notes` is a direct visual contrast between two states:
- "before/after the new update"
- "morning sky vs night sky"
- "1 hour of work vs 4 hours"
- "Earth's ozone — 1950 vs today"

Don't use it for: judgment-style contests with a winner/loser verdict (use `right-wrong-card`), or a continuous timeline of more than two points (use `timeline-marker`).

## Holds & visual design notes

- **Built-in breath on both sides.** `preSweepHoldFrames` (18) holds the "before" beat alone so the viewer registers the starting state before it's wiped; `postSweepHoldFrames` (30) holds the post-wipe frame so the after-state lands and reads. The whole timing is: hold-before → wipe → hold-after.
- **Default palette is designed, not a dashboard.** Panels fall through to `theme.primary` (before) and `theme.secondary` (after). If you want a verdict feel (red/green), use `right-wrong-card`; if you want a designed contrast (ink → teal, sand → midnight), you're in the right template.
- **Per-label sweep choreography.** The "before" label retreats (slides + fades 0→0.6 of sweep) as its panel is eroded — the eye leaves the before-state. The "after" label rises in (slides from the wipe direction + opacity 0→1 across sweep 0.3→0.55) as its panel is exposed — landing at full opacity before the wipe even finishes, so the eye is pulled to it. Each label has its own independent sweep-local timeline instead of a single global `labelOpacityDuringSweep`.
- **Type hierarchy carries half the verdict.** "before" label is `weight 500`, `+0.04em` tracking — airier, transitional. "after" label is `weight 800`, `-0.02em` tracking, scaled up 6% relative to the before — heavier, settled. The viewer reads the transformation in the type alone, before they even see color.
- **Label contrast by luminance, not a soft shadow.** Each label's color is auto-picked (dark on light panels, light on dark panels) using the panel's YIQ luminance.
- **Soft wipe light.** A perpendicular gradient band trails the divider by `wipeLightWidthPx` and fades behind it, blended additively with `mixBlendMode: "screen"` so it brightens the panel without darkening it. Sells the wipe as "doing something" rather than just being there.
- **Contact glow.** A small bright dot with a soft `box-shadow` halo sits at the divider's outer edge while the wipe is moving (fades in over sweep 0.02→0.12, fades out over 0.88→0.985). Gives the sweep a "live" feel.
- **Per-side panel gradient.** Each panel renders a subtle linear-gradient (darker on the outer edge, brighter at the divider contact edge) by default — gives the panels depth rather than reading as flat painted rectangles. Disable via `panelGradient: false`.
- **Optional per-side numeric aside.** `beforeValue` / `afterValue` render small body-font text above the headline, in a tabular-nums body face — for contrast beats like "8 cm / 30 cm" or "44% / 12%".
- **"gradient" divider is a real gradient** (perpendicular fade — transparent → accent → transparent). `"line"` is a solid bar. `"glow"` adds an explicit drop-shadow halo on top of the line.
- **Decelerating finish.** `sweepAccentSeconds` (default 0.32) runs the final sweep segment as a spring deceleration — the divider settles against the far edge instead of snapping. Clean material-feeling motion.
- **`dividerColor` defaults to `theme.accent`** (not `theme.primary`) so the divider is always visible against the default `theme.primary` "before" panel.
- **Same-color guard — silent.** If `beforeColor` and `afterColor` resolve identically (a config bug or a minimalist single-color brief), the divider automatically widens so the wipe is still visible. The previous version's footnote is removed — the guard now widens the divider silently without shipping an author message into the rendered video.
- **`fps` aware.** All sweep durations derive from `useVideoConfig().fps` — 24/60 deliverables pace identically to the 30fps preview.

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
    "sweepDurationSeconds": 1.6,
    "dividerStyle": "gradient",
    "beforeColor": "#0F1B2D",
    "afterColor": "#00BFA6",
    "beforeValue": "8 cm",
    "afterValue": "30 cm"
  }
}
```

## Pass arbitrary JSX into a panel (render-prop API)

For scenes that need an icon, image, mini-chart, or any custom composition inside a panel — when JSON `text`/`beforeValue`/`afterValue` isn't enough — the component also exposes two optional render-prop props on the React side (not part of the DeepConfig JSON):

```tsx
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type { BeforeAfterRenderCtx } from "../components/animations";
import { BeforeAfterSplit } from "../components/animations";

const IconPanel: React.FC<{ ctx: BeforeAfterRenderCtx }> = ({ ctx }) => {
  // ctx.sweepProgress goes 0..1 across the wipe. ctx.side = "before" | "after".
  // ctx.opacity + ctx.slide are the per-panel fade/slide the built-in labels
  // use — apply them to your custom child if you want it to follow the same
  // sweep-local choreography, or ignore them and animate fully off
  // ctx.sweepProgress for creative effects.
  const reveal = interpolate(ctx.sweepProgress, [0.2, 0.6, 1], [0, 1, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity: ctx.opacity, transform: `translate(${ctx.slide}px, 0)` }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={50 * reveal} fill={ctx.panelColor === "#0F1B2D" ? "#FFFFFF" : "#0B0F14"} />
      </svg>
    </div>
  );
};

export const Scene06: React.FC = () => (
  <AbsoluteFill>
    <BeforeAfterSplit
      config={{ global: { speed: 1 }, elements: [], extras: { direction: "vertical", sweepDurationSeconds: 1.6 } }}
      styles={{ colors: COLORS, fonts: FONTS }}
      renderBefore={(ctx) => <IconPanel ctx={ctx} />}
      renderAfter={(ctx) => <IconPanel ctx={ctx} />}
    />
  </AbsoluteFill>
);
```

### Behavior

- When `renderBefore` (or `renderAfter`) is provided, the panel's default headline+value block is **replaced entirely** by the returned node. The panel's background gradient + clip-path are still applied, so the custom child is still hidden / revealed by the sweep exactly like the built-in labels.
- When both render-props are omitted, the JSON `before-label` / `after-label` config drives the built-in headline + `beforeValue` / `afterValue` aside as documented above.
- Each render-prop receives a `BeforeAfterRenderCtx`:
  - `sweepProgress: number` — 0..1 wipe progress
  - `side: "before" | "after"` — which panel you're rendering into
  - `panelColor: string` — resolved panel background hex (useful for choosing icon/text contrast)
  - `opacity: number` — the per-panel sweep-local opacity (multiply onto your root node if you want the same fade)
  - `slide: number` — per-panel sweep-local slide in px along the wipe axis
  - `isHorizontal: boolean` — true when `direction: "horizontal"`; useful for axis-aware layout
- Optional, side-agnostic — you can pass only `renderBefore`, only `renderAfter`, or neither.

### When to use which API

- **JSON `text` + `beforeValue` / `afterValue`** — the default. Use for any before/after scene where the panel content is text and an optional numeric aside. Remains valid JSON-canonical (the template system validates it; no JSX touch required).
- **`renderBefore` / `renderAfter`** — escape hatch. Use when a scene needs icons, images, mini-charts, custom typography, or any composition the declarative JSON can't express. You break the JSON-only contract on that scene (the template system won't validate your JSX), but you keep the wipe + clip + sweep choreography for free.

## Recognized element ids

| id | Role | Default text |
|---|---|---|
| `before-label` | Headline rendered in the FIRST panel (left or top). | `"Before"` |
| `after-label`  | Headline rendered in the SECOND panel (right or bottom). | `"After"` |

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `direction` | enum: `vertical` `horizontal` | `"vertical"` | The divider's axis. `"vertical"` = vertical divider sweeping horizontally; `"horizontal"` = horizontal divider sweeping vertically. Color/side mapping is then decided by `sweepDirection`. |
| `sweepDirection` | enum: `ltr` `rtl` `ttb` `btt` | `"ltr"` (vertical) / `"ttb"` (horizontal) | Travel direction of the divider AND the direction the AFTER panel reveals. `"ltr"` = divider sweeps left → right, BEFORE starts fullscreen on the right and erodes to its right edge, AFTER reveals left → right on the left. `"rtl"` is the mirror (BEFORE on the left, divider right → left). `"ttb"`/`"btt"` are the horizontal equivalents (top→bottom / bottom→top). The beforeEach/after boundary IS the divider, so panel motion and swipe motion always match — no drift. |
| `panelContentAnchor` | enum: `panel-edge` `screen-center` | `"screen-center"` | Where each panel's content sits. `"screen-center"` centers both before/after children on the FULL canvas so they sit on top of each other and the wipe reveals one in place (no slide). `"panel-edge"` anchors each label to its panel's invariant edge — before hugs its fixed edge, after hugs its own — so the labels read as the panel's identity, never passing the divider. |
| `sweepDurationSeconds` | number 0.3-8 | `1.4` | Time the divider takes to cross the frame. |
| `sweepEasing` | EasingName | `"ease-in-out"` | Easing for the flat segment of the sweep (the bulk of the motion). |
| `sweepAccentSeconds` | number 0-2 | `0.32` | Final sweep segment runs as a decelerating spring — the divider settles against the far edge instead of a hard stop. |
| `dividerStyle` | enum: `line` `gradient` `glow` | `"gradient"` | `"line"` = solid bar; `"gradient"` = perpendicular soft fade (transparent → accent → transparent, thickness ×1.4); `"glow"` = solid bar + explicit soft halo (opt-in halo on top of `"line"`). |
| `dividerColor` | hex string | theme `accent` | The divider's color. Defaults to `theme.accent` so the divider is visible against either panel. |
| `beforeColor` | hex string | theme `primary` | First-panel background. Default is `theme.primary`, *not* a saturated red — design by your project's palette. |
| `afterColor` | hex string | theme `secondary` | Second-panel background. Default is `theme.secondary`. |
| `dividerWidthPx` | number 1-32 | `6` | Divider thickness in pixels (gradient spreads ×1.4 to soften). |
| `wipeLightWidthPx` | number 24-400 | `120` | Thickness of the soft perpendicular light band that trails the divider. Screen-blended onto the panels. |
| `panelGradient` | boolean | `true` | Each panel renders a subtle linear gradient (darker on the outer edge, brighter at the divider contact edge). |
| `beforeValue` / `afterValue` | string / null | `null` | Optional body-font label rendered above the headline (e.g. `"8 cm"` above `"1950"`). Tabular-nums for stable numeric columns. |
| `valueFontPx` | number 12-120 | `40` | Font size for the optional numeric aside. |
| `labelFontPx` | number 24-160 | `84` | Font size for the headline labels (falls back to `fontSizes.headline` × `theme.sizes.scale` if unspecified). |
| `panelPaddingPx` | number 0-400 | `120` | Padding inside each panel around its label. |
| `labelOpacityDuringSweep` | number 0-1 | `0.55` | Retained from earlier for backward compat — superseded by per-label sweep-local fade. Has no effect in the new component. |
| `labelFadeInFrames` | integer 1-120 | `12` | Retained for backward compat — superseded by the sweep-local fade. |
| `labelHoldAfterFrames` | integer 0-120 | `12` | Retained for backward compat — superseded by the sweep-local fade. |
| `preSweepHoldFrames` | integer 0-600 | `18` | Hold the "before" beat alone before the wipe starts. |
| `postSweepHoldFrames` | integer 0-600 | `30` | Hold the final post-wipe frame before the scene cuts (timeline-bound — the scene's `actual_duration_frames` owns the cut). |
| `sameColorGuard` | boolean | `true` | When the two panel colors resolve identically, widens the divider so the wipe remains visible. Silent (no on-screen footnote) — the prior author notice has been removed. |

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

### Slim divider with strong wipe light (cinematic feel)
```json
{ "extras": { "dividerStyle": "line", "dividerWidthPx": 2, "wipeLightWidthPx": 240 } }
```

### Glow divider (premium halo)
```json
{ "extras": { "dividerStyle": "glow", "dividerWidthPx": 4, "dividerColor": "#FFD166" } }
```

### Disable panel gradient for a flat-paint brutalist feel
```json
{ "extras": { "panelGradient": false } }
```

## Pitfalls

- `direction: "horizontal"` flips the divider axis but NOT the color mapping — `beforeColor` is always top, `afterColor` is always bottom. The names are inherent to direction.
- A very fast sweep (`sweepDurationSeconds < 0.5`) makes the labels jarring; pair with `labelOpacityDuringSweep: 1` (full label opacity through the wipe) to avoid flicker.
- Default panel colors fall through to `theme.primary` / `theme.secondary`. If your project's palette is monochrome (e.g. video with only black/white + accent), the default may not give visible contrast — set `beforeColor`/`afterColor` explicitly, or trust the same-color guard to widen the divider.
- The pre-sweep hold means the first ~18 frames show only the "before" panel — don't shorten `preSweepHoldFrames` below 12 unless you've deliberately decided the "before" beat needs no time to register.
- On the **non-sweep** axis, padding doesn't push the label off-screen because labels are anchored to the wipe-adjacent edge; if your label is long it may clip on short resolutions. Shorten the text.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md).
