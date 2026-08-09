# shatter — the page breaks into 3D glass shards

Deterministic Remotion port of the Canvas UI [`<Shatter>`](https://canvasui.dev/docs/components/shatter) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame and broken into 3D glass shards around a traveling lens — each shard lifts, tips, and floats above the void, casting soft shadows and refracting (with chromatic dispersion) the content beneath it.

Unlike glyph-rain/flame-wrap (box wrappers), **ShatterRip fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card. The scene should be TALLER than the frame so it has real scroll distance (see the preview pattern).

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM and breaks it into shards. The GLSL is kept **verbatim** from upstream `ShatterVanilla.ts`; the runtime driver is re-touched for Remotion.
- **Deterministic by construction — cursor becomes frame**: upstream drives a lens from the pointer (`pointermove` + exponential smoothing + `pointerleave`, `followSpeed`) and runs a `requestAnimationFrame` loop. A render has no cursor, so this port:
  1. drives the lens from a waypoint PATH — `lensPath` is a list of `{ x, y, at }` stops (normalized screen position over composition progress) that the lens follows deterministically with smoothstep timing: the classic cursor sweep is two stops (`-0.25 → 1.25`), a static lens is two identical stops, and any curve is just more stops, and
  2. drives the scroll beneath it: `scrollTo` picks how much of the page's scroll distance the composition covers (`1` = top to bottom, `-1` = bottom to top, `0` = pinned still, `|v| < 1` = a fraction). The html-in-canvas paint record includes the scrolled viewport, so the texture really scrolls, and `uScroll` reports it to the shader exactly like upstream — the tile grid is computed in content space, so the shards stay glued to the page while it scrolls.
  Frame N always produces exactly the same pixels — deterministic, seek-safe.
- **Interactive machinery dropped**: pointer listeners, `followSpeed` smoothing, `IntersectionObserver`, `ResizeObserver`, the rAF loop, `prefers-reduced-motion`, `setOptions`/`destroy` all require a live page with a cursor — none exist in a render, so all are removed. The one-shot `syncCanvasSize` sizing stays, performed once at setup (the composition size never changes mid-render).
- **`uActive` is an envelope, not a presence flag**: upstream's pointer-active flag (and the lens radius scaling by it) becomes a waypoint envelope — `activePath` is a list of `{ at, v }` stops (activation value over composition progress), smoothstepped between stops. The lens can grow in at any progress, hold, and shrink out again — "shatter at 60% and hold" is `[{at:0,v:0},{at:0.6,v:1}]`; "then reform at 80%" adds `{at:0.8,v:0}`. `uBase` (baseStrength) still lifts the whole page if you want it.
- **`time` is composition time, not wall clock**: upstream advances the float time by `delta * floatSpeed` (real elapsed seconds, wrapped at `TIME_WRAP = PI * 800`). The port advances it by `frame * floatSpeed / fps` of composition time and applies the same wrap — the wobble of every shard is a pure function of the frame. (The wobble only scales lifted tiles, so idle frames don't care about the phase.)
- **Content capture via native html-in-canvas**: the children render as normal DOM, are moved into a `layoutSubtree` canvas, painted on demand (`requestPaint` + `paint` event), and the paint record is drawn into the canvas backing store with `drawElementImage` — an origin-clean bitmap (the browser painted the DOM itself), uploaded straight into the GL texture via `texImage2D`. Per-frame inline styles are included — **transforms animate cleanly** (see the entrance pitfall below about opacity). Sampler matches upstream: `LINEAR`/`LINEAR`, `CLAMP_TO_EDGE`, no mipmaps. (An SVG `<foreignObject>` blob image would be simpler, but Chrome flags such images as cross-origin and WebGL rejects the upload — tainted canvases may not be loaded.)
- **One page per composition**: a Remotion render does NOT load a fresh page per frame — one page persists and React re-renders each frame. The capture DOM (layoutSubtree canvas + moved scene) is therefore created once and reused, and the texture is refreshed on every frame's freshly painted DOM. Per-frame delays (`delayRender`/`continueRender`) hold the screenshot until the capture + draw completes.
- **The scrollport scrolls for real**: the wrapped content div carries `overflow: auto` like upstream, and each frame's `content.scrollTop` is applied before the paint is requested, so the captured texture shows the scrolled viewport — the page visibly travels while the shards sweep. The scroll must be a real scroll (not a `translate`): in headless Chrome the html-in-canvas record only rebuilds when the subtree's painted appearance changes, and a compositor-level transform does not dirty the paint — a translate would freeze the texture once the content stops changing. If the content is NOT taller than the frame (no scroll distance), `scrollTop` stays 0 and the lens sweeps over the static page — the effect still demonstrates.
- **The first capture is deferred one frame**: the very first paint of a freshly moved subtree comes out partial in headless Chrome, and it only rebuilds once the content's appearance changes. The output canvas is transparent on frame 0 (nothing is lifted and the lens is still off-screen), so instead of capturing garbage the setup is deferred: frame 0 shows the raw DOM and the first record is built on frame 1 after a double macrotask settle.
- **The composite is shards over DOM**: the canvas is transparent outside the lens (`maskB` early-out) and where no tile acts (`maxAct` early-out), so the intact page shows through; inside the lens the shader outputs the shard layer with opaque `guard`, including the dark `gapColor` voids between lifted shards — the page "falls into the void" exactly like upstream.
- **Graceful degradation**: until the texture is ready the canvas is transparent and the plain DOM shows through. A capture failure (WebGL2, html-in-canvas, or the paint never firing) logs an error and leaves the scene untreated — the frame never crashes.
- **uMaxX preserved**: like upstream, content narrower than the frame is shattered only over its own horizontal band (`contentMaxX = content.clientWidth / output.clientWidth`), so the shards do not stretch the scene. For a 16:9 composition with full-frame children, `uMaxX = 1`.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `radius` | 0.4 | Radius of the shatter lens, relative to the screen height. The lens sweeps horizontally across the frame during the composition (0.01–2) |
| `softness` | 0.6 | Edge feather of the lens as a fraction of the radius (0–1) |
| `tileSize` | 125 | Tile size in CSS pixels (24–600) |
| `shards` | 1 | Shape irregularity. 0 keeps a perfect square grid, 1 breaks the page into uneven glass shards (0–1) |
| `corner` | 0 | Corner rounding of fully lifted tiles in CSS pixels (0–300) |
| `lift` | 30 | How high tiles lift off the page in CSS pixels (0–600) |
| `tilt` | 2 | How steeply tiles tip out of the page plane (0–3) |
| `scatter` | 5 | How far tiles slide sideways while lifted, in CSS pixels (0–300) |
| `perspective` | 1500 | Perspective distance in CSS pixels. Lower is more dramatic (200–5000) |
| `gapColor` | `[0, 0, 0]` | Color of the void behind lifted tiles as `[r, g, b]` in 0–1 range |
| `shadow` | 0.5 | Opacity of the drop shadows under lifted tiles (0–2) |
| `shading` | 0.5 | Strength of the per-tile lighting (0–2) |
| `refraction` | 1.5 | How strongly lifted shards refract the content beneath them, like glass (0–2) |
| `dispersion` | 0.3 | Chromatic fringing of the refraction (0–1). 0 keeps it color-true |
| `floatSpeed` | 2 | Speed of the floating tile motion. 0 freezes the tiles (0–20) |
| `strength` | 1 | How fully tiles lift inside the lens (0–1) |
| `baseStrength` | 0 | Lift amount across the whole screen, outside the lens (0–1) |
| `lensPath` | sweep | Lens center waypoints `{x, y, at}` over composition progress (0–1). y is CSS-style (0 = top, 1 = bottom); x/y outside 0–1 move the lens off-frame for enter/exit. Smoothstepped between stops. Default: left-to-right sweep. Static lens = two identical stops |
| `activePath` | always on | uActive envelope waypoints `{at, v}` over composition progress. v = 0 lens off, 1 fully on; smoothstepped between stops. Grow-in at any progress, hold, reform — all expressible |
| `scrollTo` | 1 | How much of the page's scroll distance the composition covers: 1 top→bottom, -1 bottom→top, \|v\| < 1 a fraction, 0 the page stays still (the lens still works over a static page) |

Upstream's `followSpeed` is intentionally absent — see Model above.

## Typical scenes

- **Full sweep (the default)**: `lensPath: [{x:-0.25,y:0.5,at:0},{x:1.25,y:0.5,at:1}]`, `scrollTo: 1` — the page scrolls while the shatter wave crosses it, reforming behind itself.
- **One card, no scroll, shatters at 3s of a 5s video**: a centered single-card scene (not taller than the frame), `lensPath: [{x:0.5,y:0.5,at:0},{x:0.5,y:0.5,at:1}]` (static center), `scrollTo: 0` (page pinned), `activePath: [{at:0,v:0},{at:0.6,v:1}]` (lens off until 60% = 3s, then fully on and held), tune `radius`/`lift`/`tileSize` to the card. Add `{at:0.8,v:0}` to the envelope to reform the card at 4s.
- **Static lens, live page**: one lens stop anywhere plus `scrollTo: 1` — the page scrolls through a fixed shatter zone.
- **Traveling but never off-frame**: `lensPath: [{x:0.2,y:0.6,at:0},{x:0.8,y:0.4,at:1}]` — a diagonal drift; the lens never leaves the frame, so no entrance is needed (`activePath` can stay at its default).

## Pitfalls & notes

- **The composition is one lens pass over one scroll pass**: `progress = frame / durationInFrames` drives both — the page's scroll coverage and the lens's path both complete exactly once over the composition, shaped by `scrollTo` and `lensPath`. Time your scene (and its entrance animations) for that. There is deliberately no `speed` knob — the motion is tied to the composition itself.
- **Make the scene taller than the frame**: the shards stay glued to the content only if it has scroll distance (`scrollHeight - clientHeight > 0`). In the preview the page is 2240px tall inside a 1080px frame, so the page travels 1160px while the lens crosses. For a non-scrolling scene the lens still sweeps over the static page.
- **The shatter is not a scroller effect — it is a lens effect**: unlike bend, the treatment does not depend on the scroll; `uScroll` exists so the shards stay attached to the page as it moves. A static (non-scrollable) scene shatters just as well.
- **`uMaxX` is measured after the page settles**: the layout effect runs before Remotion lays out the page, so early `clientWidth` reads 0 — measuring there would clamp `uMaxX` to its 0.05 minimum and confine the treatment to a ~5% sliver of the frame. The driver defers one macrotask (the page is laid out by then) and falls back to the full band if the measurement still reads 0. Same fix as vhs/droplets/bend.
- **The lens early-out keeps frames cheap**: pixels outside `lensB` (radius + 3-tile slack) return transparent immediately, so only the lens band runs the 5×5 cell sweep and per-shard inverse-perspective maps. One WebGL2 draw per frame at 1× resolution (SwiftShader software raster) — a 90-frame 1080p preview takes a few minutes, comparable to bend and cheaper than vhs.
- **The wrapped scene must be fully opaque — no per-element opacity fades**: in headless Chrome, content at less than full opacity decays out of the html-in-canvas record: the first record includes it, but every later rebuild fades it further until it disappears entirely — a title fading in vanishes from the texture mid-fade and only returns when its opacity reaches 1. This is not a threshold to tune; any element below `opacity: 1` for more than a frame or two is affected. Entrances inside the scene must use **transforms** (a rise/slide is captured cleanly, verified) or per-line clip/geometry, never opacity; the lens's own entrance is handled by the `activePath` envelope. The preview's headline rise demonstrates the working pattern.
- **`activePath` ramping replaces a treatment fade**: the canvas needs no opacity crossfade of its own — at rest its output is pixel-identical to the DOM beneath it (flat texture over flat page). The lens path + `activePath` envelope handle every entrance; a `tapeFade` like bend's is not needed and would only risk the record-decay pitfall.

## Deterministic preview

`preview/preview.tsx` renders a tall magazine `PageScene` (masthead, "GLASS BREAKS INTO LIGHT" headline with a transform-only rise entrance, two CSS-gradient "photo" blocks, pull quote) wrapped in Shatter with upstream defaults and an explicit `lensPath` sweep + `activePath` envelope that grows the lens in over the first 8 frames and shrinks it out over the last 8 — one pass in 90 frames: the lens enters from the left edge, crosses mid-screen while the page scrolls, and exits off the right edge — shards lift, float, and reform behind the traveling lens. `preview/preview.mp4` is the rendered 90-frame output.
