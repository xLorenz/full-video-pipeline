# vhs — worn-tape CRT treatment over arbitrary content

Deterministic Remotion port of the Canvas UI [`<VHS>`](https://canvasui.dev/docs/components/vhs) WebGL component (canvasui.dev, MIT + Commons Clause). A full-frame treatment: whatever the caller puts in `children` is captured each frame and played back through a worn-tape shader — slow horizontal wave, per-line jitter, a travelling crease band, bottom head-switching noise, horizontal chroma bloom with RGB aberration, a rolling brightness beat, animated grain, CRT scanlines, vignette, and optional tube barrel curvature.

Unlike glyph-rain/flame-wrap (box wrappers), **Vhs fills the composition** and processes the ENTIRE scene — wrap your whole frame, not a card.

## When to use

Reach for this when your scene's `visual_notes` says something like:
- "found footage / demo tape"
- "retro tech commercial"
- "90s broadcast flashback"

Don't use it for subtle film grain alone (use a light touch below instead). The wrapped scene MUST have an opaque background — the shader probes up from the captured element for the CRT bezel color.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Vhs } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-10-vhs.json";

export const Scene10: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill style={{ backgroundColor: "#0A0A0E" }}>
    <Vhs config={config}
      styles={{colors: COLORS, fonts: FONTS}}
      fontSizes={FONT_SIZES}>
      <MyTapeScene />
    </Vhs>
  </AbsoluteFill>
);
```

`scene-10-vhs.json`:
```json
{
  "global": { "speed": 1.0 },
  "extras": { "wave": 1.3, "grain": 0.4, "scanlines": 0.4 }
}
```

## Recognized element ids

None — children-wrapper. `elements[]` is ignored; pass content as `children`.

## Model

- **The treatment IS the content**: the shader samples a texture of the wrapped DOM. The GLSL is kept **verbatim** from upstream `VHSVanilla.ts`; the runtime driver is re-touched for Remotion.
- **Content capture via native html-in-canvas**: the upstream component captures its children with Chrome's `drawElementImage` + layoutSubtree mechanism, and the headless render shell supports it too. The children render as normal DOM, are moved into a `layoutSubtree` canvas, painted on demand (`requestPaint` + `paint` event), and the paint record is drawn into the canvas backing store with `drawElementImage` — an origin-clean bitmap (the browser painted the DOM itself), uploaded straight into the GL texture via `texImage2D`. Per-frame inline styles are included, so entrance animations are captured as-is. An SVG `<foreignObject>` blob image would be simpler, but Chrome flags such images as cross-origin and WebGL rejects the upload with a `SecurityError` — tainted canvases may not be loaded (`--disable-web-security` does not clear it). The canvas stays on the page underneath the treated canvas: until the first texture is ready, the raw scene shows through.
- **One page per composition**: a Remotion render does NOT load a fresh page per frame — one page persists and React re-renders each frame. The capture DOM (layoutSubtree canvas + moved scene) is therefore created once and reused, and the texture is refreshed on every frame's freshly painted DOM (timecode, blinking REC, fade-ins all animate inside the tape). Per-frame delays (`delayRender`/`continueRender`) hold the screenshot until the capture + draw completes.
- **Determinism**: the upstream engine accumulates `time += delta * speed` in a `requestAnimationFrame` loop; this port draws ONCE per frame with `uTime = (frame / fps) * global.speed * speed`. The shader — a pure function of its uniforms — always renders identical pixels for frame N.
- **Graceful degradation**: until the texture is ready the canvas is transparent and the plain DOM shows through. A capture failure (WebGL2, html-in-canvas, or the paint never firing) logs an error and leaves the scene untreated — the frame never crashes.
- **uMaxX preserved**: like upstream, content narrower than the frame is sampled only over its own horizontal band (`contentMaxX = content.clientWidth / output.clientWidth`), so the effect does not stretch the scene. For a 16:9 composition with full-frame children, `uMaxX = 1`.

## Parameters (`extras.*`, schema-bounded)

| Key | Default | Meaning |
| --- | --- | --- |
| `speed` | 0.5 | Playback speed of the tape artifacts (1 = normal) |
| `wave` | 1 | Slow horizontal tape wave (0–3) |
| `jitter` | 0.25 | Fine per-line horizontal jitter (0–3) |
| `crease` | 0.1 | Travelling tape crease band (0–3) |
| `switching` | 0.05 | Head-switching noise at the bottom (0–3) |
| `switchingHeight` | 0.02 | Head-switching band height as a screen fraction |
| `bloom` | 0.4 | Horizontal glow bleed (0–1) — **expensive: 11 texture taps/pixel** |
| `aberration` | 2 | RGB channel misalignment in CSS px (0–20) |
| `acBeat` | 1 | Slow brightness beat rolling down the frame (0–1) |
| `grain` | 0.1 | Animated static grain (0–1) |
| `scanlines` | 0.1 | CRT scanline overlay (0–1) |
| `vignette` | 0 | Corner darkening (0–1) |
| `barrel` | 0 | CRT tube curvature bending the frame inward (0–1). 0 disables |
| `saturation` | 1 | Color saturation (0 grayscale – 2 punchy) |
| `exposure` | 1 | Final brightness multiplier (0–3) |
| `fadeInFrames` / `fadeOutFrames` | 0 / 0 | Treatment fade, frames |

## Customization recipes

### Subtle aging (period flavor, full legibility)
```json
{ "extras": { "wave": 0.5, "jitter": 0.1, "grain": 0.15, "scanlines": 0.15, "aberration": 1 } }
```

### Destroyed tape (barely holding tracking)
```json
{ "extras": { "jitter": 1.0, "crease": 0.8, "switchingHeight": 0.08, "aberration": 5 } }
```

### CRT letterbox (clean tube look)
```json
{ "extras": { "barrel": 0.3, "vignette": 0.6, "saturation": 0.9 } }
```

## Pitfalls & notes

- **Give the wrapped scene an opaque background** if you enable `barrel` — the bezel color shown at the curved edges is probed by walking up from the captured element to the first opaque `background-color` (solid `backgroundColor`, not just a gradient — the probe reads the computed background-color, which is transparent for gradient-only elements). A white `body` background makes a white bezel.
- **`uMaxX` is measured after the page settles**: the layout effect runs before Remotion lays out the page, so early `clientWidth` reads 0 — measuring there would clamp `uMaxX` to its 0.05 minimum and confine the treatment to a ~5% sliver of the frame. The driver defers one macrotask (the page is laid out by then) and falls back to the full band if the measurement still reads 0.
- **Fonts**: the capture renders text with the same font stack as the live DOM (same engine), so whatever the scene shows in the DOM shows in the tape. If a webfont loads late, the first frames may capture a fallback — keep system fonts in the stack.
- **The DOM copy sits underneath the canvas**: with `barrel: 0` and an opaque scene, the canvas fully covers it. With `fadeInFrames`/`fadeOutFrames`, the tape visibly materializes over the raw scene — intentional.
- **Performance**: the effect is one full-frame GL draw per frame at 1× resolution (SwiftShader software raster). `bloom` multiplies texture sampling by ~11×; drop it for fast local previews. A 90-frame 1080p preview takes a few minutes.
- **`uMaxX` + barrel interplay**: with barrel enabled, content narrower than the frame gets the tube applied over its own band, like a CRT showing a letterboxed feed.

## Deterministic preview

`preview/preview.tsx` renders a retro `TapeScene` (CH/SP HUD, REC dot, "DEMO TAPE" title with progress bar, transport controls) wrapped in VHS with `speed: 0.9`, heavy wave/jitter/crease/switching, bloom + 3px aberration, grain, scanlines, vignette and `barrel: 0.14`. `preview/preview.mp4` is the rendered 90-frame output.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8. The preview passes an opaque `TapeScene` (CH/SP HUD, REC dot, transport controls) as `children` — transparency would break the bezel-color probe.
