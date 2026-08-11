import React, { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
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
 * though flame-wrap renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * FlameWrapRip — border of fire around arbitrary content.
 *
 * A deterministic Remotion port of the Canvas UI `<FlameWrap>` WebGL
 * component (canvasui.dev). The GLSL is kept VERBATIM from the upstream
 * `FlameWrapVanilla.ts`; only the runtime driver is re-touched:
 *
 *   1. No `requestAnimationFrame` loop and no accumulated time. Each
 *      Remotion frame is a fresh browser page, and the shader is a pure
 *      function of its uniforms, so the effect draws ONCE per frame with
 *      `uTime = (frame / fps) * global.speed * speed`. Frame N always
 *      produces exactly the same pixels — seek-safe and deterministic.
 *   2. No html-in-canvas content capture (the experimental
 *      `drawElementImage` API does not exist in headless Chromium). The
 *      component always runs the shader's BUILT-IN fallback branch
 *      (`uHasContent = 0`): transparent-canvas fire — tongues rising
 *      from the top edge, rim glow on all edges, rising sparks, smoke
 *      wisps — composited OVER the caller's `children`, which stay
 *      crisp DOM text underneath. Content-branch features (scorch,
 *      ember line, burn dissolve, heat distortion) are skipped.
 *   3. The output canvas renders at 0.5x internal resolution (SwiftShader
 *      is software-rasterized; fire is soft noise, so upscaling is
 *      invisible) and is positioned by pure CSS around the content box —
 *      no DOM measurement state, one layout effect per frame.
 *
 * Layering (lowest → highest):
 *   1. The caller's `children` — untouched, rendered by the DOM.
 *   2. The fire canvas, absolutely positioned `reach` px above the
 *      content's top edge and `glow` px beyond the other three, sized
 *      to the content box via CSS `calc()` — flames melt `melt` px into
 *      the rounded-rect silhouette (radius must match the content's
 *      border-radius to hug its corners).
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): color (hex, default theme accent), intensity,
 * height (flame reach), spread, radius (corner radius of the burning
 * outline — match your content), speed, scale (flame detail),
 * turbulence/turbulenceScale/turbulenceReach, sparks/sparkSize/
 * sparkDensity/sparkSpeed, rim (edge glow), melt (bite into the
 * silhouette), smoke, ember, scorch, distortion (accepted for schema
 * parity; content-branch only, no-op headless), fadeInFrames,
 * fadeOutFrames.
 *
 * Performance:
 *   - One WebGL2 context, one shader compile, one full-canvas draw per
 *     frame (~0.5x res). No per-cell DOM cost like the DOM templates.
 *   - If WebGL2 is unavailable the component renders the children alone
 *     (no fire) and logs an error — it never crashes the frame.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface FlameWrapRipProps {
  config: TemplateConfig;
  /** Source content the fire wraps around. Rendered untouched. */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

/** Parse #RGB / #RRGGBB into 0..255 [r, g, b]. Falls back to orange. */
function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [255, 87, 34];
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI FlameWrapVanilla.ts. Do not
// edit; the port's "re-touch" lives in the driver below.
// ---------------------------------------------------------------------------

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uRectCenter;
uniform vec2 uRectHalf;
uniform float uCorner;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uHeight;
uniform float uSpread;
uniform float uScale;
uniform float uTurbulence;
uniform float uTurbScale;
uniform float uTurbReach;
uniform float uSparks;
uniform float uSparkSize;
uniform float uSparkDensity;
uniform float uSparkSpeed;
uniform float uRim;
uniform float uMelt;
uniform float uDistortion;
uniform float uSmoke;
uniform float uEmber;
uniform float uScorch;
uniform float uHasContent;

#define S(a, b, t) smoothstep(a, b, t)

vec3 permute (vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise (vec2 v) {
  const vec4 C = vec4(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm (vec2 p) {
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.5 * snoise(p);
  p = m * p * 2.03 + vec2(11.3, 7.1);
  v += 0.27 * snoise(p);
  p = m * p * 1.97 + vec2(3.7, 19.1);
  v += 0.15 * snoise(p);
  p = m * p * 2.01 + vec2(8.3, 2.9);
  v += 0.08 * snoise(p);
  return v * 0.5 + 0.5;
}

float fbm2 (vec2 p) {
  float v = 0.62 * snoise(p);
  v += 0.31 * snoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.13 + vec2(5.2, 1.3));
  return v * 0.54 + 0.5;
}

vec2 turbulence (vec2 p) {
  float freq = 12.0 * clamp(uScale, 0.05, 1.0) * clamp(uTurbScale, 0.2, 3.0);
  mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
  for (float i = 0.0; i < 7.0; i++) {
    float phase = freq * (p * rot).y + 6.0 * uTime + i;
    p += uTurbulence * rot[0] * sin(phase) / freq;
    rot *= mat2(0.6, -0.8, 0.8, 0.6);
    freq *= 1.2;
  }
  return p;
}

vec3 hash3 (vec2 p) {
  vec3 q = vec3(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)),
    dot(p, vec2(419.2, 371.9))
  );
  return fract(sin(q) * 43758.5453);
}

float sdRoundRect (vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main () {
  vec2 frag = vUv * uResolution;
  vec2 rel = frag - uRectCenter;
  float unit = max(uHeight, 24.0);
  float corner = min(uCorner, min(uRectHalf.x, uRectHalf.y));
  float spreadPx = max(uSpread, 8.0);
  float t = uTime;
  float detail = clamp(uScale, 0.05, 1.0);

  float d0 = sdRoundRect(rel, uRectHalf, corner);
  float px = rel.x / unit;
  float py = rel.y / unit;

  float yA = max(rel.y - uRectHalf.y, 0.0) / unit;
  float sway = snoise(vec2(px * 1.1, t * 0.5)) * 0.55
    + snoise(vec2(px * 2.4, t * 0.9 + 41.0)) * 0.25;
  float sx = px + yA * sway;
  float env = fbm2(vec2(sx * 1.6 * detail + 3.7, t * 0.55 - yA * 0.4));
  float env2 = fbm2(vec2(sx * 3.6 * detail, t * 0.85 + 17.0 - yA * 0.6));
  float tongue = clamp(
    0.75 * S(0.3, 0.9, env) + 0.5 * S(0.4, 0.95, env2),
    0.0,
    1.0
  );

  float meltPx = max(uMelt, 1.0);
  float biteTop = (3.0 + meltPx * 1.4) * (0.35 + 0.65 * tongue)
    + 2.0 * snoise(vec2(px * 5.0 * detail, t * 1.1 + 5.0));
  float yF = uRectHalf.y - biteTop;
  float frontTop = rel.y - yF;

  float perim = fbm2(rel * (1.9 / unit) * detail + vec2(0.0, t * 0.4) + 31.0);
  float biteSB = 3.0 + meltPx * (0.25 + 0.75 * perim);
  float frontSB = d0 + biteSB;

  float wTop = S(-0.62 * unit, -0.1 * unit, rel.y - uRectHalf.y)
    * S(10.0, -30.0, abs(rel.x) - (uRectHalf.x - corner));
  float front = mix(frontSB, frontTop, wTop);

  float reach = mix(
    spreadPx * 0.9,
    unit * (0.2 + 0.45 * tongue),
    wTop
  );
  float q = front / reach;

  vec2 np = vec2(px * 2.3, py * 1.25 - t * 1.85) * detail;
  np = turbulence(np);
  float n = fbm(np);

  float win = S(-0.08, 0.02, q);
  float root = exp(-abs(q) * 5.0);
  float ridge = 1.0 - abs(2.0 * n - 1.0);
  float flameH = mix(1.0, 0.5 + 0.6 * tongue, wTop);
  float g = max(q, 0.0) / flameH;
  float shred = fbm2(np * 1.9 + 63.0);
  g *= 1.0 + 0.7 * (shred - 0.5) * S(0.2, 0.8, g);
  float dens = n * 0.95 + ridge * 0.45 - 0.18
    + (1.0 - min(g, 1.0)) * 0.3
    - g * (0.9 + 0.25 * n);
  dens = clamp(dens * 2.4, 0.0, 1.0) * win;
  dens *= mix(1.0 - S(0.32, 1.05, q), 1.0 - S(0.9, 1.2, g), wTop);
  float body = dens * dens * (3.0 - 2.0 * dens);
  float emis = clamp(uIntensity, 0.0, 2.0);
  float e = body * (0.55 + 0.75 * root) * (0.45 + 0.55 * n)
    + win * root * (0.1 + 0.4 * n);
  e *= mix(0.45, 1.0, wTop) * max(emis, 0.001);

  vec3 hot = mix(uColor, vec3(1.0), 0.35);
  vec3 deep = mix(uColor, uColor * uColor, 0.5) * 0.9;
  float ramp = 1.0 - exp(-e * 2.4);
  vec3 fireCol = mix(deep, uColor, S(0.0, 0.55, ramp));
  float core = ramp * (0.45 + 0.55 * exp(-g * 2.2)) * (0.5 + 0.5 * n);
  fireCol = mix(fireCol, hot, S(0.7, 1.05, core));
  fireCol *= 0.8 + 0.4 * ramp;
  float fireA = clamp(1.0 - exp(-e * 3.4), 0.0, 1.0);

  float halo = exp(-max(front, 0.0) / (spreadPx * 1.2)) * S(0.0, 3.0, front)
    * (0.5 + 0.5 * n) * 0.3 * clamp(uRim, 0.0, 2.0) * mix(1.0, 0.45, wTop);
  vec3 glow = uColor * halo * clamp(uIntensity, 0.0, 2.0);

  if (uSparks > 0.001) {
    float sSpeed = max(uSparkSpeed, 0.05);
    float sCells = 5.0 * clamp(uSparkDensity, 0.3, 2.5);
    float sSize = clamp(uSparkSize, 0.2, 3.0);
    float gate = S(-0.05, 0.1, q) * (1.0 - S(1.3, 2.2, q)) * wTop;
    float spark = 0.0;
    for (float L = 0.0; L < 2.0; L++) {
      float speed = 1.5 * sSpeed * (0.75 + 0.5 * L);
      vec2 ps = vec2(px, py - t * speed);
      ps.x += 0.08 * snoise(vec2(py * 0.9 + L * 5.0, t * 0.5));
      float cells = sCells * (1.0 + 0.6 * L);
      vec2 cl = floor(ps * cells) + L * 19.0;
      vec2 fr = fract(ps * cells);
      vec3 rnd = hash3(cl);
      vec3 rnd2 = hash3(cl + 7.3);
      float on = step(rnd2.x, 0.42);
      float life = fract(rnd.z + t * sSpeed * (0.3 + 0.5 * rnd2.x));
      vec2 ppos = vec2(0.5) + 0.56 * (rnd.xy - 0.5);
      ppos.x += 0.14 * sin(t * (0.7 + rnd.z * 2.8) + rnd.y * 6.2832)
        + 0.1 * snoise(vec2(t * 0.6 + rnd.x * 9.0, cl.y * 0.7))
        + (life - 0.5) * 0.5 * (rnd2.y - 0.5);
      ppos.y += (life - 0.5) * 0.3 * rnd2.y;
      float tw = S(0.02, 0.2, life) * S(1.0, 0.55, life);
      tw *= 0.75 + 0.25 * sin(t * (6.0 + rnd2.z * 9.0) + rnd.x * 6.2832);
      vec2 pd = (fr - ppos) / cells * unit;
      pd.y *= 0.55 + 0.3 * rnd2.z;
      float dp = length(pd);
      float r = (0.004 + 0.014 * rnd.y * rnd.y) * unit * sSize
        * mix(1.15, 0.55, life);
      float bmask = S(0.5, 0.32, max(abs(fr.x - 0.5), abs(fr.y - 0.5)));
      float sbody = exp(-dp * dp / (r * r));
      float sbloom = exp(-dp * dp / (r * r * 6.0)) * 0.3;
      spark += (sbody + sbloom) * tw * tw * on * bmask * (1.0 - 0.35 * L);
    }
    spark *= gate * uSparks;
    fireCol += mix(uColor, vec3(1.0), 0.55) * spark * 1.6;
    fireA = clamp(fireA + spark * 0.85, 0.0, 1.0);
  }

  vec2 edgePx = min(frag, uResolution - frag);
  float fadeW = max(24.0, spreadPx * 0.75);
  float fade = S(0.0, fadeW, edgePx.x) * S(0.0, fadeW, edgePx.y);
  fireA *= fade;
  glow *= fade;
  halo *= fade;

  float wisp = S(0.45, 0.9, fbm2(np * 0.55 + vec2(0.0, 17.0)));
  float smoke = S(1.55, 1.05, g) * S(0.85, 1.15, g)
    * (1.0 - body) * wTop
    * wisp * 0.055 * clamp(uSmoke, 0.0, 2.0) * fade;
  vec3 smokeCol = mix(vec3(0.5), uColor, 0.5);

  if (uHasContent < 0.5) {
    float sA = clamp(smoke, 0.0, 1.0);
    float a = clamp(fireA + sA * (1.0 - fireA), 0.0, 1.0);
    outColor = vec4(
      fireCol * fireA + glow + smokeCol * sA * (1.0 - fireA),
      clamp(a + halo * 0.6, 0.0, 1.0)
    );
    return;
  }

  vec2 cUv = (rel + uRectHalf) / (2.0 * uRectHalf);
  float inRect = step(abs(cUv.x - 0.5), 0.5) * step(abs(cUv.y - 0.5), 0.5);

  float heatBand = exp(-abs(front) / max(uTurbReach, 4.0));
  vec2 wob = vec2(
    snoise(np * 1.7 + 9.0),
    snoise(np * 1.7 + 27.0)
  );
  vec2 disp = wob * min(uDistortion, 32.0) * heatBand;
  vec2 cUvD = clamp(cUv + disp / (2.0 * uRectHalf), vec2(0.002), vec2(0.998));
  vec4 content = texture(uContent, vec2(cUvD.x, 1.0 - cUvD.y));

  float burn = clamp(uIntensity, 0.0, 1.0);
  float depth = max(-front, 0.0);
  float charPatch = 0.5 + 0.5 * fbm2(rel * (2.6 / unit) * detail + 57.0);
  float charW = mix(4.0, 6.0 + meltPx * 1.6, wTop) * charPatch;
  float charT = (1.0 - S(charW, charW * 2.4, depth));
  content.rgb = mix(
    content.rgb,
    content.rgb * vec3(0.22, 0.19, 0.17),
    clamp(charT * 0.85 * burn * clamp(uScorch, 0.0, 2.0), 0.0, 1.0)
  );

  float emberW = mix(2.5, 5.5, wTop);
  float emberN = 0.3 + 0.7 * fbm2(np * 2.2 + 73.0);
  float emberK = clamp(uEmber, 0.0, 2.0);
  float ember = exp(-depth / emberW) * emberN * emberK;
  float whiteHot = exp(-depth / (emberW * 0.4)) * emberN * emberN * emberK;
  content.rgb = mix(content.rgb, uColor * 1.2, clamp(ember, 0.0, 1.0) * burn);
  content.rgb = mix(
    content.rgb,
    mix(uColor, vec3(1.0), 0.3) * 1.2,
    clamp(whiteHot, 0.0, 1.0) * burn
  );

  float dn = fbm2(rel * (3.2 / unit) * detail + vec2(0.0, t * 0.5) + 91.0);
  float dw = mix(2.0, 5.0, wTop);
  float dissolve = S(-dw, dw, front + (dn - 0.5) * dw * 2.5);
  float cA = content.a * (1.0 - dissolve) * inRect;
  float smk = smoke * (1.0 - cA);
  float baseA = min(cA + smk, 1.0);
  vec3 base = content.rgb * cA + smokeCol * smk;
  vec3 col = fireCol * fireA + base * (1.0 - fireA) + glow;
  float alpha = clamp(fireA + baseA * (1.0 - fireA) + halo * 0.5, 0.0, 1.0);
  outColor = vec4(col, alpha);
}`;

// ---------------------------------------------------------------------------
// Driver — the re-touched part: one deterministic draw per frame.
// ---------------------------------------------------------------------------

/** Internal render scale — SwiftShader rasterizes in software, so the
 * full-canvas fire shader is drawn at half resolution and CSS-upscaled
 * (fire is soft noise; the upscale is invisible). */
const RENDER_SCALE = 0.5;

/** Canvas margin above the content box (flame reach), CSS px. */
function canvasReach(height: number): number {
  return Math.round(Math.max(height, 24) * 1.5) + 40;
}

/** Canvas margin around the other three sides (glow), CSS px. */
function canvasGlow(spread: number): number {
  return Math.round(Math.max(spread, 8) * 3) + 16;
}

interface FlameParams {
  color: [number, number, number]; // 0..1
  intensity: number;
  height: number;
  spread: number;
  radius: number;
  speed: number;
  scale: number;
  turbulence: number;
  turbulenceScale: number;
  turbulenceReach: number;
  sparks: number;
  sparkSize: number;
  sparkDensity: number;
  sparkSpeed: number;
  rim: number;
  melt: number;
  distortion: number;
  smoke: number;
  ember: number;
  scorch: number;
}

/** Compile + link the fire program and draw it once at `time` seconds.
 * Pure function of the canvas layout and params — deterministic. */
function drawFlame(
  canvas: HTMLCanvasElement,
  p: FlameParams,
  time: number,
): void {
  const reach = canvasReach(p.height);
  const glow = canvasGlow(p.spread);

  const box = canvas.getBoundingClientRect();
  const contentW = box.width - 2 * glow;
  const contentH = box.height - reach - glow;
  if (contentW < 8 || contentH < 8) return;

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) {
    console.error("FlameWrap: WebGL2 unavailable — rendering children only");
    return;
  }
  // TS narrowing does not flow into closures, so alias the checked
  // context for compile() and the rest of the draw.
  const glc: WebGL2RenderingContext = gl;

  const s = RENDER_SCALE;
  canvas.width = Math.max(1, Math.round(box.width * s));
  canvas.height = Math.max(1, Math.round(box.height * s));

  function compile(type: number, text: string): WebGLShader | null {
    const shader = glc.createShader(type);
    if (!shader) return null;
    glc.shaderSource(shader, text);
    glc.compileShader(shader);
    if (!glc.getShaderParameter(shader, glc.COMPILE_STATUS)) {
      console.error("FlameWrap shader error:", glc.getShaderInfoLog(shader));
      glc.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compile(glc.VERTEX_SHADER, VERT);
  const fragmentShader = compile(glc.FRAGMENT_SHADER, FRAG);
  if (!vertexShader || !fragmentShader) return;
  const program = glc.createProgram();
  if (!program) return;
  glc.attachShader(program, vertexShader);
  glc.attachShader(program, fragmentShader);
  glc.linkProgram(program);
  if (!glc.getProgramParameter(program, glc.LINK_STATUS)) {
    console.error("FlameWrap link error:", glc.getProgramInfoLog(program));
    return;
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = glc.getProgramParameter(program, glc.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = glc.getActiveUniform(program, i);
    if (!info) continue;
    uniforms[info.name] = glc.getUniformLocation(program, info.name);
  }

  const quad = glc.createBuffer();
  glc.bindBuffer(glc.ARRAY_BUFFER, quad);
  glc.bufferData(
    glc.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    glc.STATIC_DRAW,
  );
  glc.enableVertexAttribArray(0);
  glc.vertexAttribPointer(0, 2, glc.FLOAT, false, 0, 0);

  // Content texture: bound but never sampled — the fallback branch
  // (uHasContent = 0) never reads it. Kept for GLSL validation parity.
  const contentTexture = glc.createTexture();
  glc.bindTexture(glc.TEXTURE_2D, contentTexture);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MIN_FILTER, glc.LINEAR);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAG_FILTER, glc.LINEAR);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_S, glc.CLAMP_TO_EDGE);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_T, glc.CLAMP_TO_EDGE);
  glc.texImage2D(
    glc.TEXTURE_2D,
    0,
    glc.RGBA,
    1,
    1,
    0,
    glc.RGBA,
    glc.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  glc.useProgram(program);
  glc.activeTexture(glc.TEXTURE0);
  glc.bindTexture(glc.TEXTURE_2D, contentTexture);
  glc.uniform1i(uniforms.uContent, 0);
  glc.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
  glc.uniform1f(uniforms.uTime, time);
  glc.uniform2f(
    uniforms.uRectCenter,
    (box.width / 2) * s,
    // WebGL y is BOTTOM-UP: the upstream engine computes
    // `rect.cy = outRect.bottom - boxCenterY`, so the rect center must
    // be measured from the canvas BOTTOM edge, not the top.
    (box.height - reach - contentH / 2) * s,
  );
  glc.uniform2f(
    uniforms.uRectHalf,
    Math.max((contentW / 2) * s, 1),
    Math.max((contentH / 2) * s, 1),
  );
  glc.uniform1f(uniforms.uCorner, Math.max(p.radius, 0) * s);
  glc.uniform3f(uniforms.uColor, p.color[0], p.color[1], p.color[2]);
  glc.uniform1f(uniforms.uIntensity, Math.max(p.intensity, 0));
  glc.uniform1f(uniforms.uHeight, Math.max(p.height, 24) * s);
  glc.uniform1f(uniforms.uSpread, Math.max(p.spread, 8) * s);
  glc.uniform1f(uniforms.uScale, Math.max(p.scale, 0.05));
  glc.uniform1f(uniforms.uTurbulence, Math.max(p.turbulence, 0));
  glc.uniform1f(uniforms.uTurbScale, Math.max(p.turbulenceScale, 0.2));
  glc.uniform1f(uniforms.uTurbReach, Math.max(p.turbulenceReach, 4) * s);
  glc.uniform1f(uniforms.uSparks, Math.max(p.sparks, 0));
  glc.uniform1f(uniforms.uSparkSize, Math.max(p.sparkSize, 0.2));
  glc.uniform1f(uniforms.uSparkDensity, Math.max(p.sparkDensity, 0.3));
  glc.uniform1f(uniforms.uSparkSpeed, Math.max(p.sparkSpeed, 0.05));
  glc.uniform1f(uniforms.uRim, Math.max(p.rim, 0));
  glc.uniform1f(uniforms.uMelt, Math.max(p.melt, 0) * s);
  glc.uniform1f(uniforms.uDistortion, Math.max(p.distortion, 0) * s);
  glc.uniform1f(uniforms.uSmoke, Math.max(p.smoke, 0));
  glc.uniform1f(uniforms.uEmber, Math.max(p.ember, 0));
  glc.uniform1f(uniforms.uScorch, Math.max(p.scorch, 0));
  glc.uniform1f(uniforms.uHasContent, 0);

  glc.bindFramebuffer(glc.FRAMEBUFFER, null);
  glc.viewport(0, 0, canvas.width, canvas.height);
  glc.drawArrays(glc.TRIANGLE_STRIP, 0, 4);
}

export const FlameWrapRip: React.FC<FlameWrapRipProps> = ({
  config,
  children,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [
    config.theme,
    styles,
  ]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds.
  const colorHex = pickColor(
    typeof extras.color === "string" ? extras.color : null,
    theme,
    "accent",
    "#FF5722",
  );
  const [cr, cg, cb] = parseHex(colorHex);
  const p: FlameParams = {
    color: [cr / 255, cg / 255, cb / 255],
    intensity: Math.min(3, Math.max(0, Number(extras.intensity ?? 0.5))),
    height: Math.min(500, Math.max(24, Number(extras.height ?? 170))),
    spread: Math.min(120, Math.max(8, Number(extras.spread ?? 8))),
    radius: Math.min(200, Math.max(0, Number(extras.radius ?? 40))),
    speed: Math.min(3, Math.max(0.05, Number(extras.speed ?? 0.25))),
    scale: Math.min(1, Math.max(0.05, Number(extras.scale ?? 0.75))),
    turbulence: Math.min(1, Math.max(0, Number(extras.turbulence ?? 0.5))),
    turbulenceScale: Math.min(3, Math.max(0.2, Number(extras.turbulenceScale ?? 0.5))),
    turbulenceReach: Math.min(200, Math.max(4, Number(extras.turbulenceReach ?? 25))),
    sparks: Math.min(3, Math.max(0, Number(extras.sparks ?? 1.5))),
    sparkSize: Math.min(3, Math.max(0.2, Number(extras.sparkSize ?? 0.35))),
    sparkDensity: Math.min(2.5, Math.max(0.3, Number(extras.sparkDensity ?? 1))),
    sparkSpeed: Math.min(3, Math.max(0.1, Number(extras.sparkSpeed ?? 1))),
    rim: Math.min(3, Math.max(0, Number(extras.rim ?? 2.5))),
    melt: Math.min(20, Math.max(0, Number(extras.melt ?? 4.5))),
    distortion: Math.min(32, Math.max(0, Number(extras.distortion ?? 10))),
    smoke: Math.min(2, Math.max(0, Number(extras.smoke ?? 1.5))),
    ember: Math.min(2, Math.max(0, Number(extras.ember ?? 2))),
    scorch: Math.min(2, Math.max(0, Number(extras.scorch ?? 0))),
  };
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));

  // Shader time — seconds × speed (upstream accumulated `time += delta *
  // config.speed`, so uTime already carries the speed multiplier).
  const time = (frame / fps) * g.speed * p.speed;

  // Fire fade in/out so the flames don't pop at scene bounds.
  const fireFade = (() => {
    let f = 1;
    if (fadeInF > 0 && frame < fadeInF) f = Math.min(f, frame / fadeInF);
    if (fadeOutF > 0 && frame > durationInFrames - fadeOutF) {
      f = Math.min(f, Math.max(0, (durationInFrames - frame) / fadeOutF));
    }
    return Math.max(0, Math.min(1, f));
  })();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Every Remotion frame is a fresh page load, so this layout effect
  // runs exactly once per frame: measure the canvas box, draw the fire
  // at the frame's time. No state, no RAF, no teardown needed.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawFlame(canvas, p, time);
  }, [p, time, fireFade]);

  const reach = canvasReach(p.height);
  const glow = canvasGlow(p.spread);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{ position: "relative" }}>{children}</div>
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "absolute",
          top: -reach,
          left: -glow,
          width: `calc(100% + ${glow * 2}px)`,
          height: `calc(100% + ${reach + glow}px)`,
          pointerEvents: "none",
          opacity: fireFade,
        }}
      />
    </div>
  );
};
// Barrel-name alias: publish_animations.py derives the exported component name
// from the folder (flame-wrap) and the auto-generated index.ts re-exports FlameWrap.
// Keep both names available so previews (FlameWrapRip) and the barrel (FlameWrap) compile.
export const FlameWrap = FlameWrapRip;
