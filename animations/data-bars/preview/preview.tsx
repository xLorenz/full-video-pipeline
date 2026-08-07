import React from "react";
import { AbsoluteFill } from "remotion";
import { DataBars } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#FFB300",
  background: "#0A1220", text: "#FFFFFF", muted: "#8A94A6",
  danger: "#EF4444", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins", mono: "JetBrains Mono" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 28 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "data-bars.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-quint" as const },
    elements: [
      { id: "bar-0", text: "Baseline" },
      { id: "bar-1", text: "Greedy" },
      { id: "bar-2", text: "Beam Search" },
      { id: "bar-3", text: "Top-k" },
      { id: "bar-4", text: "Nucleus" },
      { id: "bar-5", text: "Mixture" },
    ],
    extras: {
      values: [42, 88, 64, 35, 96, 18],
      labels: ["A", "B", "C", "D", "E", "F"],
      barHeightPx: 52,
      barGapPx: 16,
      countUp: true,
      holdAfterFillFrames: 36,
      barSpringDamping: 10,
      staggerFrames: 5,
      fillFrames: 22,
      accentLeader: true,
      labelGutterPx: 320,
      lanePaddingPx: 160,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: PREVIEW_COLORS.background }}>
      <DataBars {...PREVIEW_DEFAULT_PROPS} />
    </AbsoluteFill>
  );
};
