import React from "react";
import { RightWrongCard } from "../component";

/**
 * Self-contained preview for right-wrong-card.
 *
 * Each template's `preview/preview.tsx` exports a `Preview` React component
 * plus `PREVIEW_DEFAULT_PROPS` (the theme + extras that exercise the template
 * with at least one element override + one theme override + one extras value).
 * The preview step in pipeline.py imports
 * `../components/animations/<template>/preview/preview` via a generated root
 * that registers a `<Composition id="preview-<template>" component={Preview} />`
 * for each template found on disk, then renders each via `npx remotion render`.
 */

const PREVIEW_COLORS = {
  primary: "#0F1B2D",
  secondary: "#00BFA6",
  accent: "#FFB300",
  background: "#0A1220",
  text: "#FFFFFF",
  muted: "#4A5568",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "#1A2744",
};
const PREVIEW_FONTS = { heading: "Inter", body: "Poppins" };
const PREVIEW_FONT_SIZES = { headline: 64, body: 28, stamp: 180 };

// Theme override (deviation from defaults) + per-element text override +
// extras override — preview exercises all three DeepConfig layers.
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "right-wrong-card.preview",
    global: { speed: 1.0, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [
      { id: "left-label",  text: "Old way",           delay: 6,  duration: 14 },
      { id: "left-body",   text: "Manual editing",   delay: 14, duration: 12 },
      { id: "right-label", text: "With us",          delay: 12, duration: 14 },
      { id: "right-body",  text: "Automated pipeline", delay: 20, duration: 12, color: "#00BFA6" },
      { id: "verdict-stamp", text: "",                   delay: 48, duration: 18 },
    ],
    extras: {
      leftIsWinner: true,
      stampStyle: "shake" as const,
      stampForce: 1.2,
      winnerGlowWidthPx: 28,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return <RightWrongCard {...PREVIEW_DEFAULT_PROPS} />;
};
