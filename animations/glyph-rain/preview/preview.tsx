import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { GlyphRainRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#2B6AFF",
  secondary: "#4474FF",
  accent: "#FF2D55",
  background: "#03060F",
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
 * Demonstrates the children-wrapper model: this `TerminalCard` is the
 * CALLER'S content — `<GlyphRainRip>` knows nothing about it and only
 * overlays the rain on top. The title block has its OWN intrinsic
 * animation (a typed-in + glow-flicker headline + a boot sub-line) so
 * the preview shows how the rain composes with content that is already
 * animating underneath.
 *
 * On every frame, the rain falls and the terminal text remains
 * dimmed underneath. Children sit at `1 - dim` opacity (here 0.5 → 0.5
 * visible), always present, never hidden by the template — only
 * visually pushed under the rain by the dimming.
 */
const TerminalCard: React.FC = () => {
  const frame = useCurrentFrame();
  // Headline types in over 16 frames starting at frame 4, then locks.
  const typeProgress = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fullText = "ENTERING NODE";
  const visibleChars = Math.floor(typeProgress * fullText.length);
  const typed = fullText.slice(0, visibleChars);
  // Cursor stays MOUNTED and only toggles opacity — a conditionally
  // mounted underline would make the flex-centered title reflow/jitter
  // on every blink.
  const cursorOn = Math.floor(frame / 6) % 2 === 0;
  const subIn = interpolate(frame, [22, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, #060A18 0%, #03060F 70%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "JetBrains Mono, monospace",
      }}
    >
      <div
        style={{
          fontSize: 156,
          fontWeight: 800,
          letterSpacing: -2,
          color: "#FFFFFF",
          fontFamily: "Inter, system-ui, sans-serif",
          textShadow: "0 0 36px rgba(43, 106, 255, 0.6)",
        }}
      >
        {typed}
        <span style={{ opacity: cursorOn ? 0.85 : 0 }}>_</span>
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: 3,
          color: "#7B8694",
          opacity: subIn,
        }}
      >
        handshake · gateway · trust=0
      </div>
    </AbsoluteFill>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for glyph-rain.
 *
 * Exercises the children-wrapper model: `<GlyphRainRip>` is given a
 * `<TerminalCard>` as `children`. The TerminalCard carries its own
 * type-in + glow flicker animation; the rain overlays on top at a
 * 0.5 dim so the terminal reads through. Faster `speed` (0.5 vs
 * default 0.2) and `mutate` at 1.0 (vs default 0) so the rain visibly
 * churns over the 90-frame preview. Three parallax layers + a green
 * accent on glyphColor so the matrix read is unmistakable.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "glyph-rain.preview",
    theme: {
      palette: {
        primary: "#2B6AFF",
        secondary: "#10FF9E",
        accent: "#FF2D55",
        background: "#03060F",
        text: "#FFFFFF",
        muted: "#7B8694",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      cell: 18,
      glyphColor: "#10FF9E",
      headColor: "#FFFFFF",
      speed: 0.45,
      speedVariance: 0.7,
      density: 0.22,
      trail: 0.85,
      glow: 2.2,
      mutate: 1.4,
      flicker: 0.35,
      layers: 3,
      dim: 0.5,
      deterministicSeed: 1337,
      fadeInFrames: 6,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <GlyphRainRip {...PREVIEW_DEFAULT_PROPS}>
      <TerminalCard />
    </GlyphRainRip>
  );
};
