import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { ShatterRip } from "../component";

const CARD_COLORS = {
  primary: "#A93A2A",
  secondary: "#2E5B52",
  accent: "#C79A3E",
  background: "#17141A",
  text: "#241F1B",
  muted: "#6B6359",
  ink: "#1D1A16",
  paper: "#F4EFE6",
  paperDeep: "#E7DFCF",
};
const CARD_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const CARD_FONT_SIZES = { headline: 120, body: 26, caption: 18 };

/**
 * The card demo scene — the counter-example to the scrolling magazine:
 * a single card, centered on a dark backdrop, NOT taller than the
 * frame. No scroll distance, so `scrollTo: 0` pins the page and the
 * shards stay put on the card. The card rises in (transforms only —
 * opacity fades drop out of the html-in-canvas record), holds, and at
 * progress 0.6 (3s of the 5s composition) the static centered lens
 * activates: the card breaks into glass shards, floats, and reforms.
 */
const CardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [6, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: CARD_COLORS.background,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* the card — centered, one entrance: a transform rise */}
      <div
        style={{
          width: 880,
          height: 560,
          borderRadius: 24,
          backgroundColor: CARD_COLORS.paper,
          boxShadow: "0 40px 120px -40px rgba(0, 0, 0, 0.85)",
          position: "relative",
          padding: "56px 64px",
          overflow: "hidden",
          transform: `translateY(${(1 - rise) * 46}px) scale(${0.96 + rise * 0.04})`,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 18,
            letterSpacing: 5,
            fontWeight: 700,
            color: CARD_COLORS.primary,
          }}
        >
          PORT 013 — CANVAS UI
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 0.95,
            color: CARD_COLORS.ink,
          }}
        >
          ONE CARD
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 24,
            lineHeight: 1.55,
            color: CARD_COLORS.text,
            maxWidth: 560,
          }}
        >
          A single centered card, a static lens, no scroll — the page
          sits still until the shatter trigger fires.
        </div>
        {/* photo strip — strong edges for the refraction + dispersion */}
        <div
          style={{
            position: "absolute",
            left: 64,
            right: 64,
            bottom: 56,
            height: 150,
            borderRadius: 14,
            background:
              "linear-gradient(to bottom, #E8DCC3 0%, #E8DCC3 55%, #9DB8A4 55%, #9DB8A4 72%, #5F7D6A 72%, #5F7D6A 100%)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 26,
              width: 90,
              height: 90,
              borderRadius: 999,
              transform: "translateX(-50%)",
              background:
                "radial-gradient(circle at 40% 35%, #E4B64C 0%, #E4B64C 42%, rgba(255, 255, 255, 0) 43%)",
            }}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Self-contained 150-frame (5s @ 30fps) card demo for shatter.
 *
 * The scene the config model was designed for: a static centered lens
 * (`lensPath` two identical stops), a pinned page (`scrollTo: 0`), and
 * an `activePath` envelope that holds the lens OFF until progress 0.6
 * (3s), snaps it on over ~3 frames (the shatter), holds through 0.74,
 * then drops back to 0 (the card reforms) — the card stays flat for
 * the rest of the composition.
 */
export const PREVIEW_CARD_DEFAULT_PROPS = {
  config: {
    instanceId: "shatter.preview-card",
    theme: {
      palette: {
        primary: "#A93A2A",
        secondary: "#2E5B52",
        accent: "#C79A3E",
        background: "#17141A",
        text: "#241F1B",
        muted: "#6B6359",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      radius: 0.45,
      softness: 0.5,
      tileSize: 90,
      shards: 1,
      corner: 8,
      lift: 35,
      tilt: 2,
      scatter: 6,
      perspective: 1500,
      gapColor: [0, 0, 0],
      shadow: 0.6,
      shading: 0.6,
      refraction: 1.5,
      dispersion: 0.35,
      floatSpeed: 2,
      strength: 1,
      baseStrength: 0,
      lensPath: [
        { x: 0.5, y: 0.5, at: 0 },
        { x: 0.5, y: 0.5, at: 1 },
      ],
      activePath: [
        { at: 0, v: 0 },
        { at: 0.6, v: 0 },
        { at: 0.62, v: 1 },
        { at: 0.74, v: 1 },
        { at: 0.78, v: 0 },
      ],
      scrollTo: 0,
    },
  },
  styles: { colors: CARD_COLORS, fonts: CARD_FONTS },
  fontSizes: CARD_FONT_SIZES,
};

export const PreviewCard: React.FC = () => {
  return (
    <ShatterRip {...PREVIEW_CARD_DEFAULT_PROPS}>
      <CardScene />
    </ShatterRip>
  );
};
