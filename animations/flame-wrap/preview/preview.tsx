import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { FlameWrapRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#FF7A1A",
  secondary: "#FFB36B",
  accent: "#FF5722",
  background: "#0B0A12",
  text: "#FFFFFF",
  muted: "#8A8496",
  danger: "#FF3B46",
  success: "#10B981",
  gridLine: "#1C1A2E",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 96, body: 24, caption: 18 };

/**
 * Demonstrates the children-wrapper model: this `TitleCard` is the
 * CALLER'S content — `<FlameWrapRip>` knows nothing about it, it only
 * wraps the box with fire. The card's border-radius (28px) intentionally
 * matches `extras.radius: 28` so the burning outline hugs its corners.
 * Its own entrance animation (overline fade, title rise, sub fade) shows
 * how the fire composes with content that is already animating.
 *
 * The card is pushed toward the BOTTOM of the frame so the ~300px of
 * flames rising from its top edge stay inside the canvas. Fire wraps
 * every edge of the box (rim glow) and licks up hard from the top.
 */
const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const overlineIn = interpolate(frame, [4, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const titleIn = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const subIn = interpolate(frame, [20, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const pulse = 0.55 + 0.45 * Math.sin(frame / 4.5);
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 38%, #161226 0%, #0B0A12 72%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ marginTop: 150 }}>
        <FlameWrapRip
          config={{
            instanceId: "flame-wrap.preview",
            theme: {
              palette: {
                primary: "#FF7A1A",
                secondary: "#FFB36B",
                accent: "#FF5722",
                background: "#0B0A12",
                text: "#FFFFFF",
                muted: "#8A8496",
              },
            },
            global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
            elements: [],
            extras: {
              color: "#FF5722",
              intensity: 1.0,
              height: 200,
              spread: 16,
              radius: 28,
              speed: 0.6,
              scale: 0.85,
              turbulence: 0.55,
              turbulenceScale: 0.6,
              turbulenceReach: 30,
              sparks: 1.9,
              sparkSize: 0.5,
              sparkDensity: 1.2,
              sparkSpeed: 1.1,
              rim: 2.6,
              melt: 6,
              distortion: 12,
              smoke: 1.4,
              ember: 1.6,
              scorch: 0,
              fadeInFrames: 6,
            },
          }}
          styles={{ colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS }}
          fontSizes={PREVIEW_FONT_SIZES}
        >
          <div
            style={{
              width: 940,
              padding: "54px 72px",
              borderRadius: 28,
              background: "linear-gradient(180deg, #1C1A2A 0%, #12101C 100%)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              boxShadow:
                "0 24px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 8,
                color: "#FF7A1A",
                opacity: overlineIn,
              }}
            >
              SEQUENCE 07 — LIVE
            </div>
            <div
              style={{
                marginTop: 20,
                fontSize: 96,
                fontWeight: 900,
                letterSpacing: -3,
                lineHeight: 1,
                color: "#FFFFFF",
                fontFamily: "Inter, system-ui, sans-serif",
                opacity: titleIn,
                transform: `translateY(${(1 - titleIn) * 24}px) scale(${0.98 + titleIn * 0.02})`,
              }}
            >
              IGNITION
            </div>
            <div
              style={{
                marginTop: 26,
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: subIn,
              }}
            >
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 21,
                  fontWeight: 500,
                  letterSpacing: 2,
                  color: "#8A8496",
                }}
              >
                burning frames · 30fps · deterministic
              </span>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: "#FFB36B",
                  border: "1px solid rgba(255, 122, 26, 0.45)",
                  borderRadius: 999,
                  padding: "6px 14px",
                  opacity: 0.7 + 0.3 * pulse,
                }}
              >
                ● ON FIRE
              </span>
            </div>
          </div>
        </FlameWrapRip>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for flame-wrap.
 *
 * Exercises the children-wrapper model: `<FlameWrapRip>` wraps a
 * `<TitleCard>`. The card animates on its own; the fire wraps it with
 * orange tongues from the top edge, rim glow on all edges, rising
 * sparks, and smoke — deterministically re-computed every frame.
 * `radius: 28` matches the card's border-radius so the flames hug the
 * corners; `height: 200` gives tall, readable flames over the 90-frame
 * preview.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "flame-wrap.preview",
    theme: {
      palette: {
        primary: "#FF7A1A",
        secondary: "#FFB36B",
        accent: "#FF5722",
        background: "#0B0A12",
        text: "#FFFFFF",
        muted: "#8A8496",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      color: "#FF5722",
      intensity: 1.0,
      height: 200,
      spread: 16,
      radius: 28,
      speed: 0.6,
      scale: 0.85,
      turbulence: 0.55,
      turbulenceScale: 0.6,
      turbulenceReach: 30,
      sparks: 1.9,
      sparkSize: 0.5,
      sparkDensity: 1.2,
      sparkSpeed: 1.1,
      rim: 2.6,
      melt: 6,
      distortion: 12,
      smoke: 1.4,
      ember: 1.6,
      scorch: 0,
      fadeInFrames: 6,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <TitleCard />;
};
