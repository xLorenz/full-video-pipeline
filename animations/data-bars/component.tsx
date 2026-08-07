import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveTiming,
  resolveEasing,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
  type EasingName,
} from "../_shared";

/**
 * DataBars — horizontal racing-bar chart for ranked quantities.
 *
 * N horizontal bars stack vertically; each bar's width animates from 0 to
 * its proportional share of the maximum, and the trailing value counts up
 * in lockstep. Bars are colored from a per-index ramp between two bright
 * theme tokens (default `secondary → accent`) so the chart reads as
 * ranked data regardless of the project palette. Per-bar overrides
 * (`element.color` / `custom.color` / `extras.barColor`) win at every tier.
 *
 * Rhythm (built-in):
 *   - Bars enter staggered by `staggerFrames` (default 5).
 *   - Each bar's fill is driven by ONE spring (mass 1, stiffness 100, damping
 *     13 by default). The spring naturally rushes from 0, overshoots ~6%,
 *     and glides back to the target — no eased-fill-plus-spring lego.
 *   - The leader (largest value) gets a one-shot halo pulse timed to the
 *     spring's overshoot peak — a single signature accent, never a batch
 *     glow. `custom.glow: true` opts in a permanent halo on a different bar.
 *   - Labels and value numbers lift into place alongside their bar; the
 *     trailing number ramps in over the back ~35% of the fill so it
 *     doesn't read before the bar is moving.
 *   - `holdAfterFillFrames` (default 18) is the breath that lets the
 *     viewer compare before the scene cuts.
 *
 * Per-element `easing` is honored for the **label lift** and **leader-pulse**
 * envelopes (interpolated segments); the bar fill itself is spring-driven so
 * custom easing is irrelevant to it.
 *
 * Recognized element ids (one per data slot, by index):
 *   - "bar-0", "bar-1", ... up to "bar-{N-1}"
 *   - `text` overrides the bar's label; `color` overrides its bar fill;
 *     `custom.color` is an alternative slot for per-bar color;
 *     `custom.glow: true` opts one bar into a permanent halo (the rest
 *     stay flat, per the no-batch-glow rubric).
 *
 * Required extras:
 *   - values: number[]
 *   - labels: string[]
 *
 * Optional extras (declared in config/schema.json):
 *   - countUp:                  boolean         (default true)
 *   - topN:                     integer 1-9     (default 8)
 *   - barHeightPx:              number 8-200    (default 48)
 *   - barGapPx:                 number 0-80     (default 14)
 *   - barColor:                 hex             (default null → per-index ramp)
 *   - barRampFrom:              hex             (default theme.secondary)
 *   - barRampTo:                hex             (default theme.accent)
 *   - valueFormat:              "int" | "decimals1" | "decimals2" | "percent"
 *   - showValueLabels:          boolean         (default true)
 *   - lanePaddingPx:            number 0-800    (default 140)
 *   - labelGutterPx:            number 0-600    (default 300)
 *   - holdAfterFillFrames:      integer ≥0      (default 18)
 *   - barSpringDamping:         number 4-30     (default 10)
 *   - staggerFrames:            integer 0-30    (default 5)
 *   - fillFrames:               integer 8-90    (default 22)
 *   - accentLeader:             boolean         (default true — auto-halo the largest bar at land)
 *   - trackRoundingPx:          number 0-40    (default 8)
 */

export interface DataBarsProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const slotId = (i: number) => `bar-${i}`;

