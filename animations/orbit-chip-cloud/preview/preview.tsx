import React from "react";
import { OrbitChipCloud } from "../component";

const PREVIEW_COLORS = {
  primary: "#14202E",
  secondary: "#00D9A3",
  accent: "#00D9A3",
  background: "#0A1220",
  surface: "#14202E",
  text: "#F4F7FF",
  muted: "#6F7B91",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "rgba(255,255,255,0.06)",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Inter", mono: "JetBrains Mono" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 28, caption: 16 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "orbit-chip-cloud.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    theme: { palette: { surface: "#14202E" } },
    elements: [
      { id: "chip-0" },
      { id: "chip-1", custom: { accent: true } },
      { id: "chip-2" },
      { id: "chip-3" },
      { id: "chip-4" },
    ],
    extras: {
      chips: ["vectors", "tokens", "memory", "scheduler", "tools"],
      eyebrow: "ARCHITECTURE",
      title: "What makes an agent",
      subtitle: "Five pillars orbit a single core.",
      revealSeconds: 0.95,
      chipsStaggerSeconds: 0.10,
      orbitStartAngleDeg: -90,
      orbitDegreesPerSec: 9,
      orbitRadiusXPx: 720,
      orbitRadiusYPx: 380,
      orbitStrokeWidthPx: 1.4,
      orbitDashOnPx: 6,
      orbitDashOffPx: 10,
      orbitDashDriftPxPerSec: 8,
      chipHeightPx: 56,
      chipPaddingXPx: 28,
      chipPaddingYPx: 12,
      chipStrokeWidthPx: 0,
      chipRadiusPx: 28,
      chipFontWeight: 600,
      chipFontSizeScale: 0.45,
      chipArrivalTangent: "behind",
      chipArrivalOffsetPx: 140,
      chipTextShadow: true,
      nodeRadiusPx: 76,
      nodeGlow: true,
      nodeLabel: "AGENT",
      nodeLabelFontPx: 22,
      connectors: true,
      connectorsDrawOn: true,
      connectorWidthPx: 1,
      holdAfterLandFrames: 30,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <OrbitChipCloud {...PREVIEW_DEFAULT_PROPS} />;
};
