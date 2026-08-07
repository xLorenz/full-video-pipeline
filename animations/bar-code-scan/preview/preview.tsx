import React from "react";
import { BarCodeScan } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D",
  secondary: "#00BFA6",
  accent: "#00BFA6",
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

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "bar-code-scan.preview",
    global: {
      speed: 1.0,
      delayOffset: 0,
      easing: "ease-out-cubic" as const,
    },
    theme: { palette: { accent: "#00BFA6" } },
    elements: [
      { id: "bar-0", custom: { value: 64, width: 1.0 } },
      { id: "bar-1", custom: { value: 41, width: 0.7 } },
      { id: "bar-2", custom: { value: 38, width: 0.55 } },
      { id: "bar-3", custom: { value: 19, width: 0.3 } },
      { id: "bar-4", custom: { value: 23, width: 0.4 } },
    ],
    extras: {
      barcodeBars: ["GPU", "CPU", "NET", "DISK", "RAM"],
      scanStartSeconds: 0.5,
      scanLineSeconds: 2.4,
      scanEasing: "ease-in-out",
      scanWidthPx: 3,
      scanGlow: true,
      barBaseWidthPx: 28,
      barGapPx: 18,
      barcodeHeightPct: 45,
      barcodeWidthPct: 78,
      countUp: true,
      valueFormat: "int",
      valueFontPx: 36,
      labelFontPx: 24,
      showValueLabels: true,
      showSpineTicks: true,
      holdAfterScanFrames: 30,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
};

export const Preview: React.FC = () => {
  return <BarCodeScan {...PREVIEW_DEFAULT_PROPS} />;
};
