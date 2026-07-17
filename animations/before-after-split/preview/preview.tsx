import React from "react";
import { BeforeAfterSplit } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#FFB300",
  background: "#0A1220", text: "#FFFFFF", muted: "#9CA3AF",
  danger: "#9E9E9E", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 96, body: 64 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "before-after-split.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "before-label", text: "1950" },
      { id: "after-label",  text: "Today" },
    ],
    extras: {
      direction: "vertical",
      sweepDurationSeconds: 1.6,
      dividerStyle: "gradient",
      dividerColor: "#FFD166",
      dividerWidthPx: 8,
      labelOpacityDuringSweep: 0.7,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <BeforeAfterSplit {...PREVIEW_DEFAULT_PROPS} />;
};
