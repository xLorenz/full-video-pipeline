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
 * though shatter renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * ShatterRip — the page breaks into 3D glass shards around a traveling
 * lens. Each shard lifts, tips, and floats above the void, casting soft
 * shadows; the lifted glass refracts and chromatically fringes the
 * content beneath it.
 *
 * A deterministic Remotion port of the Canvas UI `<Shatter>` WebGL
 * component (canvasui.dev). Like glyph-rain/flame-wrap/vhs/droplets/bend,
 * the effect IS a content treatment: the shader samples a texture of
 * the wrapped DOM and shatters it. The GLSL is kept VERBATIM from the
 * upstream `ShatterVanilla.ts`; only the runtime driver is re-touched:
 *
 *   1. No pointer, no `requestAnimationFrame` loop, no observers.
 *      Upstream drives a cursor lens (pointermove + exponential
 *      smoothing + pointerleave); a render has no cursor, so the port
 *      SWEEPS the lens deterministically across the frame:
 *      `progress = clamp01(frame / durationInFrames)` moves `uPointer.x`
 *      from -0.25 to 1.25 (y fixed at mid-screen) while the page scrolls
 *      beneath it. Frame N always produces exactly the same pixels —
 *      deterministic, seek-safe.
 *   2. `uActive` is driven by the treatment envelope
 *      (fadeInFrames/fadeOutFrames, smoothstepped) instead of the
 *      pointer's presence: the lens grows in at the scene start and
 *      shrinks out at the end, so no shards pop. `time` (the floating
 *      tile wobble) advances deterministically at `floatSpeed` per
 *      second of composition time, wrapped at the upstream TIME_WRAP —
 *      no real wall clock involved.
 *   3. Content capture via the native html-in-canvas mechanism (the
 *      same `ctx.drawElementImage` + layoutSubtree path the upstream
 *      component uses, and the same one vhs/droplets/bend rely on): the
 *      children are rendered as normal DOM, moved into a layoutSubtree
 *      canvas, painted on demand (`requestPaint` + `paint` event), and
 *      the paint record is drawn into the canvas backing store with
 *      `drawElementImage` — an origin-clean bitmap, so it can be
 *      uploaded straight into the GL texture with `texImage2D`. The
 *      texture is the SCROLLED VIEWPORT of the content (like upstream:
 *      `uScroll` carries the real `scrollTop` and the shader offsets
 *      the tile grid in content space by it, so the shards stay glued
 *      to the page while it scrolls). Per-frame inline styles are
 *      included — animated transforms are captured cleanly; per-element
 *      opacity fades are not (see the animation.md pitfall). Sampler
 *      matches upstream: LINEAR/LINEAR, no mipmaps.
 *   4. Full-frame treatment: like the other treatments, ShatterRip
 *      fills the composition (`AbsoluteFill` root) and processes
 *      everything the caller puts inside — wrap your ENTIRE scene.
 *      `uMaxX` is kept: content narrower than the frame is shattered
 *      only over its own horizontal band, exactly like upstream.
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): radius, softness, tileSize, shards, corner, lift,
 * tilt, scatter, perspective, gapColor, shadow, shading, refraction,
 * dispersion, floatSpeed, strength, baseStrength, fadeInFrames,
 * fadeOutFrames. The upstream `followSpeed` option is dropped — there
 * is no pointer to follow in a render.
 *
 * Performance:
 *   - One WebGL2 context, one shader compile, one full-frame draw per
 *     frame at 1x internal resolution (SwiftShader software raster).
 *     The 5x5 cell sweep + per-cell distance checks cost per lifted
 *     pixel, but the early-out returns transparent pixels outside the
 *     lens immediately — cheaper than vhs, comparable to bend.
 *   - The html-in-canvas capture + texture upload happens once per
 *     frame.
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface ShatterRipProps {
  config: TemplateConfig;
  /** The scrollable scene behind the shards (fills the frame, taller
   *  than the frame to scroll — see the preview for the pattern).
   */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI ShatterVanilla.ts. Do not
// edit; the port's "re-touch" lives in the driver below.
// ---------------------------------------------------------------------------

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uStrength;
uniform float uBase;
uniform float uTile;
uniform float uShards;
uniform float uCorner;
uniform float uLift;
uniform float uTilt;
uniform float uScatter;
uniform float uPersp;
uniform vec3 uGap;
uniform float uShadow;
uniform float uShading;
uniform float uRefract;
uniform float uDispersion;
uniform float uTime;
uniform float uMaxX;
uniform vec2 uScroll;
out vec4 outColor;

const float TAU = 6.28318530718;
const vec2 LIGHT = vec2(-0.514495755, 0.857492926);

vec2 hash22 (vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float smin (float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float shardD (vec2 q, vec2 cell, float k) {
  float jit = uTile * 0.8 * clamp(uShards, 0.0, 1.0);
  vec2 s0 = (hash22(cell) - 0.5) * jit;
  float d = uTile;
  for (int i = 0; i < 9; i++) {
    if (i == 4) continue;
    vec2 g = vec2(float(i % 3 - 1), float(i / 3 - 1));
    vec2 sn = g * uTile + (hash22(cell + g) - 0.5) * jit;
    vec2 diff = sn - s0;
    float e = -dot(q - s0 - diff * 0.5, normalize(diff));
    d = smin(d, e, k);
  }
  return d;
}

vec3 pick (vec2 uv) {
  vec2 c = vec2(
    clamp(uv.x, 0.0005, uMaxX - 0.0005),
    clamp(uv.y, 0.0005, 0.9995));
  return texture(uContent, vec2(c.x, 1.0 - c.y)).rgb;
}

float cellAct (vec2 cell, out vec2 sxy) {
  sxy = hash22(cell + 13.13);
  vec2 center = (cell + 0.5) * uTile;
  float aspect = uResolution.x / uResolution.y;
  vec2 cuv = (center - vec2(uScroll.x, -uScroll.y)) / uResolution;
  vec2 dv = vec2((cuv.x - uPointer.x) * aspect, cuv.y - uPointer.y);
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - smoothstep(inner, radius, length(dv))) * uActive;
  float mask = clamp(max(lens, clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);
  float th = sxy.x * 0.6;
  return smoothstep(th, th + 0.4, mask);
}

void cellDyn (
  vec2 cell,
  vec2 sxy,
  float act,
  out mat3 R,
  out float lift,
  out vec2 anchor,
  out float k
) {
  vec2 center = (cell + 0.5) * uTile;
  vec4 seed = vec4(sxy, hash22(cell + 27.7));

  float wob = sin(uTime + seed.z * TAU);
  float maxT = 0.2 * clamp(uTilt, 0.0, 3.0) * act;
  float rx = (seed.y - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * wob);
  float ry = (seed.z - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * cos(uTime * 0.7 + seed.w * TAU));
  float rz = (seed.w - 0.5) * 1.2 * maxT * (0.85 + 0.15 * wob);
  float cx = cos(rx); float sx = sin(rx);
  float cy = cos(ry); float sy = sin(ry);
  float cz = cos(rz); float sz = sin(rz);
  R = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0)
    * mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy)
    * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);

  lift = uLift * act * (0.72 + 0.36 * seed.y)
    * (0.86 + 0.14 * sin(uTime * 0.9 + seed.w * TAU));
  vec2 shift = (seed.zw - 0.5) * 2.0 * uScatter * act * (0.85 + 0.15 * wob);
  anchor = center + shift;
  k = max(min(uCorner * act, uTile * 0.45), 1e-2);
}

