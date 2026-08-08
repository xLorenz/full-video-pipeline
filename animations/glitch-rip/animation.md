# Glitch rip

Broadcast-style glitch bursts tear the source content into shifted horizontal slices, with RGB chromatic split, corrupted block jitter, scanline flicker, and analog grain — then the overlay hard-cuts off, revealing the untouched source underneath. A **deterministic, GPU-free re-implementation** of the Canvas UI "Glitch" look, computed per frame (no WebGL, no `requestAnimationFrame`, no CSS animations) so it renders frame-exact through Remotion on a t3.micro.

## Children-wrapper model

`<GlitchRip>` is a **wrapper, not a content owner**. Pass your own Remotion component(s) as `children` and the template overlays glitch bursts above them:

```tsx
<GlitchRip config={config} styles={{ colors, fonts }}>
  <YourTitleCard />
</GlitchRip>
```

Layer order (lowest → highest):

1. **Source** — your `children`, rendered unmodified and **always visible**. The glitch is an effect, never a substitute.
2. **Banded clone** — three per-band clones of the SAME `children` (R/G/B channel tints, offset ± `rgbShiftPx`, sharing one per-band tear plan) with `mix-blend-mode: screen`, so the channels recombine into one chromatic-aberrated copy of your content.
3. **Scanline + grain** — white-mix screen + alternating white/black stripes at `overlay` blend.

When the burst ends, the overlay hard-cuts to opacity 0 — there is NO fade-out — so the original `children` snaps back into view instantly, exactly like the shader's `e = 0` frame where only the unmodified source samples. A short `quietFadeFrames` fade-IN at burst onset softens the entry so it doesn't jolt.

## When to use

Reach for this when your scene's `visual_notes` reads like:
- "broadcast interruption / news opener"
- "signal lost → signal found" reveal
- "cyberpunk data corruption" title beat
- "uptime graph flickered, then crashed" frame
- hook / cliffhanger mid-roll to imply an out-of-band event

Don't use it for: a full-scene VHS overlay across the whole video (use the foundation primitives for that, or build a scene-specific SVG mask), or anything that needs the actual Canvas UI fluid refractive look (this template is the *glitch* look only — Canvas UI's WebGL components stay un-ported; see "Pitfalls" below).

## Why this is a port, not a wrap

