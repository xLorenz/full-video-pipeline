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
 * though vhs renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * VHSRip — worn-tape CRT treatment over arbitrary content.
 *
 * A deterministic Remotion port of the Canvas UI `<VHS>` WebGL component
 * (canvasui.dev). Unlike glyph-rain/flame-wrap, the VHS effect IS the
 * content treatment — the shader samples a texture of the wrapped DOM
 * and displaces/bleeds/destabilizes it, so the port keeps a real content
 * capture path. The GLSL is kept VERBATIM from the upstream
 * `VHSVanilla.ts`; only the runtime driver is re-touched:
 *
 *   1. No `requestAnimationFrame` loop / no accumulated time. The shader
 *      is a pure function of its uniforms, so the effect draws once per
 *      frame with `uTime = (frame / fps) * global.speed * speed`. Frame N
 *      always produces exactly the same pixels — deterministic, seek-safe.
 *      (One page persists per composition; each frame re-renders React,
 *      re-paints the scene, and re-uploads the texture — the capture DOM
 *      is stateful, the draw is not.)
 *   2. Content capture via the native html-in-canvas mechanism (the same
 *      `ctx.drawElementImage` + layoutSubtree path the upstream component
 *      uses): the children are rendered as normal DOM, moved into a
 *      layoutSubtree canvas, painted on demand (`requestPaint` + `paint`
 *      event), and the paint record is drawn into the canvas backing
 *      store with `drawElementImage` — an origin-clean bitmap, so it can
 *      be uploaded straight into the GL texture with `texImage2D`.
 *      Per-frame inline styles are included, so entrance animations are
 *      captured as-is. (An SVG `<foreignObject>` blob image would be
 *      simpler, but Chrome flags such images as cross-origin and WebGL
 *      rejects the upload with a SecurityError — tainted.)
 *   3. Full-frame treatment: unlike flame-wrap (a box wrapper), VHSRip
 *      fills the composition (`AbsoluteFill` root) and processes
 *      everything the caller puts inside — wrap your ENTIRE scene.
 *      `uMaxX` is kept: content narrower than the frame is sampled only
 *      over its own horizontal band, exactly like upstream.
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): speed, wave, jitter, crease, switching,
 * switchingHeight, bloom, aberration, acBeat, grain, scanlines,
 * vignette, barrel, saturation, exposure, fadeInFrames, fadeOutFrames.
 *
 * Performance:
 *   - One WebGL2 context, one shader compile, one full-frame draw per
 *     frame at 1x internal resolution (SwiftShader software raster).
 *     The bloom loop samples the texture 11x per pixel, so `bloom` is
 *     the expensive knob; the rest is cheap.
 *   - The html-in-canvas capture + texture upload happens once per frame
 *     (one `requestPaint` + paint event + one backing-store redraw).
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface VHSRipProps {
  config: TemplateConfig;
  /** The scene the VHS treatment is applied to (fills the frame). */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI VHSVanilla.ts. Do not edit;
// the port's "re-touch" lives in the driver below.
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
uniform float uWave;
uniform float uJitter;
uniform float uCrease;
uniform float uSwitching;
uniform float uSwitchHeight;
uniform float uBloom;
uniform float uAberration;
uniform float uAcBeat;
uniform float uGrain;
uniform float uScanlines;
uniform float uVignette;
uniform float uSaturation;
uniform float uExposure;
uniform float uBarrel;
uniform vec3 uBezel;
uniform float uCreaseNoise;
uniform float uMaxX;

#define PI 3.14159265

float hash (vec2 v) {
  return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
}

float iHash (vec2 v, vec2 r) {
  float h00 = hash(floor(v * r + vec2(0.0, 0.0)) / r);
  float h10 = hash(floor(v * r + vec2(1.0, 0.0)) / r);
  float h01 = hash(floor(v * r + vec2(0.0, 1.0)) / r);
  float h11 = hash(floor(v * r + vec2(1.0, 1.0)) / r);
  vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
  return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y)
    + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
}

float noise (vec2 v) {
  float sum = 0.0;
  float s = 2.0;
  for (int i = 1; i < 7; i++) {
    sum += iHash(v + vec2(i), vec2(2.0 * s)) / s;
    s *= 2.0;
  }
  return sum;
}

