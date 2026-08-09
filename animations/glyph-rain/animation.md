# Glyph rain

Matrix-style glyph rain layered above arbitrary content. Columns of katakana / digits fall down the canvas with bright head cells, fading trails, parallax depth layers, and a per-cell mutation rate. A **deterministic, GPU-free re-implementation** of the Canvas UI "Glyph Rain" look, computed per frame (no WebGL, no `requestAnimationFrame`, no html-in-canvas) so it renders frame-exact through Remotion on a t3.micro.

## Children-wrapper model

`<GlyphRainRip>` is a **wrapper, not a content owner**. Pass your own Remotion component(s) as `children` and the template overlays the rain above them:

```tsx
<GlyphRainRip config={config} styles={{ colors, fonts }}>
  <YourContent />
</GlyphRainRip>
```

Layer order (lowest → highest):

1. **Source** — your `children`, rendered at `1 - dim` opacity. With `dim: 0` the children stay fully visible (rain reads as a translucent overlay); with `dim: 1` the children are hidden entirely (pure matrix rain on a transparent canvas).
2. **Rain** — up to `layers` parallax strata of falling glyph spans. Each layer scales cell size and per-column speed by `[1, 1.5, 2.2]` (matches the shader's `scales[3]`), so back layers fall slower and look chunkier — the same faux-depth read as the original.

An optional `fadeInFrames` / `fadeOutFrames` ramps the rain overlay in/out at scene bounds so the rain doesn't pop on/off — defaults to 0 (instant cut) but worth a 4-8 frame fade in a long-take scene.

## When to use

Reach for this when your scene's `visual_notes` reads like:
- "matrix code rain / digital waterfall"
- "terminal bootup sequence / hacker POV"
- "cyberpunk data cascade over a still frame"
- "animated background behind a hero statistics reveal"
- "transmission cold-open before an explainer cut"

Don't use it for: anything that needs the rain to *light up* the underlying content (the Canvas UI shader simulates ~24 neighboring drop heads as point lights — that light-pool shader pass is GPU-only and was dropped here; the rain is the visual); or as a full-scene VHS overlay across the whole video (use the foundation primitives, or a per-scene SVG mask).

## Why this is a port, not a wrap

Canvas UI ships the source via `npx shadcn add @canvas-ui/glyph-rain-react`. The original component paints via WebGL2 + html-in-canvas (`CanvasDrawElement`, Chrome ≥148 in origin trial) and feeds its shader `time = performance.now()`. Neither is determinable on Remotion: the WebGL path needs a Chrome 148 binary and a `puppeteerInstance` (not exposed by Remotion's CLI), and the real-time RAF timeline can't be stepped to frame N. So this template takes **the visual design** of the Canvas UI glyph rain (falling columns, per-cycle density gating, head + trail envelopes, parallax layers, glyph mutation) and **re-implements it in JS driven by `useCurrentFrame()`**, keeping the same per-column per-cycle hash functions so the visual reads as the same effect — but it's pure DOM, plays anywhere Remotion renders (including SwiftShader on a t3.micro), and reproduces bit-for-bit identical frame N every render. The Canvas UI `<GlyphRain>` is the design reference; **this template is not a wrapper around Canvas UI**.

## Per-column model (ported deterministically)

Every hash is the same `fract()` style hash the shader uses, ported line-for-line to JS and keyed off the Remotion frame index instead of real time. The glyphs themselves are **pinned to fixed grid cells — nothing translates**; the "rain" is a brightness envelope that sweeps down each column:

- **Column speed** — `config.speed * mix(1, hashCol(col, layerSeed), speedVariance) * 0.5` where `hashCol = mix(0.35, 1.0, hash11(col*0.37 + seed + 3.1))`.
- **Column phase offset** — `hash11(col * 1.713 + seed) * 9.0` cycles.
- **Wavefront** — per cell, `yn = 1 - (row + 0.5) * cell / height` (1 at the top), `T = t * speed + offset`, `phase = fract(yn + T)`, `cyc = floor(yn + T)`. The wavefront (`phase → 0`) is the bright head; every row of every column is evaluated each frame, so when the head wraps from the bottom edge back to the top edge at a cycle boundary the streak stays continuous — the previous cycle's cells keep fading while the new head starts. A column never blinks out as it leaves the screen.
- **Trail envelope (the linear reveal)** — `b = clamp(trail / (phase * 22.0), 0, 1.3) - 0.04`. Cells right under the wavefront are near-max brightness and fade as their phase grows — glyphs appear one by one down the column, revealing linearly instead of snapping in whole.
- **Head glow** — `head = 1 - smoothstep(0, cellYn * 1.2, phase)`; `g = b * flick * weight * (1 + head * glow * 1.4)` drives opacity, peaking at ~3.4× the trail brightness. The color mix toward `headColor` deviates from the shader on purpose: the mix window is widened to `1 - smoothstep(0, cellYn * 3.2, phase)` with a 1.1× boost, so the head plus the cells behind it read as a white-hot blob rather than a one-frame white flash, and every glyph renders with a two-ring CSS box-shadow halo (tight core + wide soft bloom) scaled by the mix. The wavefront cell still renders fully in the head color.
- **Per-cycle density gate** — `hash21(col + cyc * 0.0731, cyc + layerSeed) < density`. Same `step(hash21, uDensity)` shape as the shader, so columns pop in/out of existence on the same cadence. With `density: 0.15`, only 15% of columns have a streak visible at any instant.
- **Per-cell glyph** — hashed on `(col, row)` so each cell in a column draws a DIFFERENT glyph: `idx = floor(hash21(col*1.71 + seed + tick*7.31, row*1.71 + tick*0.613) * charsetLen)` with `seed = layerSeed + cyc * 0.173` and `tick = floor(t * mutate * 1.6 + hash21(col + seed, row + seed) * 9.0)`. `mutate` rolls the time-dependent part of the tick; the per-row hash always keeps the column varied.

`deterministicSeed` shifts every layer's seed so two scenes can mutate differently without changing the column geometry.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { GlyphRainRip } from "../components/animations";
import { COLORS, FONTS } from "../lib/styles";
import config from "../scene-assets/scene-03-rain.json";

const MyTitle: React.FC = () => (
  <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
    <h1 style={{ color: "white", fontSize: 180, fontWeight: 900 }}>ENTERING NODE</h1>
  </AbsoluteFill>
);

export const Scene03: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <GlyphRainRip config={config} styles={{ colors: COLORS, fonts: FONTS }}>
      <MyTitle />
    </GlyphRainRip>
  </AbsoluteFill>
);
```

Save the config at `videos/<title>/remotion/src/scene-assets/scene-03-rain.json`:

```json
{
  "global": { "speed": 1.0 },
  "elements": [],
  "extras": {
    "cell": 16,
    "glyphColor": "#10FF9E",
    "headColor": "#FFFFFF",
    "speed": 0.3,
    "density": 0.18,
    "layers": 3,
    "dim": 0.6,
    "deterministicSeed": 7
  }
}
```

> `elements[]` is unused by glyph-rain itself — content is passed as `children`. Keep the array empty (or omit it) so your config stays clean. The schema still accepts arbitrary element objects for DeepConfig pipeline shape compatibility.

## Recognized element ids

**None.** This template renders no content of its own — pass everything through `children`. The `elements[]` array in the config is ignored at runtime and is kept in the schema only for DeepConfig pipeline shape compatibility.

## `extras.*`

### Rain geometry
| Key | Type | Default | Description |
|---|---|---|---|
| `cell` | integer 8-64 | `15` | Glyph cell edge in CSS pixels. Smaller = denser, more columns; larger = chunkier retro feel. |
| `charset` | string 1-256 | katakana+digits | Characters the rain draws from. Deduplicated. Order does not matter — per-cell picks are hashed. |
| `layers` | integer 1-3 | `2` | Parallax rain strata. Each back layer scales cell × 1.5 (then × 2.2), slows per-column speed, and dims to 45% / 22% — matches the shader's `scales[3]` / `weights[3]`. |
| `columnCountCap` | integer 8-400 | `220` | Hard cap on the number of horizontal columns considered (per layer). Each layer independently computes `ceil(width / cellPx)`, then clamps against this. |

### Motion
| Key | Type | Default | Description |
|---|---|---|---|
| `speed` | number 0.05-3 | `0.2` | Fall speed in screen heights per second. The head of each column advances by this much per second (before per-column variance). |
| `speedVariance` | number 0-1 | `0.5` | Per-column speed variation. 0 = every column falls at the same speed; 1 = column speed varies from ×0.35 to ×1.0 baseline — the staggered matrix feel. |
| `density` | number 0-1 | `0.15` | Fraction of columns that have a streak visible at any instant. Lower = sparser (sparser, more legible source); higher = denser (more rain). 0 = no rain; 1 = every column always has a streak (overwhelming). |
| `trail` | number 0.2-3 | `0.65` | Length multiplier for the fading trail behind each head. 1 = ~3 cells of trail; 3 = ~9 cells of trail. |
| `mutate` | number 0-4 | `0` | Per-cell glyph mutation rate. 0 = streak glyphs are static; 4 = glyphs scramble constantly. Capped at 4 to bound visual churn. |
| `flicker` | number 0-1 | `0` | Per-cell brightness flicker. 0 = stable; 1 = high-frequency flicker via `sin(t*14 + hash*40 + phase*30)`. |

### Look
| Key | Type | Default | Description |
|---|---|---|---|
| `glow` | number 0-3 | `1.75` | Brightness boost on streak heads. Scales the opacity boost, the width of the white-hot color-mix window, and the two-ring CSS box-shadow halo (core + bloom) on head glyphs. |
| `dim` | number 0-1 | `0.5` | Opacity reduction of the underlying `children`. 0 = children fully visible; 1 = children hidden entirely (pure matrix rain). |
| `glyphColor` | string | `#4474FF` | Hex colour for trail glyphs. Falls back to `theme.palette.secondary`. |
| `headColor` | string | `#2B6AFF` | Hex colour for streak head glyphs. Falls back to `theme.palette.primary`. |

### Wrap / determinism
| Key | Type | Default | Description |
|---|---|---|---|
| `deterministicSeed` | integer 0-1_000_000 | `1` | Base PRNG seed. Shifts every layer's seed so two scenes can rain differently without changing the column geometry. |
| `fadeInFrames` | integer 0-600 | `0` | Frames to fade the rain overlay in at scene start. 0 = instant cut. |
| `fadeOutFrames` | integer 0-600 | `0` | Frames to fade the rain overlay out before scene end. 0 = instant cut. |

## Customization recipes

### Pure matrix rain, no source (matrix opener)
```json
{ "extras": { "dim": 1, "cell": 14, "density": 0.25, "trail": 1.2, "mutate": 1.6, "layers": 3 } }
```

### Light foreground rain (terminal POV, source stays visible)
```json
{ "extras": { "dim": 0.25, "density": 0.1, "cell": 22, "trail": 0.55, "layers": 1 } }
```

### Cyberpunk cascade with magenta head / cyan trail
```json
{
  "extras": { "glyphColor": "#00FFE0", "headColor": "#FF2D55", "glow": 2.4, "cell": 18 },
  "theme": { "palette": { "background": "#06060F" } }
}
```

### Slow contemplative rain (long-take opener)
```json
{ "extras": { "speed": 0.08, "speedVariance": 0.8, "density": 0.08, "trail": 2.0, "mutate": 0, "fadeInFrames": 30 } }
```

### Violent code cascade (chaotic mid-roll shot)
```json
{ "extras": { "speed": 1.2, "density": 0.45, "trail": 1.4, "mutate": 3, "flicker": 0.6, "cell": 12, "layers": 3 } }
```

### Custom charset — pure binary (0s and 1s only, dense)
```json
{ "extras": { "charset": "01", "cell": 14, "density": 0.3, "trail": 0.9, "glyphColor": "#10FF9E", "headColor": "#FFFFFF" } }
```

### Smaller rain on a 9:16 deliverable (downscale cells)
```json
{ "extras": { "cell": 12, "density": 0.18, "columnCountCap": 140 } }
```

### Rain your own animated content (terminal title block underneath)
The children can be any Remotion component, including one with its own intrinsic animation. The rain overlays above it; children stay at `1 - dim` opacity, never hidden.
```tsx
<GlyphRainRip config={config} styles={styles} >
  <TerminalCard /> {/* has its own type-in animation */}
</GlyphRainRip>
```

## Pitfalls

- **DOM span count is bounded by `SPAN_CAP` (3600).** Each visible glyph is one absolutely-positioned `<span>`. Total spans per frame are capped regardless of `columns * litCells * layers`; once `SPAN_CAP` is hit, the rain stops emitting glyphs for the remaining columns that frame. With sensible `density` (0.15) and `trail` (0.65), real span count is ~500-1500 per frame — well under the cap. Only near `density: 0.45` + `trail: 2` + `layers: 3` do you risk hitting the cap, in which case you'll see the columns at the back-layer / right-side silently drop — bump the cap if you need it (but watch t3.micro rendering time). The per-frame CPU walk (`cols * rowsPerCol * layers` hash evaluations) is cheap; the DOM is the expensive part and that's what the cap bounds.
- **Glyphs are stationary — the light moves, not the glyphs.** The "falling" look comes from the brightness envelope sweeping down each column (wavefront `phase → 0`), never from translating spans. This is faithful to the Canvas UI shader (`id = floor(px / cell)` pins glyphs to cells) and it's what makes the reveal read as linear instead of stepped. If you want glyphs to physically travel, this is the wrong template.
- **The head wraps bottom → top at each cycle boundary, but the streak never blinks out.** Every row is evaluated every frame, so the old cycle's cells fade smoothly while the new cycle's head starts — the column reads as a continuous stream. If a column vanishes for a whole cycle, that's the per-cycle density gate re-rolling (by design); raise `density` to keep columns alive longer.
- **Each cell's glyph is hashed on `(col, row)`.** Two cells in the same column always show different characters (unless your charset has fewer unique glyphs than cells — then repeats are inevitable, pick a longer charset). `mutate` rolls the time-dependent part of the tick; at `mutate: 0` glyphs are static but still varied per row.
- **`layers: 1` is fastest.** Each layer roughly multiplies span count and CPU cost. `layers: 3` at `density: 0.2` is the heaviest practical setting; layers 4+ are not supported (matches the shader's `scales[3]`).
- **`text-shadow` does not paint under Remotion's headless Chromium (SwiftShader) — the halo uses `box-shadow`.** Verified empirically: neither `text-shadow` nor `filter: drop-shadow()` render in this environment; only `box-shadow` does. The head-glow bloom is a two-ring NEGATIVE-spread box-shadow on each glyph cell — the glow starts inside the cell box (visible through the transparent span, glyph text painted above it) and bleeds outward, so the character reads as emitting light. If you copy the effect elsewhere (a real browser, Remotion with a GPU binary), the box-shadow ring still reads fine.
- **Background light pooling is NOT ported.** The Canvas UI shader simulates ~24 neighboring drop heads as point lights that "shine" onto the underlying page. That's a fragment-shader-per-texel sampling pass and is the part that requires sampling the source content's pixels — fundamentally GPU-bound. The rain itself (the iconic matrix look) IS ported; the light pools are not. To fake the "lit by rain" feel, set your `children` background slightly brighter and let the head-glyph CSS `box-shadow` bloom do the work.
- **Cursor stirring is NOT ported.** The shader's `stir` + `stirRadius` + `settle` keys let the cursor perturb column speeds. Remotion renders have no cursor — drop these fields. To get the "intermittent surge" feel in a deterministic render, use `mutate` + `flicker` instead.
- **`dim: 1` doesn't hide the canvas — it hides the children.** Children drop to opacity 0; the canvas itself remains transparent. An `<AbsoluteFill>` with a solid background-color underneath the children will still read. Style your scene's `<Background>` (or pass a children with its own background div) if you want a non-transparent matrix.
- **`deterministicSeed` defaults to 1.** Same seed → identical render. Bump the seed if two scenes in the same video use this template and ought to rain in different columns.
- **Custom `charset` strings with whitespace are auto-stripped.** The dedup pass drops every character whose `trim()` is empty (spaces, tabs, newlines — matching the shader's atlas filter), so multi-line strings don't accidentally push the schema's `minLength: 1` past breaking. An all-whitespace charset falls back to `0` and `1`.
- **This template does NOT wrap Canvas UI.** It re-implements the visual design deterministically. The Canvas UI `<GlyphRain>` React component, the html-in-canvas Chrome 148 requirement, the cursor-stir wake field, the relief/embossed normals, and the WebGL shader are all out of scope here on purpose — see the conversation assessment for the t3.micro rationale.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8. The preview exports `PREVIEW_DEFAULT_PROPS` with a 0.45 speed and `mutate: 1.4` so the rain visibly churns inside the 90-frame window, three parallax layers, and a `<TerminalCard>` passed as `children` (with its own type-in glow) to demonstrate the children-wrapper model.
