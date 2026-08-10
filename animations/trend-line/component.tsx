import React, { useId, useMemo } from "react";
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
 * TrendLine — draw-on line chart with gradient area, popping data dots,
 * an end-value count-up and an optional goal line.
 *
 * Choreography (150f @ 30fps default, scales with `extras.*`):
 *   1. Title lift        (14f) the title fades + lifts in (if any)
 *   2. Chart furniture    (8f) gridlines + axis labels fade in quietly
 *   3. Draw-on           (~dur) the line draws left->right via
 *                                stroke-dashoffset over the hand-computed
 *                                path length; the gradient area follows
 *                                under a clip that advances with the draw.
 *   4. Dot pops           (per point) each data dot springs in the frame the
 *                                leading edge passes it (arc-length paced).
 *   5. End value          (0.9s) the last point's value counts up in a mono
 *                                chip beside the final dot — the signature
 *                                beat: the trend "lands" as a number.
 *   6. Goal line          (20f)  the dashed reference line draws in after the
 *                                series completes, tagged with `goalLabel`
 *                                (accent) — the "here's the target" moment.
 *   7. Label lift         (16f)  the sub-caption lifts in after the line.
 *
 * Everything SVG, everything frame-derived — deterministic, crisp at any
 * scale. The line is the hero; the grid stays quiet (gridline color).
 *
 * Recognized element ids (see animation.md):
 *   - "title"  heading above the chart (optional)
 *   - "label"  sub-caption below the chart (optional)
 *
 * extras.* (declared in config/schema.json):
 *   - points (required), labels, yMin, yMax
 *   - drawSeconds, drawEasing, drawDelayFrames
 *   - showArea, areaOpacity, showDots, dotPop, dotSizePx, lineWidthPx
 *   - showGrid, xLabels, yLabels
 *   - showGoal, goalValue, goalLabel
 *   - endCountUp, endCountUpSeconds, valueFormat
 *   - lineColor, gridColor, holdAfterDrawFrames, labelAfterDraw
 */

export interface TrendLineProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const EASE_OUT_EXPO = Easing.out(Easing.exp);

const CHART_LEFT = 230;
const CHART_RIGHT = 1690;
const CHART_TOP = 250;
const CHART_BOTTOM = 860;
const CHART_W = CHART_RIGHT - CHART_LEFT;
const CHART_H = CHART_BOTTOM - CHART_TOP;

