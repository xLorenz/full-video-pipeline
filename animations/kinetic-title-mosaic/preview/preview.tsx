import React from "react";
import { KineticTitleMosaic } from "../component";

// Preview colours + fonts intentionally match the platform defaults so the
// preview reads the same way any pipeline-driven config would.
const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#FFB300",
  background: "#0A1220", text: "#F2F4F7", muted: "#9CA3AF",
  danger: "#EF4444", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  display: "Space Grotesk",
};
const PREVIEW_FONT_SIZES = { headline: 180, body: 32, display: 200 };

/**
 * "signal / noise / repeat" — the showcase scene for the redesign.
 *
 *   - mosaic layout (per-word weightTier produces asymmetric composition)
 *   - phrase-land phrasing: each word settles BEFORE the next begins
 *   - three different variants per word (slide-up / scale-pop / mask-wipe)
 *   - middle word carries the signature accent eyebrow (not first-word
 *     cliché); rule draws in AFTER the final word's settle tap, scaled
 *     from 0 → 1 over finalEyebrowDuration frames
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "kinetic-title-mosaic.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    theme: {},
    elements: [
      { id: "word-0", custom: { variant: "slide-up", weightTier: "light" } },
      { id: "word-1", custom: { variant: "scale-pop", accent: true, weightTier: "heavy" } },
      { id: "word-2", custom: { variant: "mask-wipe", wipeDirection: "left", weightTier: "medium" } },
    ],
    extras: {
      words: ["signal", "noise", "repeat"],
      phrasing: "phrase-land", phraseLandOverlap: 0.1,
      layout: "mosaic", align: "center",
      defaultVariant: "slide-up",
      perSlotDurationSeconds: 0.55, staggerSeconds: 0.12,
      wordFontRole: "heading", textTransform: "none",
      accentStyle: "eyebrow", accentSide: "below",
      eyebrowThicknessPx: 3, eyebrowGapEm: 0.14,
      popDamping: 14, popStiffness: 160, popMass: 1,
      finalSettle: true, finalSettleScale: 1.015, finalSettleFrames: 8,
      finalEyebrowDuration: 18,
      wordGapPx: 24, rowGapPx: 16,
      containerWidthPct: 88, containerHeightPct: 60,
      holdAfterLandFrames: 30,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <KineticTitleMosaic {...PREVIEW_DEFAULT_PROPS} />;
};
