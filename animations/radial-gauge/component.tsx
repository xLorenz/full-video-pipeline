import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  resolveEasing,
  resolveGlobal,
  resolveSize,
  resolveTheme,
  resolveTiming,
  pickColor,
  pickFont,
  type ElementOverride,
  type TemplateConfig,
} from "../_shared";

/**
 * RadialGauge — arc gauge with a count-up in the center.
 *
 * Choreography (120f @ 30fps default, scales with `extras.*`):
 *   1. Anticipation breath (6f)  arc at 0, number faint at `anticipationScale`
 *   2. Entrance pop        (12f) spring scale `anticipationScale` -> 1.0,
 *                                damping 18 (tight, no wobble)
 *   3. Sweep + count-up    (~dur) the arc sweeps 0 -> target fraction and the
 *                                number counts 0 -> `targetValue` on the SAME
 *                                eased timeline (`arcEasing`, default
 *                                ease-out-expo) — the number and the needle
 *                                arrive together, the eye tracking the arc's
 *                                final creep into the target.
 *   4. Land punch          (7f)  micro scale tap 1.0 -> `landPunchScale` -> 1.0
 *                                at `sweepEnd` (the arc's literal arrival)
 *   5. Cap dot             (7f)  the round-cap dot at the arc's leading edge
 *                                pops in once the sweep completes — the one
 *                                signature accent. Off for `segments: 4`.
 *   6. Label reveal        (16f) label lifts in AFTER the arc lands — what
 *                                the number means, never competing with it.
 *
 * The gauge is the hero. The track is quiet (gridline color), the arc is
 * the signature color, everything around it disciplined.
 *
 * SVG, not CSS: the arc draws via `strokeDasharray`/`strokeDashoffset`
 * (circumference-based), so sub-pixel edges stay crisp at any scale and
 * the sweep is frame-exact.
 *
 * Recognized element ids (see animation.md):
 *   - "value"   the number in the center (counted up if extras.countUp=true)
 *   - "label"   sub-caption inside the ring below the number
 *   - "prefix"  symbol before the number (e.g. "$")
 *   - "suffix"  symbol after  the number (e.g. "%", "x")
 *
 * extras.* (declared in config/schema.json):
 *   - targetValue (required), gaugeMax, decimals, durationSeconds, countUp
 *   - prefix, suffix, thousandSeparator, valueFontRole, maxFontPx, rowGapPx
 *   - ringSizePx, strokeWidthPx, segments (1 | 4), showTrack, capDot
 *   - arcColor, trackColor
 *   - arcEasing, pop, anticipationFrames, anticipationScale
 *   - landPunch, landPunchScale, landPunchDurationFrames
 *   - showValue, holdAfterLandFrames, labelAfterLand
 */

export interface RadialGaugeProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

/** The percent symbol is the most common gauge suffix; the arc draws its
 * own "100%" — the target fraction is `targetValue / gaugeMax`. */
