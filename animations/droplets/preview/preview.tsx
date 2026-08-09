import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { DropletsRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#FFC46B",
  secondary: "#8FB7FF",
  accent: "#FF8A5C",
  background: "#0B1026",
  text: "#F2EFE6",
  muted: "#9AA6C4",
  window: "#FFE3A8",
  windowDim: "#FFC46B",
  skyHigh: "#0B1026",
  skyLow: "#1B2A4A",
  building: "#101A30",
  buildingLit: "#16203A",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 118, body: 26, caption: 18 };

/** A small lit window on a building. */
const Window: React.FC<{ x: number; y: number; on: boolean }> = ({ x, y, on }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 8,
      height: 10,
      borderRadius: 1,
      backgroundColor: on ? PREVIEW_COLORS.window : PREVIEW_COLORS.building,
    }}
  />
);

/** One skyline building with a scatter of lit windows. */
const Building: React.FC<{ left: number; width: number; height: number; windows: Array<[number, number, boolean]> }> = ({
  left,
  width,
  height,
  windows,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      bottom: 0,
      width,
      height,
      backgroundColor: PREVIEW_COLORS.building,
      borderTop: `1px solid ${PREVIEW_COLORS.buildingLit}`,
    }}
  >
    {windows.map(([wx, wy, on], i) => (
      <Window key={i} x={wx} y={wy} on={on} />
    ))}
  </div>
);

/**
 * The scene behind the rainy glass. It is the CALLER'S content —
 * DropletsRip knows nothing about it, it just captures its DOM into a
 * texture and runs the rain over the whole frame. A small entrance
 * animation (headline rise) demonstrates that per-frame styles are
 * captured as-is.
 */
const WindowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const in1 = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const in2 = interpolate(frame, [12, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: PREVIEW_COLORS.skyHigh,
        backgroundImage:
          "linear-gradient(to bottom, #0B1026 0%, #111A33 45%, #1B2A4A 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* moon */}
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 90,
          width: 130,
          height: 130,
          borderRadius: 999,
          backgroundColor: PREVIEW_COLORS.window,
          boxShadow:
            "0 0 60px 24px rgba(255, 227, 168, 0.28), 0 0 140px 60px rgba(255, 227, 168, 0.12)",
        }}
      />
      {/* distant star specks */}
      {[[140, 70], [300, 150], [520, 60], [760, 130], [980, 70], [1560, 120], [1720, 60]].map(
        ([x, y], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 3,
              height: 3,
              borderRadius: 999,
              backgroundColor: "rgba(242, 239, 230, 0.55)",
            }}
          />
        ),
      )}

      {/* skyline */}
      <Building left={-40} width={260} height={330} windows={[[30, 40, true], [70, 90, false], [110, 40, true], [150, 130, true], [190, 80, false], [70, 170, true], [150, 210, false]]} />
      <Building left={200} width={190} height={480} windows={[[24, 50, true], [70, 50, false], [116, 50, true], [24, 120, true], [70, 120, true], [116, 120, false], [24, 190, false], [70, 190, true], [116, 190, true], [24, 260, true], [70, 260, false], [116, 260, true], [70, 330, true]]} />
      <Building left={520} width={240} height={360} windows={[[30, 60, true], [90, 60, false], [150, 60, true], [30, 140, false], [90, 140, true], [150, 140, true], [90, 220, true], [150, 220, false], [30, 240, true]]} />
      <Building left={880} width={300} height={560} windows={[[30, 60, true], [90, 60, true], [150, 60, false], [210, 60, true], [30, 140, false], [90, 140, true], [150, 140, true], [210, 140, false], [30, 220, true], [90, 220, false], [150, 220, true], [210, 220, true], [90, 300, true], [150, 300, false], [210, 300, true], [30, 380, true], [90, 380, true], [150, 380, false], [210, 380, true], [90, 460, true], [150, 460, true]]} />
      <Building left={1180} width={200} height={420} windows={[[30, 50, true], [80, 50, false], [130, 50, true], [30, 130, true], [80, 130, true], [130, 130, false], [30, 210, false], [80, 210, true], [130, 210, true], [30, 290, true], [80, 290, true], [130, 290, false], [30, 350, true]]} />
      <Building left={1500} width={280} height={300} windows={[[40, 60, true], [110, 60, true], [180, 60, false], [40, 140, false], [110, 140, true], [180, 140, true], [40, 220, true], [180, 220, true]]} />
      <Building left={1780} width={220} height={400} windows={[[30, 50, true], [90, 50, false], [150, 50, true], [30, 130, true], [90, 130, true], [150, 130, false], [30, 210, true], [90, 210, false], [150, 210, true], [90, 290, true], [150, 290, true]]} />

      {/* headline block */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 120,
          opacity: in1,
          transform: `translateY(${(1 - in1) * 30}px)`,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 22,
            letterSpacing: 10,
            color: PREVIEW_COLORS.primary,
          }}
        >
          IT'S RAINING OUTSIDE
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 118,
            fontWeight: 900,
            letterSpacing: -3,
            lineHeight: 0.98,
            color: PREVIEW_COLORS.text,
            textShadow: "0 4px 40px rgba(0, 0, 0, 0.55)",
          }}
        >
          RAIN ON THE
          <br />
          WINDOW
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 26,
            color: PREVIEW_COLORS.muted,
            opacity: in2,
          }}
        >
          a night skyline, seen through the glass
        </div>
      </div>

      {/* caption bar */}
      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 48,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 18,
          letterSpacing: 3,
          color: PREVIEW_COLORS.muted,
          opacity: in2,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: PREVIEW_COLORS.accent,
          }}
        />
        droplets · rainy glass treatment
      </div>
    </div>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for droplets.
 *
 * Exercises the full-frame children model: `<DropletsRip>` wraps a
 * `<WindowScene>` and the rainy-glass shader treats EVERYTHING — static
 * drops, running drops with trails, refraction of the skyline through
 * the glass, and a soft edge vignette. `intensity: 0.85` for a solid
 * downpour; `refraction: 0.3` so the lit windows visibly bend; a light
 * `blur` keeps the glass readable while fogging the far corners of the
 * scene.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "droplets.preview",
    theme: {
      palette: {
        primary: "#FFC46B",
        secondary: "#8FB7FF",
        accent: "#FF8A5C",
        background: "#0B1026",
        text: "#F2EFE6",
        muted: "#9AA6C4",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      intensity: 0.85,
      speed: 1.1,
      scale: 0.42,
      dropWidth: 1,
      dropLength: 1.1,
      refraction: 0.3,
      blur: 0.15,
      vignette: 0.35,
      fallSpeed: 1.1,
      wiggle: 1.2,
      staticDrops: 0.5,
      tint: [1, 1, 1] as [number, number, number],
      tintStrength: 0,
      fadeInFrames: 4,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <DropletsRip {...PREVIEW_DEFAULT_PROPS}>
      <WindowScene />
    </DropletsRip>
  );
};
