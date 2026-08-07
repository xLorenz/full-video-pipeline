import React, { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Easing,
} from "remotion";
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
 * BarCodeScan — barcode segments decode under a scanning beam.
 *
 * N vertical bars sit on a horizontal **spine** (baseline). Bars anchor
 * bottom-aligned to the spine and grow upward; their height reflects
 * `custom.value` when values are present (taller bars for bigger
 * numbers, normalized to `barcodeHeightPct` of canvas), or uniform
 * height otherwise. A **scanline beam** sweeps horizontally across the
 * canvas; as the beam's leading edge crosses each bar's center, the
 * bar **decodes**: a pre-decode brighten builds in the 8 frames before
 * crossing, then a brief bloom flash at crossing, then the bar settles
 * into the decoded accent color with a subtle 6% height-bounce spring.
 * After the scan completes, a `holdAfterScanFrames` breath holds the
 * decoded state so the viewer reads the result.
 *
 * Built for **topic-agnostic "decodes under one sweep / list adds to N
 * / sequential reveal" beats** — ranked spectators, component
 * breakdowns, sequential segments building into a whole.
 *
 * Recognized element ids (one per bar, by index):
 *   - "bar-0", "bar-1", ... up to "bar-(N-1)"
 *   - `text` overrides the bar's label rendered below the spine
 *   - `color` overrides that bar's decoded fill color
 *   - `custom.value` sets the count-up target AND the bar's relative
 *     height (the largest value claims the full `barcodeHeightPct`).
 *   - `custom.width` is a fractional weight controlling the bar's
 *     horizontal thickness relative to the row (default 1).
 *
 * Required extras:
 *   - `barcodeBars`: array of segment labels (becomes the bars)
 *
 * See `config/schema.json` for the full `extras.*` field reference.
 */

export interface BarCodeScanProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const slotId = (i: number) => `bar-${i}`;

const DECODE_FLASH_FRAMES = 14;
const PRE_DECODE_BRIGHTEN_FRAMES = 8;
const HEIGHT_BOUNCE_PEAK = 1.06;

