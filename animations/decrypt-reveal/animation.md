# decrypt-reveal — a shape-matched cipher covers the page; a decrypt circle falls through it

Deterministic Remotion port of the Canvas UI [`<DecryptReveal>`](https://canvasui.dev/docs/components/decrypt-reveal) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame and covered by a cipher of random glyphs — each glyph **shape-matched** to the content beneath it (text stays text-like, blocks stay blocks) — and a decrypt circle travels the frame, falling through the cipher to reveal the real content with a flickering, glowing, chromatically aberrated edge.

Like the other treatments, **DecryptRip fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card. Like blaze it does **not** scroll: the scene can be exactly the frame size (the preview's dossier is 1920×1080 inside a 1920×1080 comp); the circle travels over it as it stands.

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM and encrypts it with glyphs matched to its own shapes. The GLSL (`CELL_FRAG`, `MAIN_FRAG`) is kept **verbatim** from upstream `DecryptRevealVanilla.ts`; the runtime driver is re-touched for Remotion.
- **Deterministic by construction — cursor becomes a waypoint path (the shatter customization logic)**: upstream drives the decrypt circle from the pointer (`pointermove`/`pointerleave`, exponential damping over `smoothing` seconds) and runs a `requestAnimationFrame` loop. A render has no cursor, so this port:
  1. drives the circle from a waypoint PATH — `lensPath` is a list of `{x, y, at}` stops (normalized screen position over composition progress) that the circle follows with smoothstep timing, exactly like shatter's lens: the classic sweep is two stops (`-0.25 → 1.25`), a static circle is two identical stops, and any curve is just more stops, and
  2. drives its activation with `activePath` — a list of `{at, v}` stops (0 = fully encrypted, 1 = decrypt circle on), smoothstepped. "Nothing until a reveal at 60%" is `[{at:0,v:0},{at:0.6,v:0},{at:0.62,v:1}]` — hold `v` at 0 up to the trigger, then step (see the shatter docs for the full recipe).
  The exponential damping is **preserved and still deterministic**: `k = 1 - exp(-delta / tau)` with `delta = 1/fps` of composition time (upstream: real rAF deltas), so the circle lags its path exactly like it lags a cursor — `smoothing: 0` tracks the path exactly. Frame N always produces exactly the same pixels — deterministic, seek-safe.
- **Interactive machinery dropped**: pointer listeners, `ResizeObserver`, `IntersectionObserver`, `prefers-reduced-motion` (the `uCrisp` crisp-passthrough branch exists verbatim but never triggers in a render — no reduced-motion emulation), the rAF loop, `setOptions`/`destroy` all require a live page with a cursor — none exist in a render, so all are removed. The one-shot sizing stays, performed once at setup (the composition size never changes mid-render).
- **`time` is composition time, not wall clock**: upstream advances `time += delta` (real seconds) and derives the cipher scramble from `floor(uTime * scrambleSpeed)`. The port advances `time = frame / fps` — same formula, fixed delta, so the scramble, the flicker, and the edge shimmer of frame N are always the same pixels. No wrap (upstream doesn't wrap either).
- **Two passes, verbatim**:
  1. **Glyph-cell pass** (`CELL_FRAG` → a small NEAREST FBO): grids the content texture into cells (`cell` × `cell` px, `aspect`-scaled). Each cell samples 6 probe circles (7 taps each) plus 10 outer circles plus a full ink grid — building a 6-vector shape signature and an ink level/color — picks the glyph whose signature best matches (nearest neighbor against the 6×N shape-signature texture), and writes the cell's average color plus the glyph index (0–255) into the cell texture. Cells below `threshold` stay empty.
  2. **Composite pass** (`MAIN_FRAG`): per pixel — decrypt distance field around the damped pointer (`radius`/`softness`), the flicker band (`edgeWidth`/`edgeFlicker`), scramble rerolls (hash of cell + `floor(uTime * speed)`, faster near the edge), the glyph mask from the mipmapped atlas via `textureGrad`, glyph coloring (monochrome cipher color vs. `colored` vivid content color vs. `edgeTint`/`edgeGlow` on the wavefront), `passthrough` of the real content, chromatic `aberration` of the revealed UI at the edge, and the `e` mix back to real content inside the circle.
- **Glyph atlas built once at setup**: the `charset` is rasterized (monospace stack, `aspect`-scaled cell) into a canvas atlas — uploaded as a mipmapped texture for the glyph masks, plus a 6×N `R32F` texture of per-glyph shape signatures. Deterministic: a pure function of charset + aspect, rebuilt only if those change.
- **Content capture via native html-in-canvas**: the children render as normal DOM, are moved into a `layoutSubtree` canvas, painted on demand (`requestPaint` + `paint` event — the upstream component uses the same mechanism via its `onpaint` hook), and the paint record is drawn into the canvas backing store with `drawElementImage` — an origin-clean bitmap (the browser painted the DOM itself), uploaded straight into the GL texture via `texImage2D`. Per-frame inline styles are included — **transforms animate cleanly** (see the entrance pitfall below about opacity). Samplers match upstream: content `LINEAR`, cells `NEAREST`, shapes `NEAREST`, atlas `LINEAR_MIPMAP_LINEAR`, all `CLAMP_TO_EDGE`. The GL context requests `premultipliedAlpha: false` (upstream's own setup). (An SVG `<foreignObject>` blob image would be simpler, but Chrome flags such images as cross-origin and WebGL rejects the upload — tainted canvases may not be loaded.)
- **One page per composition**: a Remotion render does NOT load a fresh page per frame — one page persists and React re-renders each frame. The capture DOM (layoutSubtree canvas + moved scene) and the entire WebGL state (programs, quad, textures, FBO, glyph atlas, the damped cursor) are created once at setup and reused; the content texture is refreshed with every frame's freshly painted DOM. Per-frame delays (`delayRender`/`continueRender`) hold the screenshot until the capture + draw completes.
- **The first capture is deferred one frame**: the very first paint of a freshly moved subtree comes out partial in headless Chrome, and it only rebuilds once the content's appearance changes. The output canvas is transparent on frame 0 (the decrypt circle is inactive), so instead of capturing garbage the setup is deferred: frame 0 shows the raw DOM and the first record is built on frame 1 after a double macrotask settle.
- **The cipher starts from the t=0 path position**: upstream initializes the pointer far off-screen and snaps it to the cursor on the first `pointermove`; a render's "first pointermove" is frame 0, so the port snaps the damped cursor to the `t=0` lens position at setup and the damping takes over from frame 1.
- **The composite is cipher over DOM**: outside the circle the canvas draws the cipher (glyph masks over the `passthrough`-blended content, tinted toward `background`); inside it draws the real content; above the content band (`uMaxX`) it's transparent and the plain DOM shows through. The canvas alpha (`max(rC.a, mask)` vs `rC.a`) keeps the treated frame cleanly composited over the scene.
- **uMaxX preserved**: like upstream, content narrower than the frame is encrypted only over its own horizontal band (`contentMaxX = content.clientWidth / output.clientWidth`), so the cipher does not stretch the scene. For a 16:9 composition with full-frame children, `uMaxX = 1`.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `radius` | 400 | Decrypt radius around the cursor in CSS pixels (1–2000) |
| `softness` | 0.5 | Feather of the decrypt edge as a fraction of the radius (0–1) |
| `cell` | 10 | Glyph cell height in CSS pixels (integer 4–40). Smaller = finer, denser cipher (and slower) |
| `aspect` | 0.75 | Width of a glyph cell relative to its height (0.35–1.25) |
| `charset` | printable ASCII | Characters the cipher is written in; shapes are matched automatically. Max 255 glyphs |
| `colored` | 1 | How much glyphs keep the color of the UI beneath them; 0 is monochrome (0–1) |
| `color` | `#4ade80` | Cipher color as any CSS color — monochrome glyphs and the decrypt edge tint |
| `brightness` | 1 | Brightness of the cipher glyphs (0.2–3) |
| `legibility` | 1 | Minimum contrast the cipher keeps against the background, so subtle UI stays readable while encrypted (0–1) |
| `contrast` | 1 | Contrast of the glyph shape matching. Higher picks bolder characters (0.3–3) |
| `exposure` | 1 | Exposure applied to the UI before it is matched to glyphs (0.2–3) |
| `scramble` | 0.1 | Fraction of idle cipher cells that keep mutating (0–1) |
| `scrambleSpeed` | 6 | Cipher mutations per second (0–30) |
| `edgeWidth` | 0.2 | Width of the decrypting flicker band as a fraction of the radius (0–1) |
| `edgeFlicker` | 1 | How violently characters flicker while they decrypt (0–1) |
| `edgeGlow` | 2 | Brightness surge of glyphs on the decrypt wavefront (0–3) |
| `edgeTint` | 0.75 | How strongly the wavefront tints toward the cipher color (0–1) |
| `aberration` | 10 | Chromatic aberration of the revealed UI at the decrypt edge in CSS pixels (0–200) |
| `passthrough` | 0.15 | How much of the real UI shows through the cipher; 0 keeps the page fully encrypted (0–1) |
| `threshold` | 0.025 | Contrast against the background above which a cell counts as UI and earns a glyph (0.005–1) |
| `background` | `#000000` | Color of the backdrop behind the content, as any CSS color — tells UI pixels apart from empty space. **Match this to the scene's backdrop** |
| `smoothing` | 0.2 | Seconds the decrypt circle takes to catch up with the path (exponential damping). 0 tracks `lensPath` exactly (0–2) |
| `lensPath` | sweep | Decrypt circle center waypoints `{x, y, at}` over composition progress (0–1). y is CSS-style (0 = top, 1 = bottom); x/y outside 0–1 move the circle off-frame for enter/exit. Smoothstepped between stops, damped by `smoothing`. Default: left-to-right sweep. Static circle = two identical stops |
| `activePath` | always on | Activation envelope waypoints `{at, v}` over composition progress. v = 0 fully encrypted, 1 decrypt circle on; smoothstepped between stops, damped by `smoothing`. Grow-in at any progress, hold, reveal — all expressible |

All upstream options are kept; the pointer/loop machinery is replaced by the waypoint model (nothing else existed to drop).

## Typical scenes

- **Full sweep (the default)**: `lensPath: [{x:-0.25,y:0.5,at:0},{x:1.25,y:0.5,at:1}]`, `activePath: [{at:0,v:0},{at:0.05,v:1}]` — the frame opens fully encrypted, the decrypt circle grows in at the left edge and sweeps to the right, revealing the page and staying on.
- **One focused reveal at 3s of a 5s video**: a static centered circle (`lensPath: [{x:0.5,y:0.5,at:0},{x:0.5,y:0.5,at:1}]`) with a hold-off `activePath` — `[{at:0,v:0},{at:0.6,v:0},{at:0.62,v:1}]` — the circle blooms at exactly 3s (keep `v:0` up to the trigger, then step; the step is eased), optionally closing back down with a later `{at:0.8,v:0}`.
- **A traveling spotlight**: `lensPath` with any curve, `smoothing: 0` for a steady trail of reveal, or `smoothing: 0.3`+ for a heavy, languid cursor feel.
- **Typewriter drip**: `cell: 6`, `radius: 90`, `scramble: 0.4`, `scrambleSpeed: 20`, `edgeFlicker: 1` — a tiny churning window that decrypts letter by letter as it crawls along a line of text.
- **Redacted / burned document**: `colored: 0`, `color: "#4ade80"`, `passthrough: 0` — a fully green, shape-matched redaction over the whole frame with no reveal (`activePath` off or a tiny circle).

## Pitfalls & notes

- **The composition is one reveal pass**: `progress = frame / durationInFrames` drives the circle's path and activation — both complete exactly once over the composition, shaped by `lensPath`/`activePath` and damped by `smoothing`. Time your scene (and its entrance animations) for that. The cipher scramble runs continuously on composition time — it does not re-roll on any timeline.
- **The scene does not need to be taller than the frame**: decrypt-reveal creates no scrollport at all (unlike bend/shatter — no `scrollTop`, no scroll-to parameter). A frame-sized scene is exactly right.
- **Set `background` to the scene's backdrop color**: the shader decides which cells earn a glyph by contrast against `background`. A mismatch (e.g. default `#000000` over a `#0B0F0C` scene) makes faint empty-space cells near the bottom of the palette look "lit" and earns them stray glyphs. The preview matches `background: "#0B0F0C"` to its dossier.
- **The wrapped scene must be fully opaque — no per-element opacity fades**: in headless Chrome, content at less than full opacity decays out of the html-in-canvas record: the first record includes it, but every later rebuild fades it further until it disappears entirely — a title fading in vanishes from the texture mid-fade and only returns when its opacity reaches 1. This is not a threshold to tune; any element below `opacity: 1` for more than a frame or two is affected. Entrances inside the scene must use **transforms** (a rise/slide is captured cleanly, verified) or per-line clip/geometry, never opacity. The preview's headline rise demonstrates the working pattern. (The cipher itself needs no canvas fade — `activePath` is the entrance.)
- **`uMaxX` is measured after the page settles**: the layout effect runs before Remotion lays out the page, so early `clientWidth` reads 0 — measuring there would clamp `uMaxX` to its 0.05 minimum and confine the treatment to a ~5% sliver of the frame. The driver defers one macrotask (the page is laid out by then) and falls back to the full band if the measurement still reads 0. Same fix as vhs/droplets/bend/shatter/blaze.
- **The damping is real — plan the sweep for it**: with `smoothing` at its default 0.2 and 30fps, `k ≈ 0.15` per frame — the circle lags its path like a heavy cursor and settles late at the end of a sweep. If the reveal must reach the far edge exactly, lower `smoothing` (0.05–0.1) or extend the path past the edge (the default `1.25` exit exists precisely for this).
- **Cell pass cost scales with cell size**: the glyph-cell pass does ~180 texture taps per cell, so cell 10 over 1080p (~192×108 cells ≈ 20k cells) is the most expensive cell pass of any port. Raise `cell` for software renders (the preview uses 16: ~120×68 cells, comparable to blaze) and reserve fine cells for short or small-frame compositions.
- **The atlas is built once at setup**: rasterizing 95 glyphs + computing 6-vector signatures is a few hundred milliseconds — cheap in a long render, invisible in the output (the atlas canvases are never in the frame).

## Deterministic preview

`preview/preview.tsx` renders a frame-sized `Dossier` (status bar, "PROJECT DECRYPT" headline with a transform-only rise entrance, a REDACTED block, two columns of dense mono copy, a KEY MATERIAL section, footer) wrapped in DecryptRip with the upstream defaults tuned slightly: `radius: 440`, `cell: 16` (software-render tractability), `scramble: 0.15`, `aberration: 12`, `background: "#0B0F0C"` (the dossier's exact backdrop), `smoothing: 0.12`, an explicit `lensPath` sweep, and an `activePath` that grows the decrypt circle in over the first ~5 frames. The composition is 90 frames at 30fps: the frame opens fully encrypted, the circle blooms at the left edge and sweeps right — the cipher churning and flickering at its edge as the dossier reveals beneath it. `preview/preview.mp4` is the rendered output.
