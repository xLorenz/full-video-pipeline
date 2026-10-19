import React, {createContext, useContext} from 'react';
import {useVideoConfig} from 'remotion';

/**
 * DESIGN TOKENS
 * Pick ONE palette per video. Every colour a scene uses should come from here,
 * so re-theming is a one-line change and the piece reads as one brand.
 *
 * Contrast (WCAG) was measured for every palette:
 *   fg/bg >= 15:1, muted/bg >= 5:1, accent/bg >= 3.6:1 (fine for large text & graphics).
 * Video is watched small, compressed and often in sunlight, so we aim well above 4.5:1.
 */
export type Palette = {
  name: string;
  dark: boolean;
  bg: string; // canvas edge / base colour
  bgLift: string; // lighter tint for the centre of the backdrop gradient
  surface: string; // cards, panels
  line: string; // hairlines and borders
  fg: string; // primary text
  muted: string; // secondary text
  accent: string; // THE accent. One hero accent per scene.
  accent2: string; // supporting accent, <= ~10% of the pixels
  onAccent: string; // text placed on accent fills
};

export const palettes = {
  /** Tech / SaaS / dev tools. Cool, precise. */
  midnight: {
    name: 'midnight', dark: true,
    bg: '#07080D', bgLift: '#141A36', surface: '#11131B', line: 'rgba(255,255,255,0.09)',
    fg: '#F3F5FA', muted: '#8F98B0', accent: '#7C8DFF', accent2: '#47E5C2', onAccent: '#07080D',
  },
  /** Launches / consumer / sports energy. Warm, loud. */
  ember: {
    name: 'ember', dark: true,
    bg: '#0B0706', bgLift: '#2C150D', surface: '#150E0B', line: 'rgba(255,230,210,0.10)',
    fg: '#FFF2E8', muted: '#A8938A', accent: '#FF5A36', accent2: '#FFC24D', onAccent: '#0B0706',
  },
  /** Editorial / fashion / print-like. Light, confident. */
  paper: {
    name: 'paper', dark: false,
    bg: '#F3EEE4', bgLift: '#FBF8F2', surface: '#FFFFFF', line: 'rgba(21,19,15,0.10)',
    fg: '#15130F', muted: '#6A645A', accent: '#E5400C', accent2: '#1F3FBF', onAccent: '#15130F',
  },
  /** Creative / AI / music. Deep blue-black with neon mint + violet. */
  aurora: {
    name: 'aurora', dark: true,
    bg: '#050711', bgLift: '#0E1B3D', surface: '#0E1221', line: 'rgba(180,200,255,0.12)',
    fg: '#EDF2FF', muted: '#8C9BC4', accent: '#5BF0C5', accent2: '#9A7BFF', onAccent: '#050711',
  },
  /** Luxury / minimal / cinematic. Near-black with champagne. */
  noirgold: {
    name: 'noirgold', dark: true,
    bg: '#0A0A0A', bgLift: '#1D1B17', surface: '#121211', line: 'rgba(255,240,220,0.10)',
    fg: '#F3EFE8', muted: '#8D8880', accent: '#DDB56E', accent2: '#F3EFE8', onAccent: '#0A0A0A',
  },
  /** Friendly explainers / education / kids / wellness. Light and warm. */
  sunrise: {
    name: 'sunrise', dark: false,
    bg: '#FFF3E3', bgLift: '#FFFAF2', surface: '#FFFFFF', line: 'rgba(28,25,48,0.10)',
    fg: '#1C1930', muted: '#6A667F', accent: '#E8431B', accent2: '#3A4DFF', onAccent: '#1C1930',
  },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof palettes;

const ThemeContext = createContext<Palette>(palettes.midnight);

export const ThemeProvider: React.FC<{
  palette?: PaletteName;
  children: React.ReactNode;
}> = ({palette = 'midnight', children}) => (
  <ThemeContext.Provider value={palettes[palette]}>{children}</ThemeContext.Provider>
);

export const useTheme = (): Palette => useContext(ThemeContext);

/**
 * TYPE SCALE, in px on a 1080px SHORT side (1920x1080, 1080x1920 and 1080x1080 all
 * share it). Multiply by `u` from useLayout() so it scales with the canvas.
 * Floors for video: headline >= 84, supporting text >= 44, anything smaller is unreadable on a phone.
 */
export const TYPE = {
  hero: 168,
  display: 132,
  h1: 96,
  h2: 64,
  body: 44,
  caption: 34,
  micro: 28,
} as const;

/**
 * LAYOUT. Design everything in `u` (1u = 1px at a 1080px short side), never in raw px,
 * and the same scene survives 16:9, 9:16, 4:5 and 1:1.
 */
export const useLayout = () => {
  const {width, height} = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const ratio = height / width;
  const isTall = ratio >= 1.6; // 9:16 - platform UI covers the top and bottom
  const isPortrait = ratio >= 0.95; // 9:16, 4:5, 1:1
  const safe = isTall
    ? {x: width * 0.07, top: height * 0.13, bottom: height * 0.2}
    : isPortrait
      ? {x: width * 0.07, top: height * 0.07, bottom: height * 0.07}
      : {x: width * 0.06, top: height * 0.08, bottom: height * 0.08};
  return {width, height, u, isTall, isPortrait, safe, cx: width / 2, cy: height / 2};
};

/** "#RRGGBB" + opacity -> "rgba(r, g, b, a)". Palettes are 6-digit hex. */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
