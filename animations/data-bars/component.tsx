import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveEasing,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
  type EasingName,
} from "../_shared";

/**
 * DataBars — racing bar chart for ranked quantities.
 *
 * Renders N horizontal bars stacked vertically; each bar's width animates from
 * 0 to its proportional share. Bars recolorize per-value via element.custom.color
 * or fall back to a per-index palette slot ("barColor0".."barColor9" on the theme
 * palette). Recognized element ids (one per data slot, by index):
 *   - "bar-0", "bar-1", "bar-2", ... up to "bar-{N-1}"
 * Each bar exposes its `text` for its label and `custom.color` for an individual bar color.
 *
 * Required extras:
 *   - values: number[]        (one peso per bar)
 *   - labels: string[]        (label per bar; same length as values)
 *
 * Optional extras:
 *   - countUp:       boolean
 *   - topN:          integer 1-9  (default 8) — clamp visible bar count; longer
 *                   inputs are kept bottom-of-stack (faded)
 *   - barHeightPx:   number 8-120 (default 48)
 *   - barGapPx:      number 0-40 (default 12)
 *   - barColor:      hex  (default theme.accent) — applies to all bars not overridden
 *   - valueFormat:   "int" | "decimals1" | "decimals2" | "percent" (default "int")
 *   - showValueLabels: boolean  (default true)
 *   - lanePaddingPx: number 0-200 (default 120)
 */

export interface DataBarsProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const slotId = (i: number) => `bar-${i}`;

export const DataBars: React.FC<DataBarsProps> = ({ config, styles, fontSizes }) => {
  const frame = useCurrentFrame();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const values = Array.isArray(extras.values) ? (extras.values as number[]) : [];
  const labels = Array.isArray(extras.labels) ? (extras.labels as string[]) : [];
  const countUp = extras.countUp !== false;
  const topN = Math.max(1, Math.min(9, Number(extras.topN ?? 8)));
  const barHeightPx = Math.max(8, Number(extras.barHeightPx ?? 48));
  const barGapPx = Number(extras.barGapPx ?? 12);
  const barColor = pickColor(extras.barColor as string | undefined, theme, "accent", "#FFB300");
  const valueFormat = (extras.valueFormat as string) ?? "int";
  const showValueLabels = extras.showValueLabels !== false;
  const lanePaddingPx = Number(extras.lanePaddingPx ?? 120);
  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const mutedColor = pickColor(null, theme, "muted", "#4A5568");
  const textColor = pickColor(null, theme, "text", "#FFFFFF");

  const n = Math.max(1, Math.min(values.length || 1, topN));
  const maxVal = Math.max(...values, 1);

  // Lookup element-level override for bar i via custom.color or text.
  const elementFor = (i: number): ElementOverride | undefined =>
    config.elements?.find((e) => e.id === slotId(i));
  const slotColor = (i: number): string => {
    const ov = elementFor(i);
    return ov?.color ?? ov?.custom?.color as string | undefined ?? barColor;
  };
  const slotLabel = (i: number): string => {
    const ov = elementFor(i);
    if (ov?.text !== null && ov?.text !== undefined && ov.text !== "") return ov.text!;
    return labels[i] ?? `Item ${i + 1}`;
  };

  // Per-bar opening stagger — each slot begins 6 frames after the previous
  // (unscaled timing); the parent `global.speed` applies.
  const barDuration = Math.round(28 * g.speed);
  const staggerStep = 6;

  const bars = [];
  for (let i = 0; i < n; i++) {
    const slotDelay = Math.round((i * staggerStep) * g.speed) + g.delayOffset;
    const progress = interpolate(
      frame,
      [slotDelay, slotDelay + barDuration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp",
        easing: resolveEasing((elementFor(i)?.easing as EasingName | null) ?? g.easing) },
    );
    const widthPct = (countUp ? progress : 1) * (values[i] ?? 0) / maxVal * 100;
    const labelOpacity = interpolate(
      frame, [slotDelay, slotDelay + 10], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const valueOpacity = interpolate(
      frame, [slotDelay + 10, slotDelay + barDuration], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const currentVal = countUp ? (values[i] ?? 0) * progress : (values[i] ?? 0);
    bars.push({
      idx: i,
      widthPct,
      labelOpacity,
      valueOpacity,
      color: slotColor(i),
      label: slotLabel(i),
      currentVal,
      slotDelay,
    });
  }

  const containerHeight = (n * barHeightPx) + ((n - 1) * barGapPx);
  const labelFontPx = (fontSizes?.body ?? 22) * theme.sizeScale;

  // Reserve 18% of the available bar track width for the value label so bars
  // never extend under it. This is a fixed visual cap — no new extras key.
  const maxBarWidthPct = 82;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          width: `calc(100% - ${lanePaddingPx}px)`,
          maxWidth: 1400,
          position: "relative",
          height: containerHeight,
          paddingLeft: 280, // room for label gutter
        }}
      >
        {bars.map((b) => (
          <div
            key={b.idx}
            style={{
              position: "absolute",
              top: b.idx * (barHeightPx + barGapPx),
              left: 0,
              width: "100%",
              height: barHeightPx,
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Label slot to the left of the bar */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: 260,
                textAlign: "right",
                paddingRight: 16,
                fontFamily: bodyFont,
                fontSize: labelFontPx,
                color: mutedColor,
                opacity: b.labelOpacity,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {b.label}
            </div>
            <div
              style={{
                position: "absolute",
                left: 280,
                top: 0,
                bottom: 0,
                width: `${Math.min(b.widthPct, maxBarWidthPct)}%`,
                background: b.color,
                borderRadius: 6,
                boxShadow: `0 6px 18px ${b.color}30`,
              }}
            />
            {showValueLabels && (
              <div
                style={{
                  position: "absolute",
                  left: `calc(280px + ${Math.min(b.widthPct, maxBarWidthPct)}% + 14px)`,
                  fontFamily: headingFont,
                  fontWeight: 700,
                  fontSize: labelFontPx * 1.05,
                  color: textColor,
                  opacity: b.valueOpacity,
                  textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                  whiteSpace: "nowrap",
                }}
              >
                {formatValue(b.currentVal, valueFormat)}
              </div>
            )}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

function formatValue(value: number, fmt: string): string {
  switch (fmt) {
    case "decimals1": return value.toFixed(1);
    case "decimals2": return value.toFixed(2);
    case "percent":   return `${value.toFixed(0)}%`;
    case "int":
    default:          return Math.round(value).toLocaleString("en-US");
  }
}