vec4 tape (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float edgeMask = 1.0;
  if (uBarrel > 0.0) {
    vec2 c = vec2(uv.x / uMaxX, uv.y) * 2.0 - 1.0;
    c *= 1.0 + uBarrel * 0.15 * dot(c, c);
    float m = max(abs(c.x), abs(c.y));
    edgeMask = 1.0 - smoothstep(1.0 - 0.12 * uBarrel, 1.0, m);
    if (edgeMask <= 0.0) {
      outColor = vec4(uBezel, 1.0);
      return;
    }
    uv = vec2((c.x * 0.5 + 0.5) * uMaxX, c.y * 0.5 + 0.5);
  }

  vec2 uvn = uv;
  float t = uTime;

  float lineNoise = 0.0;
  if (uJitter + uCrease + uSwitching > 0.0) {
    lineNoise = noise(vec2(uvn.y * 100.0, t * 10.0));
  }

  if (uWave > 0.0) {
    uvn.x += (noise(vec2(uvn.y, t)) - 0.5) * 0.005 * uWave;
  }
  uvn.x += (lineNoise - 0.5) * 0.01 * uJitter;

  float tcPhase = clamp(
    (sin(uvn.y * 8.0 - t * PI * 1.2) - 0.92) * uCreaseNoise,
    0.0, 0.01
  ) * 10.0 * uCrease;
  float tcNoise = max(lineNoise - 0.5, 0.0);
  uvn.x -= tcNoise * tcPhase;

  float snPhase = smoothstep(max(uSwitchHeight, 1e-4), 0.0, uvn.y) * uSwitching;
  uvn.y += snPhase * 0.3;
  uvn.x += snPhase * ((lineNoise - 0.5) * 0.2);

  vec4 base = tape(uvn);
  vec3 col = base.rgb;
  col *= 1.0 - tcPhase;

  col = mix(col, col.yzx, clamp(snPhase, 0.0, 1.0));

  if (uBloom > 0.0) {
    float px = uAberration / max(uResolution.x, 1.0);
    vec3 bloomSum = vec3(0.0);
    for (int i = -8; i <= 2; i++) {
      vec3 s = tape(uvn + vec2(float(i) * px, 0.0)).rgb;
      if (i >= -4) bloomSum.r += s.r;
      if (i >= -6 && i <= 0) bloomSum.g += s.g;
      if (i <= -2) bloomSum.b += s.b;
    }
    bloomSum *= 0.1;

    col = mix(col, (col + bloomSum) / 1.7, clamp(uBloom, 0.0, 1.0));
  }

  if (uAcBeat > 0.0) {
    col *= 1.0 + clamp(
      noise(vec2(0.0, uv.y + t * 0.2)) * 0.6 - 0.25, 0.0, 0.1
    ) * uAcBeat;
  }

  float g = hash(uv * uResolution + fract(t) * vec2(127.1, 311.7)) - 0.5;
  col += g * uGrain;

  float scan = sin(uv.y * uResolution.y * PI) * 0.5;
  col *= 1.0 - uScanlines * 0.35 * scan;

  vec2 vd = (uv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  col *= 1.0 - uVignette * smoothstep(0.4, 1.1, length(vd));

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, clamp(uSaturation, 0.0, 2.0));

  col *= uExposure;

  float alpha = max(base.a, clamp(snPhase + tcPhase, 0.0, 1.0));

  if (uBarrel > 0.0) {
    col = mix(uBezel, col, edgeMask);
    alpha = 1.0;
  }
  outColor = vec4(col, alpha);
}`;

// ---------------------------------------------------------------------------
// Driver — the re-touched part: one deterministic capture + draw per frame.
// ---------------------------------------------------------------------------

/** CPU twin of the shader's `noise()` — feeds uCreaseNoise, like the
 * upstream `noiseCpu`. */
function noiseCpu(vx: number, vy: number): number {
  const fract = (x: number) => x - Math.floor(x);
  const hash2 = (x: number, y: number) =>
    fract(Math.sin(x * 89.44 + y * 19.36) * 22189.22);
  const smooth01 = (x: number) => x * x * (3 - 2 * x);
  function iHashCpu(x: number, y: number, r: number) {
    const fx = Math.floor(x * r);
    const fy = Math.floor(y * r);
    const h00 = hash2(fx / r, fy / r);
    const h10 = hash2((fx + 1) / r, fy / r);
    const h01 = hash2(fx / r, (fy + 1) / r);
    const h11 = hash2((fx + 1) / r, (fy + 1) / r);
    const ix = smooth01(fract(x * r));
    const iy = smooth01(fract(y * r));
    return (
      (h00 * (1 - ix) + h10 * ix) * (1 - iy) + (h01 * (1 - ix) + h11 * ix) * iy
    );
  }
  let sum = 0;
  let s = 2;
  for (let i = 1; i < 7; i++) {
    sum += iHashCpu(vx + i, vy + i, 2 * s) / s;
    s *= 2;
  }
  return sum;
}

interface VHSParams {
  speed: number;
  wave: number;
  jitter: number;
  crease: number;
  switching: number;
  switchingHeight: number;
  bloom: number;
  aberration: number;
  acBeat: number;
  grain: number;
  scanlines: number;
  vignette: number;
  barrel: number;
  saturation: number;
  exposure: number;
}

/** First opaque background color walking up from `el` — the CRT bezel
 * color shown at the barrel edge. Mirrors the upstream `syncBezelColor`. */
function findBezel(el: HTMLElement): [number, number, number] {
  let current: HTMLElement | null = el;
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  while (current && ctx) {
    const bg = getComputedStyle(current).backgroundColor;
    if (bg && bg !== "transparent") {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      if (data[3] > 0) return [data[0] / 255, data[1] / 255, data[2] / 255];
    }
    current = current.parentElement;
  }
  return [0, 0, 0];
}

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

/**
 * Capture `element`'s current painted HTML into the GL texture bound at
 * texture unit 0, then run the VHS draw once. Pure function of the DOM
 * state and uniforms — deterministic. Resolves after the capture is
 * uploaded; on any failure the canvas stays transparent and the plain
 * DOM shows through (untreated), so the frame never blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: VHSParams,
  time: number,
  bezel: [number, number, number],
  compWidth: number,
  compHeight: number,
  stateRef: React.MutableRefObject<CaptureState | null>,
): Promise<void> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(compWidth * dpr));
  const height = Math.max(1, Math.round(compHeight * dpr));
  output.width = width;
  output.height = height;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl || gl.isContextLost()) {
    console.error("VHS: WebGL2 unavailable — rendering children untreated");
    return;
  }
  const glc: WebGL2RenderingContext = gl;

  function compile(type: number, text: string): WebGLShader | null {
    const shader = glc.createShader(type);
    if (!shader) return null;
    glc.shaderSource(shader, text);
    glc.compileShader(shader);
    if (!glc.getShaderParameter(shader, glc.COMPILE_STATUS)) {
      console.error("VHS shader error:", glc.getShaderInfoLog(shader));
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
    console.error("VHS link error:", glc.getProgramInfoLog(program));
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
    console.error("VHS: output canvas has no parent — rendering children untreated");
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
        "VHS: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("VHS: drawElementImage unavailable — rendering children untreated");
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
      "VHS: html-in-canvas paint never fired — rendering children untreated",
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

  glc.bindTexture(glc.TEXTURE_2D, contentTexture);
  glc.texImage2D(glc.TEXTURE_2D, 0, glc.RGBA, glc.RGBA, glc.UNSIGNED_BYTE, st.layout);

  glc.useProgram(program);
  glc.activeTexture(glc.TEXTURE0);
  glc.bindTexture(glc.TEXTURE_2D, contentTexture);
    glc.uniform1i(uniforms.uContent, 0);
    glc.uniform2f(uniforms.uResolution, width, height);
    glc.uniform1f(uniforms.uTime, time);
    glc.uniform1f(uniforms.uWave, Math.max(p.wave, 0));
    glc.uniform1f(uniforms.uJitter, Math.max(p.jitter, 0));
    glc.uniform1f(uniforms.uCrease, Math.max(p.crease, 0));
    glc.uniform1f(uniforms.uSwitching, Math.max(p.switching, 0));
    glc.uniform1f(uniforms.uSwitchHeight, Math.max(p.switchingHeight, 0));
    glc.uniform1f(uniforms.uBloom, p.bloom);
    glc.uniform1f(
      uniforms.uAberration,
      Math.max(p.aberration, 0) * (width / Math.max(output.clientWidth, 1)),
    );
    glc.uniform1f(uniforms.uAcBeat, Math.max(p.acBeat, 0));
    glc.uniform1f(uniforms.uGrain, Math.max(p.grain, 0));
    glc.uniform1f(uniforms.uScanlines, Math.max(p.scanlines, 0));
    glc.uniform1f(uniforms.uVignette, Math.max(p.vignette, 0));
    glc.uniform1f(uniforms.uBarrel, Math.max(p.barrel, 0));
    glc.uniform3f(uniforms.uBezel, bezel[0], bezel[1], bezel[2]);
    glc.uniform1f(uniforms.uCreaseNoise, noiseCpu(time, time));
    glc.uniform1f(uniforms.uSaturation, p.saturation);
    glc.uniform1f(uniforms.uExposure, Math.max(p.exposure, 0));
    glc.uniform1f(uniforms.uMaxX, contentMaxX);

    glc.bindFramebuffer(glc.FRAMEBUFFER, null);
    glc.viewport(0, 0, width, height);
    glc.drawArrays(glc.TRIANGLE_STRIP, 0, 4);
}

export const VHSRip: React.FC<VHSRipProps> = ({
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
  const p: VHSParams = useMemo(
    () => ({
      speed: Math.min(3, Math.max(0.05, Number(extras.speed ?? 0.5))),
      wave: Math.min(3, Math.max(0, Number(extras.wave ?? 1))),
      jitter: Math.min(3, Math.max(0, Number(extras.jitter ?? 0.25))),
      crease: Math.min(3, Math.max(0, Number(extras.crease ?? 0.1))),
      switching: Math.min(3, Math.max(0, Number(extras.switching ?? 0.05))),
      switchingHeight: Math.min(0.2, Math.max(0.001, Number(extras.switchingHeight ?? 0.02))),
      bloom: Math.min(1, Math.max(0, Number(extras.bloom ?? 0.4))),
      aberration: Math.min(20, Math.max(0, Number(extras.aberration ?? 2))),
      acBeat: Math.min(1, Math.max(0, Number(extras.acBeat ?? 1))),
      grain: Math.min(1, Math.max(0, Number(extras.grain ?? 0.1))),
      scanlines: Math.min(1, Math.max(0, Number(extras.scanlines ?? 0.1))),
      vignette: Math.min(1, Math.max(0, Number(extras.vignette ?? 0))),
      barrel: Math.min(1, Math.max(0, Number(extras.barrel ?? 0))),
      saturation: Math.min(2, Math.max(0, Number(extras.saturation ?? 1))),
      exposure: Math.min(3, Math.max(0, Number(extras.exposure ?? 1))),
    }),
    [extras],
  );
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));

  // Shader time — seconds × speed (upstream accumulated
  // `time += delta * config.speed`).
  const time = (frame / fps) * g.speed * p.speed;

  // Treatment fade in/out so the tape doesn't pop at scene bounds.
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
  // painted DOM (entrance animations, timecode, blinking REC included).
  // The render is held (delayRender) until the capture + draw completes,
  // so the frame screenshot always contains the treatment.
  useLayoutEffect(() => {
    const output = outputRef.current;
    const content = contentRef.current;
    if (!output || !content) return;
    const bezel = findBezel(content);
    const handle = delayRender();
    captureAndDraw(output, content, p, time, bezel, compWidth, compHeight, captureStateRef)
      .catch((err) => console.error("VHS capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, time, tapeFade]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the VHS texture
             each frame (entrance animations included); if the capture or
             WebGL fails, this DOM is what the viewer sees — untreated. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The treated frame, composited over the DOM when ready. */}
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