Canvas UI ships the source via `npx shadcn add @canvas-ui/glitch-react`. The original component paints via WebGL2 + html-in-canvas (`CanvasDrawElement`, Chrome ≥148 in origin trial) and feeds its shader `time = performance.now()`. Neither is determinable on Remotion: the WebGL path needs a Chrome 148 binary and a `puppeteerInstance` (not exposed by Remotion's CLI), and the real-time RAF timeline can't be stepped to frame N. So this template takes **the visual design** of the Canvas UI glitch (slice tears + RGB split + corrupted blocks + scanline + grain) and **re-implements it in JS driven by `useCurrentFrame()`**, keeping the same per-band hash and seed cadence so the visual reads as the same effect — but it's pure DOM, plays anywhere Remotion renders (including SwiftShader on a t3.micro), and rates bit-for-bit reproducible frame N every render. The Canvas UI `<Glitch>` is the design reference; **this template is not a wrapper around Canvas UI**.

## Choreography (built-in rhythm)

The template composes six beats; the underlying content is the hero, the glitch is the interruption:

1. **Quiet** (between bursts) — the unmodified source content sits at full opacity. No `quietOpacityFloor` knob anymore: the source is never hidden by the template, only by the burst overlay above it.
2. **Attack** (`attackRatio` of `burstDurationSeconds`, default 18% × 0.5s ≈ 5 frames @ 30fps) — envelope eases 0 → 1 with `ease-out-cubic`. Slices tear, RGB split ramps from 0, blocks and grain become visible.
3. **Decay** (remaining 82% of the burst window) — envelope eases 1 → 0 with `ease-out-cubic`. The page reassembles.
4. **Hard cut** — the frame after `decayF` + `postBurstHoldFrames`, the overlay layers hit opacity 0 immediately. No fade-out darkening. The original `children` is simply revealed.
5. **Repeat** — the next burst starts at frame `(N+1) * intervalF`. Burst schedule is **derived purely from the absolute frame index**: `burstStart(idx) = delayOffset + idx * intervalF`, so every render reproduces the same burst pattern.
6. **Constant interrupt** — set `intervalSeconds: 0` for a continuous glitch with no quiet beats. Each frame re-seeds the per-band hash so the page keeps churning; this is loud and best for sub-2s shots only.

A small `quietFadeFrames` (default 4) ramps the overlay opacity in at the very start of each burst's attack so the transition into the burst doesn't read as a hard-edge switch. It only affects fade-IN; the cut at the end is always instant.

The per-band tear value is driven by `sliceSeed = deterministicSeed + Math.floor(frame * 24 / fps)` — the same temporal cadence Canvas UI uses for its `uSeed` uniform (it floors `time * 24`), so the tear pattern has the same granularity as the shader, but seeded from the Remotion frame index instead of real time.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { GlitchRip } from "../components/animations";
import { COLORS, FONTS } from "../lib/styles";
import config from "../scene-assets/scene-02-glitch.json";

const MyTitle: React.FC = () => (
  <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
    <h1 style={{ color: "white", fontSize: 180, fontWeight: 900 }}>SYSTEM OFFLINE</h1>
  </AbsoluteFill>
);

export const Scene02: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <GlitchRip config={config} styles={{ colors: COLORS, fonts: FONTS }}>
      <MyTitle />
    </GlitchRip>
  </AbsoluteFill>
);
```

Save the config at `videos/<title>/remotion/src/scene-assets/scene-02-glitch.json`:

```json
{
  "global": { "speed": 1.0 },
  "elements": [],
  "extras": {
    "intervalSeconds": 2.5,
    "burstDurationSeconds": 0.5,
    "slices": 24,
    "shiftPx": 38,
    "rgbShiftPx": 10,
    "noise": 0.45,
    "deterministicSeed": 7
  }
}
```

> `elements[]` is unused by glitch-rip itself — content is passed as `children`. Keep the array empty (or omit it) so your config stays clean. The schema still accepts arbitrary element objects for pipeline compatibility.

## Recognized element ids

**None.** This template renders no content of its own — pass everything through `children`. The `elements[]` array in the config is ignored at runtime and is kept in the schema only for DeepConfig pipeline shape compatibility.

## `extras.*`

### Burst schedule
| Key | Type | Default | Description |
|---|---|---|---|
| `intervalSeconds` | number 0-60 | `3` | Seconds between burst attacks. `0` keeps the glitch running constantly (continuous interrupt — aggressive). |
| `burstDurationSeconds` | number 0.05-8 | `0.9` | Length of a single burst from attack onset to end of decay. |
| `attackRatio` | number 0.05-0.8 | `0.18` | Fraction of the burst spent in the attack rise (0 → 1). Remainder is the decay fall (1 → 0). Both halves ease `ease-out-cubic`. |
| `postBurstHoldFrames` | integer 0-600 | `0` | Extra hold frames after a burst before its envelope is considered fully gone. Lengthens the post-burst quiet without lengthening the schedule. |
| `quietFadeFrames` | integer 0-60 | `4` | Fade-IN length (in frames) at the very start of each burst. Only affects the entry — the post-burst cut is ALWAYS instant. Set 0 for a hard attack hit. |
| `deterministicSeed` | integer 0-1_000_000 | `1` | Base PRNG seed. Burst N seeds with `deterministicSeed + N`; per-frame slice seeds override with `Math.floor(frame * 24 / fps)`. Same seed → same render. |

### Tear / RGB split / blocks
| Key | Type | Default | Description |
|---|---|---|---|
| `slices` | integer 3-200 | `22` | Horizontal band count for tear selection. Lower = chunkier blocks; higher = finer grain. Matches the shader's `uSlices` role. |
| `rowBandMode` | `"slices"` / `"rows"` | `"slices"` | Whether bands are uniform horizontal slices (= the shader's `floor(uv.y * uSlices)` mode) or per-row fine rows (up to 160). `"rows"` is denser, shows the texture more. |
| `shiftPx` | number 0-400 | `34` | Peak horizontal shift of torn slices, in CSS pixels. |
| `rgbShiftPx` | number 0-120 | `8` | Peak chromatic-abberration offset of the R/B layers, in CSS pixels. |
| `blocks` | number 0-1 | `0.55` | Strength of the corrupted-block jitter. Cells are picked at a coarse grid; higher = more blocks jump. |
| `blocksCellPx` | integer 24-1024 | `120` | Coarse-grid cell size for block selection, in CSS pixels. Smaller = finer corrupted pixels. |

### Scanline + grain
| Key | Type | Default | Description |
|---|---|---|---|
| `scanlineEveryRows` | integer 1-64 | `3` | Every Nth band is eligible for a scanline flicker hit. Lower = more scanlines. |
| `scanlineOpacity` | number 0-1 | `0.18` | Peak opacity of a scanline flicker band. Adds white-mix screen over a row. |
| `grainOpacity` | number 0-1 | `0.22` | Peak overlay opacity of the per-frame noise grain (32 stripes, alternating white/black). |
| `noise` | number 0-1 | `0.4` | Overall noise weight the shader multiplies scanline + grain by (analog noise / scanline flicker). |

### Layout
| Key | Type | Default | Description |
|---|---|---|---|
| `backgroundColor` | string | (none) | **Deprecated** — accepted by the schema for backward compatibility, no longer read at runtime. The overlay layer is intentionally transparent so the caller's source colours show through the band tears. To control the look between bursts, style your `children` directly. |

## Customization recipes

### Make the burst hit on the open frame and only once
```json
{
  "extras": {
    "intervalSeconds": 30,
    "burstDurationSeconds": 0.8,
    "delayOffsetFrames": 0,
    "postBurstHoldFrames": 200
  }
}
```

### Continuous interrupt — the cyberpunk-outage look
```json
{ "extras": { "intervalSeconds": 0, "slices": 32, "shiftPx": 56, "rgbShiftPx": 18, "noise": 0.6 } }
```

### Hard attack (no fade-in)
```json
{ "extras": { "quietFadeFrames": 0 } }
```

### Tasteful newsroom break (lighter hit, longer quiet)
```json
{
  "extras": {
    "intervalSeconds": 4,
    "burstDurationSeconds": 0.35,
    "slices": 18,
    "shiftPx": 22,
    "rgbShiftPx": 5,
    "blocks": 0.3,
    "noise": 0.3
  }
}
```

### Smaller glitch on a 9:16 deliverable (downscale slices)
```json
{ "extras": { "slices": 14, "shiftPx": 28, "scanlineEveryRows": 2 } }
```

### Glitch your own animated content
The children can be any Remotion component, including one with its own intrinsic animation. The glitch composes ABOVE it — your content's animation keeps running underneath; bursts read as additional corruption, not as a replacement.
```tsx
<GlitchRip config={config} styles={styles}>
  <AnimatedStatReveal value={42} label="uptime %" />
