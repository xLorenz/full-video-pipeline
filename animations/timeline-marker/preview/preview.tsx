import React from "react";
import { AbsoluteFill } from "remotion";
import { TimelineMarker } from "../component";

const PREVIEW_COLORS = {
  primary: "#D7C6B0", // warm sand rail — distinct from default amber, reads as "engraved line"
  secondary: "#00BFA6",
  accent: "#FFB300",
  background: "#0E1014", // near-black with a hint of warm grey
  text: "#F5F1EA", // soft ivory, not pure white — flagship-screen feel
  muted: "#7C7468",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 96, body: 36 };

// 150 frames @ 30fps = 5s — long enough to show sweep (0.9s) + 4 markers drop
// (4 × stagger 0.35s ≈ 1.4s) + the post-land focus pulse + a 1s breath.
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "timeline-marker.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "event-3", color: "#00BFA6" }, // "now" reads as the accent
    ],
    extras: {
      foregroundLabel: "A decade of progress",
      events: [
        { label: "2015", caption: "Idea" },
        { label: "2018", caption: "Build" },
        { label: "2021", caption: "Launch", icon: "✦" },
        { label: "2025", caption: "Scale" },
      ],
      staggerSeconds: 0.35,
      dotRadiusPx: 22,
      trackSweepSeconds: 0.9,
      trackHeightPx: 4,
      // All signature elements exercised by default:
      trackInnerHighlight: true,
      trackLeadingGlow: true,
      trackGlow: false,
      dotRingOnLand: true,
      trackRippleOnLand: true,
      focusPulse: "last",
      holdAfterLastMarkerFrames: 30,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: PREVIEW_COLORS.background,
        // Vignette so the timeline reads as the focal subject on a near-black canvas.
        backgroundImage: `radial-gradient(ellipse 70% 55% at 50% 60%, ${PREVIEW_COLORS.background} 0%, #060708 100%)`,
      }}
    >
      <TimelineMarker {...PREVIEW_DEFAULT_PROPS} />
    </AbsoluteFill>
  );
};