export const TrendLine: React.FC<TrendLineProps> = ({ config, styles, fontSizes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const svgId = useId().replace(/[^a-zA-Z0-9]/g, "");

  const pointsRaw = Array.isArray(extras.points) ? (extras.points as unknown[]) : [];
  const points = pointsRaw
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .slice(0, 24);
  const labels = Array.isArray(extras.labels) ? (extras.labels as unknown[]).map(String) : [];
  const n = points.length;

  const drawSec = Math.max(0.5, Number(extras.drawSeconds ?? 1.8));
  const drawEasing = resolveEasing((extras.drawEasing as never) ?? "ease-out-cubic");
  const drawDelayFrames = Math.max(0, Math.round(Number(extras.drawDelayFrames ?? 10)));
  const showArea = extras.showArea !== false;
  const areaOpacity = Math.min(1, Math.max(0, Number(extras.areaOpacity ?? 0.32)));
  const showDots = extras.showDots !== false;
  const dotPop = extras.dotPop !== false;
  const dotSizePx = Math.max(2, Math.min(32, Number(extras.dotSizePx ?? 10)));
  const lineWidthPx = Math.max(2, Math.min(24, Number(extras.lineWidthPx ?? 6)));
  const showGrid = extras.showGrid !== false;
  const xLabelsOn = extras.xLabels !== false;
  const yLabelsOn = extras.yLabels !== false;
  const showGoal = extras.showGoal === true;
  const goalValue = Number(extras.goalValue ?? NaN);
  const goalLabel = String(extras.goalLabel ?? "GOAL");
  const endCountUp = extras.endCountUp !== false;
  const endCountUpSec = Math.max(0.3, Number(extras.endCountUpSeconds ?? 0.9));
  const valueFormat = (extras.valueFormat as string) ?? "int";
  const holdAfterDrawFrames = Math.max(0, Number(extras.holdAfterDrawFrames ?? 24));
  const labelAfterDraw = extras.labelAfterDraw !== false;
  const lineColor = pickColor(
    extras.lineColor as string | undefined,
    theme,
    "accent",
    "#FFB300",
  );
  const gridColor = pickColor(
    extras.gridColor as string | undefined,
    theme,
    "gridLine",
    "#1A2744",
  );

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const findOv = (id: string): ElementOverride | undefined => overrideMap.get(id);
  const titleText = findOv("title")?.text ?? "";
  const labelText = findOv("label")?.text ?? "";

  const titleTiming = resolveTiming(findOv("title"), g, 6, 14, 0, 6);
  const labelTiming = resolveTiming(findOv("label"), g, 40, 16, 0, 6);

  const titleSize = resolveSize(findOv("title"), theme.sizeScale);
  const titleFontPx = titleSize.fontSize ?? (fontSizes?.title ?? 52) * titleSize.scale;
  const labelSize = resolveSize(findOv("label"), theme.sizeScale);
  const labelFontPx = labelSize.fontSize ?? (fontSizes?.body ?? 28) * labelSize.scale;

  const titleFamily = pickFont(null, theme, "heading", "Inter");
  const labelFamily = pickFont(null, theme, "body", "Poppins");
  const monoFamily = pickFont(null, theme, "mono", "JetBrains Mono");
  const titleColor = pickColor(findOv("title")?.color, theme, "text", "#FFFFFF");
  const labelColor = pickColor(findOv("label")?.color, theme, "muted", "#9CA3AF");

  // ---- Data geometry (deterministic) ----
  const goalIncluded = showGoal && Number.isFinite(goalValue);
  const lo = Math.min(...points, goalIncluded ? goalValue : Infinity);
  const hi = Math.max(...points, goalIncluded ? goalValue : -Infinity);
  const extYMin = Number(extras.yMin);
  const extYMax = Number(extras.yMax);
  const hasYMin = Number.isFinite(extYMin);
  const hasYMax = Number.isFinite(extYMax);
  let yMin = hasYMin ? extYMin : lo;
  let yMax = hasYMax ? extYMax : hi;
  if (yMax - yMin < 1e-9) {
    yMin -= 1;
    yMax += 1;
  }
  if (!hasYMin) {
    const pad = (yMax - yMin) * 0.08;
    yMin = yMin - pad;
  }
  if (!hasYMax) {
    const pad = (yMax - yMin) * 0.08;
    yMax = yMax + pad;
  }

  const xs = (i: number) => (n <= 1 ? CHART_LEFT + CHART_W / 2 : CHART_LEFT + (CHART_W * i) / (n - 1));
  const ys = (v: number) => CHART_BOTTOM - ((v - yMin) / (yMax - yMin)) * CHART_H;

  const polyline = points.map((v, i) => `${xs(i).toFixed(2)} ${ys(v).toFixed(2)}`);
  const pathD = `M ${polyline.join(" L ")}`;
  // The area needs a CLOSED path down to the chart base — an open
  // polyline would fill the triangle bounded by the closing chord
  // between first and last point instead of reaching the x-axis.
  const areaPathD =
    n >= 2
      ? `${pathD} L ${xs(n - 1).toFixed(2)} ${CHART_BOTTOM} L ${xs(0).toFixed(2)} ${CHART_BOTTOM} Z`
      : pathD;
  const cumLen: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < n; i++) {
    cumLen.push(totalLen);
    if (i < n - 1) {
      const dx = xs(i + 1) - xs(i);
      const dy = ys(points[i + 1]) - ys(points[i]);
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }
  }

  // ---- Timeline ----
  const drawDur = Math.round(drawSec * fps);
  const drawStart = drawDelayFrames * g.speed + g.delayOffset;
  const drawEnd = drawStart + drawDur;
  const drawT = interpolate(frame, [drawStart, drawEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: drawEasing,
  });
  const dashOffset = totalLen * (1 - drawT);

  // Furniture fades in with the draw's first frames (quiet, 8f).
  const furnitureOpacity = interpolate(
    frame,
    [drawStart, drawStart + Math.min(8, drawDur / 2)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const titleOpacity = interpolate(
    frame,
    [titleTiming.delay, titleTiming.delay + titleTiming.duration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const titleY = interpolate(
    frame,
    [titleTiming.delay, titleTiming.delay + titleTiming.duration],
    [18, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // End value: counts up in a mono chip beside the final dot once the
  // line has fully drawn. The signature beat — the trend lands as a number.
  const endCountFrames = Math.round(endCountUpSec * fps);
  const endT = interpolate(frame, [drawEnd, drawEnd + endCountFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT_EXPO,
  });
  const endValue = n > 0 ? points[n - 1] * endT : 0;
  // Fade the chip in over the first frames of the count so the "0" never
  // flashes — by the time it's opaque the value has visibly started.
  const endOpacity = interpolate(
    frame,
    [drawEnd, drawEnd + 8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Goal line draws in after the series completes.
  const goalStart = drawEnd + 6;
  const goalDur = 20;
  const goalT = interpolate(frame, [goalStart, goalStart + goalDur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const goalOpacity = interpolate(
    frame,
    [goalStart, goalStart + Math.min(6, goalDur)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Label lifts in after the line completes (or at its authored delay).
  const labelAfterLandOffset = 4;
  const labelStart = labelAfterDraw
    ? drawEnd + labelAfterLandOffset
    : labelTiming.delay;
  const labelOpacity = interpolate(
    frame, [labelStart, labelStart + labelTiming.duration], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const labelY = interpolate(
    frame, [labelStart, labelStart + labelTiming.duration], [14, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  void holdAfterDrawFrames;

  const gridQs = [0.25, 0.5, 0.75, 1];
  const gridLines = gridQs.map((q) => yMin + (yMax - yMin) * q);
  const labelStep = n > 8 ? 2 : 1;

  const goalY = goalIncluded ? ys(goalValue) : CHART_TOP;
  const goalValueText = goalIncluded ? formatValue(goalValue, valueFormat) : "";
  // Tag shows the value too — a bare label leaves the line's level unreadable
  // (the axis only ticks quarter-gridlines). Skip the duplicate when the
  // label already contains the formatted value.
  const goalTagText =
    goalIncluded && goalValueText && !goalLabel.includes(goalValueText)
      ? `${goalLabel} ${goalValueText}`
      : goalLabel;
  // The goal value lands between axis ticks (e.g. 50 between 45 and 60) —
  // echo it as an accent Y-axis label so the line provably sits at its value.
  const goalOnGrid = gridLines.some((gv) => Math.abs(gv - goalValue) < 1e-6);

  if (n < 2) {
    return (
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          fontFamily: monoFamily,
          fontSize: 28,
          fontWeight: 500,
          color: labelColor,
          letterSpacing: "0.06em",
        }}
      >
        NO DATA
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {titleText ? (
        <div
          style={{
            position: "absolute",
            top: 84,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: titleFamily,
            fontSize: titleFontPx,
            fontWeight: 700,
            color: titleColor,
            letterSpacing: "0.02em",
            opacity: titleOpacity,
            translate: `0 ${titleY}px`,
          }}
        >
          {titleText}
        </div>
      ) : null}

      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id={`area-${svgId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={areaOpacity} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
          <clipPath id={`clip-${svgId}`}>
            <rect x={CHART_LEFT} y={0} width={CHART_W * drawT} height={1080} />
          </clipPath>
          <clipPath id={`goal-clip-${svgId}`}>
            <rect x={CHART_LEFT} y={0} width={CHART_W * goalT} height={1080} />
          </clipPath>
        </defs>

        {showGrid ? (
          <g opacity={furnitureOpacity}>
            {gridLines.map((v, i) => {
              const y = ys(v);
              return (
                <g key={i}>
                  <line
                    x1={CHART_LEFT}
                    y1={y}
                    x2={CHART_RIGHT}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={2}
                    opacity={0.3}
                  />
                  {yLabelsOn ? (
                    <text
                      x={CHART_LEFT - 14}
                      y={y + 8}
                      textAnchor="end"
                      fill={gridColor}
                      fontFamily={monoFamily}
                      fontSize={22}
                      fontWeight={500}
                      opacity={0.85}
                    >
                      {formatValue(v, valueFormat)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : null}

        {xLabelsOn && labels.length > 0 ? (
          <g opacity={furnitureOpacity} fontFamily={labelFamily} fontSize={22} fill={gridColor}>
            {labels.map((t, i) => {
              if (i % labelStep !== 0 && i !== n - 1) return null;
              return (
                <text
                  key={i}
                  x={xs(i)}
                  y={CHART_BOTTOM + 42}
                  textAnchor="middle"
                  fontWeight={500}
                >
                  {t}
                </text>
              );
            })}
          </g>
        ) : null}

        {showArea && n >= 2 ? (
          <g clipPath={`url(#clip-${svgId})`}>
            <path d={areaPathD} fill={`url(#area-${svgId})`} stroke="none" />
          </g>
        ) : null}

        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth={lineWidthPx}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${totalLen.toFixed(2)} ${totalLen.toFixed(2)}`}
          strokeDashoffset={dashOffset}
          opacity={drawT > 0.004 ? 1 : 0}
        />

        {showDots
          ? points.map((v, i) => {
              const dotFrac = totalLen > 0 ? cumLen[i] / totalLen : i / Math.max(n - 1, 1);
              const dotFrame = drawStart + drawDur * dotFrac;
              const s = dotPop
                ? spring({
                    frame,
                    fps,
                    delay: dotFrame,
                    config: { damping: 12, mass: 1, stiffness: 150 },
                  })
                : 1;
              const sNum = typeof s === "number" && isFinite(s) ? s : 1;
              const visible = dotPop ? frame >= dotFrame - 1 : true;
              return (
                <circle
                  key={i}
                  cx={xs(i)}
                  cy={ys(v)}
                  r={dotSizePx / 2}
                  fill={lineColor}
                  opacity={visible ? Math.min(1, Math.max(0, sNum)) : 0}
                  transform={`translate(${xs(i)} ${ys(v)}) scale(${sNum}) translate(${-xs(i)} ${-ys(v)})`}
                />
              );
            })
          : null}

        {goalIncluded ? (
          <g opacity={goalOpacity}>
            <g clipPath={`url(#goal-clip-${svgId})`}>
              <line
                x1={CHART_LEFT}
                y1={goalY}
                x2={CHART_RIGHT}
                y2={goalY}
                stroke={lineColor}
                strokeWidth={3}
                strokeDasharray="16 12"
              />
            </g>
            {/* Tag floats ABOVE the line's LEFT end — the right end is where
                the series lands (final dot + end-value chip), so a right-side
                tag would sit on top of the graphics. */}
            <text
              x={CHART_LEFT}
              y={goalY - 14}
              textAnchor="start"
              fill={lineColor}
              fontFamily={monoFamily}
              fontSize={22}
              fontWeight={700}
              letterSpacing="0.08em"
            >
              {goalTagText}
            </text>
            {!goalOnGrid && goalValueText ? (
              <text
                x={CHART_LEFT - 14}
                y={goalY + 8}
                textAnchor="end"
                fill={lineColor}
                fontFamily={monoFamily}
                fontSize={22}
                fontWeight={500}
              >
                {goalValueText}
              </text>
            ) : null}
          </g>
        ) : null}

        {endCountUp && n > 0 ? (
          <text
            x={xs(n - 1)}
            y={ys(points[n - 1]) - 14}
            textAnchor="middle"
            fill={lineColor}
            fontFamily={monoFamily}
            fontSize={34}
            fontWeight={700}
            style={{ fontVariantNumeric: "tabular-nums" }}
            opacity={endOpacity}
          >
            {formatValue(endValue, valueFormat)}
          </text>
        ) : null}
      </svg>

      {labelText ? (
        <div
          style={{
            position: "absolute",
            top: CHART_BOTTOM + 96,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: labelFamily,
            fontSize: labelFontPx,
            fontWeight: 500,
            color: labelColor,
            opacity: labelOpacity,
            translate: `0 ${labelY}px`,
            letterSpacing: "0.01em",
          }}
        >
          {labelText}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

function formatValue(v: number, format: string): string {
  switch (format) {
    case "decimals1":
      return v.toFixed(1);
    case "decimals2":
      return v.toFixed(2);
    case "percent":
      return `${Math.round(v)}%`;
    case "compact":
      if (Math.abs(v) >= 1e6) {
        const m = v / 1e6;
        return `${Math.abs(m) >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
      }
      if (Math.abs(v) >= 1e3) {
        const k = v / 1e3;
        return `${Math.abs(k) >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
      }
      return `${Math.round(v)}`;
    default:
      return `${Math.round(v)}`;
  }
}
