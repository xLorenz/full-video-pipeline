import React from 'react';
import {AbsoluteFill} from 'remotion';
import {noise2D} from '@remotion/noise';
import {alpha, useLayout, useTheme} from '../design/theme';
import {DUR, ease, mix, prog, sec, useMotion} from '../motion/language';
import {Reveal} from './Reveal';

/**
 * EXTRAS: finishing touches. Each is a tested recipe; use ONE or TWO per piece as seasoning.
 * (See the "Gallery" composition to preview all of them.)
 */

/**
 * SHINE: a band of light sweeps across text once. Best on big, saturated type (the accent
 * word); on near-white text the highlight has nowhere to go. Time it AFTER the word has landed.
 */
export const ShineText: React.FC<{
  text: string;
  at: number;
  dur?: number;
  style?: React.CSSProperties;
}> = ({text, at, dur = 1.4, style}) => {
  const {frame, fps} = useMotion();
  const t = useTheme();
  const p = prog(frame, sec(at, fps), sec(dur, fps), ease.move);
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(105deg, ${t.accent} 0%, ${t.accent} 42%, #FFFFFF 50%, ${t.accent} 58%, ${t.accent} 100%)`,
        backgroundSize: '300% 100%',
        backgroundPosition: `${mix(100, 0, p)}% 0`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        ...style,
      }}
    >
      {text}
    </span>
  );
};

/** MARKER: a highlighter stripe wipes in behind a word. Sizes in `em`, so it scales with the text. */
export const Marker: React.FC<{at: number; dur?: number; children: string}> = ({at, dur = 0.5, children}) => {
  const {frame, fps} = useMotion();
  const t = useTheme();
  const p = prog(frame, sec(at, fps), sec(dur, fps), ease.enter);
  return (
    <span style={{position: 'relative', display: 'inline-block'}}>
      <span
        style={{
          position: 'absolute',
          left: '-0.12em',
          right: '-0.12em',
          bottom: '0.06em',
          height: '0.46em',
          borderRadius: '0.12em',
          background: alpha(t.accent, 0.4),
          transformOrigin: 'left center',
          scale: `${p} 1`,
        }}
      />
      <span style={{position: 'relative'}}>{children}</span>
    </span>
  );
};

/** TYPEWRITER with a cursor that blinks at rest and stays solid while typing (like a real terminal). */
export const Typewriter: React.FC<{text: string; at: number; cps?: number}> = ({text, at, cps = 22}) => {
  const {frame, fps} = useMotion();
  const t = useTheme();
  const n = Math.min(text.length, Math.max(0, Math.floor(((frame - sec(at, fps)) / fps) * cps)));
  const blink = Math.floor(frame / (fps / 2)) % 2 === 0 || n < text.length;
  return (
    <span>
      {text.slice(0, n)}
      <span style={{opacity: blink ? 1 : 0, color: t.accent}}>{'\u258D'}</span>
    </span>
  );
};

/**
 * TILT CARD: slow noise-driven 3D rotation. Gives flat UI/cards presence and a hint of
 * a physical object. Keep rotation under ~15deg; more reads as a gimmick.
 */
export const TiltCard: React.FC<{children: React.ReactNode; seed?: string}> = ({children, seed = 'tilt'}) => {
  const {frame} = useMotion();
  const {u} = useLayout();
  const ry = noise2D(`${seed}-y`, frame * 0.01, 0) * 14;
  const rx = noise2D(`${seed}-x`, 0, frame * 0.01) * 9;
  return (
    <div style={{perspective: 1400 * u}}>
      <div style={{transform: `rotateY(${ry}deg) rotateX(${rx}deg)`, transformStyle: 'preserve-3d'}}>{children}</div>
    </div>
  );
};

/** IRIS REVEAL: a circle grows from the centre and reveals its children. A scene-level reveal / custom transition. */
export const IrisReveal: React.FC<{at: number; dur?: number; children: React.ReactNode}> = ({at, dur = 0.9, children}) => {
  const {frame, fps} = useMotion();
  const {width, height} = useLayout();
  const p = prog(frame, sec(at, fps), sec(dur, fps), ease.move);
  const r = p * Math.hypot(width, height) * 0.6;
  return <AbsoluteFill style={{clipPath: `circle(${r}px at 50% 50%)`}}>{children}</AbsoluteFill>;
};

/**
 * DIRECTIONAL BLUR: cheap motion blur along ONE axis (SVG feGaussianBlur with a different
 * deviation per axis). Pass the px the object moved THIS frame times ~0.22 (a 180deg shutter):
 *     const vx = Math.abs(pos(frame) - pos(frame - 1));  <DirectionalBlur id="a" x={vx * 0.22}>
 * Blur is zero when the object is still, so text is razor sharp at rest. `id` must be unique per instance.
 * For true sub-frame motion blur see @remotion/motion-blur (costlier, more accurate).
 */
export const DirectionalBlur: React.FC<{
  id: string;
  x?: number;
  y?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({id, x = 0, y = 0, style, children}) => (
  <>
    <svg width={0} height={0} style={{position: 'absolute'}}>
      <filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={`${x} ${y}`} />
      </filter>
    </svg>
    <div style={{filter: x || y ? `url(#${id})` : undefined, ...style}}>{children}</div>
  </>
);

/**
 * WORD SWAP: a slot that cycles through words ("Built for teams / makers / you"). Each word
 * rises out of a mask while the previous one leaves upward, overlapping slightly (overlap,
 * don't sequence). The slot reserves the width of the LONGEST word, so nothing around it
 * shifts. Give each word >= 0.9 s on screen so it can be read.
 */
export const WordSwap: React.FC<{
  words: string[];
  at: number;
  every?: number;
  style?: React.CSSProperties;
}> = ({words, at, every = 1.1, style}) => {
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '');
  return (
    <span style={{position: 'relative', display: 'inline-block', ...style}}>
      <span style={{visibility: 'hidden'}}>{longest}</span>
      {words.map((w, i) => (
        <span key={w} style={{position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap'}}>
          <Reveal
            variant="mask"
            at={at + i * every}
            dur={DUR.base}
            exitAt={i < words.length - 1 ? at + (i + 1) * every - DUR.exit * 0.5 : undefined}
          >
            {w}
          </Reveal>
        </span>
      ))}
    </span>
  );
};
