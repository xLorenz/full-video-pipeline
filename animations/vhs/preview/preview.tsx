import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { VHSRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#FFB347",
  secondary: "#FF3B46",
  accent: "#FF5722",
  background: "#0A0A0E",
  text: "#EDE7DC",
  muted: "#8B8577",
  danger: "#FF3B46",
  success: "#10B981",
  gridLine: "#1A1A22",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 132, body: 28, caption: 20 };

/**
 * The scene the VHS treatment eats. It is the CALLER'S content — VHSRip
 * knows nothing about it, it just captures its DOM into a texture and
 * runs the tape effect over the whole frame. The root div carries an
 * OPAQUE background (#0A0A0E): the shader's CRT bezel color is probed by
 * walking up from the captured element to the first opaque background.
 * A small entrance animation (headline rise) demonstrates that per-frame
 * styles are captured as-is.
 */
const TapeScene: React.FC = () => {
  const frame = useCurrentFrame();  const in1 = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const in2 = interpolate(frame, [14, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const recOn = Math.floor(frame / 8) % 2 === 0;
  const t = 42 + Math.floor(frame / 30);
  const stamp = `00:00:${String(t).padStart(2, "0")}`;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#0A0A0E",
        backgroundImage:
          "radial-gradient(ellipse at 50% 42%, #14141C 0%, #0A0A0E 68%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* corner HUD */}
      <div
        style={{
          position: "absolute",
          top: 42,
          left: 56,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 21,
          letterSpacing: 3,
          color: "#8B8577",
        }}
      >
        CH 07 · SP {stamp}
      </div>
      <div
        style={{
          position: "absolute",
          top: 42,
          right: 56,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 21,
          letterSpacing: 3,
          color: "#8B8577",
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            backgroundColor: recOn ? "#FF3B46" : "#3A1A1E",
          }}
        />
        REC
      </div>

      {/* center title */}
      <div style={{ opacity: in1, transform: `translateY(${(1 - in1) * 26}px)` }}>
        <div
          style={{
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: 12,
            color: "#FFB347",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          PLAY ▶
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 132,
            fontWeight: 900,
            letterSpacing: -3,
            lineHeight: 1,
            color: "#EDE7DC",
            fontFamily: "Inter, system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          DEMO TAPE
        </div>
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            opacity: in2,
          }}
        >
          <div
            style={{
              width: 420,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#1E1E28",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${34 + Math.min(46, frame / 1.2)}%`,
                height: "100%",
                borderRadius: 4,
                backgroundColor: "#FFB347",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 21,
              letterSpacing: 2,
              color: "#8B8577",
            }}
          >
            SIDE A · 1/12
          </span>
        </div>
      </div>

      {/* transport */}
      <div
        style={{
          position: "absolute",
          bottom: 46,
          display: "flex",
          gap: 26,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 24,
          letterSpacing: 4,
          color: "#8B8577",
          opacity: in2,
        }}
      >
        <span>REW ▷▷</span>
        <span style={{ color: "#EDE7DC" }}>PLAY ▶</span>
        <span>STOP ■</span>
        <span>PAUSE ❚❚</span>
      </div>
    </div>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for vhs.
 *
 * Exercises the full-frame children model: `<VHSRip>` wraps a
 * `<TapeScene>` and the worn-tape shader treats EVERYTHING — wave,
 * jitter, crease band, head-switching noise, chroma bloom + RGB
 * aberration, brightness beat, grain, scanlines, vignette, CRT barrel.
 * `speed: 0.9` so the artifacts visibly churn over the 90 frames;
 * `barrel: 0.14` bends the frame into a tube with the dark bezel.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "vhs.preview",
    theme: {
      palette: {
        primary: "#FFB347",
        secondary: "#FF3B46",
        accent: "#FF5722",
        background: "#0A0A0E",
        text: "#EDE7DC",
        muted: "#8B8577",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      speed: 0.9,
      wave: 1.3,
      jitter: 0.7,
      crease: 0.4,
      switching: 0.7,
      switchingHeight: 0.04,
      bloom: 0.5,
      aberration: 3,
      acBeat: 1,
      grain: 0.4,
      scanlines: 0.4,
      vignette: 0.5,
      barrel: 0.14,
      saturation: 0.85,
      exposure: 1.15,
      fadeInFrames: 4,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <VHSRip {...PREVIEW_DEFAULT_PROPS}>
      <TapeScene />
    </VHSRip>
  );
};
