# blaze — fire rises up from the bottom of the frame

Deterministic Remotion port of the Canvas UI [`<Blaze>`](https://canvasui.dev/docs/components/blaze) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame and burned from the bottom up — layered procedural sparks rising in depth, drifting fbm smoke, a warm glow at the base, and heat-distortion noise that bends the content near the fire zone and darkens it under the flames.

Like vhs/droplets/bend/shatter, **BlazeRip fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card. Unlike bend and shatter it does **not** scroll: the scene can be exactly the frame size (the preview's poster is 1920×1080 inside a 1920×1080 comp); the fire rises over it as it stands.

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM and burns it. The GLSL is kept **verbatim** from upstream `BlazeVanilla.ts`; the runtime driver is re-touched for Remotion.
- **Deterministic by construction — there was nothing to determinize but the clock**: upstream Blaze has no pointer, no scroll, no observers — the fire is generated purely from `uTime` (and the captured content) in a `requestAnimationFrame` loop advancing `delta * speed` per frame. A render has no rAF, so the port advances `time = frame * speed / fps` of composition time instead — exactly `delta * speed` at the fixed `delta = 1/fps` a render implies. Frame N always produces exactly the same pixels — deterministic, seek-safe. Nothing interactive existed to drop; no parameter was removed.
- **Two passes, verbatim**: a half-resolution FBO pass generates the fire (`FIRE_FRAG` — voronoi spark cells layered `layers` deep with per-layer parallax, fbm smoke drifting upward, base glow), then the main pass (`FRAG`) samples the fire texture and the content texture: `snoiseOctaves` heat distortion bends the content where the fire is (`heat` falls off with height), the content is darkened by `fire.a * luma` where the flames are bright, the fire rises over it, and the result composites over the DOM. The half-res fire FBO is deliberate — that's where the fire's softness comes from (upstream sizes it `output.width / 2`).
- **Content capture via native html-in-canvas**: the children render as normal DOM, are moved into a `layoutSubtree` canvas, painted on demand (`requestPaint` + `paint` event), and the paint record is drawn into the canvas backing store with `drawElementImage` — an origin-clean bitmap (the browser painted the DOM itself), uploaded straight into the GL texture via `texImage2D`. Per-frame inline styles are included — **transforms animate cleanly** (see the entrance pitfall below about opacity). Sampler matches upstream: `LINEAR`/`LINEAR`, `CLAMP_TO_EDGE`, no mipmaps. The GL context requests `premultipliedAlpha: true` (upstream's own setup). (An SVG `<foreignObject>` blob image would be simpler, but Chrome flags such images as cross-origin and WebGL rejects the upload — tainted canvases may not be loaded.)
- **One page per composition**: a Remotion render does NOT load a fresh page per frame — one page persists and React re-renders each frame. The capture DOM (layoutSubtree canvas + moved scene) is therefore created once and reused, and the texture is refreshed on every frame's freshly painted DOM. Per-frame delays (`delayRender`/`continueRender`) hold the screenshot until the capture + draw completes.
- **The first capture is deferred one frame**: the very first paint of a freshly moved subtree comes out partial in headless Chrome, and it only rebuilds once the content's appearance changes. The output canvas is transparent on frame 0 (treatment fade), so instead of capturing garbage the setup is deferred: frame 0 shows the raw DOM and the first record is built on frame 1 after a double macrotask settle.
- **`uHasContent` is always 1**: the driver only runs the composite path when the capture succeeded, so the fire-over-content branch of the shader is the one that always executes (the fire-only fallback branch exists verbatim upstream for when content fails to load). A capture failure logs an error and leaves the scene untreated — the frame never crashes.
- **The composite is fire over DOM**: inside the fire zone (`uv.y < uHeight`) the fire texture is added over the (distorted, darkened) content; above the zone the content passes through untouched; outside the content band (`uMaxX`) the canvas is transparent and the plain DOM shows through. Fire alpha clamps so the canvas stays composited cleanly.
- **Treatment fade via canvas opacity (the bend pattern)**: unlike shatter — whose rest state is pixel-identical to the DOM — blaze is a continuous overlay, so the port applies `fadeInFrames`/`fadeOutFrames` as a linear tape on the OUTPUT canvas's `opacity` style. This is safe with the html-in-canvas record: the opacity lives on the treated canvas, never inside the captured content.
- **uMaxX preserved**: like upstream, content narrower than the frame is burned only over its own horizontal band (`contentMaxX = content.clientWidth / output.clientWidth`), so the fire does not stretch the scene. For a 16:9 composition with full-frame children, `uMaxX = 1`.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `height` | 0.97 | Height of the fire zone as a fraction of the frame height, rising from the bottom (0.02–1) |
| `distortion` | 0.6 | Heat-distortion strength: how strongly the fire zone bends the content beneath it (0–3) |
| `distortionScale` | 0.5 | Spatial scale of the heat-distortion noise. Lower = larger, softer ripples (0.05–2) |
| `speed` | 1 | Animation speed multiplier. Fire time advances at `speed` seconds per second of composition time; 0 freezes the fire (0–10) |
| `sparks` | 0.5 | Brightness of the rising spark layer; 0 disables sparks entirely (0–2) |
| `sparkDensity` | 1.5 | Density of the spark cells — higher packs more sparks into the same area (0.05–5) |
| `sparkSize` | 1 | Size of the individual sparks (0.05–3) |
| `layers` | 4 | Depth layers of sparks (integer 1–10) — more layers give more parallax and density |
| `smoke` | 0.5 | Intensity of the drifting fbm smoke column; 0 disables smoke (0–2) |
| `glow` | 1.5 | Warm glow intensity at the base of the fire (0–5) |
| `sparkColor` | `[1, 0.4, 0.05]` | Color of the sparks as `[r, g, b]` in 0–1 range |
| `smokeColor` | `[1, 0.43, 0.1]` | Color of the smoke and base glow as `[r, g, b]` in 0–1 range |
| `fadeInFrames` | 0 | Treatment fade-in over the first N frames (canvas-opacity tape — the fire grows in instead of popping) |
| `fadeOutFrames` | 0 | Treatment fade-out over the last N frames (canvas opacity) |

All upstream options are kept — nothing interactive existed to drop.

## Typical scenes

- **Full-frame fire (the default)**: nothing to configure — the fire fills the frame bottom-up with the upstream defaults. Use `fadeInFrames`/`fadeOutFrames` (~10–15 on a 30fps comp) so the video doesn't open or close on a fully-formed fire.
- **A burning bottom band**: `height: 0.25`, `distortion: 0.9` — a low fire strip with strong heat shimmer over, say, a footer or lower-third area; the top of the frame stays pristine.
- **Pure heat mirage, no fire**: `sparks: 0`, `smoke: 0`, `glow: 0`, `distortion: 1.5` — the fire layer goes fully transparent and only the heat-distortion bending remains: a desert-shimmer look over the whole frame.
- **Cold fire / electric mirage**: `sparkColor: [0.2, 0.8, 1]`, `smokeColor: [0.1, 0.4, 0.9]`, `speed: 2` — the same pipeline re-dressed; the luma darkening and distortion still sell the heat.
- **Slow ember flicker**: `speed: 0.35`, `sparks: 0.8`, `glow: 2` — a slow, close ember bed.

## Pitfalls & notes

- **The composition is one burn**: the fire is driven by `time = frame * speed / fps` and nothing else — there is no waypoint, envelope, or scroll parameter. Time your scene (and its entrance animations) for the composition; `speed` scales the fire, not the pacing of any camera.
- **The scene does not need to be taller than the frame**: blaze creates no scrollport at all (unlike bend/shatter — no `scrollTop`, no scroll-to parameter). A frame-sized scene is exactly right; a taller scene simply shows its top part, unscrolled.
- **The wrapped scene must be fully opaque — no per-element opacity fades**: in headless Chrome, content at less than full opacity decays out of the html-in-canvas record: the first record includes it, but every later rebuild fades it further until it disappears entirely — a title fading in vanishes from the texture mid-fade and only returns when its opacity reaches 1. This is not a threshold to tune; any element below `opacity: 1` for more than a frame or two is affected. Entrances inside the scene must use **transforms** (a rise/slide is captured cleanly, verified) or per-line clip/geometry, never opacity. The preview's headline rise demonstrates the working pattern. The treatment's own fade is exempt — it lives on the output canvas, not in the capture.
- **`uMaxX` is measured after the page settles**: the layout effect runs before Remotion lays out the page, so early `clientWidth` reads 0 — measuring there would clamp `uMaxX` to its 0.05 minimum and confine the treatment to a ~5% sliver of the frame. The driver defers one macrotask (the page is laid out by then) and falls back to the full band if the measurement still reads 0. Same fix as vhs/droplets/bend/shatter.
- **The fire pass runs at half resolution by design**: `fireWidth = floor(width / 2)` matches upstream, and the fire's blurry softness comes from that low-res sample — do not "fix" it.
- **`layers` is an integer**: the driver rounds it into 1–10 before upload (`uLayers` is an `int` uniform). `sparkDensity`/`sparkSize`/`distortionScale` floor at 0.05 to keep the noise from collapsing.
- **The fire darkens bright content**: the composite subtracts `fire.a * luma` from the content — bright, high-luma areas under the flames visibly burn out while dark areas stay readable. That's the upstream look, not a bug; structure your lower third with dark tones if you want it legible under the fire.
- **`time` does not wrap**: upstream runs `elapsed * speed` unbounded; the port's `frame * speed / fps` is likewise unwrapped (unlike shatter's wrapped float time). At 30fps a 90-frame preview reaches `t ≈ 3`, exactly as the upstream demo would at 3 seconds — the smoke and spark phases line up with a real burn.
- **Performance**: one WebGL2 draw into a quarter-resolution FBO plus one full-frame composite per frame at 1× internal resolution (SwiftShader software raster), plus one html-in-canvas capture + upload per frame — comparable to bend, cheaper than vhs. A 90-frame 1080p preview takes a few minutes.

## Deterministic preview

`preview/preview.tsx` renders a frame-sized `BurnPoster` (masthead, "THE FIRE STARTS HERE" headline with a transform-only rise entrance, a gradient "pyre" photo, two-column body copy, pull quote) wrapped in Blaze with the upstream defaults tuned only slightly: `height: 0.85` (a clean band of undisturbed poster stays visible across the top), `fadeInFrames: 12`, `fadeOutFrames: 12` (the fire grows in and dies out instead of popping). The composition is 90 frames at 30fps: the fire rises over the whole poster, heat-shimmering the copy, darkening it under the flames, and laying sparks and smoke over it. `preview/preview.mp4` is the rendered output.
