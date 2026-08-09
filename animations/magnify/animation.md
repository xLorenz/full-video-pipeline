# magnify — a scripted cursor magnifies the page

Deterministic Remotion port of the Canvas UI [`<Magnify>`](https://canvasui.dev/docs/components/magnify) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame (mipmapped) and magnified inside a traveling lens — with chromatic aberration, an inner haze, a HUD reticle, and click ripples that bend the page.

Unlike glyph-rain/flame-wrap (box wrappers), **Magnify fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card. The scene should be exactly the composition size (or larger — magnify does NOT scroll, so anything below the fold is simply off-screen).

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM and magnifies it inside the lens. The GLSL is kept **verbatim** from upstream `MagnifyVanilla.ts`; the runtime driver is re-touched for Remotion.
- **Deterministic by construction — cursor becomes script**: upstream drives the lens from the pointer (`pointermove` + exponential smoothing + `pointerleave`/`pointerdown`) and runs a `requestAnimationFrame` loop. A render has no cursor, so this port drives the lens from a **scripted cursor model** — `extras.cursor` — and reproduces the upstream smoothing exactly with a fixed `delta = 1/fps`. Frame N always produces exactly the same pixels — deterministic, seek-safe.
- **Interactive machinery dropped**: pointer listeners, wheel zoom (`scrollZoom`/`zoomModifier` — no wheel in a render; zoom is driven by clicks), `IntersectionObserver`, `ResizeObserver`, `prefers-reduced-motion`, the rAF loop, `setOptions`/`destroy`. The one-shot sizing stays, at the composition size (it never changes mid-render).

### The cursor model (`extras.cursor`) — scene-time script

```
progress ──► 0                         enter   m1.at   m2.at   m3.at  leave
              │                          │       │       │       │      │
  start ──────┼──────────────────────────┴───────┴───────┴───────┴──────┼──►
              │ holds at start      │ eased move 1 │ eased move 2 │ hold at last
              │ while enter < p < m1.start   (absolute x/y)   (relative dx/dy)
```

- **`start`** — where the cursor sits at progress 0 (normalized 0-1 of the frame; outside the frame is fine for an off-screen entrance). Default `{x: 0.5, y: 0.5}`.
- **`enter` / `leave`** — composition progress (0-1) at which the lens fades in/out. Upstream's pointer-enter/leave presence becomes these two numbers; the presence itself ramps with the upstream exponential smoothing (`kScale = 1 - exp(-delta * 11)`), so the lens still "walks in".
- **`moves`** — the ordered cursor moves; list order IS the chain (relative moves resolve against the previous arrival), so keep `at` increasing:
  - `to` — the destination: **absolute** `{x, y}` (normalized 0-1, y CSS-style 0 = top) or **relative** `{dx, dy}` (offsets from the previous arrival, in frame fractions). Absolute wins on conflict; a missing axis keeps the previous value. A single `{x: 0.5, y: 0.5}`-style move is a static lens.
  - `at` — composition progress when the cursor's TARGET **arrives** at `to`.
  - `start` — optional progress when the move *begins* (default: the previous move's `at`, 0 for the first). A gap between the previous `at` and this `start` = the cursor **pauses** at the previous arrival.
  - `ease` — the non-linear movement function for the segment: any of the global `easingName` names (`ease-out-quint`, `ease-out-back` …). Default `ease-out-cubic`.
  - `bezier` — optional `[x1, y1, x2, y2]` cubic-bezier easing, overrides `ease` — any arbitrary non-linear curve (x1/x2 should stay 0-1; y may overshoot, e.g. `[0.34, 1.56, 0.64, 1]` for a spring).
  - `click` — optional; a click that fires when the cursor **reaches the position** (at this move's `at`).
- **`clicks`** — optional standalone clicks, independent of the moves: `at` (required), `hold` (seconds held), `release` (seconds to ease the magnification back), `count` (2 = double-click), `zoom` (punch multiplier while held), `ripple` (emit the ripple ring).
- **A click presses the lens**: the magnification punches from `zoom` up to `zoom × click.zoom` (clamped to the upstream 1-4 range) while held, eases back over `release`, and — like upstream's `pointerdown` — emits a ripple ring at the cursor that bends the page as it travels. `moves[i].click` without an `at` fires on arrival (the "click when it reaches the position" pattern); a standalone click fires anywhere.
- **The target vs the cursor**: the eased segment path is the TARGET; the actual cursor damped toward it with the upstream follow formula (`kPos = 1 - exp(-delta * (4 + follow * 26))`). `follow: 1` snaps (no lag); lower values give the soft trailing feel of a real cursor. Clicks trigger off the target's arrival — deterministic regardless of `follow`.
- **Static cursor**: no `moves` (or empty) = the cursor holds at `start` for the whole composition. Add a click for a "hover and click" shot.

### Determinism notes

- `time = frame / fps` everywhere: the damping step (`delta = 1/fps`, exactly the frame rate — upstream caps real deltas at 1/30), ripple `age`, the zoom release curve, and the readout blink (`floor(time * 1000 / 600) % 2`).
- Ripples spawn exactly when a press's time crosses a frame boundary; up to 6 live (`MAX_RIPPLES`, upstream), oldest dropped; each ages out after `rippleLife`.
- The cursor simulation lives in a ref and advances **exactly one step per frame** inside the layout effect (the same per-frame-effect pattern as the shatter capture) — a pure function of the config and the frame number.
- Content capture via native html-in-canvas: children render as normal DOM, move into a `layoutSubtree` canvas, paint on demand (`requestPaint` + `paint`), `drawElementImage` copies the origin-clean record into the backing store, `texImage2D` uploads, `generateMipmap` builds the mip chain — the shader's `textureLod` picks the soft mip levels for the haze (sampler: `LINEAR_MIPMAP_LINEAR`, verbatim upstream). Per-frame inline styles are included — **transforms animate cleanly** (see the entrance pitfall below about opacity).
- One page per composition (no fresh page load per frame): the capture DOM and the sim are created once and reused; per-frame `delayRender`/`continueRender` hold the screenshot until the capture + draw completes.
- The first capture is deferred one frame: the first paint of a freshly moved subtree comes out partial in headless Chrome, and it only rebuilds once the content's appearance changes — frame 0 shows the raw DOM and the first record is built on frame 1 after a double macrotask settle (same fix as vhs/droplets/bend/shatter).
- The composite is lens over DOM: the canvas is transparent outside the lens and where `uHasContent` is empty (the HUD-only branch), so the intact page shows through; inside the lens the shader outputs the magnified page. The **readout is a live DOM overlay** beside the lens (upstream does the same) — deterministic because its content is frame time.
- Graceful degradation: until the texture is ready the canvas is transparent and the plain DOM shows through. A capture failure (WebGL2, html-in-canvas, or the paint never firing) logs an error and leaves the scene untreated — the frame never crashes.
- `uMaxX` preserved: content narrower than the frame is magnified only over its own horizontal band. For a 16:9 composition with full-frame children, `uMaxX = 1`.
- Scissor optimization kept: with no ripple alive the draw is scissored to the lens band + ripple margin (the upstream trick), so idle frames only rasterize the lens area.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `size` | 140 | Lens radius in CSS pixels (20–600) |
| `zoom` | 1.5 | Magnification inside the lens (1–4) |
| `color` | `[0.8, 0.8, 0.8]` | HUD accent color `[r, g, b]` in 0–1. Tints the reticle, readout, and ripple outline |
| `follow` | 0.25 | How quickly the lens follows the cursor script (0–1). 1 snaps to the eased path |
| `hud` | 0.8 | Overall HUD intensity (0–1). 0 hides every reticle element |
| `ring` | true | Show the outer ring |
| `crosshair` | true | Show the crosshair lines through the center |
| `ticks` | true | Show the tick marks around the ring |
| `brackets` | true | Show the corner brackets inside the lens |
| `dot` | true | Show the center dot |
| `grid` | false | Show a faint measurement grid inside the lens |
| `readout` | true | Show the data readout beside the lens (X/Y/zoom/size + blinking dot) |
| `aberration` | 0.8 | Chromatic aberration split inside the lens (0–3). 0 disables it |
| `haze` | 0.2 | Dreamy insight haze inside the lens (0–1) |
| `ripples` | true | Emit a ripple across the page on click |
| `rippleSpeed` | 900 | How fast the ripple wavefront travels, in CSS px/s (50–3000) |
| `rippleWidth` | 2 | Thickness of the colored ripple outline in CSS px |
| `rippleBendWidth` | 100 | Width of the band the ripple bends, in CSS px |
| `rippleBend` | 20 | How many CSS px the ripple bends the page |
| `rippleGlow` | 1 | Strength of the colored ripple outline (0–2). 0 hides it |
| `rippleLife` | 1.4 | Seconds a ripple lives before it fades out |
| `cursor` | static center | The scripted cursor — see the Model section above for the full shape |

Upstream's `scrollZoom`/`zoomModifier` are intentionally absent — there is no wheel in a render; zoom is driven by clicks.

## Typical scenes

- **Travel + click on arrival (the "click when it reaches the position" pattern)**: a move whose `to` is the thing to click, with a nested `click` — `{to: {x: 0.52, y: 0.36}, at: 0.52, ease: "ease-out-cubic", click: {hold: 0.1, release: 0.08, zoom: 1.6}}`. The cursor reaches the position and clicks: ripple + magnification punch.
- **Relative chain**: script a path without knowing absolute coordinates — `moves: [{to: {dx: 0.3, dy: 0}, at: 0.4}, {to: {dx: 0, dy: 0.25}, at: 0.8}]` walks the cursor right, then down, step by step.
- **Pause + double-click**: a move arriving at 0.5 followed by a move with `start: 0.65` (the cursor rests at the arrival 15% of the composition), then a standalone `clicks: [{at: 0.62, count: 2}]` — two ripples, two punches, while the cursor rests.
- **Hold-shot on a detail**: no moves, `cursor: {start: {x: 0.5, y: 0.5}}`, `follow: 1`, a click at 0.4 — a fixed lens hovering a spec, clicking at the right moment.
- **Off-frame walk-on/walk-off**: `start: {x: -0.2, y: 0.5}` (or a first `to` at x < 0) with `enter` at 0.05, last move `to: {x: 1.2, y: 0.5}` with `leave` at 0.95 — the lens walks in from the left and out to the right, like the classic demo.

## Pitfalls & notes

- **The composition is one cursor script**: `progress = frame / durationInFrames` drives the whole cursor timeline — the moves complete at their `at` fractions regardless of composition length. Time the scene (and its entrance animations) around the script; there is deliberately no `speed` knob.
- **Keep `at` increasing**: relative moves resolve against the previous arrival, so the list order is the chain order. A move with `at` earlier than the previous move's `at` produces an overlap — first match wins; don't do it.
- **The cursor script drives the target; `follow` smooths it**: with `follow < 1` the visible lens trails the eased path and converges onto each destination over ~10–15 frames. Clicks fire on the target's arrival (deterministic), so a click at a move's `at` happens as the lens lands — for a hard "arrive and click at the same instant" feel, use `follow: 1`.
- **The wrapped scene must be fully opaque — no per-element opacity fades**: in headless Chrome, content at less than full opacity decays out of the html-in-canvas record: the first record includes it, but every later rebuild fades it further until it disappears entirely. Entrances inside the scene must use **transforms** (the preview's headline rise is verified) or per-line clip/geometry, never opacity; the lens's own entrance is handled by `cursor.enter`/`leave`.
- **`enter`/`leave` ramping replaces a treatment fade**: the canvas needs no opacity crossfade of its own — at rest its output is pixel-identical to the DOM beneath it (flat texture over flat page, lens hidden at `presence ≤ 0.004`). The cursor's presence envelope handles every entrance.
- **The readout overlay can stray in unusual compositions**: it positions itself beside the lens and flips to the other side near the frame edge, exactly like upstream. It lives OUTSIDE the captured content (a real DOM overlay, above the canvas), so it is always crisp.
- **The scene is a static page**: unlike bend/shatter, magnify does not scroll — the lens travels over the frame. For a scrolling demo, wrap a taller scene inside a scrollable container yourself and drive `scrollTop` per frame (the capture includes the scrolled viewport, since it re-paints every frame).
- **Idle frames are cheap**: no ripple alive → the draw is scissored to the lens band + 160px margin (the upstream optimization). One WebGL2 draw per frame at 1× resolution (SwiftShader software raster); the 120-frame 1080p preview takes a few minutes, comparable to shatter.

## Deterministic preview

`preview/preview.tsx` renders a 16:9 magazine spread (`SpreadScene`: masthead, "SEE CLOSER" headline with a transform-only rise entrance, a gradient photo block, a dark optical spec sheet with tiny mono rows) wrapped in Magnify with the full cursor script — lens fades in at the left edge, sweeps to the headline (ease-out-quint), **clicks the headline on arrival** (ripple + zoom punch), makes a **relative** ease-out-back move down to the spec sheet, and a standalone **double-click** at 82% fires two ripples with two punches before the lens fades out at 97% — one pass in 120 frames. `preview/preview.mp4` is the rendered output.
