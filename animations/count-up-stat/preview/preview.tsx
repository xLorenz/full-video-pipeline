import React from "react";
import { CountUpStat } from "../component";

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
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins", mono: "JetBrains Mono" };
const PREVIEW_FONT_SIZES = { headline: 200, body: 30 };

/**
 * Self-contained preview for count-up-stat.
 *
 * Exercises: a million-and-change target with thousand separators and a "+"
 * suffix (mono role for column alignment), land-punch enabled, the hairline
 * accent drawn on land, and the label lifted in AFTER the number lands — the
 * canonical "stat reveal" beat. 90 frames = 3s @ 30fps.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "count-up-stat.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "value", delay: 8, duration: 24, color: null },
      { id: "label", text: "active monthly creators", delay: 32, duration: 16 },
    ],
    extras: {
      targetValue: 1_250_000,
      decimals: 0,
      durationSeconds: 1.5,
      thousandSeparator: ",",
      suffix: "+",
      pop: true,
      valueFontRole: "mono",
      holdAfterCountUpFrames: 30,
      showAccentLine: true,
      accentLineWidthPct: 58,
      accentLineThicknessPx: 2,
      landPunch: true,
      landPunchScale: 1.02,
      landPunchDurationFrames: 7,
      anticipationFrames: 6,
      anticipationScale: 0.92,
      labelAfterLand: true,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <CountUpStat {...PREVIEW_DEFAULT_PROPS} />;
};
