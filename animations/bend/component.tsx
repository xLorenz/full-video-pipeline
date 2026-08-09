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
 * though bend renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * BendRip — the page scrolls on the face of a cube; the top and bottom
 * edges fold over virtual creases and flatten back out at the scroll
 * ends.
 *
 * A deterministic Remotion port of the Canvas UI `<Bend>` WebGL
 * component (canvasui.dev). Like glyph-rain/flame-wrap/vhs/droplets,
 * the effect IS a content treatment: the shader samples a texture of
 * the wrapped DOM and bends it over folded edges. The GLSL is kept
 * VERBATIM from the upstream `Bend.tsx`; only the runtime driver is
 * re-touched:
 *
 *   1. No scroll / no `requestAnimationFrame` loop / no pointer state.
 *      Upstream derives the fold amounts from the content's scroll
 *      position; a render has no scroll, so the port SWEEPS the scroll
 *      deterministically: `progress = clamp01(frame / durationInFrames)`
 *      moves `content.scrollTop` from 0 to the content's scroll height
 *      (the html-in-canvas paint record includes the scrolled viewport,
 *      so the texture really scrolls), and the fold amounts are computed
 *      from that same scroll position exactly like upstream's
 *      `syncScroll` — `top = ramp(scrollTop)`, `bottom = ramp(max -
 *      scrollTop)`. Frame N always produces exactly the same pixels —
 *      deterministic, seek-safe.
 *   2. `smoothing` snaps (k = 1, no exponential easing), and the
 *      interactive machinery is dropped: tumble (overscroll tip), tilt
 *      (pointer lean), phi, hover-rule patching, click forwarding, and
 *      text-selection remapping — there is no pointer in a render.
 *   3. Content capture via the native html-in-canvas mechanism (the
 *      same `ctx.drawElementImage` + layoutSubtree path the upstream
 *      component uses, and the same one vhs/droplets rely on): the
 *      children are rendered as normal DOM, moved into a layoutSubtree
 *      canvas, painted on demand (`requestPaint` + `paint` event), and
 *      the paint record is drawn into the canvas backing store with
 *      `drawElementImage` — an origin-clean bitmap, so it can be
 *      uploaded straight into the GL texture with `texImage2D`. Per-
 *      frame inline styles are included — animated transforms are
 *      captured cleanly; per-element opacity fades are not (headless
 *      Chrome fades sub-fully-opaque content out of the record over
 *      rebuilds; see the animation.md pitfall). The texture keeps its
 *      mipmap chain
 *      (`generateMipmap` per upload), matching upstream's sampler.
 *   4. Full-frame treatment: like vhs/droplets, BendRip fills the
 *      composition (`AbsoluteFill` root) and processes everything the
 *      caller puts inside — wrap your ENTIRE scene. `uMaxX` is kept:
 *      content narrower than the frame is bent only over its own
 *      horizontal band, exactly like upstream.
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): zone, angle, rounding, perspective, direction,
 * ease, top, bottom, fadeInFrames, fadeOutFrames. The upstream
 * `smoothing`, `tumble` and `tilt` options are dropped — there is no
 * scroll momentum and no pointer in a render.
 *
 * Performance:
 *   - One WebGL2 context, one shader compile, one full-frame draw per
 *     frame at 1x internal resolution (SwiftShader software raster).
 *     The fold edge is traced with a 40-step arc loop per folded pixel,
 *     so folding edges cost more than flat frames — cheaper than vhs.
 *   - The html-in-canvas capture + texture upload (with mipmaps)
 *     happens once per frame.
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface BendRipProps {
  config: TemplateConfig;
  /** The scrollable scene behind the folding edges (fills the frame,
   *  taller than the frame to scroll — see the preview for the pattern).
   */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI Bend.tsx. Do not edit;
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
uniform float uZone;
uniform float uAngle;
uniform float uPersp;
uniform float uDir;
uniform float uTopAmt;
uniform float uBotAmt;
uniform float uMaxX;
uniform float uPxY;
uniform float uPxX;
uniform float uCover;
uniform vec3 uBg;
uniform float uTiltX;
uniform float uTiltY;
uniform float uPhi;
uniform float uRound;

vec3 foldEdge (float sy, float amt) {
  float yf = 1.0 - uZone;
  if (amt < 1e-4) return vec3(sy, 0.0, 1.0);
  float theta = uAngle * amt;
  if (uRound < 1e-4) {
    float s = sin(theta) * uDir;
    float c = cos(theta);
    float denom = max(c * uPersp + s * (0.5 - sy), 1e-5);
    float tRaw = uPersp * (sy - yf) / denom;
    float t = clamp(tRaw, 0.0, uZone);
    float z = max(t * s, -0.85 * uPersp);
    float alpha = 1.0 - smoothstep(uZone, uZone + 2.0 * uPxY, tRaw);
    return vec3(yf + t, z, alpha);
  }
  if (sy <= yf) return vec3(sy, 0.0, 1.0);
  float R = min(uRound, uZone);
  float r = R / theta;
  float ca = cos(theta);
  float sa = sin(theta);
  float yA = r * sa;
  float zA = r * (1.0 - ca);
  float prevSy = yf;
  float prevZ = 0.0;
  float prevU = 0.0;
  float bestU = -1.0;
  float bestZ = 0.0;
  float maxSy = yf;
  float du = uZone / 40.0;
  for (int i = 1; i <= 40; i++) {
    float u = du * float(i);
    float Y;
    float Zm;
    if (u <= R) {
      float a = u / r;
      Y = r * sin(a);
      Zm = r * (1.0 - cos(a));
    } else {
      Y = yA + (u - R) * ca;
      Zm = zA + (u - R) * sa;
    }
    Y += yf;
    float Z = max(Zm * uDir, -0.85 * uPersp);
    float scr = 0.5 + (Y - 0.5) * uPersp / (uPersp + Z);
    if ((prevSy - sy) * (scr - sy) <= 0.0 && abs(scr - prevSy) > 1e-7) {
      float f = clamp((sy - prevSy) / (scr - prevSy), 0.0, 1.0);
      bestU = mix(prevU, u, f);
      bestZ = mix(prevZ, Z, f);
      if (uDir > 0.0) break;
    }
    maxSy = max(maxSy, scr);
    prevSy = scr;
    prevZ = Z;
    prevU = u;
  }
  if (bestU < 0.0) {
    float alpha = 1.0 - smoothstep(maxSy - uPxY, maxSy + uPxY, sy);
    return vec3(1.0, prevZ, alpha);
  }
  return vec3(yf + bestU, bestZ, 1.0);
}

vec2 tipPlane (float sy, float phi) {
  float s = sin(phi);
  float c = cos(phi);
  float denom = max(c * uPersp + s * (sy - 0.5), 1e-4);
  float t = uPersp * (1.0 - sy) / denom;
  return vec2(1.0 - t, t * s);
}

void main () {
  vec2 uv = vUv;
  float cx = uMaxX * 0.5;
  float zSum = 0.0;

  if (abs(uPhi) > 1e-4) {
    if (uPhi > 0.0) {
      vec2 r = tipPlane(uv.y, uPhi);
      uv.y = r.x;
      zSum += r.y;
    } else {
      vec2 r = tipPlane(1.0 - uv.y, -uPhi);
      uv.y = 1.0 - r.x;
      zSum += r.y;
    }
  }

  float zG = uTiltX * (uv.x - cx) + uTiltY * (uv.y - 0.5);
  zSum += zG;
  uv.y = 0.5 + (uv.y - 0.5) * (uPersp + zG) / uPersp;

  float inTop = step(1.0 - uZone, uv.y);
  float inBot = step(uv.y, uZone);

  vec3 top = foldEdge(uv.y, uTopAmt);
  vec3 bot = foldEdge(1.0 - uv.y, uBotAmt);

  float srcY = uv.y;
  srcY = mix(srcY, top.x, inTop);
  srcY = mix(srcY, 1.0 - bot.x, inBot);

  zSum += inTop * top.y + inBot * bot.y;
  float alpha = mix(1.0, top.z, inTop) * mix(1.0, bot.z, inBot);

  float srcX = cx + (uv.x - cx) * (uPersp + zSum) / uPersp;

  alpha *= smoothstep(-2.0 * uPxX, 0.0, srcX);
  alpha *= 1.0 - smoothstep(uMaxX, uMaxX + 2.0 * uPxX, srcX);
  alpha *= smoothstep(-2.0 * uPxY, 0.0, srcY);
  alpha *= 1.0 - smoothstep(1.0, 1.0 + 2.0 * uPxY, srcY);

  vec2 p = vec2(
    clamp(srcX, 0.0005, uMaxX - 0.0005),
    clamp(srcY, 0.0005, 0.9995)
  );
  vec4 base = texture(uContent, vec2(p.x, 1.0 - p.y));

  outColor = vec4(mix(uBg, base.rgb, alpha * base.a), uCover);
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

interface BendParams {
  zone: number;
  angle: number;
  rounding: number;
  perspective: number;
  direction: "in" | "out";
  ease: number;
  top: boolean;
  bottom: boolean;
}

/** First opaque background color walking up from `el` — the color
 * revealed at the folded edge (upstream `syncBgColor`). */
function findBgColor(el: HTMLElement): [number, number, number] {
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

/**
 * Capture `element`'s current painted HTML (scrolled to the frame's
 * deterministic scroll position) into the GL texture bound at texture
 * unit 0, then run the fold draw once. Pure function of the DOM state
 * and uniforms — deterministic. Resolves after the capture is
 * uploaded; on any failure the canvas stays transparent and the plain
 * DOM shows through (untreated), so the frame never blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: BendParams,
  progress: number,
  compWidth: number,
  compHeight: number,
  stateRef: React.MutableRefObject<CaptureState | null>,
  foldEnv: number,
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
      console.error("Bend shader error:", gl.getShaderInfoLog(shader));
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
    console.error("Bend link error:", gl.getProgramInfoLog(program));
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
    console.error("Bend: output canvas has no parent — rendering children untreated");
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
        "Bend: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("Bend: drawElementImage unavailable — rendering children untreated");
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
  // container (overflow auto) and `t` becomes its scrollTop. A real
  // scroll dirties the captured subtree's paint every frame, so the
  // texture always reflects the current scroll position. (A translate
  // transform does not — it is compositor-level, and in headless Chrome
  // the html-in-canvas record only rebuilds when the content's painted
  // appearance changes; with a static opening state that leaves a stale
  // record sticky.)
  //
  // If the content is not scrollable (shorter than the frame), the fold
  // sweep still runs over a synthetic scroll length so the effect stays
  // demonstrable.
  content.style.overflow = "auto";
  const scrollable = content.scrollHeight - content.clientHeight;
  const max = scrollable > 1 ? scrollable : p.ease * 4;
  const t = progress * max;
  if (scrollable > 1) {
    content.scrollTop = t;
  }
  const e = Math.max(p.ease, 1);
  const ramp = (v: number) => {
    const x = Math.min(Math.max(v / e, 0), 1);
    return x * x * (3 - 2 * x);
  };
  const topAmt = p.top ? ramp(t) : 0;
  const botAmt = p.bottom ? ramp(max - t) : 0;

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
      "Bend: html-in-canvas paint never fired — rendering children untreated",
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

  // All geometric uniforms are normalized against the COMPOSITION size
  // (upstream divides by output.clientHeight at render time — before
  // Remotion lays the page out that reads 0, which would NaN the shader).
  const h = Math.max(compHeight, 1);
  const w = Math.max(compWidth, 1);
  const zoneFrac = Math.min(Math.max(p.zone, 8) / h, 0.49);

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.uniform1i(uniforms.uContent, 0);
  gl.uniform1f(uniforms.uZone, zoneFrac);
  gl.uniform1f(uniforms.uAngle, Math.min(Math.max(p.angle, 1), 160) * (Math.PI / 180));
  gl.uniform1f(uniforms.uPersp, Math.max(p.perspective, 50) / h);
  gl.uniform1f(uniforms.uDir, p.direction === "in" ? -1 : 1);
  gl.uniform1f(uniforms.uTopAmt, topAmt * foldEnv);
  gl.uniform1f(uniforms.uBotAmt, botAmt * foldEnv);
  gl.uniform1f(uniforms.uMaxX, contentMaxX);
  gl.uniform1f(uniforms.uPxY, 1.5 / h);
  gl.uniform1f(uniforms.uPxX, 1.5 / w);
  gl.uniform1f(uniforms.uCover, 1);
  const bg = findBgColor(content);
  gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
  gl.uniform1f(uniforms.uTiltX, 0);
  gl.uniform1f(uniforms.uTiltY, 0);
  gl.uniform1f(uniforms.uPhi, 0);
  gl.uniform1f(uniforms.uRound, Math.min(Math.max(p.rounding, 0) / h, zoneFrac));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export const BendRip: React.FC<BendRipProps> = ({
  config,
  children,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width: compWidth, height: compHeight } = useVideoConfig();
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds. Memoized so the effect
  // below only re-runs when the values actually change (a fresh object
  // each render would re-trigger the capture mid-frame).
  const p: BendParams = useMemo(() => {
    const direction =
      extras.direction === "out" ? "out" : extras.direction === "in" ? "in" : "in";
    return {
      zone: Math.min(600, Math.max(8, Number(extras.zone ?? 240))),
      angle: Math.min(160, Math.max(1, Number(extras.angle ?? 80))),
      rounding: Math.min(600, Math.max(0, Number(extras.rounding ?? 150))),
      perspective: Math.min(3000, Math.max(50, Number(extras.perspective ?? 700))),
      direction,
      ease: Math.min(1200, Math.max(1, Number(extras.ease ?? 240))),
      top: extras.top !== false,
      bottom: extras.bottom !== false,
    };
  }, [extras]);
  const fadeInF = Math.max(0, Math.round(Number(extras.fadeInFrames ?? 0)));
  const fadeOutF = Math.max(0, Math.round(Number(extras.fadeOutFrames ?? 0)));

  // Scroll sweep — deterministic: the composition plays one full scroll
  // pass, from the top of the content to the bottom.
  const progress = Math.min(1, Math.max(0, frame / durationInFrames));

  // Treatment fade in/out so the fold doesn't pop at scene bounds.
  const tapeFade = (() => {
    let f = 1;
    if (fadeInF > 0 && frame < fadeInF) f = Math.min(f, frame / fadeInF);
    if (fadeOutF > 0 && frame > durationInFrames - fadeOutF) {
      f = Math.min(f, Math.max(0, (durationInFrames - frame) / fadeOutF));
    }
    return Math.max(0, Math.min(1, f));
  })();

  // The fold itself grows in with the fade-in (and shrinks with the
  // fade-out), eased — otherwise the video would open on a fully folded
  // bottom edge crossfading over the flat DOM, which reads as the page
  // "fading out" while the bend pops in. The envelope mirrors the fade
  // but is a smoothstep, so the crease settles in softly.
  const foldEnv = (() => {
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
      compWidth,
      compHeight,
      captureStateRef,
      foldEnv,
    )
      .catch((err) => console.error("Bend capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, progress, tapeFade, foldEnv]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the fold texture
             each frame (scroll position + transform animations included;
             per-element opacity fades are not — see animation.md);
             if the capture or WebGL fails, this DOM is what the viewer
             sees — untreated. The driver turns the content div into the
             scroll container (overflow auto, scrollTop per frame) like
             upstream, so the captured record shows the scrolled page. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The folded glass, composited over the DOM when ready. */}
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