export const BarCodeScan: React.FC<BarCodeScanProps> = ({ config, styles }) => {
  const frame = useCurrentFrame();
  const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  const barcodeLabels = Array.isArray(extras.barcodeBars)
    ? (extras.barcodeBars as string[])
    : [];
  const scanStartSec = Math.max(0, Number(extras.scanStartSeconds ?? 0.5));
  const scanLineSec = Math.max(0.4, Number(extras.scanLineSeconds ?? 2.5));
  const scanEasingName = (extras.scanEasing as EasingName) ?? "ease-in-out";
  const scanWidthPx = Math.max(1, Number(extras.scanWidthPx ?? 3));
  const scanColorOverride = (extras.scanColor as string | undefined) ?? null;
  const scanGlow = extras.scanGlow !== false;
  const barcodeHeightPct = Math.min(80, Math.max(10, Number(extras.barcodeHeightPct ?? 45)));
  const barcodeWidthPct = Math.min(100, Math.max(30, Number(extras.barcodeWidthPct ?? 80)));
  const barBaseWidthPx = Math.max(4, Number(extras.barBaseWidthPx ?? 24));
  const barGapPx = Math.max(0, Number(extras.barGapPx ?? 16));
  const idleColorOverride = (extras.idleColor as string | undefined) ?? null;
  const decodedColorOverride = (extras.decodedColor as string | undefined) ?? null;
  const countUp = extras.countUp !== false;
  const valueFormat = (extras.valueFormat as string) ?? "int";
  const valueFontPx = Math.max(8, Number(extras.valueFontPx ?? 32));
  const labelFontPx = Math.max(8, Number(extras.labelFontPx ?? 22));
  const showValueLabels = extras.showValueLabels !== false;
  const valueLabelColorOverride = (extras.valueLabelColor as string | undefined) ?? null;
  const holdAfterScanFrames = Math.max(0, Number(extras.holdAfterScanFrames ?? 30));
  const showSpineTicks = extras.showSpineTicks !== false;
  void holdAfterScanFrames; // breath is implicit — scene duration owns this

  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const monoFont = pickFont(null, theme, "mono", "JetBrains Mono");
  const idleColor = pickColor(idleColorOverride, theme, "muted", "#9CA3AF");
  const decodedColor = pickColor(decodedColorOverride, theme, "accent", "#00BFA6");
  const scanColor = pickColor(scanColorOverride, theme, "accent", decodedColor);
  const valueLabelColor = pickColor(valueLabelColorOverride, theme, "text", "#FFFFFF");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");
  const spineColor = pickColor(null, theme, "gridLine", "#1A2744");
  const bgColor = pickColor(null, theme, "background", "#0A1220");

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);

  if (barcodeLabels.length === 0) {
    return (
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
        }}
      >
        <div
          style={{
            fontFamily: bodyFont,
            fontSize: 28,
            color: mutedColor,
            letterSpacing: "0.04em",
            opacity: 0.7,
          }}
        >
          No bars
        </div>
      </AbsoluteFill>
    );
  }

  const barCount = barcodeLabels.length;

  // Scanline sweep: 0..1 horizontal progress.
  const scanStartFrame = g.delayOffset + Math.round(scanStartSec * fps * g.speed);
  const scanSpanFrames = Math.round(scanLineSec * fps * g.speed);
  const scanT = interpolate(
    frame,
    [scanStartFrame, scanStartFrame + scanSpanFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: resolveEasing(scanEasingName),
    },
  );

  // Barcode container geometry
  const containerW = Math.round((canvasWidth * barcodeWidthPct) / 100);
  const maxBarH = Math.round((canvasHeight * barcodeHeightPct) / 100);
  const containerLeft = Math.round((canvasWidth - containerW) / 2);
  // Spine (baseline) sits below center so bars have room to grow upward
  // and labels have room below the spine.
  const spineY = Math.round(canvasHeight * 0.62);
  const containerTop = spineY - maxBarH;
  const labelY = spineY + 18;

  // Resolve per-bar overrides
  const barConfigs = barcodeLabels.map((defaultLabel, i) => {
    const ov = overrideMap.get(slotId(i));
    const label =
      ov?.text !== null && ov?.text !== undefined && ov.text !== ""
        ? ov.text
        : defaultLabel;
    const value = typeof ov?.custom?.value === "number" ? Number(ov.custom.value) : null;
    const widthFrac =
      typeof ov?.custom?.width === "number"
        ? Math.max(0.05, Math.min(4, Number(ov.custom.width)))
        : 1;
    const decodedFillColor = pickColor(ov?.color, theme, "accent", decodedColor);
    return { i, label, value, widthFrac, decodedFillColor };
  });

  // Build row geometry. When any bar has `custom.width` set, the row uses
  // weighted (proportional) widths. When no `custom.width` is set on any
  // bar, all bars use the uniform `barBaseWidthPx` (clamped to fit).
  const hasCustomWidth = barConfigs.some((b, i) => {
    const ov = overrideMap.get(slotId(i));
    return typeof ov?.custom?.width === "number";
  });
  const uniformW = Math.min(
    barBaseWidthPx,
    (containerW - (barCount - 1) * barGapPx) / barCount,
  );
  const uniformTotalW = barCount * uniformW + (barCount - 1) * barGapPx;
  const uniformRowStartX = containerLeft + Math.round((containerW - uniformTotalW) / 2);
  const totalWeight = barConfigs.reduce((acc, b) => acc + b.widthFrac, 0);
  const weightedUsableW = containerW - (barCount - 1) * barGapPx;
  const barGeometry: {
    x: number;
    w: number;
    centerX: number;
    heightFactor: number;
  }[] = [];
  let cursor = hasCustomWidth ? containerLeft : uniformRowStartX;
  barConfigs.forEach((b, i) => {
    const w = hasCustomWidth
      ? (b.widthFrac / totalWeight) * weightedUsableW
      : uniformW;
    const centerX = cursor + w / 2;
    barGeometry.push({ x: cursor, w, centerX, heightFactor: 0 });
    cursor += w + barGapPx;
  });

  // Height normalized: only values drive height when at least one is set.
  const anyValue = barConfigs.some((b) => b.value !== null);
  let valueMax = 1;
  if (anyValue) {
    valueMax = Math.max(
      1,
      ...barConfigs.map((b) => (b.value !== null ? Math.abs(b.value) : 0)),
    );
  }
  barConfigs.forEach((b, i) => {
    if (anyValue && b.value !== null) {
      barGeometry[i].heightFactor = Math.abs(b.value) / valueMax;
    } else {
      barGeometry[i].heightFactor = 0.62; // uniform muted height
    }
  });

  // Scanline x position in canvas px.
  const scanX = containerLeft + scanT * containerW;

  // Spine intro alpha — fades in over the first 8% of the sweep.
  const spineAlpha = interpolate(scanT, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Vignette fades in alongside the scan, holds, then remains.
  const vignetteAlpha = interpolate(scanT, [0, 0.12, 0.95, 1], [0, 1, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scanline opacity: fade in fast, fade out at the end.
  const scanlineOpacity = interpolate(
    scanT,
    [0, 0.04, 0.92, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // For each bar, compute decode progress, height with spring bounce,
  // flash brightness, and pre-decode lift.
  const barRender = barConfigs.map((b, i) => {
    const geo = barGeometry[i];
    const centerX = geo.centerX;
    const decodeFrame = scanStartFrame + Math.round(
      ((centerX - containerLeft) / containerW) * scanSpanFrames,
    );
    // Pre-decode brighten begins PRE_DECODE_BRIGHTEN_FRAMES before crossing.
    const preLift = interpolate(
      frame,
      [decodeFrame - PRE_DECODE_BRIGHTEN_FRAMES, decodeFrame],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    // Decode flash: a one-shot bloom peaking near decodeFrame +2 and falling
    // over DECODE_FLASH_FRAMES.
    const flash = interpolate(
      frame,
      [decodeFrame - 1, decodeFrame + 2, decodeFrame + DECODE_FLASH_FRAMES],
      [0, 1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      },
    );
    // Idle→decoded crossfade (alpha) — quick snap at decode, clamped.
    const decodeAlpha = interpolate(
      frame,
      [decodeFrame, decodeFrame + 5],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    // Height bounce: spring that briefly overshoots upward after decode.
    const bounceSpring = spring({
      frame,
      fps,
      delay: decodeFrame,
      durationInFrames: Math.max(16, 26),
      config: { damping: 14, mass: 1, stiffness: 140 },
    });
    const heightBounce = 1 + (HEIGHT_BOUNCE_PEAK - 1) * bounceSpring;
    const baseHeightPx = maxBarH * geo.heightFactor;
    const decodedHeightPx = baseHeightPx * heightBounce;
    const isDecoded = frame >= decodeFrame;
    return {
      ...b,
      geo,
      decodeFrame,
      preLift,
      flash,
      decodeAlpha,
      baseHeightPx,
      decodedHeightPx,
      isDecoded,
    };
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: bgColor }}>
      {/* Ambient background: faint radial vignette under the barcode */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% ${spineY}px, ${withAlpha(scanColor, 0.08 * vignetteAlpha)} 0%, ${withAlpha(scanColor, 0)} 55%)`,
          pointerEvents: "none",
        }}
      />

      {/* Optional spine tick marks (faint, evenly spaced) */}
      {showSpineTicks && (
        <svg
          width={canvasWidth}
          height={canvasHeight}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {Array.from({ length: 25 }).map((_, idx) => {
            const tx = containerLeft + (idx / 24) * containerW;
            return (
              <line
                key={`tick-${idx}`}
                x1={tx}
                y1={spineY - 4}
                x2={tx}
                y2={spineY + 4}
                stroke={withAlpha(spineColor, 1)}
                strokeWidth={1}
                opacity={spineAlpha * 0.5}
              />
            );
          })}
        </svg>
      )}

      {/* Main SVG layer: spine, bars, scanline */}
      <svg
        width={canvasWidth}
        height={canvasHeight}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          {/* Soft horizontal beam gradient for the scanline halo */}
          <linearGradient id="scanBeam" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor={withAlpha(scanColor, 0)} />
            <stop offset="50%" stopColor={withAlpha(scanColor, 0.4)} />
            <stop offset="100%" stopColor={withAlpha(scanColor, 0)} />
          </linearGradient>
          {/* Bloom flash filter for the active bar — feGaussianBlur */}
          <filter id="bloomFlash" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Spine baseline hairline */}
        <line
          x1={containerLeft - 16}
          y1={spineY}
          x2={containerLeft + containerW + 16}
          y2={spineY}
          stroke={withAlpha(spineColor, 1)}
          strokeWidth={1.5}
          opacity={spineAlpha}
        />
        {/* Spine-left and spine-right anchor caps */}
        <line
          x1={containerLeft - 16}
          y1={spineY - 8}
          x2={containerLeft - 16}
          y2={spineY + 8}
          stroke={withAlpha(mutedColor, spineAlpha)}
          strokeWidth={1.5}
          opacity={spineAlpha * 0.8}
        />
        <line
          x1={containerLeft + containerW + 16}
          y1={spineY - 8}
          x2={containerLeft + containerW + 16}
          y2={spineY + 8}
          stroke={withAlpha(mutedColor, spineAlpha)}
          strokeWidth={1.5}
          opacity={spineAlpha * 0.8}
        />

        {/* Bars: idle + decoded bottom-aligned on the spine */}
        {barRender.map((b) => {
          const { x, w } = b.geo;
          // Idle bar — full authored height, faded out as decodeAlpha rises.
          const idleOpacity = 1 - b.decodeAlpha;
          // Pre-decode lift: idle bar brightens slightly before decode.
          const idleColorLift = mixColors(idleColor, scanColor, b.preLift * 0.18);
          return (
            <g key={`bar-${b.i}`}>
              {/* Idle bar */}
              <rect
                x={x}
                y={spineY - b.baseHeightPx}
                width={w}
                height={b.baseHeightPx}
                fill={withAlpha(idleColorLift, 1)}
                opacity={idleOpacity}
              />
              {/* Decoded bar (height-bounced). */}
              <rect
                x={x}
                y={spineY - b.decodedHeightPx}
                width={w}
                height={b.decodedHeightPx}
                fill={withAlpha(b.decodedFillColor, 1)}
                opacity={b.decodeAlpha}
              />
              {/* Decode bloom: a softened duplicate rect tinted white,
                  flashing bright at decode then fading out. */}
              <rect
                x={x - 3}
                y={spineY - b.decodedHeightPx - 3}
                width={w + 6}
                height={b.decodedHeightPx + 6}
                fill={withAlpha("#FFFFFF", b.flash * 0.55)}
                filter="url(#bloomFlash)"
                opacity={b.flash}
              />
              {/* Top cap rule: a small horizontal arc that flashes on decode. */}
              <rect
                x={x}
                y={spineY - b.decodedHeightPx - 2}
                width={w}
                height={2}
                fill={withAlpha("#FFFFFF", 0.85)}
                opacity={b.flash * b.decodeAlpha}
              />
            </g>
          );
        })}

        {/* Scanned trail: a thin vertical guide that follows the scan x,
            fading behind it. Strikes through each decoded bar's center. */}
        {barRender
          .filter((b) => b.isDecoded)
          .map((b) => (
            <line
              key={`trail-${b.i}`}
              x1={b.geo.centerX}
              y1={spineY - b.decodedHeightPx - 6}
              x2={b.geo.centerX}
              y2={spineY + 6}
              stroke={withAlpha(scanColor, 0.25)}
              strokeWidth={1}
              opacity={scanlineOpacity * 0.7}
            />
          ))}

        {/* Scanline beam: vertical line + soft horizontal halo */}
        <g opacity={scanlineOpacity}>
          {/* Soft wide halo */}
          {scanGlow && (
            <rect
              x={scanX - 36}
              y={containerTop - 28}
              width={72}
              height={maxBarH + 56}
              fill="url(#scanBeam)"
              opacity={0.55}
            />
          )}
          {/* Bright vertical line */}
          <line
            x1={scanX}
            y1={containerTop - 24}
            x2={scanX}
            y2={spineY + 24}
            stroke={withAlpha(scanColor, 1)}
            strokeWidth={scanWidthPx}
          />
          {/* Spine tick that follows the beam — a small horizontal mark */}
          <line
            x1={scanX - 14}
            y1={spineY}
            x2={scanX + 14}
            y2={spineY}
            stroke={withAlpha(scanColor, 1)}
            strokeWidth={2}
            opacity={0.9}
          />
          {/* Tiny bright dot at the spine intercept */}
          <circle cx={scanX} cy={spineY} r={4} fill={withAlpha("#FFFFFF", 1)} />
        </g>
      </svg>

      {/* HTML label layer below the spine */}
      {barRender.map((b) => {
        const cx = b.geo.centerX;
        const amp = Math.max(0, b.decodeAlpha);
        // Count-up value from 0 -> value over 16 frames post-decode.
        const labelText = b.label;
        if (showValueLabels && b.value !== null) {
          const countupT = interpolate(
            frame,
            [b.decodeFrame, b.decodeFrame + 18],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const currentVal = countUp ? b.value * countupT : b.value;
          const formatted = formatValue(currentVal, valueFormat);
          // Label structure: small uppercase label, value in mono below
          return (
            <React.Fragment key={`label-${b.i}`}>
              <div
                style={{
                  position: "absolute",
                  left: cx,
                  top: labelY,
                  transform: "translate(-50%, 0)",
                  fontFamily: bodyFont,
                  fontSize: labelFontPx,
                  fontWeight: 600,
                  color: withAlpha(valueLabelColor, 0.78 * amp),
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {b.label}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: cx,
                  top: labelY + labelFontPx + 6,
                  transform: "translate(-50%, 0)",
                  fontFamily: monoFont,
                  fontSize: valueFontPx,
                  fontWeight: 700,
                  color: withAlpha(b.decodedFillColor, amp),
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {formatted}
              </div>
            </React.Fragment>
          );
        }
        return (
          <div
            key={`label-${b.i}`}
            style={{
              position: "absolute",
              left: cx,
              top: labelY,
              transform: "translate(-50%, 0)",
              fontFamily: bodyFont,
              fontSize: labelFontPx,
              fontWeight: 600,
              color: withAlpha(valueLabelColor, 0.78 * amp),
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: amp,
              textAlign: "center",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {labelText}
          </div>
        );
      })}

      {/* Corner stamp: a small scan indicator with a blinking dot */}
      <div
        style={{
          position: "absolute",
          bottom: 36,
          left: 40,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: monoFont,
          fontSize: 14,
          color: mutedColor,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: interpolate(scanT, [0, 0.1], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: scanColor,
            opacity: interpolate(
              scanT,
              [0, 0.1, 0.92, 1],
              [0, 1, 1, 0.3],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        />
        <span>Scan · {Math.round(scanT * 100)}%</span>
      </div>

      {/* Right-edge settling indicator: "DECODED N/M" tally */}
      <div
        style={{
          position: "absolute",
          bottom: 36,
          right: 40,
          fontFamily: monoFont,
          fontSize: 14,
          color: mutedColor,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: interpolate(scanT, [0, 0.1], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {`Decoded ${barRender.filter((b) => b.isDecoded).length}/${barCount}`}
      </div>
    </AbsoluteFill>
  );
};

function formatValue(value: number, fmt: string): string {
  // Negative values render with a leading minus; tabular-nums on the wrapper
  // keeps the column widths stable during the count-up.
  switch (fmt) {
    case "decimals1":
      return value.toFixed(1);
    case "decimals2":
      return value.toFixed(2);
    case "percent":
      return `${Math.round(value)}%`;
    case "int":
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

function withAlpha(hex: string, alpha: number): string {
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  if (/^#([0-9a-fA-F]{8})$/.test(hex)) return hex;
  return hex;
}

function mixColors(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
