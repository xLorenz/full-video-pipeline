import React from "react";
import { CountUpStat } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#FFB300",
  background: "#0A1220", text: "#FFFFFF", muted: "#9CA3AF",
  danger: "#EF4444", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 160, body: 28 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "count-up-stat.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "value", delay: 8, duration: 24, color: "#00BFA6" },
      { id: "label", text: "active monthly creators", delay: 32, duration: 16 },
    ],
    extras: {
      targetValue: 1250000,
      decimals: 0,
      durationSeconds: 1.6,
      thousandSeparator: ",",
      suffix: "+",
      pop: true,
      popForce: 1.2,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <CountUpStat {...PREVIEW_DEFAULT_PROPS} />;
};
