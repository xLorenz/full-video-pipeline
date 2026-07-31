import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveTiming,
  resolveEasing,
  resolveSize,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * CountUpStat — big numerical reveal with count-up digits, optional prefix/suffix,
 * and a sub-label.
 *
 * Recognized element ids (see animation.md):
 *   - "value"     the number (or text) — counts up if extras.countUp=true
 *   - "label"      sub-caption under the number
 *   - "prefix"     symbol before the number (e.g.  "$")
 *   - "suffix"     symbol after the number (e.g.  "%", "x")
 *
 * extras.* (declared in config/schema.json):
 *   - targetValue:    number        (REQUIRED when countUp=true)
 *   - decimals:       integer 0-4  (default 0)
 *   - durationSeconds: number 0.5-30 (default 1.5) — count-up span
 *   - countUp:        boolean
 *   - prefix, suffix: string
 *   - pop:            boolean      scale-from-zero entry
 *   - popForce:       number 0-2   intro pop intensity
 *   - rowGapPx:       number
 *   - maxFontPx:      number       cap the resolved font-size of the number
 *   - thousandSeparator: "," | "." | "" (default "")
 */

export interface CountUpStatProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

export const CountUpStat: React.FC<CountUpStatProps> = ({ config, styles, fontSizes }) => {
  const frame = useCurrentFrame();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const targetValue = Number(extras.targetValue ?? 0);
  const decimals = Math.max(0, Math.min(4, Number(extras.decimals ?? 0)));
  const durSec = Math.max(0.5, Number(extras.durationSeconds ?? 1.5));
  const countUp = extras.countUp !== false;
  const prefix = String(extras.prefix ?? "");
  const suffix = String(extras.suffix ?? "");
  const pop = Boolean(extras.pop ?? true);
  const popForce = Math.max(0, Math.min(2, Number(extras.popForce ?? 1)));
  const rowGapPx = Number(extras.rowGapPx ?? 24);
  const maxFontPx = Number(extras.maxFontPx ?? 240);
  const thousandSep = (extras.thousandSeparator as string) ?? "";

  const findOv = (id: string): ElementOverride | undefined =>
    config.elements?.find((e) => e.id === id);
  const labelText = findOv("label")?.text ?? "";

  // "value" timing drives both fade-in and count-up span.
  const valueTiming = resolveTiming(findOv("value"), g, 6, 20, 0, 6);
  const labelTiming = resolveTiming(findOv("label"), g, 22, 14, 0, 6);

  const valSize = resolveSize(findOv("value"), theme.sizeScale);
  const labelSize = resolveSize(findOv("label"), theme.sizeScale);

  const valFontPx = Math.min(
    maxFontPx,
    valSize.fontSize ?? (fontSizes?.headline ?? 96) * valSize.scale,
  );
  const labelFontPx = labelSize.fontSize ?? (fontSizes?.body ?? 28) * labelSize.scale;

  const valFamily = pickFont(null, theme, "heading", "Inter");
  const labelFamily = pickFont(null, theme, "body", "Poppins");
  const valColor = pickColor(findOv("value")?.color, theme, "text", "#FFFFFF");
  const labelColor = pickColor(findOv("label")?.color, theme, "muted", "#4A5568");
  const accentColor = pickColor(null, theme, "accent", "#FFB300");

  // Count-up value interpolates from 0 → targetValue across `durationSeconds`,
  // flat after. When pop=true, the number also pops in via scale-from-zero.
  const fps = 30; // template defaults to 30fps; the FPS measure happens via the
  // scene-level container so this is consistent across videos rendered at the
  // foundation defaults.
  const countupFrames = Math.round(durSec * fps);
  const startFrame = valueTiming.delay;
  const easedT = interpolate(
    frame,
    [startFrame, startFrame + countupFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: resolveEasing("ease-out-cubic"),
    },
  );
  const currentValue = countUp ? targetValue * easedT : targetValue;
  const displayNumber = formatNumber(currentValue, decimals, thousandSep);

  const valueOpacity = interpolate(
    frame,
    [valueTiming.delay, valueTiming.delay + Math.max(6, countupFrames / 3)],
    [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const valueScale = pop
    ? interpolate(frame, [valueTiming.delay, valueTiming.delay + 16],
        [0.6 * popForce, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp",
          easing: resolveEasing("ease-out-back") })
    : 1;
  const labelOpacity = interpolate(
    frame, [labelTiming.delay, labelTiming.delay + labelTiming.duration],
    [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const labelY = interpolate(
    frame, [labelTiming.delay, labelTiming.delay + labelTiming.duration],
    [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
      >
      <div
        style={{
          fontFamily: valFamily,
          fontWeight: 800,
          fontSize: valFontPx,
          color: valColor,
          lineHeight: 1,
          opacity: valueOpacity,
          transform: `scale(${valueScale})`,
          textShadow: `0 0 24px ${accentColor}40`,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: accentColor }}>{prefix}</span>
        {displayNumber}
        <span style={{ color: accentColor }}>{suffix}</span>
      </div>
      {labelText && (
        <div
          style={{
            fontFamily: labelFamily,
            fontSize: labelFontPx,
            color: labelColor,
            opacity: labelOpacity,
            transform: `translateY(${labelY}px)`,
            marginTop: rowGapPx,
            maxWidth: 800,
            textAlign: "center",
          }}
        >
          {labelText}
        </div>
      )}
    </AbsoluteFill>
  );
};

function formatNumber(value: number, decimals: number, thousandSeparator: string): string {
  let s = value.toFixed(decimals);
  if (thousandSeparator) {
    const [intPart, decPart] = s.split(".");
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
    s = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  }
  return s;
}
