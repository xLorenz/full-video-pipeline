import React, { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * Element override type — carried in the DeepConfig signature so callers
 * can keep using `extras: ElementOverride[]` in their own typing even
 * though decrypt-reveal renders its content via `children`, not
 * `elements[]`.
 */
export type { ElementOverride };

/**
 * DecryptRip — the wrapped content is covered by a shape-matched cipher
 * of random glyphs; a decrypt circle (radius, softness) travels through
 * the frame, and wherever it passes the cipher falls away to reveal the
 * real content beneath, with a flickering, glowing, chromatically
 * aberrated decrypt edge.
 *
 * A deterministic Remotion port of the Canvas UI `<DecryptReveal>` WebGL
 * component (canvasui.dev). Like the other treatments, the effect IS a
 * content treatment: the shader samples a texture of the wrapped DOM.
 * The GLSL (CELL_FRAG, MAIN_FRAG) is kept VERBATIM from the upstream
 * `DecryptRevealVanilla.ts`; only the runtime driver is re-touched:
 *
 *   1. Cursor becomes a waypoint PATH, exactly like the shatter port:
 *      upstream drives the decrypt circle from the pointer
 *      (`pointermove` + `pointerleave`, exponential damping with
 *      `smoothing` seconds). A render has no cursor, so `lensPath` is a
 *      list of `{x, y, at}` stops (normalized screen position over
 *      composition progress) the circle follows with smoothstep timing,
 *      and `activePath` is a list of `{at, v}` stops for its activation
 *      (0 = fully encrypted, 1 = decrypt circle on). The damping is
 *      preserved and still deterministic: `k = 1 - exp(-delta / tau)`
 *      with `delta = 1/fps` of composition time, so the circle lags its
 *      path exactly like it lags a cursor. `smoothing: 0` tracks the
 *      path exactly.
 *   2. Time becomes composition time: upstream advances `time` by the
 *      real rAF delta and derives the cipher scramble from
 *      `floor(uTime * scrambleSpeed)`; the port advances
 *      `time = frame / fps` instead — same formula, fixed delta, so the
 *      scramble, flicker, and edge shimmer of frame N are always the
 *      same pixels.
 *   3. Two passes, verbatim: the glyph-cell pass (CELL_FRAG) grids the
 *      content texture into cells, samples each cell against 6 probe
 *      circles (plus an ink grid) to build a 6-vector shape signature,
 *      and picks the glyph whose signature best matches — writing the
 *      cell's average color plus the chosen glyph index into a small
 *      NEAREST texture. The main pass (MAIN_FRAG) then composites per
 *      pixel: decrypt distance field around the pointer, scramble
 *      rerolls (hash of cell + time), the glyph mask sampled from the
 *      mipmapped character atlas with textureGrad, glyph coloring
 *      (monochrome vs. vivid vs. edge tint/glow), passthrough of the
 *      real content, and the chromatic aberration of the edge.
 *   4. Glyph atlas built at setup: the charset is rasterized into a
 *      canvas atlas (monospace stack) and uploaded once — the atlas
 *      texture (mipmapped) for the glyph masks and a 6×N R32F texture
 *      of per-glyph shape signatures. Deterministic: the rasterization
 *      is a pure function of the charset + aspect.
 *   5. Content capture via native html-in-canvas: the same
 *      `drawElementImage` + layoutSubtree path the upstream component
 *      uses (via its `onpaint` hook) and the same one vhs/droplets/
 *      bend/shatter/blaze rely on — the children are moved into a
 *      layoutSubtree canvas, painted on demand (`requestPaint` +
 *      `paint` event), and the paint record is drawn into the canvas
 *      backing store and uploaded. Per-frame inline styles are included
 *      — transforms animate cleanly; per-element opacity fades are not
 *      (see the animation.md pitfall).
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): radius, softness, cell, aspect, charset, colored,
 * color, brightness, legibility, contrast, exposure, scramble,
 * scrambleSpeed, edgeWidth, edgeFlicker, edgeGlow, edgeTint, aberration,
 * passthrough, threshold, background, smoothing, lensPath, activePath.
 * All upstream options are kept; the pointer/loop machinery is replaced
 * by the waypoint model.
 *
 * Performance:
 *   - Two WebGL2 draws per frame at 1x internal resolution (SwiftShader
 *     software raster): the glyph-cell pass is a small NEAREST grid (at
 *     cell 16 over 1080p: ~120×68 cells, each doing ~180 texture taps),
 *     the main pass is one full-frame composite with a textureGrad
 *     atlas sample. Comparable to blaze, a bit slower per cell pass;
 *     the preview raises `cell` to 16 to keep the render tractable.
 *   - The atlas + shape-signature build happens once at setup; the
 *     content capture + upload once per frame.
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface DecryptRipProps {
  config: TemplateConfig;
  /** The scene behind the cipher (fills the frame; the decrypt circle
   *  travels over it — see the preview for the pattern).
   */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI DecryptRevealVanilla.ts. Do
// not edit; the port's "re-touch" lives in the driver below.
// ---------------------------------------------------------------------------

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const CELL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uShapes;
uniform vec2 uContentRes;
uniform vec2 uCellPx;
uniform int uGlyphCount;
uniform float uContrast;
uniform float uExposure;
uniform float uThreshold;
uniform vec3 uBg;

const vec2 INNER[6] = vec2[6](
  vec2(0.28, 0.26), vec2(0.72, 0.14),
  vec2(0.28, 0.56), vec2(0.72, 0.44),
  vec2(0.28, 0.86), vec2(0.72, 0.74)
);
const vec2 OUTER[10] = vec2[10](
  vec2(0.28, -0.2), vec2(0.72, -0.2),
  vec2(-0.22, 0.25), vec2(1.22, 0.25),
  vec2(-0.22, 0.5), vec2(1.22, 0.5),
  vec2(-0.22, 0.75), vec2(1.22, 0.75),
  vec2(0.28, 1.2), vec2(0.72, 1.2)
);
const vec2 RING[6] = vec2[6](
  vec2(1.0, 0.0), vec2(0.5, 0.8660254), vec2(-0.5, 0.8660254),
  vec2(-1.0, 0.0), vec2(-0.5, -0.8660254), vec2(0.5, -0.8660254)
);

vec2 cellBase;

vec4 fetchTap (vec2 p) {
  vec2 uv = p / uContentRes;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(uContent, uv);
}

vec4 sampleCircle (vec2 c) {
  vec2 middle = cellBase + c * uCellPx;
  float r = uCellPx.y * 0.161;
  vec4 acc = fetchTap(middle);
  for (int k = 0; k < 6; k++) acc += fetchTap(middle + RING[k] * r);
  return acc / 7.0;
}

float tapLevel (vec4 t) {
  vec3 straight = t.rgb / max(t.a, 1e-4);
  return dot(abs(straight - uBg), vec3(0.299, 0.587, 0.114)) * t.a;
}

float circleSig (vec4 acc) {
  return clamp(tapLevel(acc) * uExposure, 0.0, 1.0);
}

float dirContrast (float value, float ext) {
  float peak = max(value, ext);
  if (peak < 1e-4) return value;
  return pow(value / peak, uContrast) * peak;
}

void main () {
  cellBase = floor(gl_FragCoord.xy) * uCellPx;
  float v[6];
  vec3 colAcc = vec3(0.0);
  float alphaAcc = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 acc = sampleCircle(INNER[i]);
    v[i] = circleSig(acc);
    colAcc += acc.rgb;
    alphaAcc += acc.a;
  }
  float e[10];
  for (int i = 0; i < 10; i++) e[i] = circleSig(sampleCircle(OUTER[i]));
  v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
  v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
  v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
  v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
  v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
  v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));
  float gm[6];
  for (int i = 0; i < 6; i++) gm[i] = 0.0;
  float levSum = 0.0;
  float inkLev = 0.0;
  vec3 inkCol = vec3(0.0);
  int nx = int(clamp(uCellPx.x, 6.0, 20.0));
  int ny = int(clamp(uCellPx.y, 8.0, 32.0));
  float fx = float(nx - 1);
  float fy = float(ny - 1);
  for (int gy = 0; gy < ny; gy++) {
    for (int gx = 0; gx < nx; gx++) {
      vec2 p = vec2(float(gx) / fx, float(gy) / fy);
      vec4 t = fetchTap(cellBase + p * uCellPx);
      float lev = tapLevel(t);
      int idx = (p.y < 0.41 ? 0 : (p.y < 0.71 ? 2 : 4)) + (p.x < 0.5 ? 0 : 1);
      gm[idx] = max(gm[idx], lev);
      levSum += lev;
      if (lev > inkLev) {
        inkLev = lev;
        inkCol = t.rgb / max(t.a, 1e-4);
      }
    }
  }
  inkLev *= uExposure;
  for (int i = 0; i < 6; i++)
    v[i] = max(v[i], clamp(gm[i] * uExposure, 0.0, 1.0));
  float peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
  vec3 avgCol = colAcc / max(alphaAcc, 1e-4);
  if (peak < uThreshold) {
    outColor = vec4(avgCol, 0.0);
    return;
  }
  float mean = levSum * uExposure / float(nx * ny);
  float sharp = inkLev / max(mean, 1e-4);
  float solid = smoothstep(uThreshold, uThreshold * 1.6, inkLev);
  float lift = smoothstep(1.5, 3.0, sharp) * solid;
  float lifted = mix(peak, 1.0, lift);
  for (int i = 0; i < 6; i++)
    v[i] = pow(min(v[i] / max(peak, 1e-4), 1.0), uContrast) * lifted;
  vec3 cellCol = mix(avgCol, inkCol, lift);
  int best = 0;
  float bestD = 1e9;
  for (int g = 0; g < uGlyphCount; g++) {
    float d = 0.0;
    for (int i = 0; i < 6; i++) {
      float diff = v[i] - texelFetch(uShapes, ivec2(i, g), 0).r;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  outColor = vec4(cellCol, float(best) / 255.0);
}`;

const MAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uCellPx;
uniform vec2 uGrid;
uniform vec2 uAtlasGrid;
uniform vec2 uAtlasPad;
uniform vec2 uAtlasInner;
uniform int uGlyphCount;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uColored;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uLegibility;
uniform float uScramble;
uniform float uScrambleSpeed;
uniform float uEdgeWidth;
uniform float uEdgeFlicker;
uniform float uEdgeGlow;
uniform float uEdgeTint;
uniform float uAberration;
uniform float uPassthrough;
uniform vec3 uBg;
uniform float uTime;
uniform float uMaxX;
uniform float uCrisp;

float hash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 samp (vec2 p) {
  vec2 uv = p / uRes;
  uv = clamp(uv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  return texture(uContent, uv);
}

void main () {
  vec2 pc = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  if (pc.x > uMaxX * uRes.x) {
    outColor = vec4(0.0);
    return;
  }
  if (uCrisp > 0.5) {
    outColor = samp(pc);
    return;
  }

  float dist = length(pc - uPointer);
  float radius = max(uRadius, 1.0);
  float inner = radius * (1.0 - clamp(uSoftness, 0.02, 1.0));
  float e = (1.0 - smoothstep(inner, radius, dist)) * uActive;

  float bandW = max(radius * clamp(uEdgeWidth, 0.0, 1.0) * 0.5, 6.0);
  float bandD = dist - mix(inner, radius, 0.5);
  float ring = exp(-bandD * bandD / (2.0 * bandW * bandW)) * uActive;

  vec2 dir = (pc - uPointer) / max(dist, 1e-3);
  float ca = uAberration * ring;
  vec4 rC = samp(pc);
  vec3 real = vec3(samp(pc + dir * ca).r, rC.g, samp(pc - dir * ca).b);

  vec2 cellPos = pc * uDpr / uCellPx;
  vec2 cell = clamp(floor(cellPos), vec2(0.0), uGrid - 1.0);
  vec4 info = texelFetch(uCells, ivec2(cell), 0);
  float glyph = floor(info.a * 255.0 + 0.5);

  float rerollP = clamp(uScramble * 0.35 + ring * uEdgeFlicker, 0.0, 1.0);
  float speed = max(uScrambleSpeed, 0.001) * (1.0 + ring * 2.5);
  float ft = floor(uTime * speed);
  float swap = step(1.0 - rerollP, hash(cell * 3.3 + vec2(ft * 0.717, ft * 0.523)))
    * step(0.5, glyph);
  float pick = hash(cell + vec2(ft * 0.613, ft * 0.831));
  glyph = mix(glyph, floor(pick * float(uGlyphCount - 1)) + 1.0, swap);

  vec2 local = clamp(cellPos - cell, 0.0, 1.0);
  float gx = mod(glyph, uAtlasGrid.x);
  float gy = floor(glyph / uAtlasGrid.x);
  vec2 atlasUv = vec2(
    (gx + uAtlasPad.x + local.x * uAtlasInner.x) / uAtlasGrid.x,
    (gy + uAtlasPad.y + local.y * uAtlasInner.y) / uAtlasGrid.y
  );
  vec2 atlasStep = uAtlasInner / uAtlasGrid;
  float mask = textureGrad(
    uAtlas,
    atlasUv,
    dFdx(cellPos) * atlasStep,
    dFdy(cellPos) * atlasStep
  ).a * step(0.5, glyph);

  vec3 cellCol = info.rgb;
  vec3 lw = vec3(0.299, 0.587, 0.114);
  vec3 dev = cellCol - uBg;
  float mag = dot(abs(dev), lw);
  float target = clamp(uLegibility, 0.0, 1.0) * 0.75;
  float boost = clamp(target / max(mag, 0.01), 1.0, 32.0);
  vec3 vivid = clamp(uBg + dev * boost, 0.0, 1.0);
  float vividMag = dot(abs(vivid - uBg), lw);
  vec3 ink = mix(vec3(1.0), vec3(0.06), step(0.5, dot(uBg, lw)));
  vivid = mix(vivid, ink, clamp((target - vividMag) / max(target, 1e-3), 0.0, 1.0));
  float cellSig = clamp(mag * 1.6, 0.0, 1.0);
  vec3 mono = uColor * mix(0.35, 1.2, cellSig);
  vec3 glyphColor = mix(mono, vivid, clamp(uColored, 0.0, 1.0));
  glyphColor = clamp(uBg + (glyphColor - uBg) * uBrightness, 0.0, 1.0);
  float cellLum = dot(vivid, lw);
  glyphColor = mix(
    glyphColor,
    uColor * max(uBrightness, 1.0) * (0.6 + cellLum),
    ring * clamp(uEdgeTint, 0.0, 1.0)
  );
  glyphColor = clamp(
    uBg + (glyphColor - uBg) * (1.0 + ring * uEdgeGlow * 1.6),
    0.0,
    1.0
  );

  vec3 base = mix(uBg, real, clamp(uPassthrough, 0.0, 1.0));
  vec3 encrypted = mix(base, glyphColor, mask);
  vec3 col = mix(encrypted, real, e);
  float alpha = mix(max(rC.a, mask), rC.a, e);
  outColor = vec4(col, alpha);
}`;

// ---------------------------------------------------------------------------
// Upstream support helpers (verbatim behavior).
// ---------------------------------------------------------------------------

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
).join("");

