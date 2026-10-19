import {Easing, interpolate, spring} from 'remotion';
import {useTransitionProgress} from '@remotion/transitions';
import {ease, sec, useMotion, type EasingFn} from './language';

/**
 * CHOREOGRAPHY: reusable motion patterns that go beyond a single tween.
 * Each one encodes a principle of animation (anticipation, follow-through, rhythm).
 */

/** Frames per beat at a tempo. Often fractional (120 BPM @ 30fps = 15, 128 BPM = 14.06): that's fine for continuous motion. */
export const beatFrames = (bpm: number, fps: number) => (60 / bpm) * fps;

/**
 * Snap a frame to the nearest beat (or subdivision: 2 = 8th notes, 4 = 16ths).
 * Cuts and scene boundaries MUST land on whole frames, so this returns an integer.
 */
export const snapToBeat = (frame: number, bpm: number, fps: number, subdivision = 1) => {
  const b = beatFrames(bpm, fps) / subdivision;
  return Math.round(Math.round(frame / b) * b);
};

/**
 * BEAT PULSE. `pulse` is 1 exactly on the beat and decays fast (power 4): a sharp attack
 * and quick release feels like a kick drum. Multiply into scale / glow / brightness:
 *   scale: 1 + 0.06 * pulse
 * Keep amplitude small (3-8%); subtle on every beat beats huge on some.
 */
export const useBeat = (bpm: number) => {
  const {frame, fps} = useMotion();
  const beat = beatFrames(bpm, fps);
  const phase = (frame % beat) / beat; // 0 on the beat, -> 1 just before the next
  return {beat, phase, pulse: Math.pow(1 - phase, 4)};
};

/**
 * ANTICIPATION then arrival. The element first dips ~6% BACKWARDS for 5 frames (the
 * wind-up), then launches with ease.enter. One easing per segment.
 * `f` = frames since the move started. Goes 0 -> `travel`; apply to translate, rotate, etc.
 * Pure on purpose: call it for frame-1 too, to get velocity (e.g. for <DirectionalBlur>).
 */
export const anticipate = (f: number, travel: number) =>
  interpolate(f, [0, 5, 24], [0, -travel * 0.06, travel], {
    easing: [Easing.out(Easing.quad), ease.enter],
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const useAnticipate = (startSeconds: number, travel: number) => {
  const {frame, fps} = useMotion();
  return anticipate(frame - sec(startSeconds, fps), travel);
};

/**
 * SQUASH & STRETCH on landing. At impact the object flattens ~10% and widens, then springs
 * back. Apply as `scale: `${scaleX} ${scaleY}`` with transformOrigin on the contact edge
 * (e.g. 'bottom center'). Keep it subtle: this is seasoning, not the meal.
 */
export const useSquash = (landAtSeconds: number, amount = 0.1) => {
  const {frame, fps} = useMotion();
  const s = spring({frame: frame - sec(landAtSeconds, fps), fps, config: {damping: 11, stiffness: 220}});
  const hit = 1 - Math.min(1, s); // 1 at impact, decays to 0
  return {scaleX: 1 + amount * hit, scaleY: 1 - amount * hit};
};

/** Stagger delay (frames) that radiates OUTWARD from the middle item. Reads as "emerging". */
export const fromCenter = (i: number, n: number, gapFrames: number) => Math.abs(i - (n - 1) / 2) * gapFrames;

/**
 * CONTENT-DRIVEN TRANSITIONS. With `presentation={none()}` the transition itself does nothing
 * visually; instead each scene's ELEMENTS hand off to each other: the outgoing scene's items
 * stagger out while the incoming scene's items stagger in, all driven by the transition's
 * progress. This is how pros avoid a generic crossfade: nothing fades, things *move*.
 *
 *  - `i` of `n`: the element's index in reading order.
 *  - `overlap` (0..1): how much each item's window overlaps the next item's (0 = strictly one
 *    after another, 0.55 = flowing).
 *  - `handoff` (0..0.5): when ENTRIES may begin, as a fraction of the transition. Exits run
 *    over [0, 1 - handoff]; entries over [handoff, 1]. 0.5 = strict relay (everything leaves,
 *    then everything arrives); 0.4 = a little overlap; 0 = simultaneous. If the two scenes put
 *    text in the SAME spot, use >= 0.4 or incoming words land on top of outgoing ones.
 *
 * Returns eased 0..1 `enter` (use in the incoming scene) and `exit` (outgoing scene), e.g.
 *   opacity: enter * (1 - exit),  translate: `0 ${(1 - enter) * 40 - exit * 24}px`
 * Verified semantics of useTransitionProgress(): `entering` ramps 0->1 on the incoming scene
 * across the transition, `exiting` ramps 0->1 on the outgoing scene; both scenes are mounted
 * together for the overlap. Outside a TransitionSeries it returns enter=1, exit=0.
 */
export const useTransitionStagger = (
  i: number,
  n: number,
  {
    overlap = 0.55,
    handoff = 0.4,
    enterEase = ease.enter,
    exitEase = ease.exit,
  }: {overlap?: number; handoff?: number; enterEase?: EasingFn; exitEase?: EasingFn} = {},
) => {
  const {entering, exiting} = useTransitionProgress();
  const len = 1 / (1 + (n - 1) * (1 - overlap)); // each item's window, as a fraction of its phase
  const start = i * len * (1 - overlap);
  const local = (v: number) => Math.min(1, Math.max(0, (v - start) / len));
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const enterPhase = clamp01((entering - handoff) / (1 - handoff));
  const exitPhase = clamp01(exiting / (1 - handoff));
  return {enter: enterEase(local(enterPhase)), exit: exitEase(local(exitPhase))};
};