export const DataBars: React.FC<DataBarsProps> = ({ config, styles, fontSizes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const values = Array.isArray(extras.values) ? (extras.values as number[]) : [];
  const labels = Array.isArray(extras.labels) ? (extras.labels as string[]) : [];
  const countUp = extras.countUp !== false;
  const topN = Math.max(1, Math.min(9, Number(extras.topN ?? 8)));
  const barHeightPx = Math.max(8, Number(extras.barHeightPx ?? 48));
  const barGapPx = Number(extras.barGapPx ?? 14);
  const overrideBarColor = (extras.barColor as string | undefined) ?? null;
  const rampFromOpt = (extras.barRampFrom as string | undefined) ?? null;
  const rampToOpt = (extras.barRampTo as string | undefined) ?? null;
  const valueFormat = (extras.valueFormat as string) ?? "int";
  const showValueLabels = extras.showValueLabels !== false;
  const lanePaddingPx = Number(extras.lanePaddingPx ?? 140);
  const labelGutterPx = Math.max(0, Number(extras.labelGutterPx ?? 300));
  const holdAfterFillFrames = Math.max(0, Number(extras.holdAfterFillFrames ?? 18));
  void holdAfterFillFrames;
  const barSpringDamping = Math.max(4, Math.min(30, Number(extras.barSpringDamping ?? 10)));
  const staggerStep = Math.max(0, Math.min(30, Number(extras.staggerFrames ?? 5)));
  const fillFrames = Math.max(8, Math.min(90, Number(extras.fillFrames ?? 22)));
  const accentLeader = extras.accentLeader !== false;
  const trackRoundingPx = Math.max(0, Math.min(40, Number(extras.trackRoundingPx ?? 8)));

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);

  const visibleIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < Math.min(topN, values.length); i++) {
      const ov = overrideMap.get(slotId(i));
      if (!ov?.hidden) out.push(i);
    }
    return out;
  }, [overrideMap, values.length, topN]);

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const monoFont = pickFont(null, theme, "mono", "JetBrains Mono");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");
  const textColor = pickColor(null, theme, "text", "#FFFFFF");
  const gridLineColor = pickColor(null, theme, "gridLine", "#1A2744");
  // Default ramp = secondary → accent (both bright tokens). Going primary →
  // would render the largest bar as flat dark navy against a dark navy
  // background — invisible. Authors who really want primary in the ramp can
  // pass `barRampFrom: theme.primary` explicitly.
  const rampFrom = rampFromOpt ?? pickColor(null, theme, "secondary", "#00BFA6");
  const rampTo = rampToOpt ?? pickColor(null, theme, "accent", "#FFB300");

  if (visibleIndices.length === 0) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontFamily: bodyFont, fontSize: 26, color: mutedColor, letterSpacing: "0.04em", opacity: 0.7 }}>
          No data
        </div>
      </AbsoluteFill>
    );
  }

  const visibleValues = visibleIndices.map((i) => Number(values[i] ?? 0));
  const maxVal = Math.max(...visibleValues, 1);
  const leaderLocalIdx = visibleValues.reduce((best, v, i) => (v > visibleValues[best] ? i : best), 0);

  // Per-bar color via a perceptual HSL lightness mix across the ramp.
  // The largest bar lands on `accent` (the brighter anchor) so the leader
  // is the most saturated; later, smaller bars sit closer to `secondary`.
  // Per-bar overrides (`element.color` / `custom.color` / `extras.barColor`)
  // win at every precedence tier.
  const rampColor = (i: number): string => {
    if (overrideBarColor) return overrideBarColor;
    const ov = overrideMap.get(slotId(i));
    const perColor = ov?.color ?? (ov?.custom?.color as string | undefined);
    if (perColor) return perColor;
    // Map index 0 → 1 across the *visual* ordering so the bar with the
    // longest fill sits on the bright end of the ramp. We rank by value
    // (descending) rather than array index so a sparse unsorted dataset
    // still produces a coherent brightness gradient — brightest = largest.
    const rankByValue = [...visibleIndices]
      .map((idx, k) => ({ idx, k, v: visibleValues[k] }))
      .sort((a, b) => b.v - a.v);
    const rankPos = rankByValue.findIndex((r) => r.idx === i);
    const t = visibleIndices.length > 1 ? rankPos / (visibleIndices.length - 1) : 0;
    // t=0 → largest. We want the largest on the bright end, so mix toward
    // rampTo (accent) at t=0 and toward rampFrom (secondary) at t=1.
    return mixHex(rampTo, rampFrom, t);
  };

  const barDurDefault = fillFrames;
  const staggerDefault = staggerStep;
  // Reserve room for the trailing value label. Bars are scaled relative
  // to this cap (not 100%), so the leader lands at exactly maxBarWidthPct
  // and smaller bars stay proportional + uncapped. Keeps labels aligned.
  const maxBarWidthPct = 78;

  const bars = visibleIndices.map((idx, i) => {
    const ov = overrideMap.get(slotId(idx));
    const t = resolveTiming(ov, g, 0, barDurDefault, i, staggerDefault);
    const easingFn = resolveEasing((ov?.easing as EasingName | null) ?? g.easing);

    // Real spring landing: replace the broken "eased fill + spring * 0.06"
    // lego (which had a discontinuous lunge at springStart and a stiff snap
    // back) with one spring driving the whole fill. With mass 1, stiffness
    // 60, damping 13 (default `barSpringDamping` was lowered to 13), the
    // spring rises over ~7-8 frames, overshoots softly (~5% in Remotion's
    // parameterization), and *glides* back over the next ~20 frames — the
    // racing-bar "rush, lung, smooth settle" feel. We deliberately use a
    // *low* stiffness (60) because that lengthens the rise + overshoot +
    // settle window, giving the glide-back room to occur; stiffness 100
    // packs everything into ~12 frames and feels snapped. We do NOT pass
    // `durationInFrames` — that parameter stretches the curve to fit a
    // fixed duration and kills the natural settle.
    const landSpring = spring({
      frame,
      fps,
      delay: t.delay,
      config: { damping: barSpringDamping, mass: 1, stiffness: 60 },
    });
    // `landSpring` is 0 before t.delay, rises past 1.0 (overshoot), then
    // glides back to 1.0. We let it ride slightly past 1.0 for the
    // visible overshoot; the downstream `widthStablePct` clamps the
    // value-label position so the number doesn't oscillate (only the
    // bar visually lunges).
    const fillProgress = Math.max(0, landSpring);

    // Scale bars relative to the cap (not 100%), so the leader lands at
    // exactly `maxBarWidthPct` and smaller bars stay proportional + uncapped.
    // This preserves a visible width ladder even when 2nd/3rd place are
    // close to max (would otherwise both clip at the cap and look identical).
    const widthPct = fillProgress * (visibleValues[i] / maxVal) * maxBarWidthPct;
    // Stable width (clamped to the spring's settled target) drives the
    // trailing value-label position so the label sits at the bar's *rest*
    // position and doesn't oscillate during the spring overshoot. After
    // the spring has settled, `fillProgress` ≈ 1.0; during the overshoot,
    // `fillProgress` reads ~1.05 but the label should sit at 1.0.
    const widthStablePct = Math.min(1, fillProgress) * (visibleValues[i] / maxVal) * maxBarWidthPct;

    // Count-up value synced to the clamped fill so the trailing number
    // rises with the bar but doesn't visibly overshoot — only the bar
    // visually lunges past its target and settles back, the number
    // reaches exactly its final value when the spring first crosses 1.0.
    const valueProgress = Math.min(1, fillProgress);
    const currentVal = countUp ? (visibleValues[i] ?? 0) * valueProgress : visibleValues[i] ?? 0;

    // Label lifts into place: 12px up + fade, over the first 14 frames of
    // the bar's life. Reads as the bar *pushing* its label up out of the
    // baseline rather than labels and bars being unrelated.
    const labelOpacity = interpolate(
      frame, [t.delay, t.delay + 14], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const labelY = interpolate(
      frame, [t.delay, t.delay + 14], [12, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easingFn },
    );

    // Value label ramps in over the back ~35% of the fill so the number
    // isn't visible before the bar is moving (avoids a "0 → 0 → 0... →
    // suddenly 88" feel on slow bars).
    const valueAppearAt = t.delay + Math.round(t.duration * 0.65);
    const valueOpacity = interpolate(
      frame, [valueAppearAt, valueAppearAt + 10], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    const labelText = ov?.text && ov.text !== "" ? ov.text : (labels[idx] ?? `Item ${idx + 1}`);

    // Permanent halo (signature accent) only when explicitly opted in.
    const permanentGlow = Boolean(ov?.custom?.glow);
    // Leader auto-halo: a one-shot halo pulse timed to the spring's
    // overshoot peak, so the flash lands exactly when the bar lunges past
    // its target. The spring's overshoot peak time = π / (ω₀ · √(1-ζ²))
    // with ω₀ = √(stiffness/mass), ζ = damping / (2·√(m·k)). For mass=1
    // stiffness=60 that's ω₀=√60≈7.75, so the peak lands roughly at
    //   frame = t.delay + π / (ω₀ · √(1 - ζ²)) · fps
    // Below the overdamped threshold (ζ ≥ 1, damping ≥ 2·√mk ≈ 15.5) there
    // is no overshoot so we fall back to t.duration as the visual "land" mark.
    const k = 60;
    const omega0 = Math.sqrt(k); // mass is 1
    const zeta = barSpringDamping / (2 * omega0);
    const landFrame = zeta >= 1
      ? t.delay + t.duration
      : t.delay + Math.round((Math.PI / (omega0 * Math.sqrt(1 - zeta * zeta))) * fps);
    const isLeader = accentLeader && i === leaderLocalIdx && !permanentGlow;
    const leaderPulse = isLeader
      ? interpolate(
          frame,
          [landFrame - 6, landFrame + 2, landFrame + 24],
          [0, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1) },
        )
      : 0;
    const leaderGlowAlpha = Math.round(leaderPulse * 80);

    return {
      idx, slot: idx,
      widthPct, widthStablePct,
      labelOpacity, labelY,
      valueOpacity,
      color: rampColor(idx),
      permanentGlow,
      leaderGlowAlpha,
      label: labelText,
      currentVal, slotDelay: t.delay,
    };
  });

  const n = bars.length;
  const containerHeight = n * barHeightPx + (n - 1) * barGapPx;
  const labelFontPx = (fontSizes?.body ?? 28) * theme.sizeScale;

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center" }}
    >
      <div
        style={{
          boxSizing: "border-box",
          width: `calc(100% - ${lanePaddingPx}px)`,
          maxWidth: 1500,
          position: "relative",
          height: containerHeight,
        }}
      >
        {bars.map((b) => {
          const trackLeft = labelGutterPx;
          const trackWidthStyle = `calc(100% - ${labelGutterPx}px)`;
          const barW = `${b.widthPct}%`;
          return (
            <div
              key={b.slot}
              style={{
                position: "absolute",
                top: b.idx * (barHeightPx + barGapPx),
                left: 0,
                width: "100%",
                height: barHeightPx,
              }}
            >
              {/* Track is the faint baseline behind each bar. Sits a hair
                  inset from the bar height so the bar reads as a filled
                  measure on top of the empty runway. */}
              <div
                style={{
                  position: "absolute",
                  left: trackLeft,
                  top: 0,
                  width: trackWidthStyle,
                  height: barHeightPx,
                  background: gridLineColor,
                  opacity: 0.5,
                  borderRadius: trackRoundingPx,
                  overflow: "hidden",
                }}
              />

              {/* Label slot — categorical heading family at medium weight
                  so labels read as names, not body copy. Rises into place
                  alongside its bar via labelY. */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  width: labelGutterPx - 24,
                  textAlign: "right",
                  paddingRight: 24,
                  transform: `translateY(calc(-50% + ${b.labelY}px))`,
                  fontFamily: headingFont,
                  fontWeight: 500,
                  fontSize: labelFontPx,
                  color: mutedColor,
                  opacity: b.labelOpacity,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: "0.005em",
                }}
              >
                {b.label}
              </div>

              {/* Bar fill — the racing measure. Width grows from 0 to its
                  proportion of the maximum; the spring excursion in the
                  final ~10 frames visibly overshoots the target then snaps
                  back (the parent has no overflow:hidden so the overshoot
                  shows). */}
              <div
                style={{
                  position: "absolute",
                  left: trackLeft,
                  top: 0,
                  bottom: 0,
                  width: trackWidthStyle,
                  borderRadius: trackRoundingPx,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: barW,
                    background: `linear-gradient(90deg, ${b.color} 0%, ${lighten(b.color, 0.12)} 100%)`,
                    borderRadius: trackRoundingPx,
                    boxShadow: b.permanentGlow
                      ? `0 4px 16px ${b.color}80, 0 0 24px ${b.color}55`
                      : b.leaderGlowAlpha > 0
                        ? `0 4px 16px ${b.color}80, 0 0 28px ${b.color}${alphaHex(b.leaderGlowAlpha)}`
                        : `0 2px 8px ${b.color}33`,
                  }}
                />
              </div>

              {showValueLabels && (
                <div
                  style={{
                    position: "absolute",
                    left: `calc(${labelGutterPx}px + (100% - ${labelGutterPx}px) * ${b.widthStablePct / 100} + 16px)`,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontFamily: monoFont ?? headingFont,
                    fontWeight: 700,
                    fontSize: labelFontPx * 1.0,
                    color: textColor,
                    opacity: b.valueOpacity,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.01em",
                  }}
                >
                  {formatValue(b.currentVal, valueFormat)}
                </div>
              )}
            </div>
          );
        })}
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

/** Linear RGB mix of two hex colors by t ∈ [0,1]. */
function mixHex(aHex: string, bHex: string, t: number): string {
  const a = parseHex(aHex);
  const b = parseHex(bHex);
  const c = [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  return rgbToHex(c[0], c[1], c[2]);
}

/** Lighten a hex color by `amt` (0-1) toward white. */
function lighten(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * amt),
    Math.round(g + (255 - g) * amt),
    Math.round(b + (255 - b) * amt),
  );
}

/** Convert 0-255 alpha to 2-char hex (00-FF). */
function alphaHex(alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  return a.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${cl(r)}${cl(g)}${cl(b)}`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