const ATLAS_CELL = 64;
const ATLAS_PAD = 8;
const MAX_GLYPHS = 255;

const INNER_CIRCLES: Array<[number, number]> = [
  [0.28, 0.26],
  [0.72, 0.14],
  [0.28, 0.56],
  [0.72, 0.44],
  [0.28, 0.86],
  [0.72, 0.74],
];

let colorProbe: CanvasRenderingContext2D | null = null;

function parseColor(input: string): [number, number, number] {
  if (typeof document === "undefined") return [0, 0, 0];
  if (!colorProbe) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    colorProbe = probe.getContext("2d", { willReadFrequently: true });
  }
  if (!colorProbe) return [0, 0, 0];
  colorProbe.fillStyle = "#000000";
  colorProbe.fillStyle = input;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillRect(0, 0, 1, 1);
  const data = colorProbe.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255];
}

function buildGlyphList(charset: string) {
  const seen = new Set<string>([" "]);
  const glyphs = [" "];
  for (const ch of charset) {
    if (glyphs.length >= MAX_GLYPHS) break;
    if (ch === "\n" || ch === "\r" || ch === "\t" || seen.has(ch)) continue;
    seen.add(ch);
    glyphs.push(ch);
  }
  return glyphs;
}

function glyphShapes(
  image: ImageData,
  cols: number,
  cellW: number,
  cellH: number,
  count: number,
) {
  const vectors = new Float32Array(count * 6);
  const radius = cellH * 0.26;
  const padW = cellW + ATLAS_PAD * 2;
  const padH = cellH + ATLAS_PAD * 2;
  for (let g = 0; g < count; g++) {
    const originX = (g % cols) * padW + ATLAS_PAD;
    const originY = Math.floor(g / cols) * padH + ATLAS_PAD;
    for (let c = 0; c < 6; c++) {
      const cx = INNER_CIRCLES[c][0] * cellW;
      const cy = INNER_CIRCLES[c][1] * cellH;
      let sum = 0;
      let total = 0;
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
        for (
          let x = Math.floor(cx - radius);
          x <= Math.ceil(cx + radius);
          x++
        ) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > radius * radius) continue;
          total += 1;
          if (
            x < -ATLAS_PAD ||
            y < -ATLAS_PAD ||
            x >= cellW + ATLAS_PAD ||
            y >= cellH + ATLAS_PAD
          )
            continue;
          sum +=
            image.data[((originY + y) * image.width + originX + x) * 4 + 3];
        }
      }
      vectors[g * 6 + c] = total ? sum / (total * 255) : 0;
    }
  }
  for (let c = 0; c < 6; c++) {
    let peak = 0;
    for (let g = 0; g < count; g++) {
      peak = Math.max(peak, vectors[g * 6 + c]);
    }
    if (peak > 0) {
      for (let g = 0; g < count; g++) vectors[g * 6 + c] /= peak;
    }
  }
  return vectors;
}

