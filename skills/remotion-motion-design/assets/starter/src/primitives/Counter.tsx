import React from 'react';
import {DUR, ease, mix, prog, sec, useMotion, type EasingFn} from '../motion/language';

/**
 * COUNTER: animated number.
 *  - tabular-nums keeps every digit the same width, so the number doesn't jitter sideways
 *    as it ticks. This is the #1 tell of an amateur counter.
 *  - Default easing is ease.enterSoft: the count rockets up then lands gently on the real
 *    number, so the final value gets time to be READ. Never count up linearly.
 *  - Give a counter >= 1.2 s. Faster than that and nobody perceives it as counting.
 */
export const Counter: React.FC<{
  to: number;
  from?: number;
  at?: number;
  dur?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  locale?: string;
  easing?: EasingFn;
  style?: React.CSSProperties;
}> = ({to, from = 0, at = 0, dur = 1.6, decimals = 0, prefix = '', suffix = '', locale = 'en-US', easing = ease.enterSoft, style}) => {
  const {frame, fps} = useMotion();
  const p = prog(frame, sec(at, fps), sec(Math.max(dur, DUR.micro), fps), easing);
  const value = mix(from, to, p);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return (
    <span style={{fontVariantNumeric: 'tabular-nums', ...style}}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
