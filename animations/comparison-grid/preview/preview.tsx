import React from "react";
import { ComparisonGrid } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#7C3AED",
  background: "#0A1220", text: "#FFFFFF", muted: "#9CA3AF",
  danger: "#EF4444", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 96, body: 28 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "comparison-grid.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [{ id: "cell-1-1", text: "WINNER" }],
    extras: {
      rows: 2, cols: 3,
      cells: [
        ["Tier",   "Speed",  "Cost"],
        ["Free",   "★",     "$0"],
      ],
      headerRow: true,
      sequenceOrder: "diagonal",
      flipDurationSeconds: 0.5,
      staggerSeconds: 0.18,
      cellPaddingPx: 36,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <ComparisonGrid {...PREVIEW_DEFAULT_PROPS} />;
};