function clampAspect(aspect: number) {
  return Math.min(Math.max(aspect || 0.75, 0.35), 1.25);
}

// ---------------------------------------------------------------------------
// Waypoint model — the shatter customization logic: the cursor becomes a
// lensPath of {x, y, at} stops and an activePath of {at, v} stops.
// ---------------------------------------------------------------------------

interface LensStop {
  x: number;
  y: number;
  at: number;
}
interface ActiveStop {
  at: number;
  v: number;
}

const DEFAULT_LENS_PATH: LensStop[] = [
  { x: -0.25, y: 0.5, at: 0 },
  { x: 1.25, y: 0.5, at: 1 },
];
const DEFAULT_ACTIVE_PATH: ActiveStop[] = [{ at: 0, v: 1 }];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeSmoothstep = (t: number) => t * t * (3 - 2 * t);

function parseLensPath(raw: unknown): LensStop[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const stops: LensStop[] = [];
    for (const s of raw) {
      if (
        s &&
        typeof s === "object" &&
        typeof (s as LensStop).x === "number" &&
        typeof (s as LensStop).y === "number" &&
        typeof (s as LensStop).at === "number"
      ) {
        stops.push({
          x: (s as LensStop).x,
          y: (s as LensStop).y,
          at: clamp01((s as LensStop).at),
        });
      }
    }
    if (stops.length > 0) return stops;
  }
  return DEFAULT_LENS_PATH;
}

