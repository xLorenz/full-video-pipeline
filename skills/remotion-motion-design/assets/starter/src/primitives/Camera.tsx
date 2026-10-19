import React from 'react';
import {AbsoluteFill} from 'remotion';
import {noise2D} from '@remotion/noise';
import {useLayout} from '../design/theme';
import {ease, mix, prog, useMotion, type EasingFn} from '../motion/language';

/**
 * CAMERA RIG: a virtual camera for a whole scene. No frame should ever be fully static;
 * a slow push-in (3-6% over the scene) makes a "still" layout feel filmed.
 *
 * The move runs across the enclosing <Sequence>, so each scene gets its own.
 *
 * Default easing is LINEAR on purpose. A slow creep should still be in motion when the
 * transition starts; an eased camera stops dead right where the cut happens.
 * For a deliberate camera move (re-framing to a new focus), pass ease.move.
 *
 * Put <Backdrop> OUTSIDE the rig: content then moves against the background (parallax).
 * `shake` adds smooth noise-driven handheld drift (2-4u is subtle; >8u reads as an earthquake).
 */
export const CameraRig: React.FC<{
  push?: number;
  pan?: [number, number];
  rotate?: number;
  shake?: number;
  easing?: EasingFn;
  children: React.ReactNode;
}> = ({push = 0.05, pan = [0, 0], rotate = 0, shake = 0, easing = ease.linear, children}) => {
  const {frame, durationInFrames} = useMotion();
  const {u} = useLayout();
  const p = prog(frame, 0, durationInFrames, easing);
  const sx = shake ? noise2D('cam-x', frame * 0.018, 0) * shake * u : 0;
  const sy = shake ? noise2D('cam-y', 0, frame * 0.018) * shake * u : 0;
  const sr = shake ? noise2D('cam-r', frame * 0.012, 9) * shake * 0.06 : 0;
  return (
    <AbsoluteFill
      style={{
        transformOrigin: '50% 50%',
        scale: 1 + push * p,
        translate: `${mix(0, pan[0] * u, p) + sx}px ${mix(0, pan[1] * u, p) + sy}px`,
        rotate: `${rotate * p + sr}deg`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * PARALLAX LAYER: wrap a layer and it drifts across the scene by `travel * depth`.
 * `depth` = how CLOSE the layer is to the lens. Near layers move more, far layers less:
 *   0     far background: locked to the frame
 *   0.3   mid-ground
 *   1     foreground: travels the full `travel`
 * A negative depth moves a layer AGAINST the others, which reads as strong depth.
 * Keep it restrained: 2-3 layers, travel 60-160u. Parallax should be felt, not noticed.
 */
export const Parallax: React.FC<{
  depth?: number;
  travel?: number;
  axis?: 'x' | 'y';
  children: React.ReactNode;
}> = ({depth = 0.5, travel = 120, axis = 'x', children}) => {
  const {frame, durationInFrames} = useMotion();
  const {u} = useLayout();
  const p = prog(frame, 0, durationInFrames, ease.linear);
  const offset = (p - 0.5) * travel * depth * u;
  return (
    <AbsoluteFill style={{translate: axis === 'x' ? `${offset}px 0px` : `0px ${offset}px`}}>{children}</AbsoluteFill>
  );
};