export const RadialGauge: React.FC<RadialGaugeProps> = ({ config, styles, fontSizes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  const targetValue = Number(extras.targetValue ?? 0);
  const gaugeMax = Math.max(1, Number(extras.gaugeMax ?? 100));
  const decimals = Math.max(0, Math.min(4, Number(extras.decimals ?? 0)));
  const durSec = Math.max(0.5, Number(extras.durationSeconds ?? 1.6));
  const countUp = extras.countUp !== false;
  const showValue = extras.showValue !== false;
  const prefix = String(extras.prefix ?? "");
  const suffix = String(extras.suffix ?? "");
  const pop = Boolean(extras.pop ?? true);
  const rowGapPx = Number(extras.rowGapPx ?? 24);
  const maxFontPx = Number(extras.maxFontPx ?? 200);
  const thousandSep = (extras.thousandSeparator as string) ?? "";
  const valueFontRole = (extras.valueFontRole as string) === "mono" ? "mono" : "heading";
  const holdAfterLandFrames = Math.max(0, Number(extras.holdAfterLandFrames ?? 24));
  const ringSizePx = Math.max(120, Math.min(1200, Number(extras.ringSizePx ?? 560)));
  const strokeWidthPx = Math.max(8, Math.min(160, Number(extras.strokeWidthPx ?? 44)));
  const segments = Number(extras.segments ?? 1) === 4 ? 4 : 1;
  const showTrack = extras.showTrack !== false;
  const capDot = segments === 1 && extras.capDot !== false;
  const arcColor = pickColor(
    extras.arcColor as string | undefined,
    theme,
    "accent",
    "#FFB300",
  );
  const trackColor = pickColor(
    extras.trackColor as string | undefined,
    theme,
    "gridLine",
    "#1A2744",
  );
  const arcEasing = resolveEasing((extras.arcEasing as never) ?? "ease-out-cubic");
  const anticipationFrames = Math.max(0, Number(extras.anticipationFrames ?? 6));
  const anticipationScale = Number(extras.anticipationScale ?? 0.92);
  const landPunch = extras.landPunch !== false;
  const landPunchScale = Number(extras.landPunchScale ?? 1.02);
  const landPunchDuration = Math.max(1, Number(extras.landPunchDurationFrames ?? 7));
  const labelAfterLand = extras.labelAfterLand !== false;

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const findOv = (id: string): ElementOverride | undefined => overrideMap.get(id);
  const labelText = findOv("label")?.text ?? "";

  const valueTiming = resolveTiming(findOv("value"), g, 8, 24, 0, 6);
  const labelTiming = resolveTiming(findOv("label"), g, 30, 16, 0, 6);

  const valSize = resolveSize(findOv("value"), theme.sizeScale);
  const valFontPx = Math.min(
    maxFontPx,
    valSize.fontSize ?? (fontSizes?.headline ?? 96) * valSize.scale,
  );
  const labelSize = resolveSize(findOv("label"), theme.sizeScale);
  const labelFontPx = labelSize.fontSize ?? (fontSizes?.body ?? 28) * labelSize.scale;

  const valFamily =
    valueFontRole === "mono"
      ? pickFont(null, theme, "mono", "JetBrains Mono")
      : pickFont(null, theme, "heading", "Inter");
  const labelFamily = pickFont(null, theme, "body", "Poppins");
  const valColor = pickColor(findOv("value")?.color, theme, "text", "#FFFFFF");
  const labelColor = pickColor(findOv("label")?.color, theme, "muted", "#9CA3AF");

  // The sweep and the count-up share one eased timeline over
  // [sweepStart, sweepEnd]; land events (punch, cap dot, label) fire at
  // `sweepEnd`, the arc's literal arrival.
  const sweepFrames = Math.round(durSec * fps);
  const sweepStart = valueTiming.delay;
  const sweepEnd = sweepStart + sweepFrames;
  const easedT = interpolate(frame, [sweepStart, sweepEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: arcEasing,
  });
  const p = countUp ? easedT : 1;
  const targetFrac = Math.min(1, Math.max(0, targetValue / gaugeMax));
  const frac = targetFrac * p;
  const currentValue = targetValue * p;
  const currentFormatted = countUp
    ? formatNumber(currentValue, decimals, thousandSep)
    : formatNumber(targetValue, decimals, thousandSep);

  const finalDigitChars = formatNumber(targetValue, decimals, thousandSep)
    .replace(/[.,\s]/g, "")
    .length;
  const minWidthEm = finalDigitChars * 0.62;

  const tEntry = sweepStart - anticipationFrames;
  const valOpacity = interpolate(
    frame,
    [tEntry, tEntry + Math.max(6, sweepFrames / 3)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const popSpring = pop
    ? spring({
        frame,
        fps,
        delay: tEntry,
        config: { damping: 18, mass: 1, stiffness: 140 },
        durationInFrames: Math.max(16, sweepFrames),
        from: anticipationScale,
        to: 1,
      })
    : 1;
  const popScale = typeof popSpring === "number" && isFinite(popSpring) ? popSpring : 1;
  const punchT = interpolate(
    frame,
    [sweepEnd, sweepEnd + landPunchDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const punchEnvelope = landPunch
    ? interpolate(punchT, [0, 0.5, 1], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : 0;
  const punchScale = 1 + (landPunchScale - 1) * punchEnvelope;
  const valueScale = popScale * punchScale;

  // Cap dot — the signature. Pops at the leading edge of the arc once the
  // sweep completes, on a tight spring.
  const capPop = spring({
    frame,
    fps,
    delay: sweepEnd,
    config: { damping: 10, mass: 1, stiffness: 170 },
  });
  const capScale = typeof capPop === "number" && isFinite(capPop) ? capPop : 0;

  const labelAfterLandOffset = 2;
  const labelStart = labelAfterLand
    ? sweepEnd + labelAfterLandOffset
    : labelTiming.delay;
  const labelDur = labelTiming.duration;
  const labelOpacity = interpolate(
    frame, [labelStart, labelStart + labelDur], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const labelY = interpolate(
    frame, [labelStart, labelStart + labelDur], [16, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  void holdAfterLandFrames;

  // Gauge geometry. The SVG is pixel-sized and centered; the arc sweeps
  // from 12 o'clock clockwise.
  const size = ringSizePx * theme.sizeScale;
  const center = size / 2;
  const r = (size - strokeWidthPx) / 2;
  const C = 2 * Math.PI * r;
  const sweepDeg = frac * 360;
  const dashLen = C * frac;
  const startAngle = -90;
  const capAngle = ((startAngle + sweepDeg) * Math.PI) / 180;
  const capX = center + r * Math.cos(capAngle);
  const capY = center + r * Math.sin(capAngle);
  // The bead must be LARGER than the arc's round cap (cap radius =
  // strokeWidth/2) or the arc tip swallows it entirely. 0.66x stroke
  // yields a visible gold collar around the tip.
  const capR = strokeWidthPx * 0.66;

  const quadrants = segments === 4 ? [0, 1, 2, 3] : [];
  const gapDeg = 3;
  const quarterLen = (C * (90 - 2 * gapDeg)) / 360;
  const quarterPath = (i: number): string => {
    const a0 = ((-90 + i * 90 + gapDeg) * Math.PI) / 180;
    const a1 = ((-90 + (i + 1) * 90 - gapDeg) * Math.PI) / 180;
    const x0 = center + r * Math.cos(a0);
    const y0 = center + r * Math.sin(a0);
    const x1 = center + r * Math.cos(a1);
    const y1 = center + r * Math.sin(a1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size}>
          {showTrack ? (
            segments === 4 ? (
              quadrants.map((i) => (
                <path
                  key={i}
                  d={quarterPath(i)}
                  fill="none"
                  stroke={trackColor}
                  strokeWidth={strokeWidthPx}
                  strokeLinecap="round"
                  opacity={0.55}
                  strokeDasharray={`${quarterLen.toFixed(2)} ${C.toFixed(2)}`}
                />
              ))
            ) : (
              <circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={trackColor}
                strokeWidth={strokeWidthPx}
                opacity={0.55}
              />
            )
          ) : null}
          {segments === 4 ? (
            quadrants.map((i) => {
              const segFrac = Math.min(1, Math.max(0, (frac - i / 4) * 4));
              return (
                <path
                  key={`f${i}`}
                  d={quarterPath(i)}
                  fill="none"
                  stroke={arcColor}
                  strokeWidth={strokeWidthPx}
                  strokeLinecap="round"
                  strokeDasharray={`${(quarterLen * segFrac).toFixed(2)} ${quarterLen.toFixed(2)}`}
                  opacity={segFrac > 0.002 ? 1 : 0}
                />
              );
            })
          ) : (
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeWidthPx}
              strokeLinecap="round"
              strokeDasharray={`${dashLen.toFixed(2)} ${C.toFixed(2)}`}
              transform={`rotate(-90 ${center} ${center})`}
              opacity={frac > 0.002 ? 1 : 0}
            />
          )}
          {capDot ? (
            <g transform={`translate(${capX} ${capY}) scale(${capScale}) translate(${-capX} ${-capY})`}>
              <circle cx={capX} cy={capY} r={capR} fill={arcColor} />
            </g>
          ) : null}
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          {showValue ? (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                fontFamily: valFamily,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 800,
                fontSize: valFontPx,
                color: valColor,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                opacity: valOpacity,
                scale: valueScale,
                whiteSpace: "nowrap",
              }}
            >
              {prefix ? (
                <span style={{ color: arcColor, marginRight: "0.04em" }}>{prefix}</span>
              ) : null}
              <span
                style={{
                  display: "inline-block",
                  textAlign: "center",
                  minWidth: `${minWidthEm}em`,
                }}
              >
                {currentFormatted}
              </span>
              {suffix ? (
                <span style={{ color: arcColor, marginLeft: "0.04em" }}>{suffix}</span>
              ) : null}
            </div>
          ) : null}
          {labelText ? (
            <div
              style={{
                fontFamily: labelFamily,
                fontSize: labelFontPx,
                fontWeight: 500,
                color: labelColor,
                opacity: labelOpacity,
                translate: `0 ${labelY}px`,
                marginTop: showValue ? rowGapPx : 0,
                maxWidth: size * 0.62,
                textAlign: "center",
                letterSpacing: "0.01em",
              }}
            >
              {labelText}
            </div>
          ) : null}
        </div>
      </div>
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
