# flame-wrap — border of fire around arbitrary content

Deterministic Remotion port of the Canvas UI [`<FlameWrap>`](https://canvasui.dev/docs/components/flame-wrap) WebGL component (canvasui.dev, MIT + Commons Clause). Wraps the caller's `children` in a burning rounded-rect silhouette: fire tongues rise from the top edge, a rim glow hugs every edge, sparks fly up, and smoke wisps off the top — all composited OVER the content, which stays crisp DOM underneath.

Like glyph-rain, this is a **children-wrapper**: the caller passes their own Remotion content as `children`, the template adds the fire. Content passes through untouched (no dimming, no tinting).

## Model

- **Fire is a full-screen WebGL2 fragment shader** (verbatim from upstream `FlameWrapVanilla.ts`). A rounded-rect SDF (`sdRoundRect`) carves the burning outline; fbm noise (`fbm`/`fbm2`) + a 7-step `turbulence` domain warp shape the tongues; the density field gates them into a flame body with white-hot cores, a `hash3` cell grid spawns rising sparks, and an edge-attenuated smoke band wisps off the top.
- **The content-branch features are skipped under Remotion**: the upstream component captures the wrapped DOM into a texture with the experimental html-in-canvas API (`drawElementImage`), then scorches/emburns/dissolves/distorts it. That API does not exist in headless Chromium, so the template always runs the shader's **built-in fallback branch** (`uHasContent = 0`): pure fire + glow + sparks + smoke on a transparent canvas. `ember`, `scorch`, `distortion`, `turbulenceReach` are accepted by the schema for config parity but are no-ops headless.
- **Determinism**: the upstream engine accumulates `time += delta * speed` in a `requestAnimationFrame` loop. Remotion renders each frame on a fresh browser page, so the loop is replaced by a single synchronous draw per frame with `uTime = (frame / fps) * global.speed * speed`. The shader is a pure function of its uniforms → frame N always produces identical pixels.
- **Canvas geometry, no measurement state**: the output canvas is positioned with pure CSS — `top: -reach`, `left/right/bottom: -glow`, `width: calc(100% + 2·glow)`, `height: calc(100% + reach + glow)` — where `reach = round(max(height,24)·1.5) + 40` and `glow = round(max(spread,8)·3) + 16`. The burning rect is derived from `getBoundingClientRect()` in one layout effect per frame: `hx = (w − 2·glow)/2`, `hy = (h − reach − glow)/2`, `cy = reach + hy`.
- **SwiftShader performance**: the browser rasterizes GL in software, so the canvas is drawn at **0.5× internal resolution** (`RENDER_SCALE`) and CSS-upscaled — fire is soft noise, the upscale is invisible, and a 0.5× pass is ~4× cheaper. One context, one shader compile, one full-canvas draw per frame.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `color` | theme accent (`#FF5722`) | Flame base color, `#RRGGBB` |
| `intensity` | 0.5 | Overall brightness of the fire (0–3) |
| `height` | 170 | Flame reach above the top edge in CSS px (24–500) |
| `spread` | 8 | Rim glow reach on the other three sides (8–120) |
| `radius` | 40 | Corner radius of the burning outline — **match your content's border-radius** |
| `speed` | 0.25 | Animation speed multiplier |
| `scale` | 0.75 | Flame detail, broad licks (0) → fine licks (1) |
| `turbulence` / `turbulenceScale` | 0.5 / 0.5 | Amplitude / frequency of the turbulence domain warp |
| `turbulenceReach` | 25 | Heat-warp reach — content-branch only, no-op headless |
| `sparks` / `sparkSize` / `sparkDensity` / `sparkSpeed` | 1.5 / 0.35 / 1 / 1 | Spark brightness / size / count / speed (sparks = 0 disables) |
| `rim` | 2.5 | Strength of the molten glow hugging the edges |
| `melt` | 4.5 | How far the flames bite into the content silhouette |
| `distortion` | 10 | Content heat shimmer — content-branch only, no-op headless |
| `smoke` | 1.5 | Smoke drifting off the flames (0–2) |
| `ember` / `scorch` | 2 / 0 | Ember line / charred band — content-branch only, no-op headless |
| `fadeInFrames` / `fadeOutFrames` | 0 / 0 | Fire overlay fade, frames |

## Pitfalls & notes

- **WebGL y is bottom-up** — the burn-rect center must be measured from the canvas BOTTOM edge (`uRectCenter.y = box.height − reach − contentH/2`), mirroring upstream's `rect.cy = outRect.bottom − boxCenterY`. Measuring from the top flips the whole fire vertically: the ring renders around an empty mirrored box high above the content. (This bit the first port.)
- **`radius` must match the wrapped content's `border-radius`** or the flames will melt into corners they shouldn't, and square content will show flame gaps at its corners.
- **Give the fire headroom**: flames reach ~`height · 0.65` above the content box (plus halo). In a 1080p frame, keep the wrapped card ~350–400px below the top edge or raise `height`/lower `scale` for stubby flames.
- **WebGL2 required**: if the context is unavailable (or the shader fails to compile/link) the component renders the children alone and logs an error — it never crashes a frame. If you see no fire, check the render log for `FlameWrap` errors.
- **The fire canvas is transparent** and sits ABOVE the content; because it is pointer-transparent and alpha-composited, wrapped text stays fully readable — but avoid placing opaque content over the canvas later in the scene (e.g. a following overlay) since the canvas bounds include the reach/glow margins.
- **Noisy on long renders?** `sparks`, `smoke`, and `turbulence` are the expensive knobs; each costs via per-pixel loops (sparks run 2 cell layers). Lower them for fast local previews.
- **Cross-browser caveat**: upstream in a real browser uses html-in-canvas capture; here the fire overlays the content but does NOT burn/scorch the content itself. The visual contract is "content + fire border", not "content consumed by fire".

## Deterministic preview

`preview/preview.tsx` renders an animated `TitleCard` (overline fade → title rise → sub fade) wrapped in fire with `height: 200`, `speed: 0.6`, `radius: 28` (matching the card), orange `#FF5722` flames, sparks and smoke on. `preview/preview.mp4` is the rendered 90-frame output.
