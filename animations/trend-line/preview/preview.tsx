import React from "react";
import { TrendLine } from "../component";

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
const PREVIEW_FONT_SIZES = { title: 56, body: 30 };

/**
 * Self-contained preview for trend-line.
 *
 * Exercises: a 7-point weekly trend with a gold line (theme override on the
 * accent), gradient area, springy dot pops, a "GOAL" reference line that
 * draws in after the series, and the end-value count-up chip — the
 * canonical "this is where we're heading" beat. 150 frames = 5s @ 30fps.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "trend-line.preview",
    theme: { palette: { accent: "#FFD166" } },
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "title", text: "WATCH TIME / WEEK", delay: 6, duration: 14, color: null },
      { id: "label", text: "minutes per active viewer", delay: 40, duration: 16, color: null },
    ],
    extras: {
      points: [12, 24, 18, 33, 41, 38, 52],
      labels: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL"],
      yMin: 0,
      yMax: 60,
      drawSeconds: 1.8,
      drawEasing: "ease-out-cubic",
      drawDelayFrames: 10,
      showArea: true,
      areaOpacity: 0.32,
      showDots: true,
      dotPop: true,
      dotSizePx: 10,
      lineWidthPx: 6,
      showGrid: true,
      xLabels: true,
      yLabels: true,
      showGoal: true,
      goalValue: 50,
      goalLabel: "GOAL",
      endCountUp: true,
      endCountUpSeconds: 0.9,
      valueFormat: "int",
      holdAfterDrawFrames: 30,
      labelAfterDraw: true,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <TrendLine {...PREVIEW_DEFAULT_PROPS} />;
};
