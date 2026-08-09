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
 * though blaze renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * BlazeRip — a fire burns up from the bottom of the frame, rising over
 * the wrapped content: layered procedural sparks with depth, drifting
 * smoke, a warm glow at the base, and heat-distortion noise that bends
 * the content near the fire zone.
 *
 * A deterministic Remotion port of the Canvas UI `<Blaze>` WebGL
 * component (canvasui.dev). Like glyph-rain/flame-wrap/vhs/droplets/
 * bend/shatter, the effect IS a content treatment: the shader samples a
 * texture of the wrapped DOM and burns it. The GLSL is kept VERBATIM
 * from the upstream `BlazeVanilla.ts`; only the runtime driver is
 * re-touched:
 *
 *   1. No loop, no pointer, no scroll. Blaze is fully procedural — the
 *      fire is generated from `uTime` (and the captured content) alone.
 *      A render needs no cursor and no scrollbar; the port simply
 *      advances `time = frame * speed / fps` of composition time instead
 *      of real elapsed seconds, exactly like the upstream
 *      `delta * speed` per frame at 1/fps. Frame N always produces
 *      exactly the same pixels — deterministic, seek-safe.
 *   2. Two passes, verbatim: a half-resolution FBO pass generates the
 *      fire (sparks, smoke, glow — `FIRE_FRAG`), then the main pass
 *      samples the fire texture and the content texture: heat
 *      distortion (snoise) bends the content near the bottom, the fire
 *      rises over it with a luma-based darkening of the content under
 *      the flames, and the result composites over the DOM.
 *   3. Content capture via the native html-in-canvas mechanism (the
 *      same `ctx.drawElementImage` + layoutSubtree path the upstream
 *      component uses, and the same one vhs/droplets/bend/shatter rely
 *      on): the children are rendered as normal DOM, moved into a
 *      layoutSubtree canvas, painted on demand (`requestPaint` +
 *      `paint` event), and the paint record is drawn into the canvas
 *      backing store with `drawElementImage` — an origin-clean bitmap,
 *      so it can be uploaded straight into the GL texture with
 *      `texImage2D`. Per-frame inline styles are included — animated
 *      transforms are captured cleanly; per-element opacity fades are
 *      not (see the animation.md pitfall). Sampler matches upstream:
 *      LINEAR/LINEAR, no mipmaps.
 *   4. The fire needs no texture: the FIRE pass is purely procedural,
 *      and the main pass degrades gracefully — with an empty content
 *      texture the fire still renders over the DOM (only the heat
 *      distortion and luma-darkening of content are lost). The
 *      treatment itself is faded in via `fadeInFrames`/`fadeOutFrames`
 *      (a canvas-opacity tape like bend) so the video does not open on
 *      a fully-formed fire popping over the page.
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): height, distortion, distortionScale, speed,
 * sparks, sparkDensity, sparkSize, layers, smoke, glow, sparkColor,
 * smokeColor, fadeInFrames, fadeOutFrames. All upstream options are
 * kept — nothing interactive existed to drop.
 *
 * Performance:
 *   - One WebGL2 context, two shader compiles, one half-resolution FBO
 *     draw + one full-frame draw per frame at 1x internal resolution
 *     (SwiftShader software raster). The fire pass is procedural noise
 *     + particles over a quarter of the pixels — comparable to vhs,
 *     cheaper than the shatter cell sweeps.
 *   - The html-in-canvas capture + texture upload happens once per
 *     frame.
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface BlazeRipProps {
  config: TemplateConfig;
  /** The scene behind the fire (fills the frame; the fire rises over
   *  its lower `height` fraction — see the preview for the pattern).
   */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI BlazeVanilla.ts. Do not
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

const NOISE = `
float hash1_2 (vec2 x) {
  return fract(sin(dot(x, vec2(52.127, 61.2871))) * 521.582);
}

vec2 hash2_2 (vec2 x) {
  return fract(sin(x * mat2(20.52, 24.1994, 70.291, 80.171)) * 492.194);
}

vec2 noise2_2 (vec2 uv) {
  vec2 f = smoothstep(0.0, 1.0, fract(uv));
  vec2 uv00 = floor(uv);
  vec2 v00 = hash2_2(uv00);
  vec2 v01 = hash2_2(uv00 + vec2(0.0, 1.0));
  vec2 v10 = hash2_2(uv00 + vec2(1.0, 0.0));
  vec2 v11 = hash2_2(uv00 + 1.0);
  return mix(mix(v00, v01, f.y), mix(v10, v11, f.y), f.x);
}

vec3 permute (vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise (vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
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
}`;

const FIRE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uHeight;
uniform float uSparks;
uniform float uSparkDensity;
uniform float uSparkSize;
uniform int uLayers;
uniform float uSmoke;
uniform float uGlow;
uniform vec3 uSparkColor;
uniform vec3 uSmokeColor;

#define MOVE_DIR vec2(0.0, -1.0)
#define MOVE_SPEED 0.5
${NOISE}

float fbm (vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

float smokeField (vec2 p, float t) {
  vec2 rise = vec2(-t * 0.03, -t * 0.22);
  vec2 q = vec2(
    fbm(p + rise),
    fbm(p + rise * 0.85 + vec2(5.2, 1.3)));
  return fbm(p + 0.55 * q + rise);
}

vec2 rotate2 (vec2 point, float deg) {
  float s = sin(deg);
  float c = cos(deg);
  return mat2(s, c, -c, s) * point;
}

vec2 voronoiPoint (vec2 root, float deg) {
  vec2 point = hash2_2(root) - 0.5;
  float s = sin(deg);
  float c = cos(deg);
  point = mat2(s, c, -c, s) * point * 0.66;
  point += root + 0.5;
  return point;
}

vec2 randomAround (vec2 point, vec2 range, vec2 uv) {
  return point + (hash2_2(uv) - 0.5) * range;
}

vec3 fireParticles (vec2 uv, vec2 originalUV) {
  vec3 particles = vec3(0.0);
  vec2 rootUV = floor(uv);
  float deg = uTime * 0.6 * (hash1_2(rootUV) - 0.5) * 2.0;
  vec2 pointUV = voronoiPoint(rootUV, deg);
  float size = 0.002 * uSparkSize;

  vec2 tempUV = uv + vec2(
    snoise(uv * 1.8 + uTime * 0.55),
    snoise(uv * 1.8 - uTime * 0.4 + 7.3)) * 0.06;

  float dist = length(rotate2(tempUV - pointUV, 0.7)
    * randomAround(vec2(0.5, 1.6), vec2(0.25, 0.2), rootUV));
  float distBloom = length(rotate2(tempUV - pointUV, 0.7)
    * randomAround(vec2(0.5, 0.8), vec2(0.3, 0.1), rootUV));

  particles += (1.0 - smoothstep(size * 0.6, size * 3.0, dist)) * uSparkColor * 1.5;
  particles += pow(1.0 - smoothstep(0.0, size * 6.0, distBloom), 3.0) * uSparkColor * 0.8;

  float border = (hash1_2(rootUV) - 0.5) * 2.0;
  float disappear = 1.0 - smoothstep(border, border + 0.5, originalUV.y);
  border = (hash1_2(rootUV + 0.214) - 1.8) * 0.7;
  float appear = smoothstep(border, border + 0.4, originalUV.y);

  return particles * disappear * appear;
}

vec3 layeredParticles (vec2 uv, float sizeMod, float alphaMod, int layers, float smoke) {
  vec3 particles = vec3(0.0);
  float size = 1.0;
  float alpha = 1.0;
  vec2 offset = vec2(0.0);
  for (int i = 0; i < layers; i++) {
    vec2 noiseOffset = (noise2_2(uv * size * 2.0 + 0.5) - 0.5) * 0.15;
    vec2 bokehUV = (uv * size * uSparkDensity + uTime * MOVE_DIR * MOVE_SPEED)
      + offset + noiseOffset;
    particles += fireParticles(bokehUV, uv) * alpha
      * (1.0 - smoothstep(0.0, 1.0, smoke) * (float(i) / float(layers)));
    offset += hash2_2(vec2(alpha, alpha)) * 10.0;
    alpha *= alphaMod;
    size *= sizeMod;
  }
  return particles;
}

void main () {
  vec2 uv = vUv;

  float zone = clamp(uHeight, 0.02, 1.0);
  float fy = uv.y / zone;

  if (fy > 1.0) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / uResolution.y;
  vec2 fireUv = vec2((uv.x - 0.5) * aspect * 3.2, mix(-0.7, 1.6, fy));

  float smokeIntensity = 0.0;
  if (uSmoke > 0.001) {
    smokeIntensity = smokeField(fireUv * vec2(0.4, 0.55), uTime);
    smokeIntensity = smoothstep(0.42, 1.15, smokeIntensity);
    smokeIntensity *= pow(1.0 - smoothstep(-1.0, 1.6, fireUv.y), 1.5);
  }
  vec3 smoke = smokeIntensity * uSmokeColor * 0.8 * uSmoke;

  vec3 particles = vec3(0.0);
  if (uSparks > 0.001) {
    particles = layeredParticles(fireUv, 1.01, 0.9, uLayers, smokeIntensity) * uSparks;
  }

  float fade = 1.0 - smoothstep(0.55, 1.0, fy);
  vec3 glow = uSmokeColor * 0.05 * uGlow * pow(1.0 - fy, 2.0);
  vec3 fire = (particles + smoke) * fade + glow;

  outColor = vec4(fire, max(fire.r, max(fire.g, fire.b)));
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uFire;
uniform float uTime;
uniform float uHeight;
uniform float uDistortion;
uniform float uDistortionScale;
uniform float uMaxX;
uniform float uHasContent;
${NOISE}

float snoiseOctaves (vec2 uv, int octaves, float alpha, float beta, vec2 gamma, float delta) {
  vec2 pos = uv;
  float t = 1.0;
  float s = 1.0;
  vec2 q = gamma;
  float r = 0.0;
  for (int i = 0; i < octaves; i++) {
    r += s * snoise(pos + q);
    pos += t * uv;
    t *= beta;
    s *= alpha;
    q *= delta;
  }
  return r;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float zone = clamp(uHeight, 0.02, 1.0);
  float fy = uv.y / zone;

  if (uHasContent < 0.5) {
    if (fy > 1.0) {
      outColor = vec4(0.0);
      return;
    }
    vec4 fire = texture(uFire, uv);
    outColor = vec4(fire.rgb, clamp(fire.a * 0.85, 0.0, 1.0));
    return;
  }

  if (fy > 1.0) {
    vec4 c = texture(uContent, vec2(uv.x, 1.0 - uv.y));
    outColor = vec4(c.rgb * c.a, c.a);
    return;
  }

  float heat = uDistortion * pow(1.0 - smoothstep(0.0, 1.0, fy), 1.5);
  vec2 uv1 = uv;
  if (heat > 0.0005) {
    vec2 nUv = uv * 2.0 * uDistortionScale;
    float dx = 0.005 * snoiseOctaves(nUv + uTime * vec2(0.00323, 0.00345),
      4, 0.85, -3.0, uTime * vec2(-0.0323, -0.345), 1.203);
    float dy = 0.0035 * snoiseOctaves(nUv + 3.0 + uTime * vec2(-0.00323, 0.00345),
      4, 0.85, -3.0, uTime * vec2(-0.0323, -0.345), 1.203);
    uv1 = clamp(uv + vec2(dx, dy) * heat, vec2(0.001), vec2(uMaxX - 0.004, 0.999));
  }
  vec4 content = texture(uContent, vec2(uv1.x, 1.0 - uv1.y));

  vec4 fire = texture(uFire, uv);

  float luma = dot(content.rgb, vec3(0.299, 0.587, 0.114)) * content.a;
  vec3 col = content.rgb * content.a * (1.0 - fire.a * luma) + fire.rgb;
  float alpha = clamp(content.a + fire.a, 0.0, 1.0);
  outColor = vec4(col, alpha);
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

interface BlazeParams {
  height: number;
  distortion: number;
  distortionScale: number;
  speed: number;
  sparks: number;
  sparkDensity: number;
  sparkSize: number;
  layers: number;
  smoke: number;
  glow: number;
  sparkColor: [number, number, number];
  smokeColor: [number, number, number];
}

/** A compiled pass: linked program plus its uniform locations. */
type Pass = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
};

/**
 * Capture `element`'s current painted HTML into the GL content texture,
 * render the procedural fire into the half-resolution FBO, then run the
 * composite draw once. Pure function of the DOM state and uniforms —
 * deterministic. Resolves after the draw; on any failure the canvas
 * stays transparent and the plain DOM shows through (untreated), so the
 * frame never blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: BlazeParams,
  progress: number,
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
      console.error("Blaze shader error:", gl.getShaderInfoLog(shader));
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
      console.error("Blaze link error:", gl.getProgramInfoLog(program));
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

  const mainPass = link(FRAG);
  const firePass = link(FIRE_FRAG);
  if (!mainPass || !firePass) return;

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

  // The fire pass renders into a half-resolution FBO (upstream sizes it
  // from output.width/2 — the fire is procedural, so the lower
  // resolution is where the blurry softness comes from).
  const fireWidth = Math.max(1, Math.floor(width / 2));
  const fireHeight = Math.max(1, Math.floor(height / 2));
  const fireTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fireTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    fireWidth,
    fireHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  const fireFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fireFbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    fireTexture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

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
    console.error("Blaze: output canvas has no parent — rendering children untreated");
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
  // transparent on frame 0 (treatment fade), so instead of capturing
  // garbage the setup is deferred one frame: the scene stays in place
  // and frame 0 shows the raw DOM. From frame 1 the record is built
  // from settled content and stays correct.
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
        "Blaze: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("Blaze: drawElementImage unavailable — rendering children untreated");
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
      "Blaze: html-in-canvas paint never fired — rendering children untreated",
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

  // Pass 1 — the procedural fire into the half-resolution FBO.
  gl.useProgram(firePass.program);
  gl.uniform2f(firePass.uniforms.uResolution, width, height);
  gl.uniform1f(firePass.uniforms.uTime, time);
  gl.uniform1f(firePass.uniforms.uHeight, Math.min(1, Math.max(0.02, p.height)));
  gl.uniform1f(firePass.uniforms.uSparks, p.sparks);
  gl.uniform1f(firePass.uniforms.uSparkDensity, Math.max(p.sparkDensity, 0.05));
  gl.uniform1f(firePass.uniforms.uSparkSize, Math.max(p.sparkSize, 0.05));
  gl.uniform1i(firePass.uniforms.uLayers, Math.min(10, Math.max(1, Math.round(p.layers))));
  gl.uniform1f(firePass.uniforms.uSmoke, p.smoke);
  gl.uniform1f(firePass.uniforms.uGlow, p.glow);
  gl.uniform3f(
    firePass.uniforms.uSparkColor,
    p.sparkColor[0],
    p.sparkColor[1],
    p.sparkColor[2],
  );
  gl.uniform3f(
    firePass.uniforms.uSmokeColor,
    p.smokeColor[0],
    p.smokeColor[1],
    p.smokeColor[2],
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, fireFbo);
  gl.viewport(0, 0, fireWidth, fireHeight);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Pass 2 — composite: heat distortion + fire over the content.
  gl.useProgram(mainPass.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.uniform1i(mainPass.uniforms.uContent, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fireTexture);
  gl.uniform1i(mainPass.uniforms.uFire, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(mainPass.uniforms.uTime, time);
  gl.uniform1f(mainPass.uniforms.uHeight, Math.min(1, Math.max(0.02, p.height)));
  gl.uniform1f(mainPass.uniforms.uDistortion, p.distortion);
  gl.uniform1f(mainPass.uniforms.uDistortionScale, Math.max(p.distortionScale, 0.05));
  gl.uniform1f(mainPass.uniforms.uMaxX, contentMaxX);
  gl.uniform1f(mainPass.uniforms.uHasContent, 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export const BlazeRip: React.FC<BlazeRipProps> = ({
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
  const p: BlazeParams = useMemo(() => {
    const sparkRaw = Array.isArray(extras.sparkColor) ? extras.sparkColor : [];
    const smokeRaw = Array.isArray(extras.smokeColor) ? extras.smokeColor : [];
    return {
      height: Math.min(1, Math.max(0.02, Number(extras.height ?? 0.97))),
      distortion: Math.min(3, Math.max(0, Number(extras.distortion ?? 0.6))),
      distortionScale: Math.min(2, Math.max(0.05, Number(extras.distortionScale ?? 0.5))),
      speed: Math.min(10, Math.max(0, Number(extras.speed ?? 1))),
      sparks: Math.min(2, Math.max(0, Number(extras.sparks ?? 0.5))),
      sparkDensity: Math.min(5, Math.max(0.05, Number(extras.sparkDensity ?? 1.5))),
      sparkSize: Math.min(3, Math.max(0.05, Number(extras.sparkSize ?? 1))),
      layers: Math.min(10, Math.max(1, Math.round(Number(extras.layers ?? 4)))),
      smoke: Math.min(2, Math.max(0, Number(extras.smoke ?? 0.5))),
      glow: Math.min(5, Math.max(0, Number(extras.glow ?? 1.5))),
      sparkColor: [
        Math.min(1, Math.max(0, Number(sparkRaw[0] ?? 1))),
        Math.min(1, Math.max(0, Number(sparkRaw[1] ?? 0.4))),
        Math.min(1, Math.max(0, Number(sparkRaw[2] ?? 0.05))),
      ] as [number, number, number],
      smokeColor: [
        Math.min(1, Math.max(0, Number(smokeRaw[0] ?? 1))),
        Math.min(1, Math.max(0, Number(smokeRaw[1] ?? 0.43))),
        Math.min(1, Math.max(0, Number(smokeRaw[2] ?? 0.1))),
      ] as [number, number, number],
    };
  }, [extras]);
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));

  // Deterministic: the fire is purely time-driven, and time advances at
  // `speed` per second of composition time (upstream: delta * speed
  // with delta = 1/fps in a render). No scroll, no pointer — nothing
  // else to sweep.
  const progress = Math.min(1, Math.max(0, frame / durationInFrames));
  const time = (frame * p.speed) / Math.max(fps, 1);

  // Treatment fade in/out so the fire doesn't pop over the page at the
  // scene bounds (canvas opacity — safe: the opacity lives on the
  // output canvas, never inside the captured content).
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
  // painted DOM (transform animations included). The render is held
  // (delayRender) until the capture + draw completes, so the frame
  // screenshot always contains the treatment.
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
      captureStateRef,
    )
      .catch((err) => console.error("Blaze capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, progress, time, tapeFade]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the blaze texture
             each frame (transform animations included; per-element
             opacity fades are not — see animation.md); if the capture
             or WebGL fails, this DOM is what the viewer sees —
             untreated. Blaze does not scroll: the fire rises over the
             scene as it sits. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The fire, composited over the DOM when ready — faded in via
             the treatment fade so it grows in rather than popping. */}
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