bool invMap (
  vec2 P,
  mat3 R,
  float lift,
  vec2 anchor,
  out vec2 q
) {
  vec2 w = P - anchor;
  float m11 = uPersp * R[0][0] + w.x * R[0][2];
  float m12 = uPersp * R[1][0] + w.x * R[1][2];
  float m21 = uPersp * R[0][1] + w.y * R[0][2];
  float m22 = uPersp * R[1][1] + w.y * R[1][2];
  float det = m11 * m22 - m12 * m21;
  if (abs(det) < 1e-4) return false;
  vec2 b = w * (uPersp - lift);
  q = vec2(m22 * b.x - m12 * b.y, m11 * b.y - m21 * b.x) / det;
  return true;
}

void main () {
  vec2 P = gl_FragCoord.xy;
  vec2 Pc = P + vec2(uScroll.x, -uScroll.y);
  vec2 uvR = P / uResolution;

  float aspect = uResolution.x / uResolution.y;
  float radius = max(uRadius * uActive, 1e-4);
  vec2 duv = vec2((uvR.x - uPointer.x) * aspect, uvR.y - uPointer.y);
  float slack = 3.0 * uTile / uResolution.y;
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lensB = (1.0
    - smoothstep(inner, radius, max(length(duv) - slack, 0.0))) * uActive;
  float maskB = max(lensB, clamp(uBase, 0.0, 1.0))
    * clamp(uStrength, 0.0, 1.0);
  if (maskB < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  vec2 cuvR = vec2(
    clamp(uvR.x, 0.0005, uMaxX - 0.0005),
    clamp(uvR.y, 0.0005, 0.9995));
  vec4 tex = texture(uContent, vec2(cuvR.x, 1.0 - cuvR.y));
  float guard = step(uvR.x, uMaxX) * tex.a;
  if (guard < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  vec2 baseCell = floor(Pc / uTile);
  float act; mat3 R; float lift; vec2 anchor; float k;
  vec2 sxy; vec2 q;

  float shadowGain = clamp(uShadow, 0.0, 2.0) * 0.5;
  float shadowA = 0.0;
  float shadowZ = 0.0;
  vec2 shadowCell = vec2(1e6);

  float sumA = 0.0;
  float maxAct = 0.0;
  float k1 = -1e9; float a1 = 0.0; vec3 c1 = vec3(0.0);
  vec2 cell1 = vec2(1e6);
  float k2 = -1e9; float a2 = 0.0; vec3 c2 = vec3(0.0);
  vec2 cell2 = vec2(1e6);

  float restReach = uTile * 0.95 + 3.0;
  float reach = uTile * 1.8 + uScatter + uLift * 0.4;
  float rr = max(reach, uTile + uScatter + uLift);

  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 cell = baseCell + vec2(float(i), float(j));
      vec2 center = (cell + 0.5) * uTile;
      vec2 cp = center - Pc;
      float cd = dot(cp, cp);
      if (cd > rr * rr) continue;
      act = cellAct(cell, sxy);
      maxAct = max(maxAct, act);

      if (act < 1e-3) {
        if (cd > restReach * restReach) continue;
        float d = shardD(Pc - center, cell, 1e-2);
        float a = 1.0 - smoothstep(-1.5, 1.5, -d);
        if (a < 0.003) continue;
        sumA += a;
        if (0.0 > k1) {
          k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
          k1 = 0.0; a1 = a; c1 = tex.rgb; cell1 = cell;
        } else if (0.0 > k2) {
          k2 = 0.0; a2 = a; c2 = tex.rgb; cell2 = cell;
        }
        continue;
      }

      cellDyn(cell, sxy, act, R, lift, anchor, k);

      if (shadowGain > 1e-3 && lift > 0.5) {
        vec2 qs = Pc + LIGHT * lift * 0.5 - anchor;
        float blur = max(lift * 0.4, 1.0);
        float srad = uTile * 0.95 + blur;
        if (dot(qs, qs) < srad * srad) {
          float sA = 1.0 - smoothstep(-blur, blur, -shardD(qs, cell, k));
          sA *= shadowGain * act * act;
          if (sA > shadowA) {
            shadowA = sA;
            shadowZ = lift;
            shadowCell = cell;
          }
        }
      }

      if (cd > reach * reach) continue;
      if (!invMap(Pc, R, lift, anchor, q)) continue;
      float d = shardD(q, cell, k);
      float a = 1.0 - smoothstep(-1.5, 1.5, -d);
      if (a < 0.003) continue;
      vec2 uvS = (center + q - vec2(uScroll.x, -uScroll.y)) / uResolution;
      vec3 n = R * vec3(0.0, 0.0, 1.0);
      float rA = uRefract * act * act;
      vec3 col;
      if (rA < 1e-3) {
        col = pick(uvS);
      } else {
        vec2 refr = -n.xy * (rA * uTile * 0.25) / uResolution;
        float spread = uDispersion * 0.6;
        if (spread < 1e-3) {
          col = pick(uvS + refr);
        } else {
          col = vec3(
            pick(uvS + refr * (1.0 + spread)).r,
            pick(uvS + refr).g,
            pick(uvS + refr * (1.0 - spread)).b);
        }
      }
      col *= clamp(
        1.0 + clamp(uShading, 0.0, 2.0) * act * dot(n.xy, LIGHT) * 0.6,
        0.0, 2.0);
      sumA += a;
      if (lift > k1) {
        k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
        k1 = lift; a1 = a; c1 = col; cell1 = cell;
      } else if (lift > k2) {
        k2 = lift; a2 = a; c2 = col; cell2 = cell;
      }
    }
  }

  if (maxAct < 1e-3 && shadowA < 1e-3) {
    outColor = vec4(0.0);
    return;
  }

  if (shadowA > 1e-3) {
    if (any(notEqual(cell1, shadowCell))) {
      c1 *= 1.0 - shadowA * clamp((shadowZ - k1) / (uTile * 0.2), 0.0, 1.0);
    }
    if (any(notEqual(cell2, shadowCell))) {
      c2 *= 1.0 - shadowA * clamp((shadowZ - k2) / (uTile * 0.2), 0.0, 1.0);
    }
  }

  float cover = clamp(sumA, 0.0, 1.0);
  float sep = max(uLift * 0.25, 2.0);
  float f = clamp((k1 - k2) / sep, 0.0, 1.0);
  float w1 = a1 * (0.5 + 0.5 * f);
  float w2 = a2 * (1.0 - w1);
  float layered = w1 + w2;
  vec3 shardCol = layered > 1e-6
    ? (c1 * w1 + c2 * w2) / layered
    : uGap;
  float bgRecv = shadowA * clamp(shadowZ / (uTile * 0.2), 0.0, 1.0);
  vec3 bg = uGap * (1.0 - bgRecv);
  outColor = vec4(mix(bg, shardCol, cover), guard);
}`;

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

/** Persistent capture state across frames: the layoutSubtree canvas and
 * its 2D context. Created on the first frame, reused for the rest. */
type CaptureState = {
  layout: LayoutCanvas;
  ctx: CaptureCtx;
};

interface ShatterParams {
  radius: number;
  softness: number;
  tileSize: number;
  shards: number;
  corner: number;
  lift: number;
  tilt: number;
  scatter: number;
  perspective: number;
  gapColor: [number, number, number];
  shadow: number;
  shading: number;
  refraction: number;
  dispersion: number;
  floatSpeed: number;
  strength: number;
  baseStrength: number;
}

/** Upstream wraps the float time at PI * 800; the port reproduces the
 * wrap so long compositions never lose the wobble phase coherence. */
const TIME_WRAP = Math.PI * 800;

/**
 * Capture `element`'s current painted HTML (scrolled to the frame's
 * deterministic scroll position) into the GL texture bound at texture
 * unit 0, then run the shatter draw once. Pure function of the DOM
 * state and uniforms — deterministic. Resolves after the capture is
 * uploaded; on any failure the canvas stays transparent and the plain
 * DOM shows through (untreated), so the frame never blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: ShatterParams,
  progress: number,
  activeEnv: number,
  time: number,
  compWidth: number,
  compHeight: number,
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

  function compile(type: number, text: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shatter shader error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vertexShader || !fragmentShader) return;
  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Shatter link error:", gl.getProgramInfoLog(program));
    return;
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const contentTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

  // html-in-canvas capture, stateful across frames: a Remotion render
  // lives on ONE page (React re-renders per frame, no fresh page load),
  // so the layoutSubtree canvas and the moved scene are set up once and
  // reused. Each frame re-requests a paint of the scene (after the
  // frame's scroll position is applied), copies the fresh record into
  // the backing store, and uploads. The record is origin-clean — the
  // browser painted the DOM itself — so texImage2D accepts it.
  // (drawElementImage requires the element to be a direct child of the
  // layoutSubtree canvas.)
  const host = output.parentElement;
  if (!host) {
    console.error("Shatter: output canvas has no parent — rendering children untreated");
    return;
  }
  const cssW = Math.max(1, Math.round(compWidth));
  const cssH = Math.max(1, Math.round(compHeight));
  let st = stateRef.current;
  const needSetup =
    !st || !st.layout.isConnected || content.parentElement !== st.layout;
  // The FIRST paint of a freshly moved subtree is not reliable in
  // headless Chrome — the html-in-canvas record comes out partial
  // (missing pieces of the content), and it only rebuilds once the
  // content's painted appearance changes. The output canvas is
  // transparent on frame 0 (no shards are lifted yet and the lens is
  // off-screen), so instead of capturing garbage the setup is deferred
  // one frame: the scene stays in place and frame 0 shows the raw DOM.
  // From frame 1 the record is built from settled content and stays
  // correct.
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
        "Shatter: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("Shatter: drawElementImage unavailable — rendering children untreated");
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
    st = { layout, ctx: lctx };
    stateRef.current = st;
  }
  if (!st) return; // setup bailed — scene stays untreated this frame

  // The page is laid out and painted by the time the first macrotask
  // runs (Remotion only lays out at screenshot time, so the first frame
  // needs the settle), then a fresh paint of the scene is requested.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (needSetup) {
    // The setup frame gets an extra settle before the first paint so the
    // moved subtree is fully laid out and painted when it is recorded.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // Drive the "scroll" like upstream: the content div is the scroll
  // container (overflow auto) and `t` becomes its scrollTop, which the
  // driver reports through uScroll exactly like upstream does. A real
  // scroll dirties the captured subtree's paint every frame, so the
  // texture always reflects the current scroll position. (A translate
  // transform does not — it is compositor-level, and in headless Chrome
  // the html-in-canvas record only rebuilds when the content's painted
  // appearance changes.) If the content is not scrollable (shorter than
  // the frame), scrollTop stays 0 — the lens still sweeps over the
  // static page.
  content.style.overflow = "auto";
  const scrollable = content.scrollHeight - content.clientHeight;
  const t = progress * Math.max(scrollable, 0);
  if (scrollable > 1) {
    content.scrollTop = t;
  }

  // The scene's horizontal band, measured only NOW — before the settle
  // the page is not laid out, clientWidth reads 0, and uMaxX would
  // clamp to its minimum, restricting the treatment to a sliver of the
  // frame. Falls back to the full band if it still reads 0.
  const contentMaxX = (() => {
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
      "Shatter: html-in-canvas paint never fired — rendering children untreated",
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

  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, st.layout);

  // The deterministic lens: a straight horizontal sweep across the
  // frame, mid-screen, matching the sweep speed of the scroll pass so
  // the shatter wave reads as one continuous motion.
  const sweepX = -0.25 + progress * 1.5;
  const pointerY = 0.5;

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.uniform1i(uniforms.uContent, 0);
  gl.uniform2f(uniforms.uResolution, width, height);
  gl.uniform1f(uniforms.uTile, Math.max(p.tileSize, 24) * dpr);
  gl.uniform1f(uniforms.uCorner, Math.max(p.corner, 0) * dpr);
  gl.uniform1f(uniforms.uLift, Math.max(p.lift, 0) * dpr);
  gl.uniform1f(uniforms.uTilt, p.tilt);
  gl.uniform1f(uniforms.uScatter, Math.max(p.scatter, 0) * dpr);
  gl.uniform1f(uniforms.uPersp, Math.max(p.perspective, 200) * dpr);
  gl.uniform3f(uniforms.uGap, p.gapColor[0], p.gapColor[1], p.gapColor[2]);
  gl.uniform1f(uniforms.uShadow, p.shadow);
  gl.uniform1f(uniforms.uShading, p.shading);
  gl.uniform1f(uniforms.uShards, Math.min(Math.max(p.shards, 0), 1));
  gl.uniform1f(uniforms.uRefract, Math.max(p.refraction, 0));
  gl.uniform1f(uniforms.uDispersion, Math.min(Math.max(p.dispersion, 0), 1));
  gl.uniform1f(uniforms.uTime, time);
  gl.uniform2f(uniforms.uPointer, sweepX, pointerY);
  gl.uniform1f(uniforms.uActive, activeEnv);
  gl.uniform1f(uniforms.uRadius, Math.max(p.radius, 0.01));
  gl.uniform1f(uniforms.uSoftness, p.softness);
  gl.uniform1f(uniforms.uStrength, p.strength);
  gl.uniform1f(uniforms.uBase, p.baseStrength);
  gl.uniform1f(uniforms.uMaxX, contentMaxX);
  gl.uniform2f(uniforms.uScroll, 0, scrollable > 1 ? t * dpr : 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export const ShatterRip: React.FC<ShatterRipProps> = ({
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
  const p: ShatterParams = useMemo(() => {
    const gapRaw = Array.isArray(extras.gapColor) ? extras.gapColor : [];
    return {
      radius: Math.min(2, Math.max(0.01, Number(extras.radius ?? 0.4))),
      softness: Math.min(1, Math.max(0, Number(extras.softness ?? 0.6))),
      tileSize: Math.min(600, Math.max(24, Number(extras.tileSize ?? 125))),
      shards: Math.min(1, Math.max(0, Number(extras.shards ?? 1))),
      corner: Math.min(300, Math.max(0, Number(extras.corner ?? 0))),
      lift: Math.min(600, Math.max(0, Number(extras.lift ?? 30))),
      tilt: Math.min(3, Math.max(0, Number(extras.tilt ?? 2))),
      scatter: Math.min(300, Math.max(0, Number(extras.scatter ?? 5))),
      perspective: Math.min(5000, Math.max(200, Number(extras.perspective ?? 1500))),
      gapColor: [
        Math.min(1, Math.max(0, Number(gapRaw[0] ?? 0))),
        Math.min(1, Math.max(0, Number(gapRaw[1] ?? 0))),
        Math.min(1, Math.max(0, Number(gapRaw[2] ?? 0))),
      ] as [number, number, number],
      shadow: Math.min(2, Math.max(0, Number(extras.shadow ?? 0.5))),
      shading: Math.min(2, Math.max(0, Number(extras.shading ?? 0.5))),
      refraction: Math.min(2, Math.max(0, Number(extras.refraction ?? 1.5))),
      dispersion: Math.min(1, Math.max(0, Number(extras.dispersion ?? 0.3))),
      floatSpeed: Math.min(20, Math.max(0, Number(extras.floatSpeed ?? 2))),
      strength: Math.min(1, Math.max(0, Number(extras.strength ?? 1))),
      baseStrength: Math.min(1, Math.max(0, Number(extras.baseStrength ?? 0))),
    };
  }, [extras]);
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));

  // Scroll + lens sweep — deterministic: the composition plays one full
  // pass, from the top of the content to the bottom, while the lens
  // travels across the frame.
  const progress = Math.min(1, Math.max(0, frame / durationInFrames));

  // Float time advances at `floatSpeed` per second of composition time
  // (upstream: delta * floatSpeed with delta = 1/fps in a render),
  // wrapped at the upstream TIME_WRAP. The wobble only scales lifted
  // tiles, so an idle frame's static time is irrelevant.
  const time = (frame * p.floatSpeed) / Math.max(fps, 1) % TIME_WRAP;

  // The lens's uActive envelope: grows in over the fade-in and shrinks
  // over the fade-out, smoothstepped — the upstream cursor's presence
  // becomes a deterministic ramp, so shards never pop at scene bounds.
  const activeEnv = (() => {
    let e = 1;
    if (fadeInF > 0 && frame < fadeInF) {
      const x = frame / fadeInF;
      e = Math.min(e, x * x * (3 - 2 * x));
    }
    if (fadeOutF > 0 && frame > durationInFrames - fadeOutF) {
      const x = Math.max(0, (durationInFrames - frame) / fadeOutF);
      e = Math.min(e, x * x * (3 - 2 * x));
    }
    return Math.max(0, Math.min(1, e));
  })();

  const outputRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const captureStateRef = useRef<CaptureState | null>(null);

  // A Remotion render keeps ONE page per composition and re-renders
  // React each frame, so this layout effect re-runs every frame. The
  // capture setup (layoutSubtree canvas, the moved scene) is stateful
  // across frames — the texture is refreshed with each frame's freshly
  // painted DOM (scroll position and transform animations included). The
  // render is held (delayRender) until the capture + draw completes, so
  // the frame screenshot always contains the treatment.
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
      activeEnv,
      time,
      compWidth,
      compHeight,
      captureStateRef,
    )
      .catch((err) => console.error("Shatter capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, progress, activeEnv]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the shatter
             texture each frame (scroll position + transform animations
             included; per-element opacity fades are not — see
             animation.md); if the capture or WebGL fails, this DOM is
             what the viewer sees — untreated. The driver turns the
             content div into the scroll container (overflow auto,
             scrollTop per frame) like upstream, so the captured record
             shows the scrolled page. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The glass shards, composited over the DOM where they lift;
             transparent where the page is intact, so the DOM below
             shows through. */}
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
