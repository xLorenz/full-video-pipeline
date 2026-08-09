# bend — the page scrolls on the face of a cube

Deterministic Remotion port of the Canvas UI [`<Bend>`](https://canvasui.dev/docs/components/bend) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame and its top/bottom edges fold over virtual creases — the content appears to scroll on the face of a cube, flattening back out at the scroll ends.

Unlike glyph-rain/flame-wrap (box wrappers), **BendRip fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card. The scene should be TALLER than the frame so it has real scroll distance (see the preview pattern).

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM and bends it over folded edges. The GLSL is kept **verbatim** from upstream `Bend.tsx`; the runtime driver is re-touched for Remotion.
- **Deterministic by construction — scroll becomes frame**: upstream derives the fold amounts from `content.scrollTop` via `syncScroll` (`top = ramp(scrollTop)`, `bottom = ramp(max - scrollTop)` over the `ease` distance) and runs a `requestAnimationFrame` loop with smoothing. A render has no scroll, so this port:
  1. sweeps the scroll deterministically: `progress = clamp01(frame / durationInFrames)` moves `content.scrollTop = progress * max` (the html-in-canvas paint record includes the scrolled viewport, so the texture really scrolls), and
  2. computes the fold amounts from that same scroll position, with `smoothing` snapped (k = 1 — no exponential easing, no frame-to-frame state).
  Frame N always produces exactly the same pixels — deterministic, seek-safe.
- **Interactive machinery dropped**: tumble (overscroll tip / `uPhi`), tilt (pointer lean / `uTiltX/Y`), hover-rule patching, click forwarding, and text-selection remapping all require a pointer — none exists in a render, so all are removed. `uPhi = 0`, `uTiltX = uTiltY = 0`. The shader itself is untouched.
- **Content capture via native html-in-canvas**: the children render as normal DOM, are moved into a `layoutSubtree` canvas, painted on demand (`requestPaint` + `paint` event), and the paint record is drawn into the canvas backing store with `drawElementImage` — an origin-clean bitmap (the browser painted the DOM itself), uploaded straight into the GL texture via `texImage2D` + `generateMipmap`. Per-frame inline styles are included, so entrance animations are captured as-is. (An SVG `<foreignObject>` blob image would be simpler, but Chrome flags such images as cross-origin and WebGL rejects the upload — tainted canvases may not be loaded.)
- **One page per composition**: a Remotion render does NOT load a fresh page per frame — one page persists and React re-renders each frame. The capture DOM (layoutSubtree canvas + moved scene) is therefore created once and reused, and the texture is refreshed on every frame's freshly painted DOM. Per-frame delays (`delayRender`/`continueRender`) hold the screenshot until the capture + draw completes.
- **The scrollport scrolls for real**: the wrapped content div carries `overflow: auto` like upstream, and each frame's `content.scrollTop` is applied before the paint is requested, so the captured texture shows the scrolled viewport — the page visibly travels through the frame while the folds walk. The scroll must be a real scroll (not a `translate`): in headless Chrome the html-in-canvas record only rebuilds when the subtree's painted appearance changes, and a compositor-level transform does not dirty the paint — a translate would freeze the texture once the content stops changing. If the content is NOT taller than the frame (no scroll distance), the fold sweep still runs over a synthetic scroll length (`ease * 4`) so the treatment stays demonstrable — but the texture won't move.
- **The first capture is deferred one frame**: the very first paint of a freshly moved subtree comes out partial in headless Chrome, and it only rebuilds once the content's appearance changes. The output canvas is transparent on frame 0 (treatment fade), so instead of capturing garbage the setup is deferred: frame 0 shows the raw DOM and the first record is built on frame 1 after a double macrotask settle.
- **Mipmaps**: the texture keeps its mipmap chain (`generateMipmap` per upload), matching upstream's `LINEAR_MIPMAP_LINEAR` sampler.
- **Graceful degradation**: until the texture is ready the canvas is transparent and the plain DOM shows through. A capture failure (WebGL2, html-in-canvas, or the paint never firing) logs an error and leaves the scene untreated — the frame never crashes.
- **uMaxX preserved**: like upstream, content narrower than the frame is bent only over its own horizontal band (`contentMaxX = content.clientWidth / output.clientWidth`), so the fold does not stretch the scene. For a 16:9 composition with full-frame children, `uMaxX = 1`.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `zone` | 240 | Height of the folded region at each edge in CSS pixels (8–600) |
| `angle` | 80 | Maximum fold angle in degrees, reached away from the scroll ends. 90 is a cube edge (1–160) |
| `rounding` | 150 | Radius in CSS pixels of the circular arc that rounds each fold crease. 0 keeps a sharp cube edge. Clamped to the zone height (0–600) |
| `perspective` | 700 | Perspective focal length in CSS pixels. Smaller values pinch the folded edges harder (50–3000) |
| `direction` | `"in"` | `"out"` folds the edges away from the viewer like the outside of a cube, `"in"` tilts them toward the viewer |
| `ease` | 240 | Scroll distance in CSS pixels over which an edge flattens near its scroll end (1–1200) |
| `top` | true | Bend the top edge |
| `bottom` | true | Bend the bottom edge |
| `fadeInFrames` / `fadeOutFrames` | 0 / 0 | Treatment fade, frames |

Upstream's `smoothing`, `tumble`, `tilt` are intentionally absent — see Model above.

## Pitfalls & notes

- **The composition is one full scroll pass**: the fold sweep is `frame / durationInFrames` — the video plays the content from top to bottom exactly once. Time your scene (and its entrance animations) for that: content arriving late in the pass is folded at its crease, content at the scroll ends sits flat. There is deliberately no `speed` knob — the sweep is tied to the composition itself.
- **Make the scene taller than the frame**: the fold only travels if the content has scroll distance (`scrollHeight - clientHeight > 0`). In the preview the page is 2240px tall inside a 1080px frame — scroll the whole 1080+px over the pass and the crease walks from bottom to top. For a non-scrolling scene (or one without `overflow: auto`), the texture stays still but the folds still sweep over the synthetic distance.
- **Give the wrapped scene an opaque background**: the fold reveals the background color behind the page — `findBgColor` walks up from the captured element to the first opaque `background-color` (solid `backgroundColor`, not just a gradient — the probe reads the computed background-color, which is transparent for gradient-only elements). A white `body` background makes a white reveal at the crease.
- **The geometric uniforms are normalized against the composition size**, not `output.clientHeight`: the layout effect runs before Remotion lays the page out, so the measured height reads 0 and would NaN the shader. The driver divides `zone`/`perspective`/`rounding`/pixel widths by `compWidth`/`compHeight` instead. Same consideration as the `uMaxX` after-settle measurement.
- **`uMaxX` is measured after the page settles**: the layout effect runs before Remotion lays out the page, so early `clientWidth` reads 0 — measuring there would clamp `uMaxX` to its 0.05 minimum and confine the treatment to a ~5% sliver of the frame. The driver defers one macrotask (the page is laid out by then) and falls back to the full band if the measurement still reads 0. Same fix as vhs/droplets.
- **Folded edges cost more than flat frames**: the crease is traced with a 40-step arc loop per folded pixel (`rounding > 0`), so frames with both edges folded are the slowest; `rounding: 0` uses the cheap analytic branch. One WebGL2 draw per frame at 1× resolution (SwiftShader software raster) — a 90-frame 1080p preview takes a few minutes, comparable to droplets and cheaper than vhs.
- **Entrance animations need visible floors**: headless Chrome skips painting elements whose opacity is below ~0.1 when the record is first built — content entering from opacity 0 paints as a partial record (the page shows with dark holes where the invisible elements would be) until a style change forces a rebuild. Keep entrance floors at 0.1 or higher (the preview's `in1`/`in2` interpolate from 0.1), and if the opening state is constant for several frames make sure the floor is above that threshold for the whole constant stretch.

## Deterministic preview

`preview/preview.tsx` renders a tall magazine `PageScene` (masthead, "PAGES BEND AT THE EDGES" headline with entrance rise, two CSS-gradient "photo" blocks, pull quote) wrapped in Bend with `zone: 260`, `angle: 80`, `rounding: 150`, `ease: 260` — one full scroll pass in 90 frames: bottom crease folded at the start, both folded mid-pass, top crease folded at the end. The entrance interpolates from 0.1 (see the floors pitfall above). `preview/preview.mp4` is the rendered 90-frame output.
