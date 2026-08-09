import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { DecryptRip } from "../component";

const CARD_PREVIEW_COLORS = {
  primary: "#4ade80",
  secondary: "#FF5D5D",
  accent: "#F2E8DA",
  background: "#17141A",
  text: "#1D1A16",
  muted: "#7A7166",
  ink: "#1D1A16",
  paper: "#F2E8DA",
  red: "#FF5D5D",
};
const CARD_PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const CARD_PREVIEW_FONT_SIZES = { headline: 96, body: 26, caption: 18 };

/**
 * The scene behind the cipher — a single centered "secret message" card
 * on a flat dark backdrop. It is the CALLER'S content: DecryptRip
 * knows nothing about it, it just captures its DOM into a texture each
 * frame and covers it with a shape-matched cipher. The card is fully
 * opaque (opacity fades decay out of the html-in-canvas record — see
 * the animation.md pitfall) and enters with a transform-only rise. The
 * frame around the card is a flat solid color that matches the
 * `background` option, so the cipher only ever appears over the card
 * and the empty frame stays seamless.
 */
const SecretCard: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [6, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        backgroundColor: CARD_PREVIEW_COLORS.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 880,
          height: 560,
          borderRadius: 16,
          backgroundColor: CARD_PREVIEW_COLORS.paper,
          boxShadow: "0 40px 120px -40px rgba(0, 0, 0, 0.85)",
          padding: "54px 64px",
          display: "flex",
          flexDirection: "column",
          transform: `translateY(${(1 - rise) * 30}px)`,
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
        }}
      >
        {/* card header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 22,
            borderBottom: `2px solid ${CARD_PREVIEW_COLORS.ink}`,
            fontSize: 17,
            letterSpacing: 3,
            color: CARD_PREVIEW_COLORS.muted,
          }}
        >
          <div>FILE 0014 — DECRYPTED</div>
          <div style={{ color: CARD_PREVIEW_COLORS.red }}>TOP SECRET</div>
        </div>

        {/* the secret */}
        <div style={{ padding: "52px 0 8px 0" }}>
          <div
            style={{
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 92,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.08,
              color: CARD_PREVIEW_COLORS.ink,
            }}
          >
            THE PASSWORD
            <br />
            IS GREENHOUSE
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 21,
              letterSpacing: 2,
              color: CARD_PREVIEW_COLORS.muted,
            }}
          >
            The decrypt circle blooms at 3s, holds, and the file re-locks
            itself before the frame ends.
          </div>
        </div>

        {/* card footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 22,
            borderTop: `2px solid ${CARD_PREVIEW_COLORS.ink}`,
            fontSize: 16,
            letterSpacing: 3,
            color: CARD_PREVIEW_COLORS.muted,
          }}
        >
          <div>ENTERED 03:14</div>
          <div>CLEARANCE 5</div>
        </div>
      </div>
    </div>
  );
};

/**
 * Self-contained 150-frame (5s @ 30fps) preview for decrypt-reveal —
 * the "decrypt a card at 3s of 5s" recipe.
 *
 * A single centered card on a flat dark backdrop, wrapped in DecryptRip
 * with a STATIC centered `lensPath` (two identical stops), `radius` 600
 * (covers the 880×560 card plus feather), `background` set to the
 * backdrop color exactly (empty frame stays seamless), and a hold-off
 * `activePath`: fully encrypted for the first 3 seconds (progress 0.6 =
 * frame 90), the decrypt circle blooms over ~3 frames, holds ~0.9s, and
 * re-locks by ~frame 117 — the card rises in encrypted, decrypts in the
 * middle, and re-encrypts before the end.
 */
export const PREVIEW_CARD_DEFAULT_PROPS = {
  config: {
    instanceId: "decrypt-reveal.preview-card",
    theme: {
      palette: {
        primary: "#4ade80",
        secondary: "#FF5D5D",
        accent: "#F2E8DA",
        background: "#17141A",
        text: "#1D1A16",
        muted: "#7A7166",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      radius: 600,
      softness: 0.45,
      cell: 16,
      aspect: 0.75,
      charset: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
      colored: 1,
      color: "#4ade80",
      brightness: 1,
      legibility: 1,
      contrast: 1,
      exposure: 1,
      scramble: 0.2,
      scrambleSpeed: 8,
      edgeWidth: 0.2,
      edgeFlicker: 1,
      edgeGlow: 2.5,
      edgeTint: 0.8,
      aberration: 14,
      passthrough: 0.15,
      threshold: 0.025,
      background: "#17141A",
      smoothing: 0.08,
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
    },
  },
  styles: { colors: CARD_PREVIEW_COLORS, fonts: CARD_PREVIEW_FONTS },
  fontSizes: CARD_PREVIEW_FONT_SIZES,
};

export const PreviewCard: React.FC = () => {
  return (
    <DecryptRip {...PREVIEW_CARD_DEFAULT_PROPS}>
      <SecretCard />
    </DecryptRip>
  );
};
