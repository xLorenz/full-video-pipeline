import React from "react";
import { RadialPulseRings } from "../component";

/**
 * Preview composition for radial-pulse-rings — slow continuous sonar
 * with three radar contacts revealed by the sweep.
 *
 * 360 frames (12s @ 30fps). Paces:
 *   - Continuous rings (ringCount: null): one ring emitted every ~1.6s
 *     with a 3.5s travel time, so 2-3 rings are mid-flight at any moment
 *     throughout the WHOLE scene (rings don't stop after a fixed count).
 *   - Slow radar sweep: 6s rotation period, so two full sweeps visible
 *     across the clip. Sweep line + rings fade-to-center/tip via SVG
 *     gradients for a clean "transmission" reading.
 *   - Three radar contacts at angles ~24°, ~150°, ~277° — so they reveal
 *     one each as the sweep passes their angles (one per half-revolution
 *     roughly). Each card floats radially outside its dot, aligned
 *     (left/right/center) by the dot's side, never blocking the dot
 *     nor the center.
 *
 * The published auto-preview clamp renders the first 90 frames (3s) —
 * enough to read the radar identity (node pop, first contact reveal,
 * first ring taper + scanline gradient).
 */
const PREVIEW_COLORS = {
  primary: "#0F1B2D",
  secondary: "#00BFA6",
  accent: "#00BFA6",
  background: "#0A1220",
  text: "#FFFFFF",
  muted: "#9CA3AF",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 28 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "radial-pulse-rings.preview",
    global: { speed: 1.0, delayOffset: 8, easing: "ease-out-cubic" as const },
    theme: { palette: { accent: "#00BFA6" } },
    elements: [
      { id: "node-glyph", text: "" },
      { id: "node-label", text: "SIGNAL LIVE" },
    ],
    extras: {
      ringCount: null,
      ringEmitSeconds: 3.5,
      ringGapSeconds: 1.6,
      ringEasing: "ease-out-cubic",
      ringStrokeWidthPx: 3,
      ringStrokeColor: null,
      ringStartRadiusPx: 80,
      ringMaxRadiusPx: 1500,
      ringGlow: false,
      ringFadeToCenter: true,
      scanlineFadeToTip: true,
      nodeRadiusPx: 56,
      nodeFill: null,
      nodeStroke: null,
      nodeStrokeWidthPx: 0,
      nodeGlow: true,
      nodeLabelPosition: "below",
      nodeLabelGapPx: 28,
      scanline: true,
      scanlineStartSeconds: 0.4,
      scanlineDurationSeconds: 6.0,
      scanlineColor: null,
      scanlineStrokeWidthPx: 2,
      accentColor: null,
      holdAfterLastEmitFrames: 18,
      radarDots: [
        {
          angle: 24,
          radius: 360,
          title: "Contact Alpha",
          description: "Class A transponder — clear signature.",
          color: null,
        },
        {
          angle: 150,
          radius: 420,
          title: "Contact Beta",
          description: "Intermittent pulse, low emission.",
          color: null,
        },
        {
          angle: 277,
          radius: 300,
          title: "Contact Gamma",
          description: "Anomalous cluster at bearing 277.",
          color: null,
        },
      ],
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <RadialPulseRings {...PREVIEW_DEFAULT_PROPS} />;
};
