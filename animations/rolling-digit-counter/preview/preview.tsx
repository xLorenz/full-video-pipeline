import React from "react";
import { RollingDigitCounter } from "../component";

/**
 * Preview composition for rolling-digit-counter — a "subscribers unlocked"
 * climax reveal that exercises every polished subsystem:
 *
 *   - 7-digit target with thousand separators (so separators+lock-accent
 *     both render)
 *   - prefix ($) + suffix (+), both accent-colored
 *   - real reel scroll across 4 × 0..9 cycles per column, decelerating
 *     into each target digit with ease-out-cubic + damped spring settle
 *   - velocity-driven motion blur that dies naturally as the reel slows
 *   - per-column negative stagger = left-to-right land order
 *   - column lock-accent hairline pulse at each column's land frame
 *   - label fades in 6 frames after the LAST column lands
 *   - holdAfterLandFrames honored — number sits fully visible for ~1.2s
 *     before the global end-of-life fade
 *
 * 360 frames (12s @ 30fps). The published 3-second auto-preview clamp
 * (`scripts/preview_animations.py`) renders only 0-89 — enough to read
 * the reel scroll + first-column land in motion; the full 12s render
 * committed to preview/preview.mp4 showcases the entire sequence:
 * headstart -> roll -> per-column land -> hold -> label fade out -> end.
 */
const PREVIEW_COLORS = {
  primary: "#0F1B2D",
  secondary: "#00BFA6",
  accent: "#FFB300",
  background: "#0A1220",
  text: "#FFFFFF",
  muted: "#9CA3AF",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "#1A2744",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 180, body: 28 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "rolling-digit-counter.preview",
    global: { speed: 1.0, delayOffset: 12, easing: "ease-out-cubic" as const },
    theme: {},
    elements: [
      { id: "prefix", text: "$" },
      { id: "suffix", text: "+" },
      { id: "label",
        text: "subscribers unlocked",
        delay: 32,
        duration: 16,
      },
    ],
    extras: {
      targetValue: 1284509,
      decimals: 0,
      thousandSeparator: ",",
      rollSeconds: 2.0,
      spinRateHz: 14,
      headstartFrames: 6,
      perColumnStagger: 0.12,
      motionBlurScale: 1.0,
      springLand: true,
      valueFontRole: "mono",
      maxFontPx: 200,
      rowGapPx: 28,
      containerWidthPct: 70,
      lockAccent: true,
      accentColor: null,
      frameColor: null,
      showStamp: false,
      holdAfterLandFrames: 36,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <RollingDigitCounter {...PREVIEW_DEFAULT_PROPS} />;
};
