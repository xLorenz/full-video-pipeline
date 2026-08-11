import React, { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  resolveGlobal,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * Element override type — carried in the DeepConfig signature so callers
 * can keep using `extras: ElementOverride[]` in their own typing even
 * though droplets renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * DropletsRip — rain running down the glass, refracting the content.
 *
 * A deterministic Remotion port of the Canvas UI `<Droplets>` WebGL
 * component (canvasui.dev). Like glyph-rain/flame-wrap/vhs, the effect
 * IS a content treatment: the shader samples a texture of the wrapped
 * DOM, distorts it along each drop's surface normal, and composites the
 * glass over the frame. The GLSL is kept VERBATIM from the upstream
 * `Droplets.tsx`; only the runtime driver is re-touched:
 *
 *   1. No `requestAnimationFrame` loop / no accumulated time / no
 *      pointer state. The rain field is a pure hash function of (uv,
 *      time) — static drops, falling drops, trails, refraction normals
 *      all derive from the same deterministic field, so the effect
 *      draws ONCE per frame with `uTime = (frame / fps) * global.speed *
 *      speed`. Frame N always produces exactly the same pixels —
 *      deterministic, seek-safe.
 *   2. The interactive wipe is removed: upstream keeps a persistent
 *      "trail" texture (two ping-pong FBOs) that the cursor wipes
 *      through, updated every animation frame with decay. In a render
 *      there is no cursor, so that machinery is dropped and a static
 *      1x1 black texture is bound to `uTrail` with `uWipe = 0` — the
 *      wipe terms in the shader zero out mathematically. The shader
 *      itself is untouched.
 *   3. Content capture via the native html-in-canvas mechanism (the
 *      same `ctx.drawElementImage` + layoutSubtree path the upstream
 *      component uses, and the same one vhs relies on): the children
 *      are rendered as normal DOM, moved into a layoutSubtree canvas,
 *      painted on demand (`requestPaint` + `paint` event), and the
 *      paint record is drawn into the canvas backing store with
 *      `drawElementImage` — an origin-clean bitmap, so it can be
 *      uploaded straight into the GL texture with `texImage2D`.
 *      Per-frame inline styles are included, so entrance animations are
 *      captured as-is. Because the shader samples with `textureLod`
 *      (for the optional `blur`), `generateMipmap()` runs after every
 *      upload — an incomplete mip chain samples black.
 *   4. Full-frame treatment: like vhs, DropletsRip fills the
 *      composition (`AbsoluteFill` root) and processes everything the
 *      caller puts inside — wrap your ENTIRE scene. `uMaxX` is kept:
 *      content narrower than the frame is rained on only over its own
 *      horizontal band, exactly like upstream.
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): intensity, speed, scale, dropWidth, dropLength,
 * refraction, blur, vignette, fallSpeed, wiggle, staticDrops, tint,
 * tintStrength, fadeInFrames, fadeOutFrames. The upstream `interactive*`
 * options are dropped — there is no pointer in a render.
 *
 * Performance:
 *   - One WebGL2 context, one shader compile, one full-frame draw per
 *     frame at 1x internal resolution (SwiftShader software raster).
 *     The drop field is evaluated ~3x per pixel (the two normal-offset
 *     taps) with ~11 hash calls each, so `intensity`/`staticDrops`
 *     weight the cost; there is no multi-tap bloom like vhs.
 *   - The html-in-canvas capture + texture upload (with mipmaps)
 *     happens once per frame.
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface DropletsRipProps {
  config: TemplateConfig;
  /** The scene behind the rainy glass (fills the frame). */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI Droplets.tsx. Do not edit;
// the port's "re-touch" lives in the driver below. (The upstream TRAIL_FRAG
// is intentionally not ported — it feeds the interactive cursor wipe, which
// a deterministic render has no use for.)
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
uniform vec2 uOffset;
uniform float uTime;
uniform float uIntensity;
uniform float uScale;
uniform float uDropWidth;
uniform float uDropLength;
uniform float uRefraction;
uniform float uBlur;
uniform float uVignette;
uniform float uFallSpeed;
uniform float uWiggle;
uniform float uStaticDrops;
uniform float uMaxX;
uniform sampler2D uTrail;
uniform float uWipe;
uniform float uWipeDistort;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uHasContent;

#define S(a, b, t) smoothstep(a, b, t)

vec3 N13 (float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3(
    (p3.x + p3.y) * p3.z,
    (p3.x + p3.z) * p3.y,
    (p3.y + p3.z) * p3.x
  ));
}

