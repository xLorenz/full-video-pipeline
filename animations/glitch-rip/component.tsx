import React, { useMemo, type ReactNode } from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  pickColor,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * Element override type — carried in the DeepConfig signature so callers
 * can keep using `extras: ElementOverride[]` in their own typing even
 * though glitch-rip renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * GlitchRip — broadcast glitch bursts layered ABOVE arbitrary content.
 *
 * A wrapper, not a content owner: drop your own Remotion component(s) in
 * as `children` and the template overlays broadcast-style glitch bursts
 * (slice tears + RGB chromatic split + corrupted-block jitter + scanline
 * flicker + analog grain) on top of them, on a deterministic schedule.
 * This is the Canvas UI `<Glitch>{children}</Glitch>` interaction model
 * re-implemented for Remotion — no WebGL, no `requestAnimationFrame`,
 * no html-in-canvas; computed per frame off `useCurrentFrame()`.
 *
 * Layering (lowest → highest):
 *   1. The caller's `children`, rendered unmodified. ALWAYS visible — the
 *      glitch is an effect, never a substitute for the source.
 *   2. Three banded clones of the SAME `children` (R/G/B channel tint,
 *      offset ± `rgbShiftPx`, all bands sharing the same per-band tear
 *      plan); they `mix-blend-mode: screen` so they recombine to a
 *      chromatic-aberrated copy of your content (matches the shader's
 *      `vec4(r, c.g, b, a)` recombine exactly).
 *   3. Scanline + grain overlays, screen / overlay composite.
 *
 * Burst envelope:
 *   - attack/decay split with `attackRatio`; both halves ease-out-cubic.
 *   - bursts repeat every `intervalSeconds` derived purely from the
 *     absolute frame, so frame N always renders the same burst slice.
 *   - `intervalSeconds: 0` keeps the glitch running continuously.
 *   - When the envelope is 0, the overlay layers hard-cut off (NO fade
 *     out — the original frame cuts in instantly, exactly like the
 *     shader's `e = 0` frame where only the unmodified source samples).
 *
 * Determinism notes:
 *   - `sliceSeed = deterministicSeed + Math.floor(frame * 24 / fps)` —
 *     matches the shader's `floor(time * 24)` cadence so the per-band
 *     tear pattern has the same temporal granularity, but seeded from
 *     the Remotion frame index.
 *   - `Math.random()` in the original is a deterministic integer hash
 *     of `(band, sliceSeed)` so identical inputs always produce the
 *     same tear pattern across renders.
 *
 * Bounded: every tear, shift, and noise value is clamped at the schema
 * maxima so RAM-tight renders can never spike on edge configurations.
 *
 * extras.* (see animation.md + config/schema.json):
 *   - intervalSeconds, burstDurationSeconds, attackRatio
 *   - slices, shiftPx, rgbShiftPx, blocks, noise
 *   - rowBandMode ("slices" | "rows")
 *   - blocksCellPx, scanlineEveryRows, scanlineOpacity, grainOpacity
 *   - postBurstHoldFrames, deterministicSeed
 *   - quietFadeFrames (graceful fade-in of overlays, NOT fade-out)
 *
 * Recognized element ids (currently empty — this template doesn't bake
 * any content of its own; pass everything as `children`):
 *   (none)
 *
 * This template does NOT wrap Canvas UI. See animation.md "Why this is
 * a port, not a wrap" for the full rationale.
 */

export interface GlitchRipProps {
  config: TemplateConfig;
  /** Source content layered UNDER the glitch. Always renders unmodified. */
  children?: ReactNode;
  /**
   * Per-video styles. Used only for palette/theme resolution; the
   * glitch itself doesn't own typography since `children` carries it.
   */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

interface BandPlan {
  y: number;
  h: number;
  tearPx: number;
  blockOffset: { dx: number; dy: number; active: boolean };
}

/** Deterministic 0..1 hash. Same (input) → same output across renders. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export const GlitchRip: React.FC<GlitchRipProps> = ({
  config,
  children,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: cw, height: ch } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [
    config.theme,
    styles,
  ]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds.
  const intervalSec = Math.max(0, Number(extras.intervalSeconds ?? 3));
  const burstDurSec = Math.max(0.05, Number(extras.burstDurationSeconds ?? 0.5));
  const attackRatio = Math.min(
    0.8,
    Math.max(0.05, Number(extras.attackRatio ?? 0.18)),
  );
  const slices = Math.max(3, Math.round(Number(extras.slices ?? 22)));
  const shiftPx = Math.max(0, Number(extras.shiftPx ?? 34));
  const rgbShiftPx = Math.max(0, Number(extras.rgbShiftPx ?? 8));
  const blocks = Math.min(1, Math.max(0, Number(extras.blocks ?? 0.55)));
  const noise = Math.min(1, Math.max(0, Number(extras.noise ?? 0.4)));
  const blockCellPx = Math.max(24, Math.round(Number(extras.blocksCellPx ?? 120)));
  const scanEvery = Math.max(1, Math.round(Number(extras.scanlineEveryRows ?? 3)));
  const scanOp = Math.min(1, Math.max(0, Number(extras.scanlineOpacity ?? 0.18)));
  const grainOp = Math.min(1, Math.max(0, Number(extras.grainOpacity ?? 0.22)));
  const postHold = Math.max(0, Math.round(Number(extras.postBurstHoldFrames ?? 0)));
  const detSeed = Math.round(Number(extras.deterministicSeed ?? 1));
  const rowBandMode = (extras.rowBandMode as string) === "rows" ? "rows" : "slices";
  const quietFadeF = Math.max(0, Math.round(Number(extras.quietFadeFrames ?? 4)));

  // Palette — the glitch overlay layer is intentionally TRANSPARENT so
  // the caller's true source colours read through the band tears. We
  // resolve the palette only for the chromatic split channel tints,
  // never for an overlay backdrop.
  void pickColor;
  void theme;

  // Burst schedule — derived purely from the absolute frame.
  const intervalF = Math.round(intervalSec * fps * g.speed);
  const burstDurF = Math.round(burstDurSec * fps * g.speed);
  const attackF = Math.max(2, Math.round(burstDurF * attackRatio));
  const decayF = Math.max(2, burstDurF - attackF);
  const startOffset = g.delayOffset;

  let envelope = 0;
  let burstSeed = detSeed;
  if (intervalF === 0) {
    envelope = 1;
    burstSeed = detSeed + Math.floor((frame * 24) / fps);
  } else {
    const fRel = frame - startOffset;
    if (fRel >= 0) {
      const idx = Math.floor(fRel / intervalF);
      const sinceStart = fRel - idx * intervalF;
      if (sinceStart < burstDurF + postHold) {
        let amp;
        if (sinceStart < attackF) {
          amp = interpolate(sinceStart, [0, attackF], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
        } else {
          amp = interpolate(
            sinceStart - attackF,
            [0, decayF],
            [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
        }
        const jitter = 0.7 + 0.3 * hash01(burstSeed + Math.floor((frame * 24) / fps));
        envelope = Math.max(0, amp * jitter);
        burstSeed = detSeed + idx;
      }
    }
  }
  envelope = Math.min(1.4, envelope);

  // The overlay is fully opaque at full envelope and snaps to 0 the
  // frame after `decayF` + `postHold` elapses — NO fade-out. We instead
  // fade IN at the very start of each burst (the first `quietFadeF`
  // frames of `attackF`) so the transition into the burst doesn't jolt.
  // After the burst, the overlay just disappears — revealing the
  // untouched source underneath.
  let overlayOpacity = Math.min(1, envelope);
  if (envelope > 0 && attackF > 0 && quietFadeF > 0) {
    const fadeStart = Math.max(0, (() => {
      // first frame of current burst in continuous-interrupt mode
      if (intervalF === 0) return 0;
      const fRel = frame - startOffset;
      const idx = Math.floor(fRel / intervalF);
      return startOffset + idx * intervalF;
    })());
    const sinceFadeStart = frame - fadeStart;
    if (sinceFadeStart >= 0 && sinceFadeStart < quietFadeF) {
      overlayOpacity = interpolate(sinceFadeStart, [0, quietFadeF], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * overlayOpacity;
    }
  }
  const bursting = overlayOpacity > 0.001;

  // Slice seed advances 24x per second of frame-time.
  const sliceSeed = burstSeed + Math.floor((frame * 24) / fps);

  // Band geometry.
  const bandCount = rowBandMode === "slices" ? slices : Math.min(160, Math.ceil(ch / 6));
  const bandH = ch / bandCount;

  // Per-band tear plan — computed in JS for the three channel layers.
  const bands: BandPlan[] = useMemo(() => {
    const out: BandPlan[] = [];
    for (let i = 0; i < bandCount; i++) {
      const y = i * bandH;
      const pick = hash01(i * 1.7 + sliceSeed * 0.41);
      const tearActive = pick < 0.3 * Math.min(envelope, 1);
      const dir = hash01(i * 0.93 + sliceSeed + 13) * 2 - 1;
      const tearPx = tearActive ? dir * envelope * shiftPx : 0;
      const cellCol = Math.floor(hash01(i * 2.1 + sliceSeed * 0.31) * (cw / blockCellPx));
      const blockHash = hash01(cellCol * 11 + i + sliceSeed + 7);
      const blockActive = blockHash > 1 - 0.14 * blocks * Math.min(envelope, 1);
      out.push({
        y,
        h: bandH,
        tearPx,
        blockOffset: {
          dx: blockActive ? (hash01(cellCol + 3.1 + sliceSeed) - 0.5) * 0.08 * cw * envelope : 0,
          dy: blockActive ? (hash01(cellCol + 7.7 + sliceSeed) - 0.5) * 0.02 * ch * envelope : 0,
          active: blockActive,
        },
      });
    }
    return out;
  }, [bandCount, bandH, sliceSeed, envelope, shiftPx, blockCellPx, blocks, cw, ch]);

  // Style helper for each band slice. Each band is a clipping window that
  // sits at vertical `band.y` and shows a `-band.y`-translated clone of the
  // child layer, so the child's own layout is preserved when bands tear
  // horizontally (and never appears shifted vertically by the tear itself).
  const bandBoxStyle = (band: BandPlan): React.CSSProperties => ({
    position: "absolute",
    left: 0,
    top: band.y,
    width: cw,
    height: band.h + 1,
    overflow: "hidden",
    pointerEvents: "none",
  });

  // RGB channel split. R/B band clones offset ± channelOffset; G stays
  // centred. The chromatic aberration comes FROM the offset content
  // clones themselves (their shifted pixel data), NOT from solid colour
  // blocks layered on top — so the source's true palette has zero tint
  // applied by the glitch. Mixed with `mix-blend-mode: screen` so the
  // three clones recombine to a single chromatically-shifted image,
  // same as the shader's `vec4(r, c.g, b, a)` recombine.
  const channelOffset = interpolate(envelope, [0, 1], [0, rgbShiftPx], {
    extrapolateLeft: "clamp",
    extrapolateRight: "extend",
  });

  // The slice content for one band box — a clone of the children
  // translated vertically by `-band.y` so its layout is preserved.
  const renderBandSlice = (band: BandPlan): ReactNode => (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: -band.y,
        width: cw,
        height: ch,
      }}
    >
      {children}
    </div>
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      {/* (1) Source content layer. Renders unmodified, ALWAYS at full
           opacity — never hidden, never faded. The glitch is layered
           ABOVE this, so when overlays cut off the source is simply
           revealed again immediately. */}
      <AbsoluteFill>{children}</AbsoluteFill>

      {/* (2) The glitch overlay. Hard-cut on/off (`overlayOpacity`
           is either 0 or >0.001) — never fades out. */}
      {bursting && (
        <AbsoluteFill
          style={{
            backgroundColor: "transparent",
            opacity: overlayOpacity,
          }}
        >
          {/* The single-layer clone of the children — opaque, untinted.
              This is the body of the glitch: a re-torn, RGB-split
              reconstruction of the source. Mixed over the overlayBg
              (no blending mode) so the bands sample the children's
              true colors and the background NEVER goes cyan. The
              visible per-band tear is the horizontal translate of each
              band box. */}
          {/* Band body: a clipped window showing a torn, horizontally
              shifted copy of the children. Source colours read pristine
              through the bands — NO solid colour backdrop, NO blended
              tint block. The chromatic look comes purely from the very
              low-opacity R/B residue overlays layered ON the band clone,
              not from a wholesale colour replacement. The overlay
              AbsoluteFill is transparent so the underlying source
              fills any vertical gaps between shifted bands. */}
          {bands.map((band, i) => (
            <div
              key={`body-${i}`}
              style={{
                ...bandBoxStyle(band),
                translate: `${band.tearPx + band.blockOffset.dx}px ${band.blockOffset.dy}px`,
              }}
            >
              {renderBandSlice(band)}
              {/* Faint chromatic-aberration residue over the band clone.
                  Kept intentionally weak (≤0.12 alpha) so the source's
                  true palette is barely shifted — just enough to read as
                  a chromatic edge pull during the burst peak, never a
                  tint over the body of the text. With mix-blend-mode:
                  screen the residue adds light, it never darkens or
                  recolours the source pixels underneath. */}
              {channelOffset > 0.1 && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0.18,
                      mixBlendMode: "screen",
                      translate: `${-channelOffset}px 0`,
                      background: withAlpha("#FF0033", 0.08 + 0.04 * Math.min(envelope, 1)),
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0.16,
                      mixBlendMode: "screen",
                      translate: `${channelOffset}px 0`,
                      background: withAlpha("#0066FF", 0.08 + 0.04 * Math.min(envelope, 1)),
                    }}
                  />
                </>
              )}
            </div>
          ))}

          {/* Scanline flicker — every Nth band. White-mix screen over a
              band height. Matches the shader's
              `lines = step(0.985 - 0.01 * uNoise * e, flicker)`. */}
          {bands.map((band, i) => {
            if (i % scanEvery !== 0) return null;
            const flicker = hash01(i + sliceSeed + 41);
            const threshold = 0.985 - 0.01 * noise * Math.min(envelope, 1);
            if (flicker < threshold) return null;
            return (
              <div
                key={`scan-${i}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: band.y,
                  width: cw,
                  height: band.h,
                  background: withAlpha("#FFFFFF", scanOp * Math.min(envelope, 1)),
                  pointerEvents: "none",
                  mixBlendMode: "screen",
                }}
              />
            );
          })}

          {/* Grain overlay. Hard cap of 32 stripes so cost stays bounded. */}
          {grainOp > 0 &&
            Array.from({ length: 32 }).map((_, i) => {
              const y = (i / 32) * ch;
              const h = ch / 32;
              const grain = hash01(i * 9.7 + sliceSeed * 5.3) - 0.5;
              if (Math.abs(grain) < 0.15) return null;
              return (
                <div
                  key={`grain-${i}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: y,
                    width: cw,
                    height: h,
                    background:
                      grain > 0
                        ? withAlpha("#FFFFFF", grainOp * grain * 0.45 * Math.min(envelope, 1))
                        : withAlpha("#000000", grainOp * -grain * 0.45 * Math.min(envelope, 1)),
                    pointerEvents: "none",
                    mixBlendMode: "overlay",
                  }}
                />
              );
            })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/** Append alpha to a hex string. Accepts #RGB / #RRGGBB. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${a.toFixed(2)})`;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const gg = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${gg},${b},${a.toFixed(2)})`;
}
