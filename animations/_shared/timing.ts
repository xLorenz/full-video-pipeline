/**
 * Timing resolution + easing registry for animation templates.
 *
 * The DeepConfig model lets authors express timing as explicit frames
 * or as `null` to opt into auto-stagger. This module converts the
 * declarative config into the numbers that `interpolate()` expects,
 * honoring `global.speed` (multiplicative) and `global.delayOffset`
 * (additive, applied AFTER speed scaling so the whole instance shifts).
 */

import { Easing } from "remotion";
import type {
  ElementOverride,
  GlobalOverride,
  EasingName,
  ResolvedTiming,
} from "./types";

const EASINGS: Record<EasingName, (x: number) => number> = {
  linear: Easing.linear,
  "ease-in": Easing.in(Easing.cubic),
  "ease-out": Easing.out(Easing.cubic),
  "ease-in-out": Easing.inOut(Easing.cubic),
  "ease-in-cubic": Easing.in(Easing.cubic),
  "ease-out-cubic": Easing.out(Easing.cubic),
  // Easing.quint doesn't exist in Remotion 4.0.x — use Easing.poly(5) which
  // returns the (1 - (1-t)^5) curve; wrap with .out for ease-out behaviour.
  "ease-out-quint": Easing.out(Easing.poly(5)),
  "ease-out-expo": Easing.out(Easing.exp),
  "ease-out-back": Easing.out(Easing.back(1.7)),
  "ease-in-back": Easing.in(Easing.back(1.7)),
};

/** Resolve an easing name to a Remotion easing function. Defaults to cubic-out. */
export function resolveEasing(name?: EasingName | null): (x: number) => number {
  if (!name) return EASINGS["ease-out-cubic"];
  return EASINGS[name] ?? EASINGS["ease-out-cubic"];
}

export interface ResolvedGlobal {
  speed: number;
  delayOffset: number;
  easing: EasingName;
}

export function resolveGlobal(
  override: GlobalOverride | undefined,
): ResolvedGlobal {
  const speed = clamp(override?.speed ?? 1, 0.05, 10);
  const delayOffset = Math.round(clamp(override?.delayOffset ?? 0, -1000, 10000));
  const easing: EasingName = override?.easing ?? "ease-out-cubic";
  return { speed, delayOffset, easing };
}

/**
 * Resolve timing for one element.
 *
 * Priority (highest wins):
 *   1. explicit `element.delay` / `element.duration` (scaled by speed)
 *   2. auto-stagger fallback: `defaultDelay + staggerIndex * staggerStep`
 *   3. `defaultDelay` / `defaultDuration` (authored, scaled by speed)
 *
 * The `global.delayOffset` is added to every resolved delay AFTER speed
 * scaling (per the SCHEMA.md resolved-values rules), and clamped to >= 0
 * so frames don't go negative.
 *
 * @param element          the per-element override slice (may be missing
 *                         most fields — that's the normal case)
 * @param resolvedGlobal   output of `resolveGlobal(config.global)`
 * @param defaultDelay     the delay the template author wrote (frames,
 *                         in *unscaled* time — speed applies here)
 * @param defaultDuration  the duration the template author wrote (frames,
 *                         unscaled; speed applies)
 * @param staggerIndex     0-based index in the parent's auto-stagger
 *                         sequence (ignored when element.delay is set)
 * @param staggerStep      frames-per-step added to `defaultDelay` when
 *                         `element.delay` is null (unscaled; speed applies)
 */
export function resolveTiming(
  element: ElementOverride | undefined,
  resolvedGlobal: ResolvedGlobal,
  defaultDelay: number,
  defaultDuration: number,
  staggerIndex = 0,
  staggerStep = 6,
): ResolvedTiming {
  const g = resolvedGlobal;
  const baseDelay =
    element?.delay !== null && element?.delay !== undefined
      ? element.delay
      : defaultDelay + staggerIndex * staggerStep;
  const baseDuration =
    element?.duration !== null && element?.duration !== undefined
      ? element.duration
      : defaultDuration;

  const delay = Math.max(0, Math.round(baseDelay * g.speed) + g.delayOffset);
  const duration = Math.max(1, Math.round(baseDuration * g.speed));
  const easing = element?.easing ?? g.easing;
  return { delay, duration, easing };
}

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * Position override helper. Returns `null` when no override is set so the
 * template can fall back to its authored layout.
 */
export function resolvePosition(
  element: ElementOverride | undefined,
): { x: number; y: number } | null {
  const p = element?.position;
  if (!p) return null;
  if (p.x === null && p.y === null) return null;
  if (p.x === undefined && p.y === undefined) return null;
  return { x: p.x ?? 0, y: p.y ?? 0 };
}

/**
 * Size override helper. `fontSize` is explicit px (wins over `scale`);
 * `scale` is a multiplier the template applies to its authored size.
 * Returns `{ fontSize: null, scale: 1 }` when no override is set so the
 * template can fall back to its authored font-size.
 */
export function resolveSize(
  element: ElementOverride | undefined,
  themeSizeScale = 1,
): { fontSize: number | null; scale: number } {
  const s = element?.size;
  if (!s) return { fontSize: null, scale: themeSizeScale };
  const scale =
    s.scale !== null && s.scale !== undefined && s.scale > 0
      ? s.scale * themeSizeScale
      : themeSizeScale;
  return {
    fontSize:
      s.fontSize !== null && s.fontSize !== undefined && s.fontSize > 0
        ? s.fontSize
        : null,
    scale,
  };
}
