# droplets — rain running down the glass, refracting the content

Deterministic Remotion port of the Canvas UI [`<Droplets>`](https://canvasui.dev/docs/components/droplets) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame and viewed through a rainy window — static drops, running drops with trails, the content refracting along each drop's surface normal, optional background blur and vignette, and an optional color tint.

Unlike glyph-rain/flame-wrap (box wrappers), **DropletsRip fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card.

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM and distorts it along the rain field's surface normals. The GLSL is kept **verbatim** from upstream `Droplets.tsx`; the runtime driver is re-touched for Remotion.
- **Deterministic by construction**: the rain field is a pure hash function of `(uv, time)` — no accumulated state, no pointer input. Upstream runs a `requestAnimationFrame` loop that accumulates `elapsed += delta * speed`; this port draws ONCE per frame with `uTime = (frame / fps) * global.speed * speed`, so frame N always renders identical pixels. There is no frame-to-frame state anywhere in the pipeline.
- **Content capture via native html-in-canvas**: the children render as normal DOM, are moved into a `layoutSubtree` canvas, painted on demand (`requestPaint` + `paint` event), and the paint record is drawn into the canvas backing store with `drawElementImage` — an origin-clean bitmap (the browser painted the DOM itself), uploaded straight into the GL texture via `texImage2D` + `generateMipmap`. Per-frame inline styles are included, so entrance animations are captured as-is. (An SVG `<foreignObject>` blob image would be simpler, but Chrome flags such images as cross-origin and WebGL rejects the upload — tainted canvases may not be loaded.)
- **One page per composition**: a Remotion render does NOT load a fresh page per frame — one page persists and React re-renders each frame. The capture DOM (layoutSubtree canvas + moved scene) is therefore created once and reused, and the texture is refreshed on every frame's freshly painted DOM. Per-frame delays (`delayRender`/`continueRender`) hold the screenshot until the capture + draw completes.
- **The interactive wipe is removed**: upstream keeps a persistent "trail" texture (two ping-pong FBOs) that the cursor wipes through, updated every animation frame with decay. A render has no cursor, so that machinery is dropped and a static 1×1 black texture is bound to `uTrail` with `uWipe = 0` — the wipe terms in the shader zero out mathematically. The `interactive*` options are gone; the shader itself is untouched.
- **Mipmaps**: the shader samples the content with `textureLod` (the `blur` knob fogs the glass), so `generateMipmap()` runs after every upload — an incomplete mip chain samples black.
- **Graceful degradation**: until the texture is ready the canvas is transparent and the plain DOM shows through. A capture failure (WebGL2, html-in-canvas, or the paint never firing) logs an error and leaves the scene untreated — the frame never crashes.
- **uMaxX preserved**: like upstream, content narrower than the frame is rained on only over its own horizontal band (`contentMaxX = content.clientWidth / output.clientWidth`), so the glass does not stretch the scene. For a 16:9 composition with full-frame children, `uMaxX = 1`.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `intensity` | 0.5 | How much rain falls, drizzle to downpour (0–1.25) |
| `speed` | 1 | Animation speed multiplier |
| `scale` | 0.4 | Size of the droplet pattern. Higher means smaller drops |
| `dropWidth` | 1 | Width of the droplets and their trails |
| `dropLength` | 1 | How elongated the falling droplets are |
| `refraction` | 0.2 | How strongly droplets refract the content behind them |
| `blur` | 0 | Background blur outside the droplets, like a fogged up window (0–8) |
| `vignette` | 0 | Darkens the edges of the canvas (0–1) |
| `fallSpeed` | 1 | How fast the running drops slide down |
| `wiggle` | 1 | Horizontal wiggle of the running drops |
| `staticDrops` | 0.2 | Multiplier for the small static droplets |
| `tint` | `[1, 1, 1]` | Tint color layered over the content as [r, g, b] in 0–1 range |
| `tintStrength` | 0 | Strength of the tint (0–1) |
| `fadeInFrames` / `fadeOutFrames` | 0 / 0 | Treatment fade, frames |

Upstream's `interactive`, `interactionRadius`, `interactionStrength`, `interactionDistortion` are intentionally absent — see Model above.

## Pitfalls & notes

- **The scene's colors show through the glass unmodified** (the shader only re-samples them along refracted UVs), so make the wrapped scene's colors *readable behind rain*: high-contrast shapes (lit windows, bright text on dark sky) show refraction best. Low-contrast flat fills make the drops nearly invisible — add `tint`/`tintStrength` for a moody colored glass if needed.
- **`blur` is cheap-looking, not cheap**: it is implemented via `textureLod` mipmaps, so it samples the pre-filtered chain rather than doing per-pixel blur work — but it needs the mipmap upload after every frame, which is already paid for the normal path.
- **`uMaxX` is measured after the page settles**: the layout effect runs before Remotion lays out the page, so early `clientWidth` reads 0 — measuring there would clamp `uMaxX` to its 0.05 minimum and confine the treatment to a ~5% sliver of the frame. The driver defers one macrotask (the page is laid out by then) and falls back to the full band if the measurement still reads 0. Same fix applied to vhs.
- **Keep an opaque background in the wrapped scene**: the canvas is transparent until the first texture is ready, so an opaque scene avoids any flash of transparency in the first frames (the glass fades in over `fadeInFrames` anyway).
- **Performance**: the drop field is evaluated ~3× per pixel (the two normal-offset taps) with ~11 hash calls each, so `intensity` and `staticDrops` weigh the cost; there is no multi-tap bloom like vhs. One WebGL2 draw per frame at 1× resolution (SwiftShader software raster). A 90-frame 1080p preview takes a few minutes; grain-free and cheaper than vhs.

## Deterministic preview

`preview/preview.tsx` renders a night-skyline `WindowScene` (moon, lit buildings, "RAIN ON THE WINDOW" headline with entrance rise) wrapped in Droplets with `intensity: 0.85`, `speed: 1.1`, `refraction: 0.3`, a light `blur: 0.15` fog and `vignette: 0.35`. `preview/preview.mp4` is the rendered 90-frame output.