function parseActivePath(raw: unknown): ActiveStop[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const stops: ActiveStop[] = [];
    for (const s of raw) {
      if (
        s &&
        typeof s === "object" &&
        typeof (s as ActiveStop).at === "number" &&
        typeof (s as ActiveStop).v === "number"
      ) {
        stops.push({
          at: clamp01((s as ActiveStop).at),
          v: clamp01((s as ActiveStop).v),
        });
      }
    }
    if (stops.length > 0) return stops;
  }
  return DEFAULT_ACTIVE_PATH;
}

/** Sample a waypoint path at progress t (0-1). Clamped to the first/last
 * stop outside the path's span; smoothstepped between stops. */
function lensAt(path: LensStop[], t: number): { x: number; y: number } {
  const first = path[0];
  const last = path[path.length - 1];
  if (t <= first.at) return { x: first.x, y: first.y };
  if (t >= last.at) return { x: last.x, y: last.y };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (t >= a.at && t <= b.at) {
      const span = b.at - a.at;
      const k = span > 0 ? easeSmoothstep((t - a.at) / span) : 1;
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
      };
    }
  }
  return { x: last.x, y: last.y };
}

function activeAt(path: ActiveStop[], t: number): number {
  const first = path[0];
  const last = path[path.length - 1];
  if (t <= first.at) return first.v;
  if (t >= last.at) return last.v;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (t >= a.at && t <= b.at) {
      const span = b.at - a.at;
      const k = span > 0 ? easeSmoothstep((t - a.at) / span) : 1;
      return a.v + (b.v - a.v) * k;
    }
  }
  return last.v;
}

// ---------------------------------------------------------------------------
// Driver — the re-touched part: one deterministic capture + draw per frame.
// ---------------------------------------------------------------------------

/** A layoutSubtree canvas — Chrome paints the canvas's DOM subtree into
 * the canvas itself, and `requestPaint` triggers a fresh paint record. */
type LayoutCanvas = HTMLCanvasElement & {
  layoutSubtree?: boolean;
  requestPaint?: () => void;
};

/** The 2D context of a layoutSubtree canvas. `drawElementImage` copies
 * the element's latest paint record into the canvas backing store. */
type CaptureCtx = CanvasRenderingContext2D & {
  drawElementImage?: (
    element: HTMLElement,
    dx: number,
    dy: number,
    dwidth: number,
    dheight: number,
  ) => DOMMatrix;
};

/** Ask the browser to paint `layout`'s subtree and wait for it. Returns
 * false if the mechanism is unavailable or the paint never fires. */
function waitForPaint(layout: LayoutCanvas): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof layout.requestPaint !== "function") {
      resolve(false);
      return;
    }
    let settled = false;
    // eslint-disable-next-line prefer-const -- timer IS reassigned below; eslint scope-analysis false positive.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(ok);
    };
    timer = setTimeout(() => finish(false), 500);
    layout.addEventListener("paint", () => finish(true), { once: true });
    layout.requestPaint();
  });
}

