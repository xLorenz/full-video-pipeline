import React, { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  type EasingName,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * Element override type — carried in the DeepConfig signature so callers
 * can keep using `extras: ElementOverride[]` in their own typing even
 * though magnify renders its content via `children`, not `elements[]`.
 */
export type { ElementOverride };

/**
 * Magnify — a magnifying-glass lens travels the frame over a scripted
 * cursor, magnifying the content beneath it with chromatic aberration,
 * an inner haze, a HUD reticle, and click ripples that bend the page.
 *
 * A deterministic Remotion port of the Canvas UI `<Magnify>` WebGL
 * component (canvasui.dev). Like vhs/droplets/bend/shatter/decrypt-reveal,
 * the effect IS a content treatment: the shader samples a mipmapped
 * texture of the wrapped DOM and magnifies it inside the lens. The GLSL
 * is kept VERBATIM from the upstream `MagnifyVanilla.ts`; only the
 * runtime driver is re-touched:
 *
 *   1. No pointer, no `requestAnimationFrame` loop, no observers. A
 *      render has no cursor, so the port drives the lens from a
 *      scripted CURSOR model instead: `extras.cursor` is a scene-time
 *      script of `moves` (absolute `{x, y}` or relative `{dx, dy}`
 *      destinations, each arriving at a composition progress `at`,
 *      eased by a named easing or an arbitrary cubic bezier) plus
 *      `clicks` (presses that fire at a progress — each one emits the
 *      upstream click ripple and punches the magnification up while
 *      held). The cursor's damped motion, presence fade-in, and zoom
 *      smoothing reproduce upstream's exponential smoothing exactly,
 *      with a fixed `delta = 1/fps` — so frame N always produces the
 *      same pixels: deterministic, seek-safe.
 *   2. `presence` (the lens fade-in/out) is driven by `cursor.enter`
 *      and `cursor.leave` composition progress instead of pointer
 *      enter/leave events.
 *   3. Content capture via the native html-in-canvas mechanism (the
 *      same `ctx.drawElementImage` + layoutSubtree path the upstream
 *      component uses, and the same one vhs/droplets/bend rely on):
 *      the children are rendered as normal DOM, moved into a
 *      layoutSubtree canvas, painted on demand (`requestPaint` +
 *      `paint` event), and the paint record is drawn into the canvas
 *      backing store with `drawElementImage` — an origin-clean bitmap,
 *      uploaded straight into the GL texture with `texImage2D`.
 *      Per-frame inline styles are included — animated transforms are
 *      captured cleanly; per-element opacity fades are not (see the
 *      animation.md pitfall). Sampler matches upstream exactly:
 *      LINEAR_MIPMAP_LINEAR with `generateMipmap` — the shader's
 *      `textureLod` picks the soft mip levels for the haze.
 *   4. Full-frame treatment: like the other treatments, Magnify fills
 *      the composition (`AbsoluteFill` root) and processes everything
 *      the caller puts inside — wrap your ENTIRE scene. `uMaxX` is
 *      kept: content narrower than the frame is magnified only over
 *      its own horizontal band, exactly like upstream. The HUD readout
 *      is a live DOM overlay beside the lens (upstream does the same)
 *      with a frame-time blink — deterministic.
 *
 * Options come from `config.extras` (all optional, schema-bounded in
 * config/schema.json): the upstream optics (size, zoom, color, follow,
 * hud + the ring/crosshair/ticks/brackets/dot/grid/readout toggles,
 * aberration, haze, ripples + the ripple look) and the new `cursor`
 * model. Upstream's `scrollZoom`/`zoomModifier` (wheel events) are
 * dropped — there is no wheel in a render; zoom is driven by clicks.
 *
 * Performance:
 *   - One WebGL2 context, one shader compile, one full-frame draw per
 *     frame at 1x internal resolution (SwiftShader software raster),
 *     scissored to the lens band + ripple margin when no ripple is
 *     alive (the upstream optimization) — comparable to shatter.
 *   - The html-in-canvas capture + mipmapped texture upload happens
 *     once per frame.
 *   - If WebGL2, html-in-canvas, or the paint fails, children render
 *     untreated with an error logged — the frame never crashes.
 *
 * Pins used (recognized element ids):
 *   (none — content is passed as `children`; `elements[]` is ignored)
 */
export interface MagnifyProps {
  config: TemplateConfig;
  /** The scene behind the lens (fills the frame; may be taller for a
   *  static cursor with the page beneath, but magnify does NOT scroll —
   *  see the preview for the pattern).
   */
  children?: ReactNode;
  /** Per-video styles — used for palette/theme resolution only. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GLSL — VERBATIM from the upstream Canvas UI MagnifyVanilla.ts. Do not
// edit; the port's "re-touch" lives in the driver below.
// ---------------------------------------------------------------------------

const MAX_RIPPLES = 6;

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uHasContent;
uniform float uDpr;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uZoom;
uniform float uAlpha;
uniform vec3 uColor;
uniform float uHud;
uniform float uRing;
uniform float uCross;
uniform float uTicks;
uniform float uBrackets;
uniform float uDot;
uniform float uGrid;
uniform float uAberration;
uniform float uHaze;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uRippleWidth;
uniform float uRippleBendWidth;
uniform float uRippleBend;
uniform float uRippleGlow;

const float PI = 3.14159265358979;

float pow2 (float x) { return x * x; }

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

vec3 pageAA (vec2 px, float minLod) {
  float footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

float line (float d, float halfWidth) {
  return 1.0 - smoothstep(halfWidth - 0.75, halfWidth + 0.75, abs(d));
}

void main () {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 p = fragPx - uCenter;
  float d = length(p);
  float R = uRadius;
  float w = 1.1 * uDpr;

  vec2 rippleOffset = vec2(0.0);
  float crest = 0.0;
  float bendVis = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    vec2 rd = fragPx - rp.xy;
    float rl = max(length(rd), 1.0);
    float bendBand = exp(-pow2((rl - rp.z) / max(uRippleBendWidth * uDpr, 1.0)));
    float crestBand = exp(-pow2((rl - rp.z) / max(uRippleWidth * uDpr, 1.0)));
    rippleOffset += (rd / rl) * bendBand * rp.w * uRippleBend * uDpr;
    crest = max(crest, crestBand * rp.w);
    bendVis = max(bendVis, bendBand * rp.w);
  }

  float inContent = 1.0 - smoothstep(
    uMaxX * uResolution.x - 2.0, uMaxX * uResolution.x, fragPx.x);
  crest *= inContent;
  float rippleCover = smoothstep(0.001, 0.03, bendVis) * inContent;

  float lensMask = 1.0 - smoothstep(R - 1.5, R, d);
  vec2 lensPx = uCenter + p / max(uZoom, 1.0) - rippleOffset;
  float rimT = pow2(clamp(d / max(R, 1.0), 0.0, 1.0));
  vec2 dir = p / max(d, 0.5);
  float caPx = uAberration * 5.0 * rimT * uDpr;
  float hazeLod = uHaze * 3.0 * (0.3 + 0.7 * rimT);
  vec3 inside;
  inside.r = pageAA(lensPx + dir * caPx, hazeLod).r;
  inside.g = pageAA(lensPx, hazeLod).g;
  inside.b = pageAA(lensPx - dir * caPx, hazeLod).b;

  vec3 soft = page(lensPx, 4.5);
  inside = mix(
    inside,
    soft * (1.0 + 0.4 * uHaze) + uColor * 0.06 * uHaze,
    clamp(uHaze, 0.0, 1.0) * 0.45);

  vec3 bent = pageAA(fragPx - rippleOffset, 0.0);

  float hud = 0.0;

  hud += uRing * line(d - R, 1.3 * uDpr);

  float angle = atan(p.y, p.x);
  float sector = PI / 4.0;
  float da = abs(angle - (floor(angle / sector + 0.5) * sector)) * max(d, 1.0);
  float tickBand = smoothstep(R + 4.0 * uDpr, R + 6.0 * uDpr, d)
    * (1.0 - smoothstep(R + 12.0 * uDpr, R + 14.0 * uDpr, d));
  hud += uTicks * line(da, w) * tickBand;

  float reach = R * 1.14;
  float crossLine = max(
    line(p.x, w) * step(abs(p.y), reach),
    line(p.y, w) * step(abs(p.x), reach));
  hud += uCross * crossLine * smoothstep(6.0 * uDpr, 10.0 * uDpr, d) * 0.75;

  vec2 q = abs(p);
  float c = R * 0.64;
  float len = R * 0.2;
  float arm1 = line(q.x - c, w) * step(c - len, q.y) * step(q.y, c + w);
  float arm2 = line(q.y - c, w) * step(c - len, q.x) * step(q.x, c + w);
  hud += uBrackets * max(arm1, arm2);

  hud += uDot * (1.0 - smoothstep(1.6 * uDpr, 2.6 * uDpr, d));
  hud += uDot * line(d - 5.5 * uDpr, 0.9 * uDpr) * 0.6;

  float spacing = max(R * 0.25, 8.0);
  float gx = line(mod(p.x + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * uDpr);
  float gy = line(mod(p.y + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * uDpr);
  hud += uGrid * max(gx, gy) * lensMask * 0.16;

  hud = clamp(hud, 0.0, 1.0) * uHud;

  if (uHasContent < 0.5) {
    vec3 hudCol = pow(max(uColor, 0.0), vec3(1.0 / 2.2));
    float hudA = hud * uAlpha;
    float glow = clamp(pow(crest, 1.5) * uRippleGlow, 0.0, 1.0) * inContent;
    float a = max(hudA, lensMask * uAlpha * 0.08);
    a = max(a, glow * 0.7);
    outColor = vec4(hudCol * clamp(hudA + glow * 0.7, 0.0, 1.0), a);
    return;
  }

  vec3 base = mix(bent, inside, lensMask * uAlpha);
  base += uColor * pow(crest, 1.5) * uRippleGlow * 0.7;
  float hudA = hud * uAlpha;
  base = mix(base, uColor, hudA);

  float alpha = max(lensMask * uAlpha, rippleCover);
  alpha = max(alpha, clamp(pow(crest, 1.5) * uRippleGlow, 0.0, 1.0));
  alpha = max(alpha, hudA);

  outColor = vec4(pow(max(base, 0.0), vec3(1.0 / 2.2)) * alpha, alpha);
}`;

// ---------------------------------------------------------------------------
// Driver — the re-touched part: one deterministic capture + draw per frame
// over the scripted cursor model.
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

/** One scheduled press of a click: a ripple at the cursor + a zoom
 * punch while held. Times are in seconds of composition time. */
interface Press {
  at: number;
  hold: number;
  release: number;
  punch: number;
  ripple: boolean;
}

/** A cursor move: the target goes from the previous arrival to the
 * resolved ABSOLUTE destination (normalized) over [start, at], eased
 * by `ease` or `bezier`. Relative dx/dy are resolved to absolute at
 * parse time against the previous arrival. */
interface MovePlan {
  toX: number;
  toY: number;
  at: number;
  start: number;
  ease: EasingName;
  bezier: [number, number, number, number] | null;
}

/** The parsed, clamped cursor script. */
interface CursorPlan {
  startX: number;
  startY: number;
  enter: number;
  leave: number;
  moves: MovePlan[];
  presses: Press[];
}

/** The deterministic cursor simulation state, carried across frames in
 * a ref (the same per-frame-effect pattern as the shatter capture). */
interface CursorSim {
  posX: number;
  posY: number;
  presence: number;
  zoomValue: number;
  ripples: { x: number; y: number; r0: number; age: number }[];
  lastTime: number;
}

interface MagnifyParams {
  size: number;
  zoom: number;
  color: [number, number, number];
  follow: number;
  hud: number;
  ring: boolean;
  crosshair: boolean;
  ticks: boolean;
  brackets: boolean;
  dot: boolean;
  grid: boolean;
  readout: boolean;
  aberration: number;
  haze: number;
  ripples: boolean;
  rippleSpeed: number;
  rippleWidth: number;
  rippleBendWidth: number;
  rippleBend: number;
  rippleGlow: number;
  rippleLife: number;
  cursor: CursorPlan;
  width: number;
  height: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clampZoom(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;

/** Named easing functions — the pipeline `easingName` vocabulary. */
function easeOf(name: EasingName | undefined): (t: number) => number {
  switch (name) {
    case "ease-in":
      return (t) => t * t;
    case "ease-out":
      return (t) => 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return (t) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "ease-in-cubic":
      return (t) => t * t * t;
    case "ease-out-cubic":
      return (t) => 1 - Math.pow(1 - t, 3);
    case "ease-out-quint":
      return (t) => 1 - Math.pow(1 - t, 5);
    case "ease-out-expo":
      return (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    case "ease-out-back":
      return (t) => {
        const c = 1.70158;
        const u = t - 1;
        return 1 + (c + 1) * u * u * u + c * u * u;
      };
    case "ease-in-back":
      return (t) => {
        const c = 1.70158;
        return (c + 1) * t * t * t - c * t * t;
      };
    default:
      return (t) => t;
  }
}

/** Cubic bezier easing `[x1, y1, x2, y2]` — the `ease` function of the
 * CSS cubic-bezier() timing functions. x1/x2 should stay in 0-1. */
function bezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 10; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

/** Parse a single click object. `at` fallback: the containing move's
 * arrival progress (nested clicks) or `0.5` (standalone). */
function parseClick(
  raw: unknown,
  defaultAt: number,
  punchBase: number,
): Press {
  const o = (raw ?? {}) as Record<string, unknown>;
  const zoomMul = Math.min(3, Math.max(1, num(o.zoom, 1.35)));
  return {
    at: Math.min(1, Math.max(0, num(o.at, defaultAt))),
    hold: Math.min(1, Math.max(0, num(o.hold, 0.12))),
    release: Math.min(1, Math.max(0, num(o.release, 0.08))),
    punch: clampZoom(punchBase * zoomMul),
    ripple: bool(o.ripple, true),
  };
}

/** Parse the cursor script from config, clamped and in list order (the
 * relative-move chain follows the order of `moves` — keep `at`
 * increasing). */
function parseCursor(raw: unknown, baseZoom: number): CursorPlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const startRaw = (o.start ?? {}) as Record<string, unknown>;
  const startX = Math.min(2, Math.max(-1, num(startRaw.x, 0.5)));
  const startY = Math.min(2, Math.max(-1, num(startRaw.y, 0.5)));
  const enter = clamp01(num(o.enter, 0));
  const leave = clamp01(num(o.leave, 1));

  const presses: Press[] = [];
  const moves: MovePlan[] = [];
  const list = Array.isArray(o.moves) ? (o.moves as unknown[]) : [];
  let prevEnd = 0;
  // The running arrival — absolute x/y destinations resolve against it
  // for relative dx/dy moves (absolute wins on conflict; a missing
  // axis keeps the previous value).
  let prevX = startX;
  let prevY = startY;
  list.forEach((stop, i) => {
    const m = (stop ?? {}) as Record<string, unknown>;
    const to = (m.to ?? {}) as Record<string, unknown>;
    const at = clamp01(num(m.at, i / Math.max(list.length - 1, 1)));
    const start = clamp01(num(m.start, prevEnd));
    const bezRaw = Array.isArray(m.bezier) ? m.bezier : null;
    const ease = (m.ease as EasingName) ?? "ease-out-cubic";
    const destX = Number.isFinite(num(to.x, NaN))
      ? Math.min(2, Math.max(-1, num(to.x, 0)))
      : Number.isFinite(num(to.dx, NaN))
        ? Math.min(2, Math.max(-1, prevX + num(to.dx, 0)))
        : prevX;
    const destY = Number.isFinite(num(to.y, NaN))
      ? Math.min(2, Math.max(-1, num(to.y, 0)))
      : Number.isFinite(num(to.dy, NaN))
        ? Math.min(2, Math.max(-1, prevY + num(to.dy, 0)))
        : prevY;
    moves.push({
      toX: destX,
      toY: destY,
      at,
      start,
      ease,
      bezier:
        bezRaw && bezRaw.length === 4
          ? ([
              Math.min(2, Math.max(-1, num(bezRaw[0], 0))),
              Math.min(2, Math.max(-1, num(bezRaw[1], 0))),
              Math.min(2, Math.max(-1, num(bezRaw[2], 1))),
              Math.min(2, Math.max(-1, num(bezRaw[3], 1))),
            ] as [number, number, number, number])
          : null,
    });
    // A click nested in a move fires when the move's target ARRIVES
    // (its `at`).
    if (m.click) {
      presses.push(parseClick(m.click, at, baseZoom));
    }
    prevEnd = at;
    prevX = destX;
    prevY = destY;
  });

  // Standalone clicks — any progress, independent of the moves.
  const clickList = Array.isArray(o.clicks) ? (o.clicks as unknown[]) : [];
  for (const c of clickList) {
    const pc = parseClick(c, 0.5, baseZoom);
    const count = Math.min(
      4,
      Math.max(1, Math.round(num((c as Record<string, unknown>).count, 1))),
    );
    for (let i = 0; i < count; i++) {
      presses.push({
        at: pc.at,
        hold: pc.hold,
        release: pc.release,
        punch: pc.punch,
        ripple: pc.ripple,
      });
    }
  }

  return { startX, startY, enter, leave, moves, presses };
}

/** The cursor's normalized target at `progress`: the eased interpolation
 * of the active segment (destinations are pre-resolved absolute). Between
 * segments (in a `start` gap) the target holds at the previous arrival;
 * before the first move it holds at the start position; after the last
 * move it holds at the final arrival. */
function cursorTargetAt(plan: CursorPlan, progress: number) {
  const { moves, startX, startY } = plan;
  if (moves.length === 0) return { x: startX, y: startY };
  let px = startX;
  let py = startY;
  for (const m of moves) {
    if (progress >= m.start) {
      if (progress <= m.at) {
        const span = Math.max(m.at - m.start, 1e-6);
        const t = Math.min(1, Math.max(0, (progress - m.start) / span));
        const ease = m.bezier ? bezierEase(...m.bezier) : easeOf(m.ease);
        const e = ease(t);
        return { x: px + (m.toX - px) * e, y: py + (m.toY - py) * e };
      }
      px = m.toX;
      py = m.toY;
    }
  }
  return { x: px, y: py };
}

/** Parse the full extras block into clamped params. */
function parseParams(extras: Record<string, unknown>, width: number, height: number): MagnifyParams {
  const e = extras;
  const colorRaw = Array.isArray(e.color) ? e.color : [];
  const zoom = clampZoom(num(e.zoom, 1.5));
  return {
    size: Math.min(600, Math.max(20, num(e.size, 140))),
    zoom,
    color: [
      Math.min(1, Math.max(0, num(colorRaw[0], 0.8))),
      Math.min(1, Math.max(0, num(colorRaw[1], 0.8))),
      Math.min(1, Math.max(0, num(colorRaw[2], 0.8))),
    ] as [number, number, number],
    follow: clamp01(num(e.follow, 0.25)),
    hud: clamp01(num(e.hud, 0.8)),
    ring: bool(e.ring, true),
    crosshair: bool(e.crosshair, true),
    ticks: bool(e.ticks, true),
    brackets: bool(e.brackets, true),
    dot: bool(e.dot, true),
    grid: bool(e.grid, false),
    readout: bool(e.readout, true),
    aberration: Math.min(3, Math.max(0, num(e.aberration, 0.8))),
    haze: clamp01(num(e.haze, 0.2)),
    ripples: bool(e.ripples, true),
    rippleSpeed: Math.min(3000, Math.max(50, num(e.rippleSpeed, 900))),
    rippleWidth: Math.min(20, Math.max(0.5, num(e.rippleWidth, 2))),
    rippleBendWidth: Math.min(600, Math.max(1, num(e.rippleBendWidth, 100))),
    rippleBend: Math.min(200, Math.max(0, num(e.rippleBend, 20))),
    rippleGlow: Math.min(2, Math.max(0, num(e.rippleGlow, 1))),
    rippleLife: Math.min(5, Math.max(0.1, num(e.rippleLife, 1.4))),
    cursor: parseCursor(e.cursor, zoom),
    width,
    height,
  };
}

/**
 * Capture `element`'s current painted HTML into the mipmapped GL
 * texture bound at texture unit 0, then run the magnify draw once with
 * the frame's cursor state. Pure function of the DOM state and the
 * uniforms — deterministic. Resolves after the capture is uploaded; on
 * any failure the canvas stays transparent and the plain DOM shows
 * through (untreated), so the frame never blanks out.
 */
async function captureAndDraw(
  output: HTMLCanvasElement,
  content: HTMLElement,
  p: MagnifyParams,
  sim: CursorSim,
  frame: number,
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
      console.error("Magnify shader error:", gl.getShaderInfoLog(shader));
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
    console.error("Magnify link error:", gl.getProgramInfoLog(program));
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
    console.error("Magnify: output canvas has no parent — rendering children untreated");
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
  // transparent on frame 0 (the lens presence is still ~0), so instead
  // of capturing garbage the setup is deferred one frame: the scene
  // stays in place and frame 0 shows the raw DOM. From frame 1 the
  // record is built from settled content and stays correct.
  if (needSetup && frame === 0) {
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
        "Magnify: layoutSubtree canvas unavailable — rendering children untreated",
      );
      return;
    }
    const lctx = layout.getContext("2d") as CaptureCtx | null;
    if (!lctx || typeof lctx.drawElementImage !== "function") {
      console.error("Magnify: drawElementImage unavailable — rendering children untreated");
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
      "Magnify: html-in-canvas paint never fired — rendering children untreated",
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

  // Lens state — CSS px, y CSS-style (0 = top); the shader's uCenter is
  // y-up GL px, so flip y and scale by dpr like upstream.
  const R = Math.max(p.size, 8) * sim.presence;
  const alpha = Math.min(sim.presence * 5, 1);
  const cx = sim.posX * dpr;
  const cy = height - sim.posY * dpr;

  // Upstream's render(): clear the whole buffer, then scissor the draw
  // to the lens band + ripple margin when no ripple is alive (ripples
  // need the full frame — they bend the whole page).
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (sim.presence <= 0.004 && sim.ripples.length === 0) return;

  if (sim.ripples.length === 0) {
    const margin = (R * 0.25 + 160) * dpr;
    const sx = Math.max(0, Math.floor(cx - R * dpr - margin));
    const sy = Math.max(0, Math.floor(cy - R * dpr - margin));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      sx,
      sy,
      Math.min(width - sx, Math.ceil((R * dpr + margin) * 2)),
      Math.min(height - sy, Math.ceil((R * dpr + margin) * 2)),
    );
  }

  const rippleData = new Float32Array(MAX_RIPPLES * 4);
  for (let i = 0; i < Math.min(sim.ripples.length, MAX_RIPPLES); i++) {
    const ripple = sim.ripples[i];
    const t = ripple.age / Math.max(p.rippleLife, 0.1);
    rippleData[i * 4] = ripple.x * dpr;
    rippleData[i * 4 + 1] = height - ripple.y * dpr;
    rippleData[i * 4 + 2] =
      (ripple.r0 + Math.max(p.rippleSpeed, 1) * ripple.age) * dpr;
    rippleData[i * 4 + 3] = Math.pow(Math.max(1 - t, 0), 2);
  }

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.uniform1i(uniforms.uContent, 0);
  gl.uniform2f(uniforms.uResolution, width, height);
  gl.uniform1f(uniforms.uMaxX, contentMaxX);
  gl.uniform1f(uniforms.uHasContent, 1);
  gl.uniform1f(uniforms.uDpr, dpr);
  gl.uniform2f(uniforms.uCenter, cx, cy);
  gl.uniform1f(uniforms.uRadius, R * dpr);
  gl.uniform1f(uniforms.uZoom, sim.zoomValue);
  gl.uniform1f(uniforms.uAlpha, alpha);
  gl.uniform3f(uniforms.uColor, p.color[0], p.color[1], p.color[2]);
  gl.uniform1f(uniforms.uHud, p.hud);
  gl.uniform1f(uniforms.uRing, p.ring ? 1 : 0);
  gl.uniform1f(uniforms.uCross, p.crosshair ? 1 : 0);
  gl.uniform1f(uniforms.uTicks, p.ticks ? 1 : 0);
  gl.uniform1f(uniforms.uBrackets, p.brackets ? 1 : 0);
  gl.uniform1f(uniforms.uDot, p.dot ? 1 : 0);
  gl.uniform1f(uniforms.uGrid, p.grid ? 1 : 0);
  gl.uniform1f(uniforms.uAberration, p.aberration);
  gl.uniform1f(uniforms.uHaze, p.haze);
  const rippleLoc = uniforms["uRipples[0]"] ?? uniforms.uRipples;
  if (rippleLoc) gl.uniform4fv(rippleLoc, rippleData);
  gl.uniform1f(uniforms.uRippleWidth, p.rippleWidth);
  gl.uniform1f(uniforms.uRippleBendWidth, p.rippleBendWidth);
  gl.uniform1f(uniforms.uRippleBend, p.rippleBend);
  gl.uniform1f(uniforms.uRippleGlow, p.rippleGlow);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disable(gl.SCISSOR_TEST);
}

/** The HUD readout — a live DOM overlay beside the lens, exactly like
 * upstream (its blink uses frame time, so it is deterministic). */
function syncReadout(
  readout: HTMLDivElement,
  p: MagnifyParams,
  sim: CursorSim,
  time: number,
) {
  const show = p.readout && p.hud > 0.01 && sim.presence > 0.05;
  readout.style.opacity = show
    ? String(Math.min(sim.presence, 1) * Math.min(p.hud, 1))
    : "0";
  if (!show) return;
  const R = Math.max(p.size, 8) * sim.presence;
  const boxW = 120;
  let rx = sim.posX + R + 18;
  if (rx + boxW > p.width - 8) rx = sim.posX - R - 18 - boxW;
  const ry = Math.min(Math.max(sim.posY - 34, 8), Math.max(p.height - 90, 8));
  readout.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
  const [r, g, b] = p.color;
  readout.style.color = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  const blink = Math.floor((time * 1000) / 600) % 2 === 0 ? "\u25CF" : "\u25CB";
  readout.textContent =
    `X ${String(Math.round(sim.posX)).padStart(4, " ")}\n` +
    `Y ${String(Math.round(sim.posY)).padStart(4, " ")}\n` +
    `${sim.zoomValue.toFixed(1)}X MAG\n` +
    `R ${Math.round(p.size)}PX ${blink}`;
}

export const Magnify: React.FC<MagnifyProps> = ({
  config,
  children,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width: compWidth, height: compHeight } = useVideoConfig();
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void styles;
  void fontSizes; // accepted for hook-shape parity with the other templates

  // Tunables — clamped at the schema bounds. Memoized so the effect
  // below only re-runs when the values actually change (a fresh object
  // each render would re-trigger the capture mid-frame).
  const p: MagnifyParams = useMemo(
    () => parseParams(extras, compWidth, compHeight),
    [extras, compWidth, compHeight],
  );

  const outputRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const captureStateRef = useRef<CaptureState | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  // The cursor simulation: damped position/presence/zoom + ripples,
  // advanced exactly one deterministic step per frame.
  const simRef = useRef<CursorSim>({
    posX: p.cursor.startX * compWidth,
    posY: p.cursor.startY * compHeight,
    presence: 0,
    zoomValue: p.zoom,
    ripples: [],
    lastTime: -1 / Math.max(fps, 1),
  });

  // A Remotion render keeps ONE page per composition and re-renders
  // React each frame, so this layout effect re-runs every frame. The
  // capture setup (layoutSubtree canvas, the moved scene) and the
  // cursor simulation are stateful across frames — the texture is
  // refreshed with each frame's freshly painted DOM and the sim is
  // advanced one step. The render is held (delayRender) until the
  // capture + draw completes, so the frame screenshot always contains
  // the treatment.
  useLayoutEffect(() => {
    const output = outputRef.current;
    const content = contentRef.current;
    if (!output || !content) return;
    const handle = delayRender();

    const time = frame / Math.max(fps, 1);
    const progress = Math.min(1, Math.max(0, frame / durationInFrames));
    const totalS = durationInFrames / Math.max(fps, 1);
    const sim = simRef.current;

    // 1. Cursor target — the eased move segment at this progress
    //    (normalized), scaled to CSS px.
    const target = cursorTargetAt(p.cursor, progress);
    const targetX = target.x * compWidth;
    const targetY = target.y * compHeight;

    // 2. Presence target — the lens fades in at cursor.enter and out at
    //    cursor.leave (upstream's pointer enter/leave, scripted).
    const presenceTarget =
      progress >= p.cursor.enter && progress <= p.cursor.leave ? 1 : 0;

    // 3. Zoom target — clicks punch the magnification up while held and
    //    ease it back over `release` seconds; overlapping punches take
    //    the strongest. Base zoom otherwise. Press times are in seconds
    //    (`at` is composition progress; hold/release are seconds).
    let zoomTarget = p.zoom;
    for (const press of p.cursor.presses) {
      const pressS = press.at * totalS;
      const holdEnd = pressS + press.hold;
      const releaseEnd = holdEnd + press.release;
      if (time >= pressS && time < holdEnd) {
        zoomTarget = Math.max(zoomTarget, press.punch);
      } else if (time >= holdEnd && time < releaseEnd) {
        const rt = (time - holdEnd) / Math.max(press.release, 1e-6);
        const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, rt)), 3);
        zoomTarget = Math.max(
          zoomTarget,
          press.punch + (p.zoom - press.punch) * eased,
        );
      }
    }

    // 4. Ripple spawns — a press crossing this frame's boundary emits
    //    the upstream click ripple at the cursor (y CSS-style, x/y CSS
    //    px; the shader flips y).
    if (p.ripples) {
      for (const press of p.cursor.presses) {
        if (!press.ripple) continue;
        const pressS = press.at * totalS;
        if (sim.lastTime < pressS && time >= pressS) {
          if (sim.ripples.length >= MAX_RIPPLES) sim.ripples.shift();
          sim.ripples.push({
            x: sim.posX,
            y: sim.posY,
            r0: Math.max(p.size, 8) * sim.presence,
            age: 0,
          });
        }
      }
    }

    // 5. Damping step — upstream's exponential smoothing, verbatim,
    //    with the fixed frame delta (a render's rAF runs at the frame
    //    rate, so delta = 1/fps). follow >= 1 snaps like upstream.
    const delta = 1 / Math.max(fps, 1);
    const follow = Math.min(Math.max(p.follow, 0.02), 1);
    const kPos = follow >= 1 ? 1 : 1 - Math.exp(-delta * (4 + follow * 26));
    const kScale = 1 - Math.exp(-delta * 11);
    sim.posX += (targetX - sim.posX) * kPos;
    sim.posY += (targetY - sim.posY) * kPos;
    sim.presence += (presenceTarget - sim.presence) * kScale;
    sim.zoomValue += (zoomTarget - sim.zoomValue) * kScale;
    sim.lastTime = time;
    for (const ripple of sim.ripples) ripple.age += delta;
    sim.ripples = sim.ripples.filter(
      (ripple) => ripple.age <= Math.max(p.rippleLife, 0.1),
    );

    // 6. The readout overlay (created once, beside the lens).
    let readout = readoutRef.current;
    if (!readout || !readout.isConnected) {
      readout = document.createElement("div");
      readout.setAttribute("aria-hidden", "true");
      Object.assign(readout.style, {
        position: "absolute",
        left: "0",
        top: "0",
        pointerEvents: "none",
        whiteSpace: "pre",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: "10px",
        lineHeight: "1.8",
        letterSpacing: "0.14em",
        opacity: "0",
        zIndex: "1",
        willChange: "transform, opacity",
      } satisfies Partial<CSSStyleDeclaration>);
      (output.parentElement ?? document.body).appendChild(readout);
      readoutRef.current = readout;
    }
    syncReadout(readout, p, sim, time);

    captureAndDraw(
      output,
      content,
      p,
      sim,
      frame,
      compWidth,
      compHeight,
      captureStateRef,
    )
      .catch((err) => console.error("Magnify capture failed:", err))
      .finally(() => continueRender(handle));
  }, [p, frame, fps, durationInFrames, compWidth, compHeight]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "transparent" }}>
      <AbsoluteFill style={{ opacity: 1 }}>
        {/* The scene. Its current DOM is captured into the magnify
             texture each frame (transform animations included;
             per-element opacity fades are not — see animation.md); if
             the capture or WebGL fails, this DOM is what the viewer
             sees — untreated. Unlike shatter/bend, magnify does not
             scroll: the lens travels over the frame, like upstream. */}
        <div
          ref={contentRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          {children}
        </div>
        {/* The lens, composited over the DOM where it magnifies;
             transparent elsewhere, so the DOM below shows through. */}
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
