import React from 'react';
import {AbsoluteFill, random} from 'remotion';
import {useMotion} from '../motion/language';

/**
 * FILM GRAIN. Two jobs:
 *  1. Texture: kills the sterile "rendered by a computer" look of flat digital colour.
 *  2. Dithering: smooth dark gradients BAND badly in H.264. Noise breaks the bands up.
 *     If a dark gradient looks stepped in your export, raise `opacity` a little.
 *
 * How it's cheap: one 256px SVG-noise tile is rasterised once, then re-positioned every
 * `every` frames to a seeded-random offset (film grain refreshes on twos, ~12-15 Hz).
 * Uses remotion's random(seed), never Math.random(), so every render is identical.
 *
 * Want GPU grain instead? @remotion/effects has noise() / speckle() (needs --gl=angle).
 */
const TILE = 256;
const svg =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}'>` +
  `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
  `<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>` +
  `<feColorMatrix type='saturate' values='0'/></filter>` +
  `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
const NOISE_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

export const Grain: React.FC<{
  opacity?: number;
  every?: number;
  blend?: React.CSSProperties['mixBlendMode'];
}> = ({opacity = 0.1, every = 2, blend = 'overlay'}) => {
  const {frame} = useMotion();
  const step = Math.floor(frame / every);
  const ox = Math.floor(random(`grain-x-${step}`) * TILE);
  const oy = Math.floor(random(`grain-y-${step}`) * TILE);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: NOISE_URL,
        backgroundSize: `${TILE}px ${TILE}px`,
        backgroundPosition: `${ox}px ${oy}px`,
        mixBlendMode: blend,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