float N (float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw (float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

float sdEgg (vec2 p, float ra, float rb) {
  const float k = 1.7320508;
  p.x = abs(p.x);
  float r = ra - rb;
  return ((p.y < 0.0) ? length(vec2(p.x, p.y)) - r :
          (k * (p.x + r) < p.y) ? length(vec2(p.x, p.y - k * r)) :
          length(vec2(p.x + r, p.y)) - 2.0 * r) - rb;
}

vec2 DropLayer (vec2 uv, float t) {
  vec2 UV = uv;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;

  vec2 id = floor(uv * grid);
  float gridFall = N(id.x) / 3.0 + 0.5;
  uv.y += t * gridFall / a.y;
  id = floor(uv * grid);
  uv.y += N(id.x);

  id = floor(uv * grid);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);

  float x = n.x - 0.5;
  float lambda = UV.y * 20.0;
  float wiggle = sin(lambda + sin(lambda));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5) * uWiggle;
  x *= 0.6;

  float slowStart = 0.85;
  float ti = fract(t * (gridFall + 0.1) + n.z);
  float y = (Saw(slowStart, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);

  float dropShape = (ti > slowStart)
    ? -sin(6.2831853 * ti / (1.0 - slowStart)) * 0.5 - 0.5
    : 0.0;
  float d = sdEgg((st - p) * a.yx / vec2(uDropWidth, uDropLength), 0.0, dropShape);
  float diameter = N(id.x + id.y) / 7.0 + 0.2;
  float mainDrop = S(diameter / 1.5, 0.0, d);

  float r2 = S(1.0, y, st.y);
  float r = sqrt(r2);
  float cd = abs(st.x - x);
  float thickness = diameter * 0.95 * uDropWidth;
  float trail = S(thickness * r, 0.0, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= r2 * trailFront * 0.5;

  y = UV.y;
  float trail2 = S((thickness - 0.15) * r, 0.0, cd);
  trail2 *= trailFront * n.z;
  float rndX = N(id.x) / 1.5 + 0.5;
  float rndY = N(st.y) / 40.0 + 0.05;
  y = fract(y * 11.0 * rndX) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  float droplets = S(trail2 + rndY, 0.0, dd);

  float m = mainDrop + droplets * r * trailFront;
  return vec2(m, trail);
}

float StaticDrops (vec2 uv, float t) {
  uv *= 40.0;

  vec2 id = floor(uv);
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.6;
  uv = fract(uv) - 0.5;

  float d = length(uv - p);
  float drop = S(0.3 * clamp(uDropWidth, 0.4, 1.4), 0.0, d);

  float fade = Saw(0.1, fract(t + n.y));
  float intensity = fract(n.x * 27.0);
  return drop * fade * intensity;
}

vec2 Drops (vec2 uv, float t, float tFall, float l0, float l1, float l2, float wipe) {
  float s = StaticDrops(uv, t) * l0 * (1.0 - wipe);
  vec2 m1 = DropLayer(uv, tFall) * (l1 * (1.0 - wipe * 0.8));
  vec2 m2 = DropLayer(uv * 1.85, tFall) * (l2 * (1.0 - wipe * 0.8));

  float c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);

  return vec2(c, m1.y + m2.y);
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  vec2 aspectUv = (uv + uOffset - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * 0.2;
  float dropScale = clamp(min(uResolution.x, uResolution.y) / 900.0, 0.75, 1.35) * uScale;
  vec2 scaledUv = aspectUv * dropScale;

  float rainAmount = clamp(uIntensity, 0.0, 1.25);

  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0 * uStaticDrops;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);
  float tFall = t * uFallSpeed;

  float wipeMask = texture(uTrail, uv).r;
  float wipe = wipeMask * clamp(uWipe, 0.0, 1.0);

  vec2 c = Drops(scaledUv, t, tFall, staticDrops, layer1, layer2, wipe);

  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(scaledUv + e, t, tFall, staticDrops, layer1, layer2, wipe).x;
  float cy = Drops(scaledUv + e.yx, t, tFall, staticDrops, layer1, layer2, wipe).x;
  vec2 normal = vec2(cx - c.x, cy - c.x);

  vec2 e2 = vec2(0.012, 0.0);
  float wx = texture(uTrail, uv + e2).r;
  float wy = texture(uTrail, uv + e2.yx).r;
  normal += vec2(wipeMask - wx, wipeMask - wy) * 0.05 * uWipeDistort * clamp(uWipe, 0.0, 1.0);

  vec2 refractedUv = clamp(uv + normal * uRefraction, vec2(0.001), vec2(uMaxX - 0.004, 0.999));
  float fog = clamp(uBlur, 0.0, 8.0) * mix(0.7, 1.0, rainAmount);
  float back = fog * (1.0 - clamp(c.y * 2.0, 0.0, 1.0)) * (1.0 - wipe);
  float focus = mix(back, 0.0, S(0.1, 0.2, c.x));

  if (uHasContent < 0.5) {
    float mask = S(0.02, 0.14, c.x);
    vec3 n3 = normalize(vec3(normal * 42.0, 1.0));
    vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
    float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), n3), L), 0.0), 34.0);
    float rim = clamp(length(normal) * 26.0, 0.0, 1.0);
    vec3 dropCol = mix(vec3(0.72), uTint, clamp(uTintStrength, 0.0, 1.0));
    vec3 colF = dropCol * (0.12 + 0.5 * rim) + vec3(spec);
    float alphaF = mask * clamp(0.1 + rim * 0.5 + spec * 0.9, 0.0, 1.0);
    outColor = vec4(clamp(colF, 0.0, 1.0) * alphaF, alphaF);
    return;
  }

  vec4 content = textureLod(uContent, vec2(refractedUv.x, 1.0 - refractedUv.y), focus);
  vec3 col = content.rgb;

  col = mix(col, uTint, clamp(uTintStrength, 0.0, 1.0) * 0.35);

  vec2 vignetteUv = uv - 0.5;
  col *= 1.0 - dot(vignetteUv, vignetteUv) * clamp(uVignette, 0.0, 1.0) * 2.0;

  outColor = vec4(col * content.a, content.a);
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

