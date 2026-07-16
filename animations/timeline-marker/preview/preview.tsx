import React from "react";
import { TimelineMarker } from "../component";

const PREVIEW_COLORS = {
  primary: "#0F1B2D", secondary: "#00BFA6", accent: "#FFB300",
  background: "#0A1220", text: "#FFFFFF", muted: "#9CA3AF",
  danger: "#EF4444", success: "#10B981", gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 96, body: 36 };

export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "timeline-marker.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "event-3", color: "#10B981" },
    ],
    extras: {
      foregroundLabel: "A decade of progress",
      events: [
        { label: "2015", caption: "Idea" },
        { label: "2018", caption: "Build" },
        { label: "2021", caption: "Launch" },
        { label: "2025", caption: "Scale" },
      ],
      staggerSeconds: 0.35,
      dotRadiusPx: 22,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <TimelineMarker {...PREVIEW_DEFAULT_PROPS} />;
};
