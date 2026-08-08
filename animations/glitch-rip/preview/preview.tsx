import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { GlitchRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#0B0F14",
  secondary: "#10B981",
  accent: "#FF2D55",
  background: "#05070A",
  text: "#FFFFFF",
  muted: "#7B8694",
  danger: "#FF3B46",
  success: "#10B981",
  gridLine: "#1A2744",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 168, body: 28, caption: 22 };

/**
 * Demonstrates the children-wrapper model: this `TitleCard` is the
 * CALLER'S content — GlitchRip knows nothing about it and only overlays
 * the glitch burst on top. The title block has its OWN intrinsic
 * animation (a quick spring-in of the headline + subtitle) so the preview
 * shows how the glitch composes with content that is already animating.
 *
 * During a burst, three banded clones of THIS TitleCard get sliced and
 * chromatically offset above the unmodified TitleCard; when the burst
 * ends, the overlays hard-cut off and the original TitleCard snaps back
 * in instantly — no fade, no darkening.
 */
const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const headIn = interpolate(frame, [4, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const subIn = interpolate(frame, [12, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, #0B1220 0%, #05070A 70%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 168,
          fontWeight: 900,
          letterSpacing: -4,
          color: "#FFFFFF",
          transform: `translateY(${(1 - headIn) * 24}px)`,
          opacity: headIn,
        }}
      >
        BROADCAST DOWN
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: 2,
          color: "#7B8694",
          fontFamily: "JetBrains Mono, monospace",
          opacity: subIn,
        }}
      >
        channel 5 · restoring link
      </div>
    </AbsoluteFill>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for glitch-rip.
 *
 * Exercises the children-wrapper model: `<GlitchRip>` is given a
 * `<TitleCard>` as `children`. The TitleCard carries its own
 * headline/subtitle spring-in animation; the glitch is layered ABOVE
 * it on a 1.2s burst schedule so AT LEAST one burst lands inside the
 * 90-frame preview window. The deterministicSeed is 1337 so the same
 * per-band tear pattern appears on every render.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "glitch-rip.preview",
    theme: {
      palette: {
        accent: "#FF2D55",
        background: "#05070A",
        text: "#FFFFFF",
        muted: "#7B8694",
        danger: "#FF3B46",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      intervalSeconds: 1.2,
      burstDurationSeconds: 0.9,
      attackRatio: 0.18,
      slices: 16,
      shiftPx: 46,
      rgbShiftPx: 14,
      blocks: 0.7,
      noise: 0.55,
      scanlineEveryRows: 2,
      scanlineOpacity: 0.22,
      grainOpacity: 0.28,
      quietFadeFrames: 4,
      postBurstHoldFrames: 0,
      deterministicSeed: 1337,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <GlitchRip {...PREVIEW_DEFAULT_PROPS}>
      <TitleCard />
    </GlitchRip>
  );
};