/** Persistent capture state across frames: the layoutSubtree canvas and
 * its 2D context. Created on the first frame, reused for the rest. */
type CaptureState = {
  layout: LayoutCanvas;
  ctx: CaptureCtx;
};

interface DropletsParams {
  intensity: number;
  speed: number;
  scale: number;
  dropWidth: number;
  dropLength: number;
  refraction: number;
  blur: number;
  vignette: number;
  fallSpeed: number;
  wiggle: number;
  staticDrops: number;
  tint: [number, number, number];
  tintStrength: number;
}

/**
 * Capture `element`'s current painted HTML into the GL texture bound at
 * texture unit 0, then run the rain draw once. Pure function of the DOM
 * state and uniforms — deterministic. Resolves after the capture is
 * uploaded; on any failure the canvas stays transparent and the plain
 * DOM shows through (untreated), so the frame never blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: DropletsParams,
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
    premultipliedAlpha: true,
  });
  if (!glc || glc.isContextLost()) return;
  const gl: WebGL2RenderingContext = glc;

  function compile(type: number, text: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Droplets shader error:", gl.getShaderInfoLog(shader));
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
    console.error("Droplets link error:", gl.getProgramInfoLog(program));
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
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
  gl.generateMipmap(gl.TEXTURE_2D);

  // Static black 1x1 trail texture — the wipe terms sample it, and with
  // uWipe = 0 every wipe contribution is mathematically zero.
  const trailTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, trailTexture);
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
    new Uint8Array([0, 0, 0, 1]),
  );

  // html-in-canvas capture, stateful across frames: a Remotion render
  // lives on ONE page (React re-renders per frame, no fresh page load),
  // so the layoutSubtree canvas and the moved scene are set up once and
  // reused. Each frame re-requests a paint of the scene, copies the
  // fresh record into the backing store, and uploads. The record is
  // origin-clean — the browser painted the DOM itself — so texImage2D
  // accepts it. (drawElementImage requires the element to be a direct
  // child of the layoutSubtree canvas.)
  const host = output.parentElement;
  if (!host) {
    console.error("Droplets: output canvas has no parent — rendering children untreated");
    return;
  }
  const cssW = Math.max(1, Math.round(compWidth));
  const cssH = Math.max(1, Math.round(compHeight));
  let st = stateRef.current;
  const needSetup =
    !st || !st.layout.isConnected || content.parentElement !== st.layout;
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
        "Droplets: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("Droplets: drawElementImage unavailable — rendering children untreated");
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

  // The scene's horizontal band, measured only NOW — before the settle
  // the page is not laid out, clientWidth reads 0, and uMaxX would clamp
  // to its minimum, restricting the treatment to a sliver of the frame.
  // Falls back to the full band if it still reads 0.
  const contentMaxX = (() => {
    const measured =
      content.clientWidth / Math.max(output.clientWidth || content.clientWidth, 1);
    return Math.min(1, Math.max(0.05, measured || 1));
  })();

  const painted = await waitForPaint(st.layout);
  if (!painted) {
    if (needSetup) {
      // The mechanism is broken on this browser — roll back to plain DOM.
      if (content.parentElement === st.layout) {
        host.appendChild(content);
      }
      if (st.layout.parentElement === host) {
        host.removeChild(st.layout);
      }
      stateRef.current = null;
    }
    console.error(
      "Droplets: html-in-canvas paint never fired — rendering children untreated",
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
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.uniform1i(uniforms.uContent, 0);
  gl.uniform1f(uniforms.uHasContent, 1);
  gl.uniform2f(uniforms.uResolution, width, height);
  gl.uniform2f(uniforms.uOffset, 0, 0);
  gl.uniform1f(uniforms.uTime, time);
  gl.uniform1f(uniforms.uIntensity, Math.min(1.25, Math.max(0, p.intensity)));
  gl.uniform1f(uniforms.uScale, Math.max(p.scale, 0.01));
  gl.uniform1f(uniforms.uDropWidth, Math.max(p.dropWidth, 0.05));
  gl.uniform1f(uniforms.uDropLength, Math.max(p.dropLength, 0.05));
  gl.uniform1f(uniforms.uRefraction, Math.max(p.refraction, 0));
  gl.uniform1f(uniforms.uBlur, Math.min(8, Math.max(p.blur, 0)));
  gl.uniform1f(uniforms.uVignette, Math.min(1, Math.max(p.vignette, 0)));
  gl.uniform1f(uniforms.uFallSpeed, Math.max(p.fallSpeed, 0));
  gl.uniform1f(uniforms.uWiggle, Math.max(p.wiggle, 0));
  gl.uniform1f(uniforms.uStaticDrops, Math.max(p.staticDrops, 0));
  gl.uniform1f(uniforms.uMaxX, contentMaxX);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, trailTexture);
  gl.uniform1i(uniforms.uTrail, 1);
  gl.uniform1f(uniforms.uWipe, 0);
  gl.uniform1f(uniforms.uWipeDistort, 0);
  gl.uniform3f(uniforms.uTint, p.tint[0], p.tint[1], p.tint[2]);
  gl.uniform1f(uniforms.uTintStrength, Math.min(1, Math.max(p.tintStrength, 0)));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export const DropletsRip: React.FC<DropletsRipProps> = ({
  config,
  children,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width: compWidth, height: compHeight } = useVideoConfig();
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds. Memoized so the effect
  // below only re-runs when the values actually change (a fresh object
  // each render would re-trigger the capture mid-frame).
  const p: DropletsParams = useMemo(() => {
    const rawTint = extras.tint;
    const tint: [number, number, number] = Array.isArray(rawTint) &&
      rawTint.length === 3 &&
      rawTint.every((v) => typeof v === "number")
      ? [
          Math.min(1, Math.max(0, rawTint[0] as number)),
          Math.min(1, Math.max(0, rawTint[1] as number)),
          Math.min(1, Math.max(0, rawTint[2] as number)),
        ]
      : [1, 1, 1];
    return {
      intensity: Math.min(1.25, Math.max(0, Number(extras.intensity ?? 0.5))),
      speed: Math.min(3, Math.max(0.05, Number(extras.speed ?? 1))),
      scale: Math.min(3, Math.max(0.01, Number(extras.scale ?? 0.4))),
      dropWidth: Math.min(3, Math.max(0.05, Number(extras.dropWidth ?? 1))),
      dropLength: Math.min(3, Math.max(0.05, Number(extras.dropLength ?? 1))),
      refraction: Math.min(2, Math.max(0, Number(extras.refraction ?? 0.2))),
      blur: Math.min(8, Math.max(0, Number(extras.blur ?? 0))),
      vignette: Math.min(1, Math.max(0, Number(extras.vignette ?? 0))),
      fallSpeed: Math.min(4, Math.max(0, Number(extras.fallSpeed ?? 1))),
      wiggle: Math.min(3, Math.max(0, Number(extras.wiggle ?? 1))),
      staticDrops: Math.min(3, Math.max(0, Number(extras.staticDrops ?? 0.2))),
      tint,
      tintStrength: Math.min(1, Math.max(0, Number(extras.tintStrength ?? 0))),
    };
  }, [extras]);
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));

  // Shader time — seconds × speed (upstream accumulated
  // `elapsed += delta * config.speed`).
  const time = (frame / fps) * g.speed * p.speed;

  // Treatment fade in/out so the glass doesn't pop at scene bounds.
  const tapeFade = (() => {
    let f = 1;
    if (fadeInF > 0 && frame < fadeInF) f = Math.min(f, frame / fadeInF);
    if (fadeOutF > 0 && frame > durationInFrames - fadeOutF) {
      f = Math.min(f, Math.max(0, (durationInFrames - frame) / fadeOutF));
    }
    return Math.max(0, Math.min(1, f));
  })();

  const outputRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const captureStateRef = useRef<CaptureState | null>(null);

  // A Remotion render keeps ONE page per composition and re-renders
  // React each frame, so this layout effect re-runs every frame. The
  // capture setup (layoutSubtree canvas, the moved scene) is stateful
  // across frames — the texture is refreshed with each frame's freshly
  // painted DOM (entrance animations included). The render is held
  // (delayRender) until the capture + draw completes, so the frame
  // screenshot always contains the treatment.
  useLayoutEffect(() => {
    const output = outputRef.current;
    const content = contentRef.current;
    if (!output || !content) return;
    const handle = delayRender();
    captureAndDraw(output, content, p, time, compWidth, compHeight, captureStateRef)
      .catch((err) => console.error("Droplets capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, time, tapeFade]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the rain texture
             each frame (entrance animations included); if the capture or
             WebGL fails, this DOM is what the viewer sees — untreated. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The rainy glass, composited over the DOM when ready. */}
        <canvas
          ref={outputRef}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            opacity: tapeFade,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
// Barrel-name alias: publish_animations.py derives the exported component name
// from the folder (droplets) and the auto-generated index.ts re-exports Droplets.
// Keep both names available so previews (DropletsRip) and the barrel (Droplets) compile.
export const Droplets = DropletsRip;