interface DecryptParams {
  radius: number;
  softness: number;
  cell: number;
  aspect: number;
  charset: string;
  colored: number;
  color: string;
  brightness: number;
  legibility: number;
  contrast: number;
  exposure: number;
  scramble: number;
  scrambleSpeed: number;
  edgeWidth: number;
  edgeFlicker: number;
  edgeGlow: number;
  edgeTint: number;
  aberration: number;
  passthrough: number;
  threshold: number;
  background: string;
  smoothing: number;
  lensPath: LensStop[];
  activePath: ActiveStop[];
}

/** A compiled pass: linked program plus its uniform locations. */
type Pass = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
};

/** Persistent per-frame GL state — created once at setup and reused.
 * The glyph atlas + shape signatures are expensive to build, so they
 * are built here (once) and only rebuilt if charset/aspect change. */
type GlState = {
  cellPass: Pass;
  mainPass: Pass;
  quad: WebGLBuffer;
  contentTexture: WebGLTexture;
  cellTexture: WebGLTexture;
  cellFbo: WebGLFramebuffer;
  cellCols: number;
  cellRows: number;
  shapeTexture: WebGLTexture;
  atlasTexture: WebGLTexture;
  glyphCount: number;
  atlasCols: number;
  atlasRows: number;
  atlasPad: [number, number];
  atlasInner: [number, number];
  builtCharset: string;
  builtAspect: number;
  bg: [number, number, number];
  bgKey: string;
  fg: [number, number, number];
  colorKey: string;
  crisp: boolean;
  /** The damped cursor — initialized to the t=0 lens position, then
   * chased toward each frame's waypoint target exactly like upstream
   * chases the pointer (deterministic: delta = 1/fps). */
  pointer: {
    x: number;
    y: number;
    tx: number;
    ty: number;
    active: number;
    target: number;
  };
  measuredMaxX: number;
};

/** Persistent capture state across frames: the layoutSubtree canvas, its
 * 2D context, and the WebGL state. Created on the first frame, reused
 * for the rest. */
type CaptureState = {
  layout: LayoutCanvas;
  ctx: CaptureCtx;
  gls: GlState;
};

function cellSizePx(p: DecryptParams, dpr: number): [number, number] {
  const h = Math.min(Math.max(p.cell, 4), 40) * dpr;
  return [h * clampAspect(p.aspect), h];
}

/** Build the glyph atlas (rasterized charset) and the 6×N shape-signature
 * texture, uploading both. Pure function of charset + aspect. */
