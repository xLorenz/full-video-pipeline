import React from "react";
import { RadialGauge } from "../component";

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
const PREVIEW_FONT_SIZES = { headline: 176, body: 30 };

/**
 * Self-contained preview for radial-gauge.
 *
 * Exercises: a 78% gauge with a soft-gold arc (theme override), the cap-dot
 * signature popping on land, the label lifted in AFTER the arc arrives, and
 * element overrides (value color, label text). 120 frames = 4s @ 30fps.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "radial-gauge.preview",
    theme: { palette: { accent: "#FFD166" } },
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "value", delay: 8, duration: 24, color: "#FFFFFF" },
      { id: "label", text: "signal lock", delay: 30, duration: 16, color: null },
    ],
    extras: {
      targetValue: 78,
      gaugeMax: 100,
      decimals: 0,
      durationSeconds: 1.6,
      suffix: "%",
      pop: true,
      valueFontRole: "heading",
      ringSizePx: 560,
      strokeWidthPx: 44,
      segments: 1,
      showTrack: true,
      capDot: true,
      arcEasing: "ease-out-cubic",
      holdAfterLandFrames: 30,
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
  return <RadialGauge {...PREVIEW_DEFAULT_PROPS} />;
};
