import React from "react";
import { DataBars } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#FFB300",
  background: "#0A1220", text: "#FFFFFF", muted: "#9CA3AF",
  danger: "#EF4444", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 28 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "data-bars.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "bar-0", text: "Apple", color: "#EF4444" },
      { id: "bar-1", text: "Banana", color: "#FFB300" },
      { id: "bar-2", text: "Carrot", color: "#10B981" },
      { id: "bar-3", text: "Dew", color: "#00BFA6" },
      { id: "bar-4", text: "Echo", color: "#7C3AED" },
    ],
    extras: {
      values: [42, 88, 56, 120, 35],
      labels: ["A", "B", "C", "D", "E"],
      barHeightPx: 56,
      countUp: true,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <DataBars {...PREVIEW_DEFAULT_PROPS} />;
};
