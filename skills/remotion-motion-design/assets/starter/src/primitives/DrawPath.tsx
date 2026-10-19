import React from 'react';
import {evolvePath} from '@remotion/paths';
import {DUR, ease, prog, sec, useMotion, type EasingFn} from '../motion/language';

/**
 * PATH STROKE: a stroke drawn to `progress` (0..1). Renders a <g>, so it can sit inside
 * any <svg> you already have (charts: draw bars and line in ONE viewBox so they always align).
 *  - Round caps and joins always: butt caps look mechanical.
 *  - `glow` adds a soft, blurred, wider duplicate underneath: the light-trace look.
 */
export const PathStroke: React.FC<{
  d: string;
  progress: number;
  stroke: string;
  strokeWidth?: number;
  glow?: boolean;
}> = ({d, progress, stroke, strokeWidth = 6, glow = false}) => {
  const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
  const common = {
    d,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeDasharray,
    strokeDashoffset,
  };
  return (
    <g>
      {glow && (
        <path {...common} stroke={stroke} strokeWidth={strokeWidth * 3.5} opacity={0.28} style={{filter: `blur(${strokeWidth * 1.6}px)`}} />
      )}
      <path {...common} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
};

/**
 * DRAW PATH: a standalone SVG whose stroke draws itself over time. Lines that draw on are the
 * cheapest way to make an underline, connector, logo mark or chart feel authored.
 * ease.move by default: drawing starts and ends gently, fastest in the middle.
 */
export const DrawPath: React.FC<{
  d: string;
  viewBox: string;
  width: number;
  height: number;
  at?: number;
  dur?: number;
  stroke: string;
  strokeWidth?: number;
  glow?: boolean;
  easing?: EasingFn;
  style?: React.CSSProperties;
}> = ({d, viewBox, width, height, at = 0, dur = DUR.slow, stroke, strokeWidth = 6, glow = false, easing = ease.move, style}) => {
  const {frame, fps} = useMotion();
  const p = prog(frame, sec(at, fps), sec(dur, fps), easing);
  return (
    <svg viewBox={viewBox} width={width} height={height} style={{overflow: 'visible', ...style}}>
      <PathStroke d={d} progress={p} stroke={stroke} strokeWidth={strokeWidth} glow={glow} />
    </svg>
  );
};
