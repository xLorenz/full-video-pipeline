import React from "react";
import { AbsoluteFill } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { RightWrongCard } from "../component";

loadInter("normal", {
  weights: ["400", "500", "700", "800", "900"],
  subsets: ["latin"],
});
loadPoppins("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

const PREVIEW_BACKDROP = "#060B16";

const PREVIEW_COLORS = {
  primary: "#0F1B2D",
  secondary: "#00BFA6",
  accent: "#FFB300",
  background: "#0A1220",
  text: "#FFFFFF",
  muted: "#5B6473",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 28, stamp: 180 };

/**
 * Preview exercising the NEW N-card mode.
 *
 * 3 cards, asymmetric verdict timing:
 *   - Index 0 (left card): LOSE, marked FIRST at frame 40 (earliest)
 *   - Index 1 (center):   WIN, marked SECOND at frame 56 (the actual "answer")
 *   - Index 2 (right card): LOSE, marked last at frame 72 (also wrong)
 *
 * Result: Wrong stamps first, winner stamps at ~56, second loser stamps after.
 * All three have the same card chrome (gradient, glow, flash per-verdict).
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "right-wrong-card.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      cardGapPx: 36,
      cardElevationPx: 18,
      cornerRadiusPx: 24,
      preEnterHoldFrames: 10,
      postVerdictHoldFrames: 32,
      winnerBorderWidthPx: 4,
      winnerGlowPx: 48,
      watermarkGlyphPx: 300,
      watermarkOpacity: 0.5,
      cardGradient: true,
      loserShadowTint: true,
      impactFlash: true,
      impactFlashPeak: 0.85,
      stampForce: 1.3,
      stampStyle: "shake",
      cards: [
        {
          id: "wrong-a",
          verdict: "lose",
          label: "Myth",
          body: "Manual editing",
          verdictAt: 40,
        },
        {
          id: "right-answer",
          verdict: "win",
          label: "With us",
          body: "Automated pipeline",
          entryDelay: 4,
          verdictAt: 56,
        },
        {
          id: "wrong-b",
          verdict: "lose",
          label: "Rumor",
          body: "Outsourcing guesswork",
          entryDelay: 8,
          verdictAt: 72,
        },
      ],
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${PREVIEW_BACKDROP} 0%, ${PREVIEW_BACKDROP} 55%, #0A1424 100%)`,
      }}
    >
      <RightWrongCard {...PREVIEW_DEFAULT_PROPS} />
    </AbsoluteFill>
  );
};