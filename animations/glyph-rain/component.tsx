import React, { useMemo, type ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
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
 * though glyph-rain renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * GlyphRainRip — matrix-style glyph rain layered above arbitrary content.
 *
 * A wrapper, not a content owner: drop your own Remotion component(s) in
 * as `children` and the template overlays columns of glyphs on top of
 * them, with hot head cells, fading trails, parallax depth layers, and a
 * per-cell mutation rate. This is the Canvas UI `<GlyphRain>` interaction
 * model re-implemented for Remotion — no WebGL, no `requestAnimationFrame`,
 * no html-in-canvas; every cell is a pure function of `useCurrentFrame()`
 * so frame N always renders the same set of glyph spans.
 *
 * Layering (lowest → highest):
 *   1. The caller's `children`, rendered at `1 - dim` opacity so the
 *      rain reads as the dominant layer. `dim: 0` keeps the source
 *      untouched; `dim: 1` hides the source entirely.
 *   2. Up to `layers` parallax strata of glyph spans. Each layer scales
 *      cell size and per-column speed by `[1, 1.5, 2.2]`, mirroring the
 *      shader's `scales[3]` array, so back layers look chunkier and read
 *      as further away — the same faux-depth as the shader.
 *
 * Per-column model (deterministic port of the shader):
 *   - Glyphs are PINNED to fixed grid cells — nothing translates. The
 *     "rain" is a brightness envelope that sweeps DOWN each column: the
 *     wavefront (`phase → 0`) is the bright head, and cells above it are
 *     lit by the fading trail.
 *   - Column speed: `config.speed * mix(1, hashCol, speedVariance) * 0.5`
 *     where `hashCol = mix(0.35, 1.0, hash11(col*0.37 + seed + 3.1))`.
 *   - Column phase offset: `hash11(col * 1.713 + seed) * 9.0` cycles.
 *   - Per cell: `yn = 1 - (row + 0.5) * cell / height`, `T = t*speed +
 *     offset`, `phase = fract(yn + T)`, `cyc = floor(yn + T)`. Every row
 *     of every column is evaluated each frame. The head is the
 *     wavefront cell (`phase → 0`); it descends as T grows and wraps
 *     from the bottom edge back to the top edge at each cycle
 *     boundary — the streak stays continuous across the wrap (the
 *     previous cycle's cells keep fading while the new head starts),
 *     so a column never blinks out as it leaves the screen.
 *   - Trail envelope (the linear reveal): `b = clamp(trail / (phase*22),
 *     0, 1.3) - 0.04`. Cells right under the wavefront are near-max
 *     brightness and fade as their phase grows — glyphs appear one by
 *     one down the column, never snapping in whole.
 *   - Head glow: `head = 1 - smoothstep(0, cellYn*1.2, phase)`;
 *     `g = b * flick * weight * (1 + head * glow * 1.4)` drives each
 *     glyph's opacity — the wavefront cell peaks at ~3.4× the trail
 *     brightness. The COLOR mix toward `headColor` uses a wider window
 *     (`1 - smoothstep(0, cellYn*3.2, phase)` × weight × glow × 1.1) so
 *     the head plus the cells just behind it read as a white-hot blob
 *     instead of a one-frame flash; rendered with a two-ring CSS
 *     box-shadow halo (tight core + wide soft bloom).
 *   - Per-cycle density gate: `hash21(col + seed, cyc + seed) < density`
 *     — same `step(hash21, uDensity)` shape as the shader, so columns
 *     pop in/out of existence on the same cadence.
 *   - Per-cell glyph index, hashed on `(col, row)`:
 *     `floor(hash21(col*1.71 + seed + tick*7.31, row*1.71 + tick*0.613)
 *     * charsetLen)` with `seed = layerSeed + cyc * 0.173` and
 *     `tick = floor(t * mutate * 1.6 + hash21(col + seed, row + seed) *
 *     9)`. Row in the hash means each cell in a column draws a
 *     DIFFERENT glyph; `tick` rolls the whole column over time.
 *
 * Determinism:
 *   - Every per-column (`hash11`) and per-cell (`hash21`) hash is an
 *     exact port of the shader's `fract()` hashes, keyed off the Remotion
 *     frame index instead of real time. Frame N always renders exactly
 *     the same set of glyph spans.
 *   - `deterministicSeed` shifts every layer's seed so two scenes can
 *     mutate differently without changing the column geometry.
 *
 * Bounded:
 *   - Total span count is capped at SPAN_CAP (3600). Per-frame CPU work
 *     is bounded by `cols * rowsPerCol * layers` cell evaluations (each
 *     a handful of hashes); the DOM is the expensive part and is capped.
 *     `columnCountCap` clamps the horizontal columns per layer.
 *     Suitable for t3.micro.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 *
 * extras.* (see animation.md + config/schema.json):
 *   - cell, charset, glyphColor, headColor
 *   - speed, speedVariance, density, trail, glow, mutate, flicker
 *   - layers, dim, columnCountCap, deterministicSeed
 *   - fadeInFrames, fadeOutFrames
 */

export interface GlyphRainRipProps {
  config: TemplateConfig;
  /** Source content layered UNDER the glyph rain. Renders dimmed. */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

/** A single visible glyph to render. Pre-computed per frame. */
interface Glyph {
  layer: number;
  col: number;
  row: number;
  x: number;
  y: number;
  cell: number;
  char: string;
  opacity: number;
  /** 0..1 — how far the cell's color has mixed toward `headColor`. */
  headMix: number;
}

const DEFAULT_CHARSET =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z*+-<>¦=:.";

/** Layer scale factors — matches the shader's `scales[3]` array. */
const LAYER_SCALES = [1.0, 1.5, 2.2];
/** Layer brightness weights — matches the shader's `weights[3]`. */
const LAYER_WEIGHTS = [1.0, 0.45, 0.22];
/** Layer base seeds — matches the shader's `seeds[3]`. */
const LAYER_SEEDS = [0.0, 19.7, 41.3];

/** GLSL `fract()` — fractional part, always ≥ 0. */
const frac = (p: number): number => p - Math.floor(p);

/** Deterministic 0..1 hash from a single float — exact port of `hash11`. */
function hash11(p: number): number {
  p = frac(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return frac(p);
}

/** Deterministic 0..1 hash from two floats — exact port of `hash21`. */
function hash21(x: number, y: number): number {
  const qx = frac(x * 0.1031);
  const qy = frac(y * 0.1031);
  const qz = frac(x * 0.1031);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  return frac((qx + d + qy + d) * (qz + d));
}

/** GLSL `smoothstep` port. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Per-column speed variation, mirroring the shader's `colSpeed`. */
function colSpeed(col: number, seed: number, base: number, variance: number) {
  const v = 0.35 + 0.65 * hash11(col * 0.37 + seed + 3.1);
  return base * (1 + (v - 1) * variance) * 0.5;
}

/** Per-column phase offset, mirroring the shader's `colOffset`. */
function colOffset(col: number, seed: number) {
  return hash11(col * 1.713 + seed) * 9.0;
}

/** Glyph index for a fixed grid cell, mirroring the shader's `glyphMask`. */
function glyphChar(
  col: number,
  row: number,
  seed: number,
  t: number,
  mutate: number,
  charset: string[],
  len: number,
): string {
  const tick = Math.floor(t * mutate * 1.6 + hash21(col + seed, row + seed) * 9.0);
  const idx = Math.floor(
    hash21(col * 1.71 + seed + tick * 7.31, row * 1.71 + tick * 0.613) * len,
  );
  const safe = ((idx % len) + len) % len;
  return charset[safe];
}

/** Parse #RGB / #RRGGBB into [r, g, b]. Falls back to white. */
function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [255, 255, 255];
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/** Linear mix between two hex colors; returns #RRGGBB. */
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const tt = Math.max(0, Math.min(1, t));
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * tt)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/** Append alpha to a hex string. Accepts #RGB / #RRGGBB. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${a.toFixed(2)})`;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

/** Hard cap on total DOM spans per frame — keeps t3.micro happy. */
const SPAN_CAP = 3600;

export const GlyphRainRip: React.FC<GlyphRainRipProps> = ({
  config,
  children,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: cw, height: ch, durationInFrames } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [
    config.theme,
    styles,
  ]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds.
  const cell = Math.min(64, Math.max(8, Number(extras.cell ?? 15)));
  const charset = useMemo(() => {
    const s = typeof extras.charset === "string" && extras.charset.length > 0
      ? extras.charset
      : DEFAULT_CHARSET;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of s) {
      if (c.trim().length === 0) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    if (out.length === 0) out.push("0", "1");
    return out;
  }, [extras.charset]);
  const glyphColor = pickColor(
    typeof extras.glyphColor === "string" ? extras.glyphColor : null,
    theme,
    "secondary",
    "#4474FF",
  );
  const headColor = pickColor(
    typeof extras.headColor === "string" ? extras.headColor : null,
    theme,
    "primary",
    "#2B6AFF",
  );
  const speed = Math.min(3, Math.max(0.05, Number(extras.speed ?? 0.2)));
  const speedVar = Math.min(1, Math.max(0, Number(extras.speedVariance ?? 0.5)));
  const density = Math.min(1, Math.max(0, Number(extras.density ?? 0.15)));
  const trail = Math.min(3, Math.max(0.2, Number(extras.trail ?? 0.65)));
  const glow = Math.min(3, Math.max(0, Number(extras.glow ?? 1.75)));
  const mutate = Math.min(4, Math.max(0, Number(extras.mutate ?? 0)));
  const flicker = Math.min(1, Math.max(0, Number(extras.flicker ?? 0)));
  const layers = Math.min(3, Math.max(1, Math.round(Number(extras.layers ?? 2))));
  const dim = Math.min(1, Math.max(0, Number(extras.dim ?? 0.5)));
  const detSeed = Math.round(Number(extras.deterministicSeed ?? 1));
  const colCap = Math.min(400, Math.max(8, Math.round(Number(extras.columnCountCap ?? 220))));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));

  // Global frame-time in seconds (scaled by global.speed so per-video
  // speed multipliers apply uniformly).
  const t = (frame / fps) * g.speed;

  // Children opacity: dim the source under the rain.
  const childrenOpacity = 1 - dim;

  // Rain overlay fade in/out so the rain doesn't pop at scene bounds.
  const rainFade = (() => {
    let f = 1;
    if (fadeInF > 0 && frame < fadeInF) {
      f = Math.min(f, frame / fadeInF);
    }
    if (fadeOutF > 0 && frame > durationInFrames - fadeOutF) {
      f = Math.min(f, Math.max(0, (durationInFrames - frame) / fadeOutF));
    }
    return Math.max(0, Math.min(1, f));
  })();

  // Build the visible-glyph set for this frame. Glyphs are pinned to
  // fixed grid cells; the rain is a brightness envelope sweeping down
  // each column. Every row is evaluated each frame so the streak stays
  // continuous when the wavefront wraps from the bottom edge back to
  // the top edge at a cycle boundary.
  const glyphs: Glyph[] = useMemo(() => {
    const out: Glyph[] = [];
    const len = charset.length;

    for (let layer = 0; layer < layers; layer++) {
      if (out.length >= SPAN_CAP) break;
      const scale = LAYER_SCALES[layer];
      const weight = LAYER_WEIGHTS[layer];
      const layerSeed = LAYER_SEEDS[layer] + detSeed;
      const cellPx = cell * scale;
      const cols = Math.min(colCap, Math.floor(cw / cellPx));
      const rowsPerCol = Math.ceil(ch / cellPx);
      const cellYn = cellPx / ch;

      for (let col = 0; col < cols; col++) {
        if (out.length >= SPAN_CAP) break;
        const sp = colSpeed(col, layerSeed, speed, speedVar);
        const off = colOffset(col, layerSeed);
        const T = t * sp + off;

        // Every row of the column is evaluated each frame. The bright
        // head is the wavefront (`phase → 0`), which descends as T
        // grows and wraps from the bottom edge straight to the top edge
        // at each cycle boundary — but the streak stays continuous:
        // the previous cycle's cells keep fading while the new head
        // starts, so the column never blinks out at the wrap.
        for (let row = 0; row < rowsPerCol; row++) {
          if (out.length >= SPAN_CAP) break;
          const yn = 1 - ((row + 0.5) * cellPx) / ch;
          const ynT = yn + T;
          const phase = frac(ynT);
          const cyc = Math.floor(ynT);

          // Per-cycle density gate. Rows can straddle two cycles when
          // the wavefront is near a boundary, so a failed gate only
          // skips cells of that cycle, not the whole column walk.
          if (hash21(col + layerSeed, cyc + layerSeed) >= density) continue;

          // Trail envelope — the linear reveal ramp. ~0 everywhere
          // except inside the wavefront window; grows dimmer as the
          // wavefront passes a cell.
          const b = Math.min(1.3, trail / (phase * 22 + 1e-6)) - 0.04;
          if (b <= 0.02) continue;

          // Flicker modulation. Matches the shader's
          // `1 + flicker * 0.6 * sin(t*14 + hash21(col,cyc)*40 + phase*30)`.
          const flick = 1 + flicker * 0.6 * Math.sin(
            t * 14 + hash21(col, cyc) * 40 + phase * 30,
          );

          // Head-emphasis: the single cell at the wavefront gets the
          // glow boost (faithful to the shader's `head` ramp)...
          const head = 1 - smoothstep(0, cellYn * 1.2, phase);
          const gg = Math.max(0, b * flick * weight * (1 + head * glow * 1.4));
          if (gg <= 0.004) continue;

          // ...while the COLOR mix toward headColor uses a wider window
          // (3.2 cells vs the shader's 1.2) and a 1.1x boost, so the
          // head + the cells just behind it read as a white-hot blob
          // instead of a one-frame white flash. Opacity stays faithful.
          const colorMix = Math.min(
            1,
            (1 - smoothstep(0, cellYn * 3.2, phase)) * weight * glow * 1.1,
          );

          out.push({
            layer,
            col,
            row,
            x: col * cellPx,
            y: row * cellPx,
            cell: cellPx,
            char: glyphChar(
              col,
              row,
              layerSeed + cyc * 0.173,
              t,
              mutate,
              charset,
              len,
            ),
            opacity: Math.min(1, gg),
            headMix: colorMix,
          });
        }
      }
    }
    return out;
  }, [
    cell, charset, layers, speed, speedVar, density, trail, glow, mutate,
    flicker, dim, detSeed, colCap, t, cw, ch,
  ]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      {/* (1) Source content layer. Renders dimmed by `1 - dim` so the
           rain reads as the dominant layer. With `dim: 0` the caller's
           content stays fully visible; with `dim: 1` it disappears
           entirely (pure matrix rain). */}
      <AbsoluteFill style={{ opacity: childrenOpacity }}>
        {children}
      </AbsoluteFill>

      {/* (2) Glyph rain overlay. Pure absolutely-positioned DOM spans,
           no canvas. Each glyph is one DOM node, total bounded by
           SPAN_CAP (3600). */}
      {rainFade > 0.001 && (
        <AbsoluteFill
          style={{
            opacity: rainFade,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontWeight: 600,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {glyphs.map((glyph, i) => {
            const color = mixHex(glyphColor, headColor, glyph.headMix);
            // NOTE: text-shadow and filter: drop-shadow() do NOT paint
            // under Remotion's headless Chromium (SwiftShader) — only
            // box-shadow does (verified empirically). The halo is a
            // two-ring NEGATIVE-spread box-shadow: the glow starts
            // inside the cell box (visible through the transparent
            // span, glyph text painted above it) and bleeds outward —
            // soft, wide, and reading as if the character itself emits
            // light rather than a ring around the box.
            const bloomSpread = -glyph.cell * 0.3;
            const bloomCore = Math.min(
              80,
              glyph.cell * (0.7 + glyph.headMix * 1.2),
            );
            const bloomHalo = Math.min(
              240,
              glyph.cell * (3 + glyph.headMix * 5),
            );
            return (
              <span
                key={`${glyph.layer}-${glyph.col}-${glyph.row}-${i}`}
                style={{
                  position: "absolute",
                  left: glyph.x,
                  top: glyph.y,
                  width: glyph.cell,
                  height: glyph.cell,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: glyph.cell * 0.72,
                  lineHeight: 1,
                  color,
                  opacity: glyph.opacity,
                  boxShadow: `0 0 ${bloomCore}px ${bloomSpread}px ${withAlpha(
                    color,
                    0.25 + glyph.headMix * 0.45,
                  )}, 0 0 ${bloomHalo}px ${bloomSpread * 1.2}px ${withAlpha(
                    color,
                    0.12 + glyph.headMix * 0.34,
                  )}`,
                }}
              >
                {glyph.char}
              </span>
            );
          })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
