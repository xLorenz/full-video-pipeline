import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * MOTION LANGUAGE
 * A video feels designed when every move is drawn from one small vocabulary. This file
 * is that vocabulary. Scenes should import from here and never invent a curve inline.
 *
 * All timing is authored in SECONDS and converted with sec(), so changing fps
 * (30 -> 60) doesn't change how anything feels.
 */

export type EasingFn = (t: number) => number;

/** seconds -> whole frames */
export const sec = (seconds: number, fps: number) => Math.round(seconds * fps);

/**
 * CURVES, named by the job they do. Progress reached at 25% / 50% / 75% of the time
 * (measured with Remotion's own Easing.bezier):
 *   enter      83% / 97% / 100%   hero entrances: fast launch, long soft landing
 *   enterSoft  76% / 96% / 100%   big or heavy elements, calmer
 *   move       7%  / 50% / 93%    A -> B while staying on screen; camera; scene shifts
 *   drift      14% / 50% / 86%    slow cinematic push-ins and ambient motion
 *   exit       2%  / 13% / 42%    leaving: accelerate away (use ~65% of the entrance time)
 *   pop        82% / 109% / 106%  one gentle ~10% overshoot without a spring
 * For contrast, CSS `ease-out` is only 38% / 68% / 91%: that is why default web easing looks sluggish.
 */
export const ease = {
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  enterSoft: Easing.bezier(0.22, 1, 0.36, 1),
  move: Easing.bezier(0.65, 0, 0.35, 1),
  drift: Easing.bezier(0.37, 0, 0.63, 1),
  exit: Easing.bezier(0.32, 0, 0.67, 0),
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
  linear: Easing.linear,
} as const;

/**
 * SPRINGS as easings: you pick the duration, the spring supplies the SHAPE.
 * Remotion treats every damping ratio >= 1 as critically damped, so for the no-bounce
 * springs extra `damping` does nothing; speed comes from `stiffness` (and mass).
 * Measured at 30fps with spring():
 *   smooth    no overshoot  t90 12f   calm default
 *   quick     no overshoot  t90 7f    fast UI-like
 *   snappy    +4%           t90 6f    crisp with a hint of life
 *   heavy     no overshoot  t90 14f   weighty, cinematic
 *   playful   +10%          t90 6f    visible bounce: friendly brands
 *   bouncy    +16%          t90 7f    Remotion's DEFAULT spring: cartoonish, use on purpose only
 */
export const spr = {
  smooth: Easing.spring({damping: 200, stiffness: 100}),
  quick: Easing.spring({damping: 200, stiffness: 300}),
  snappy: Easing.spring({damping: 20, stiffness: 200}),
  heavy: Easing.spring({damping: 40, stiffness: 120, mass: 1.5}),
  playful: Easing.spring({damping: 14, stiffness: 140}),
  bouncy: Easing.spring({damping: 10, stiffness: 100}),
} as const;

/** DURATION SCALE (seconds). Pick from the scale; consistency is what reads as "system". */
export const DUR = {
  micro: 0.2, // small state changes, icon pops
  quick: 0.35, // supporting text, chips
  base: 0.55, // most element entrances
  hero: 0.85, // the one big thing in a beat
  slow: 1.3, // cinematic reveals, camera settles
  exit: 0.35, // ~65% of base: leaving is faster than arriving
} as const;

/** STAGGER GAPS (seconds between siblings). Keep the whole group under STAGGER.max. */
export const STAGGER = {
  char: 0.03,
  word: 0.09,
  item: 0.12, // cards, list rows, bars
  max: 0.6, // the group should finish launching within this
} as const;

/** Clamped, eased 0..1 progress of an animation starting at `start` and lasting `dur` (frames). */
export const prog = (frame: number, start: number, dur: number, easing: EasingFn = ease.enter) =>
  interpolate(frame, [start, start + Math.max(1, dur)], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Linear mix. Not clamped, so overshooting easings (pop, playful) can pass the target. */
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * Delay (frames) for item i of n. The gap shrinks automatically so a long list never takes
 * longer than `maxTotal` frames to launch (a 40-word headline must not stagger for 4 seconds).
 */
export const staggerDelay = (i: number, n: number, gapFrames: number, maxTotalFrames: number) =>
  n <= 1 ? 0 : i * Math.min(gapFrames, maxTotalFrames / (n - 1));

/** frame + fps + the length of the enclosing <Sequence>, and a seconds->frames helper */
export const useMotion = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  return {frame, fps, durationInFrames, s: (seconds: number) => sec(seconds, fps)};
};
