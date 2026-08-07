import React from "react";
import { ComparisonGrid } from "../component";

const PREVIEW_COLORS = {
  primary: "#00E5B4",
  secondary: "#00E5B4",
  accent: "#00E5B4",
  background: "#0A1220",
  surface: "#142233",
  text: "#FFFFFF",
  muted: "#8B95A7",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "rgba(255,255,255,0.05)",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Inter", mono: "JetBrains Mono" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 30, caption: 16 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "comparison-grid.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "cell-1-1", text: "$0",   custom: { mono: true, weight: 700 } },
      { id: "cell-1-2", text: "$20",  custom: { mono: true, weight: 700 } },
      { id: "cell-1-3", text: "$99",  custom: { mono: true, weight: 700 } },
      { id: "cell-2-1", text: "5 GB",   custom: { mono: true } },
      { id: "cell-2-2", text: "200 GB", custom: { mono: true } },
      { id: "cell-2-3", text: "Unlimited", custom: { mono: true } },
      { id: "cell-3-1", text: "1 seat",  custom: { mono: true } },
      { id: "cell-3-2", text: "5 seats", custom: { mono: true } },
      { id: "cell-3-3", text: "20 seats",custom: { mono: true } },
    ],
    extras: {
      rows: 4,
      cols: 4,
      cells: [
        ["",         "Free",   "Pro",     "Team"],
        ["Price",    "$0",     "$20",     "$99"],
        ["Storage",  "5 GB",   "200 GB",  "Unlimited"],
        ["Seats",    "1 seat", "5 seats", "20 seats"],
      ],
      eyebrow: "PRICING",
      title: "Pick your plan",
      subtitle: "Three tiers, one winner - the Pro row is our recommendation.",
      sequenceOrder: "diagonal",
      flipDurationSeconds: 0.42,
      staggerSeconds: 0.07,
      cellGapPx: 10,
      cellBackground: "#142233",
      cellBorderless: true,
      cellPaddingPx: 28,
      headerCellPaddingPx: 18,
      headerRowRatio: 0.7,
      flipEasing: "ease-out-cubic",
      headerRow: true,
      headerEmphasis: "none",
      accentLandFlash: true,
      rowSeparators: false,
      winnerRow: 2,
      winnerRowDurationFrames: 16,
      postFlipHoldFrames: 28,
      containerWidthPct: 84,
      containerHeightPct: 64,
      columnWidths: [0.78, 1, 1, 1],
      columnAlign: ["left", "right", "right", "right"],
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <ComparisonGrid {...PREVIEW_DEFAULT_PROPS} />;
};
