import React from 'react';
import {useLayout} from '../design/theme';
import {DUR, ease, mix, prog, sec, useMotion, type EasingFn} from '../motion/language';

export type RevealVariant = 'rise' | 'mask' | 'scale' | 'fade' | 'blur' | 'left' | 'right';

/**
 * REVEAL: the entrance/exit grammar. Wrap anything. Times are SECONDS from the start of
 * the enclosing <Sequence> (i.e. scene-local time).
 *
 * Grammar baked in:
 *  - Elements never just "appear": each comes FROM somewhere (below, a mask edge, a blur).
 *  - Entrances decelerate (ease.enter); exits accelerate (ease.exit) and are shorter.
 *  - Opacity leads the movement (full by ~60% of the travel) so the eye locks on early.
 *  - Exits CONTINUE the entrance direction (rise in from below -> leave upward).
 *  - At rest, no blur / no transform residue, so text is razor sharp during the hold.
 *
 * variant:
 *  mask   text slides up out of an invisible line. The editorial classic. Best for headlines.
 *  rise   small upward drift + fade. The safe default for supporting content.
 *  blur   defocus -> focus. Dreamy, premium, cinematic.
 *  scale  settles from 90% -> 100%. Cards, badges, logos.
 *  left / right   lateral slide. Use when direction means something (timelines, comparisons).
 *  fade   opacity only. Use sparingly: it is the weakest signal.
 */
export const Reveal: React.FC<{
  at?: number;
  dur?: number;
  variant?: RevealVariant;
  /** travel in `u` (px at 1080px short side) */
  distance?: number;
  easing?: EasingFn;
  /** seconds; element leaves with ease.exit over DUR.exit */
  exitAt?: number;
  inline?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({at = 0, dur = DUR.base, variant = 'rise', distance = 48, easing = ease.enter, exitAt, inline, style, children}) => {
  const {frame, fps} = useMotion();
  const {u} = useLayout();
  const start = sec(at, fps);
  const p = prog(frame, start, sec(dur, fps), easing);
  const q = exitAt === undefined ? 0 : prog(frame, sec(exitAt, fps), sec(DUR.exit, fps), ease.exit);
  const d = distance * u;
  const display = inline ? 'inline-block' : 'block';
  const opacity = Math.min(1, p * 1.6) * (1 - q);
  // Decide "at rest" by TIME, not by value: overshooting easings (pop, playful) pass through
  // p === 1 mid-flight, and snapping the transform off then would cause a visible jump.
  const resting = frame >= start + sec(dur, fps) && q === 0;

  if (variant === 'mask') {
    // The padding/negative-margin pair stops the mask from clipping ascenders and descenders.
    return (
      <span
        style={{
          display,
          overflow: 'hidden',
          verticalAlign: 'top',
          paddingBlock: '0.16em',
          marginBlock: '-0.16em',
          ...style,
        }}
      >
        <span style={{display: 'block', translate: resting ? undefined : `0% ${(1 - p) * 112 - q * 112}%`}}>{children}</span>
      </span>
    );
  }

  let motion: React.CSSProperties = {};
  switch (variant) {
    case 'rise':
      motion = {translate: `0px ${(1 - p) * d - q * d * 0.6}px`};
      break;
    case 'left':
      motion = {translate: `${-(1 - p) * d + q * d * 0.6}px 0px`};
      break;
    case 'right':
      motion = {translate: `${(1 - p) * d - q * d * 0.6}px 0px`};
      break;
    case 'scale':
      motion = {scale: mix(0.9, 1, p) + q * 0.04};
      break;
    case 'blur':
      motion = {scale: mix(0.97, 1, p), filter: `blur(${(1 - p) * 16 * u + q * 10 * u}px)`};
      break;
    case 'fade':
      break;
  }

  return (
    <span style={{display, opacity, ...(resting ? {} : motion), ...style}}>{children}</span>
  );
};