function buildAtlas(
  gl: WebGL2RenderingContext,
  gls: GlState,
  charset: string,
  aspect: number,
): boolean {
  const glyphs = buildGlyphList(charset);
  const cellH = ATLAS_CELL;
  const cellW = Math.max(Math.round(cellH * aspect), 8);
  const padW = cellW + ATLAS_PAD * 2;
  const padH = cellH + ATLAS_PAD * 2;
  const cols = Math.ceil(Math.sqrt(glyphs.length));
  const rows = Math.ceil(glyphs.length / cols);
  const surface = document.createElement("canvas");
  surface.width = cols * padW;
  surface.height = rows * padH;
  const ctx = surface.getContext("2d");
  if (!ctx) return false;
  ctx.clearRect(0, 0, surface.width, surface.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontPx = Math.floor(Math.min(cellH * 0.92, cellW / 0.58));
  ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  for (let g = 0; g < glyphs.length; g++) {
    ctx.fillText(
      glyphs[g],
      (g % cols) * padW + padW / 2,
      Math.floor(g / cols) * padH + padH / 2,
    );
  }
  const image = ctx.getImageData(0, 0, surface.width, surface.height);
  const vectors = glyphShapes(image, cols, cellW, cellH, glyphs.length);

  gl.bindTexture(gl.TEXTURE_2D, gls.atlasTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    surface,
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.bindTexture(gl.TEXTURE_2D, gls.shapeTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    6,
    glyphs.length,
    0,
    gl.RED,
    gl.FLOAT,
    vectors,
  );
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

  gls.glyphCount = glyphs.length;
  gls.atlasCols = cols;
  gls.atlasRows = rows;
  gls.atlasPad = [ATLAS_PAD / padW, ATLAS_PAD / padH];
  gls.atlasInner = [cellW / padW, cellH / padH];
  gls.builtCharset = charset;
  gls.builtAspect = aspect;
  return true;
}

/** One-time WebGL setup: programs, quad, textures, FBO, glyph atlas. */
function setupGL(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  p: DecryptParams,
  dpr: number,
): GlState | null {
  function compile(type: number, text: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("DecryptReveal shader error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function link(fragText: string): Pass | null {
    const vertexShader = compile(gl.VERTEX_SHADER, VERT);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragText);
    if (!vertexShader || !fragmentShader) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("DecryptReveal link error:", gl.getProgramInfoLog(program));
      return null;
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms, vertexShader, fragmentShader };
  }

  const cellPass = link(CELL_FRAG);
  const mainPass = link(MAIN_FRAG);
  if (!cellPass || !mainPass) return null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function makeTexture(filter: number): WebGLTexture | null {
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  const contentTexture = makeTexture(gl.LINEAR);
  if (!contentTexture) return null;
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  const [cw, ch] = cellSizePx(p, dpr);
  const cellCols = Math.max(Math.ceil(width / cw), 1);
  const cellRows = Math.max(Math.ceil(height / ch), 1);
  const cellTexture = makeTexture(gl.NEAREST);
  const cellFbo = gl.createFramebuffer();
  if (!cellTexture || !cellFbo) return null;
  gl.bindTexture(gl.TEXTURE_2D, cellTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    cellCols,
    cellRows,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, cellFbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    cellTexture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const shapeTexture = makeTexture(gl.NEAREST);
  const atlasTexture = gl.createTexture();
  if (!shapeTexture || !atlasTexture) return null;
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const gls: GlState = {
    cellPass,
    mainPass,
    quad,
    contentTexture,
    cellTexture,
    cellFbo,
    cellCols,
    cellRows,
    shapeTexture,
    atlasTexture,
    glyphCount: 0,
    atlasCols: 1,
    atlasRows: 1,
    atlasPad: [0, 0],
    atlasInner: [1, 1],
    builtCharset: "",
    builtAspect: 0,
    bg: [0, 0, 0],
    bgKey: "",
    fg: [0.29, 0.87, 0.5],
    colorKey: "",
    crisp: false,
    pointer: {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      active: 0,
      target: 0,
    },
    measuredMaxX: 1,
  };
  if (!buildAtlas(gl, gls, p.charset, clampAspect(p.aspect))) return null;

  // The cursor starts at the t=0 lens position (upstream starts
  // off-screen and snaps on first pointermove — a render's "first
  // pointermove" is frame 0, so the equivalent is a snap at t=0, then
  // the damping takes over from frame 1).
  const startLens = lensAt(gls.builtCharset === "" ? p.lensPath : p.lensPath, 0);
  const startActive = activeAt(p.activePath, 0);
  gls.pointer.x = startLens.x;
  gls.pointer.y = startLens.y;
  gls.pointer.tx = startLens.x;
  gls.pointer.ty = startLens.y;
  gls.pointer.active = startActive;
  gls.pointer.target = startActive;

  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reducedMotion = false;
  }
  gls.crisp = reducedMotion;
  return gls;
}

/** The glyph-cell pass: match each cell's shape signature to a glyph and
 * record cell color + glyph index into the cell FBO. */
function renderCells(
  gl: WebGL2RenderingContext,
  gls: GlState,
  p: DecryptParams,
  width: number,
  height: number,
  dpr: number,
) {
  const [cw, ch] = cellSizePx(p, dpr);
  const u = gls.cellPass.uniforms;
  gl.useProgram(gls.cellPass.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gls.contentTexture);
  gl.uniform1i(u.uContent, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gls.shapeTexture);
  gl.uniform1i(u.uShapes, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform2f(u.uContentRes, width, height);
  gl.uniform2f(u.uCellPx, cw, ch);
  gl.uniform1i(u.uGlyphCount, gls.glyphCount);
  gl.uniform1f(u.uContrast, Math.min(Math.max(p.contrast, 0.3), 3));
  gl.uniform1f(u.uExposure, Math.min(Math.max(p.exposure, 0.2), 3));
  gl.uniform1f(u.uThreshold, Math.max(p.threshold, 0.005));
  gl.uniform3f(u.uBg, gls.bg[0], gls.bg[1], gls.bg[2]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gls.cellFbo);
  gl.viewport(0, 0, gls.cellCols, gls.cellRows);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/** The main pass: decrypt circle + scramble + glyph masks + composite. */
function renderMain(
  gl: WebGL2RenderingContext,
  gls: GlState,
  p: DecryptParams,
  time: number,
  dpr: number,
  cssW: number,
  cssH: number,
  deviceW: number,
  deviceH: number,
  maxX: number,
) {
  const [cw, ch] = cellSizePx(p, dpr);
  const u = gls.mainPass.uniforms;
  gl.useProgram(gls.mainPass.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gls.contentTexture);
  gl.uniform1i(u.uContent, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gls.cellTexture);
  gl.uniform1i(u.uCells, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, gls.atlasTexture);
  gl.uniform1i(u.uAtlas, 2);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform2f(u.uRes, cssW, cssH);
  gl.uniform1f(u.uDpr, dpr);
  gl.uniform2f(u.uCellPx, cw, ch);
  gl.uniform2f(u.uGrid, gls.cellCols, gls.cellRows);
  gl.uniform2f(u.uAtlasGrid, gls.atlasCols, gls.atlasRows);
  gl.uniform2f(u.uAtlasPad, gls.atlasPad[0], gls.atlasPad[1]);
  gl.uniform2f(u.uAtlasInner, gls.atlasInner[0], gls.atlasInner[1]);
  gl.uniform1i(u.uGlyphCount, gls.glyphCount);
  gl.uniform2f(u.uPointer, gls.pointer.x, gls.pointer.y);
  gl.uniform1f(u.uActive, gls.pointer.active);
  gl.uniform1f(u.uRadius, Math.max(p.radius, 1));
  gl.uniform1f(u.uSoftness, p.softness);
  gl.uniform1f(u.uColored, p.colored);
  gl.uniform3f(u.uColor, gls.fg[0], gls.fg[1], gls.fg[2]);
  gl.uniform1f(u.uBrightness, Math.min(Math.max(p.brightness, 0.2), 3));
  gl.uniform1f(u.uLegibility, Math.min(Math.max(p.legibility, 0), 1));
  gl.uniform1f(u.uScramble, Math.min(Math.max(p.scramble, 0), 1));
  gl.uniform1f(
    u.uScrambleSpeed,
    Math.min(Math.max(p.scrambleSpeed, 0), 30),
  );
  gl.uniform1f(u.uEdgeWidth, p.edgeWidth);
  gl.uniform1f(u.uEdgeFlicker, Math.min(Math.max(p.edgeFlicker, 0), 1));
  gl.uniform1f(u.uEdgeGlow, Math.min(Math.max(p.edgeGlow, 0), 3));
  gl.uniform1f(u.uEdgeTint, p.edgeTint);
  gl.uniform1f(u.uAberration, Math.max(p.aberration, 0));
  gl.uniform1f(u.uPassthrough, p.passthrough);
  gl.uniform3f(u.uBg, gls.bg[0], gls.bg[1], gls.bg[2]);
  gl.uniform1f(u.uTime, time);
  gl.uniform1f(u.uMaxX, maxX);
  gl.uniform1f(u.uCrisp, gls.crisp ? 1 : 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, deviceW, deviceH);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/**
 * Capture `content`'s current painted HTML into the content texture,
 * then run the cell pass + composite once. Pure function of the DOM
 * state, the waypoint progress, and composition time — deterministic.
 * Resolves after the draw; on any failure the canvas stays transparent
 * and the plain DOM shows through (untreated), so the frame never
 * blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: DecryptParams,
  progress: number,
  time: number,
  compWidth: number,
  compHeight: number,
  fps: number,
  stateRef: React.MutableRefObject<CaptureState | null>,
): Promise<void> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(compWidth * dpr));
  const height = Math.max(1, Math.round(compHeight * dpr));
  output.width = width;
  output.height = height;

  const glc = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!glc || glc.isContextLost()) return;
  const gl: WebGL2RenderingContext = glc;

  const host = output.parentElement;
  if (!host) {
    console.error("DecryptReveal: output canvas has no parent — rendering children untreated");
    return;
  }
  const cssW = Math.max(1, Math.round(compWidth));
  const cssH = Math.max(1, Math.round(compHeight));
  let st = stateRef.current;
  const needSetup =
    !st || !st.layout.isConnected || content.parentElement !== st.layout;
  // The FIRST paint of a freshly moved subtree is not reliable in
  // headless Chrome — the html-in-canvas record comes out partial, and
  // it only rebuilds once the content's painted appearance changes. The
  // output canvas is transparent on frame 0 (the decrypt circle is
  // inactive), so instead of capturing garbage the setup is deferred
  // one frame: frame 0 shows the raw DOM. From frame 1 the record is
  // built from settled content and stays correct.
  if (needSetup && progress === 0) {
    return;
  }
  if (needSetup) {
    if (content.parentElement !== host) {
      // The scene lives inside a layout canvas we don't own (React
      // remounted the subtree mid-render) — cannot capture this frame.
      return;
    }
    if (st && st.layout.isConnected) {
      // Stale setup from a previous lifecycle — drop it.
      host.removeChild(st.layout);
      stateRef.current = null;
    }
    const layout = document.createElement("canvas") as LayoutCanvas;
    layout.layoutSubtree = true;
    if (typeof layout.requestPaint !== "function") {
      console.error(
        "DecryptReveal: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("DecryptReveal: drawElementImage unavailable — rendering children untreated");
      return;
    }
    layout.style.position = "absolute";
    layout.style.top = "0";
    layout.style.left = "0";
    layout.style.width = `${cssW}px`;
    layout.style.height = `${cssH}px`;
    // Under the treated frame: the layout canvas sits below the output
    // canvas, so until the texture is ready the raw scene shows through
    // the transparent GL canvas — no blank frames.
    if (output.parentElement === host) {
      host.insertBefore(layout, output);
    } else {
      host.appendChild(layout);
    }
    layout.appendChild(content);
    const gls = setupGL(gl, width, height, p, dpr);
    if (!gls) {
      console.error("DecryptReveal: WebGL setup failed — rendering children untreated");
      host.appendChild(content);
      if (layout.parentElement === host) host.removeChild(layout);
      return;
    }
    st = { layout, ctx: lctx, gls };
    stateRef.current = st;
  }
  if (!st) return; // setup bailed — scene stays untreated this frame

  const { gls } = st;

  // The page is laid out and painted by the time the first macrotask
  // runs (Remotion only lays out at screenshot time, so the first frame
  // needs the settle), then a fresh paint of the scene is requested.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (needSetup) {
    // The setup frame gets an extra settle before the first paint so the
    // moved subtree is fully laid out and painted when it is recorded.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // The scene's horizontal band, measured only NOW — before the settle
  // the page is not laid out, clientWidth reads 0, and uMaxX would
  // clamp to its minimum, restricting the treatment to a sliver of the
  // frame. Falls back to the full band if it still reads 0.
  gls.measuredMaxX = (() => {
    const measured =
      content.clientWidth / Math.max(output.clientWidth || content.clientWidth, 1);
    return Math.min(1, Math.max(0.05, measured || 1));
  })();

  const painted = await waitForPaint(st.layout);
  if (!painted) {
    // The mechanism is broken on this browser — roll back to plain DOM.
    if (content.parentElement === st.layout) {
      host.appendChild(content);
    }
    if (st.layout.parentElement === host) {
      host.removeChild(st.layout);
    }
    stateRef.current = null;
    console.error(
      "DecryptReveal: html-in-canvas paint never fired — rendering children untreated",
    );
    return;
  }

  // Backing store at the output's resolution (dpr-scaled), then copy the
  // freshly recorded paint of the scene into it.
  st.layout.width = Math.max(1, Math.round(cssW * dpr));
  st.layout.height = Math.max(1, Math.round(cssH * dpr));
  st.ctx.setTransform(1, 0, 0, 1, 0, 0);
  st.ctx.clearRect(0, 0, st.layout.width, st.layout.height);
  st.ctx.drawElementImage(content, 0, 0, st.layout.width, st.layout.height);

  gl.bindTexture(gl.TEXTURE_2D, gls.contentTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, st.layout);

  // Background / cipher color parsing — cached until the CSS value
  // changes (the 1×1 canvas probe is deterministic but avoid per frame).
  if (p.background !== gls.bgKey) {
    gls.bgKey = p.background;
    gls.bg = parseColor(p.background);
  }
  if (p.color !== gls.colorKey) {
    gls.colorKey = p.color;
    gls.fg = parseColor(p.color);
  }

  // Rebuild the atlas if the charset/aspect changed mid-render (rare —
  // kept for setOptions parity; normally built once at setup).
  const aspect = clampAspect(p.aspect);
  if (gls.builtCharset !== p.charset || gls.builtAspect !== aspect) {
    buildAtlas(gl, gls, p.charset, aspect);
  }

  // The cursor chases this frame's waypoint target with upstream's
  // exponential damping — deterministic because delta is fixed at
  // 1/fps of composition time (upstream: real rAF deltas).
  const lens = lensAt(p.lensPath, progress);
  const target = activeAt(p.activePath, progress);
  const tau = Math.max(p.smoothing, 1e-4);
  const k = gls.crisp ? 1 : 1 - Math.exp(-1 / Math.max(fps, 1) / tau);
  gls.pointer.tx = lens.x * cssW;
  gls.pointer.ty = lens.y * cssH;
  gls.pointer.target = target;
  gls.pointer.x += (gls.pointer.tx - gls.pointer.x) * k;
  gls.pointer.y += (gls.pointer.ty - gls.pointer.y) * k;
  gls.pointer.active += (gls.pointer.target - gls.pointer.active) * k;

  renderCells(gl, gls, p, width, height, dpr);
  renderMain(gl, gls, p, time, dpr, cssW, cssH, width, height, gls.measuredMaxX);
}

export const DecryptRip: React.FC<DecryptRipProps> = ({
  config,
  children,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width: compWidth, height: compHeight } = useVideoConfig();
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds. Memoized so the effect
  // below only re-runs when the values actually change (a fresh object
  // each render would re-trigger the capture mid-frame).
  const p: DecryptParams = useMemo(() => {
    return {
      radius: Math.max(1, Number(extras.radius ?? 400)),
      softness: Math.min(1, Math.max(0, Number(extras.softness ?? 0.5))),
      cell: Math.min(40, Math.max(4, Number(extras.cell ?? 10))),
      aspect: clampAspect(Number(extras.aspect ?? 0.75)),
      charset:
        typeof extras.charset === "string" && extras.charset.length > 0
          ? extras.charset
          : PRINTABLE_ASCII,
      colored: Math.min(1, Math.max(0, Number(extras.colored ?? 1))),
      color: typeof extras.color === "string" ? extras.color : "#4ade80",
      brightness: Math.min(3, Math.max(0.2, Number(extras.brightness ?? 1))),
      legibility: Math.min(1, Math.max(0, Number(extras.legibility ?? 1))),
      contrast: Math.min(3, Math.max(0.3, Number(extras.contrast ?? 1))),
      exposure: Math.min(3, Math.max(0.2, Number(extras.exposure ?? 1))),
      scramble: Math.min(1, Math.max(0, Number(extras.scramble ?? 0.1))),
      scrambleSpeed: Math.min(30, Math.max(0, Number(extras.scrambleSpeed ?? 6))),
      edgeWidth: Math.min(1, Math.max(0, Number(extras.edgeWidth ?? 0.2))),
      edgeFlicker: Math.min(1, Math.max(0, Number(extras.edgeFlicker ?? 1))),
      edgeGlow: Math.min(3, Math.max(0, Number(extras.edgeGlow ?? 2))),
      edgeTint: Math.min(1, Math.max(0, Number(extras.edgeTint ?? 0.75))),
      aberration: Math.max(0, Number(extras.aberration ?? 10)),
      passthrough: Math.min(1, Math.max(0, Number(extras.passthrough ?? 0.15))),
      threshold: Math.min(1, Math.max(0.005, Number(extras.threshold ?? 0.025))),
      background:
        typeof extras.background === "string" ? extras.background : "#000000",
      smoothing: Math.min(2, Math.max(0, Number(extras.smoothing ?? 0.2))),
      lensPath: parseLensPath(extras.lensPath),
      activePath: parseActivePath(extras.activePath),
    };
  }, [extras]);

  // Deterministic: the decrypt circle follows the waypoint path (not a
  // cursor), and the cipher scramble advances with composition time —
  // frame N always produces exactly the same pixels.
  const progress = Math.min(1, Math.max(0, frame / durationInFrames));
  const time = frame / Math.max(fps, 1);

  const outputRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const captureStateRef = useRef<CaptureState | null>(null);

  // A Remotion render keeps ONE page per composition and re-renders
  // React each frame, so this layout effect re-runs every frame. The
  // capture setup (layoutSubtree canvas, the moved scene, the WebGL
  // programs/atlas) is stateful across frames — the texture is
  // refreshed with each frame's freshly painted DOM (transform
  // animations included). The render is held (delayRender) until the
  // capture + draw completes, so the frame screenshot always contains
  // the treatment.
  useLayoutEffect(() => {
    const output = outputRef.current;
    const content = contentRef.current;
    if (!output || !content) return;
    const handle = delayRender();
    captureAndDraw(
      output,
      content,
      p,
      progress,
      time,
      compWidth,
      compHeight,
      fps,
      captureStateRef,
    )
      .catch((err) => console.error("DecryptReveal capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, progress, time]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the content
             texture each frame (transform animations included;
             per-element opacity fades are not — see animation.md); if
             the capture or WebGL fails, this DOM is what the viewer
             sees — untreated. DecryptReveal does not scroll: the
             decrypt circle travels over the scene as it sits. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The cipher, composited over the DOM when ready. */}
        <canvas
          ref={outputRef}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
// Barrel-name alias: publish_animations.py derives the exported component name
// from the folder (decrypt-reveal) and the auto-generated index.ts re-exports DecryptReveal.
// Keep both names available so previews (DecryptRip) and the barrel (DecryptReveal) compile.
export const DecryptReveal = DecryptRip;