</GlitchRip>
```

## Pitfalls

- **`intervalSeconds: 0` reads as always-on** — the burst never decays, only re-seeds. Use it for short clips (≤2s) only; longer scenes at continuous interrupt become hard to read.
- **Per-frame hash cadence is 24Hz at any fps.** The `sliceSeed` advances `Math.floor(frame * 24 / fps)` so the tear pattern granularity matches the Canvas UI shader — but at very high `slices` (≥120) you may see mosaics where neighbouring bands tear identically. Lower `slices` for coarser, more legible tears.
- **The source is never hidden.** Don't expect `quietOpacityFloor` anymore — between bursts the children render at full opacity; only the overlay layers toggle on/off. If you need the source to vanish between bursts, animate your children's own opacity.
- **No pointer / no parallax.** Canvas UI's `Glitch` is auto-burst only (no cursor interaction), so nothing is lost here — but the `Liquid`, `Grid`, `DecryptReveal` Canvas UI components are pointer-driven and won't port to this model. This template is the glitch look only.
- **RAM cost is bounded.** Total DOM bounded at `3 channels × bands`, where `bands = slices` (max 200). The grain overlay is hard-capped at 32 stripes regardless of `slices`. The pipeline's `render.concurrency: 1` + SwiftShader run easily held this on a t3.micro during the smoke render — no regressive behaviour observed.
- **`backgroundColor` accepts any CSS hex string via the schema.** Other CSS colour notation (rgba, named colours) is rejected by the schema. It only sets the overlay layer's background — colour-tinting your source happens via the chromatic split residues, not via `backgroundColor`.
- **`deterministicSeed` defaults to 1.** Same seed + same `intervalSeconds` + same frame index → bit-for-bit identical render. Bump the seed if two scenes in the same video use this template and ought to tear in different bands.
- **This template does NOT wrap Canvas UI.** It re-implements the visual design deterministically. The Canvas UI `<Glitch>` React component, the html-in-canvas Chrome 148 requirement, and the WebGL shader are all out of scope here on purpose — see the conversation assessment for the t3.micro rationale.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8. The preview exports `PREVIEW_DEFAULT_PROPS` with a 1.2s interval so at least one burst lands in the 90-frame window, and passes a `<TitleCard>` as `children` (with its own spring-in animation) to demonstrate the children-wrapper model.
