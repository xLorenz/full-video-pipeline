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
  resolveTheme,
  resolveGlobal,
  resolveTiming,
  resolveSize,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * CountUpStat — big numerical reveal.
 *
 * Choreography (90f @ 30fps default, scales with `extras.*`):
 *   1. Anticipation breath   (6f)  number at `anticipationScale`, opacity 0
 *   2. Entrance pop           (12f) spring scale `anticipationScale` -> 1.0,
 *                                  damping 18 (tight, no wobble)
 *   3. Count-up               (~dur) ease-out-expo 0 -> target. Eases saturate
 *                                  early, so the eye sees the number "land" at
 *                                  `landFrame` (~62% of the count-up span).
 *   4. Land punch             (7f)  micro scale tap 1.0 -> `landPunchScale` ->
 *                                  1.0 on `landFrame` (sublime, ~2% tap)
 *   5. Accent hairline        (18f) 2px underline draws in beneath the number,
 *                                  centered, ease-out-quint
 *   6. Label reveal           (16f) label fades + lifts in AFTER the number
 *                                  lands — the "reveal what the number means"
 *                                  beat, never competing with the count-up
 *
 * The number is the hero. Everything around it is quiet and disciplined. The
 * hairline is the one signature element — restrained, accent-colored, draws
 * in once and holds.
 *
 * Digit-width jitter fix: the digit span is `inline-block` with
 * `text-align: center` and a `min-width` reserved to the final formatted
 * target width (in em units, scaled from the_digit count). As commas appear
 * mid-count the number stays anchored to the centre — no horizontal jitter
 * when crossing a group boundary (e.g. 999,999 -> 1,000,000).
 *
 * `holdAfterCountUpFrames` holds the static landed frame so the brain has
 * time to register the value before the scene cuts; the direction rubric
 * leans toward longer holds; never shorter.
 *
 * Recognized element ids (see animation.md):
 *   - "value"   the number (counted up if extras.countUp=true)
 *   - "label"   sub-caption below the number
 *   - "prefix"  symbol before the number (e.g. "$")
 *   - "suffix"  symbol after  the number (e.g. "%", "x")
 *
 * extras.* (declared in config/schema.json):
 *   - targetValue, decimals, durationSeconds, countUp
 *   - prefix, suffix, pop, valueFontRole, rowGapPx, maxFontPx, thousandSeparator
 *   - holdAfterCountUpFrames
 *   - showAccentLine (boolean, default true)        draw the hairline accent
 *   - accentLineDelayFrames (number, default 0)     extra delay after land
 *   - accentLineDurationFrames (number, default 18)
 *   - accentLineWidthPct (number 0-100, default 62) width as % of value bbox
 *   - accentLineThicknessPx (number, default 2)
 *   - landPunch (boolean, default true)             micro scale tap on land
 *   - landPunchScale (number, default 1.02)
 *   - landPunchDurationFrames (number, default 7)
 *   - anticipationFrames (number, default 6)       breath-in before pop
 *   - anticipationScale (number, default 0.92)
 *   - labelAfterLand (boolean, default true)        hold label until value lands
 */

export interface CountUpStatProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// ease-out-expo gives the signature crawl-into-the-final-digit feel.
// ease-out-quint damps the hairline draw-in (a touch slower than the count).
const EASE_OUT_EXPO = Easing.out(Easing.exp);
const EASE_OUT_QUINT = Easing.out(Easing.poly(5));

// Perceptual land point — the eye sees the number "arrive" at the point where
// the eased value crosses ~95%. For ease-out-expo this is ~62% of the span.
// Land events (punch, hairline, label) fire from `landFrame`, not `countEnd`,
// so there is no dead air between the perceived arrival and the underline.
const LAND_FRACTION = 0.62;

export const CountUpStat: React.FC<CountUpStatProps> = ({ config, styles, fontSizes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
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
  const rowGapPx = Number(extras.rowGapPx ?? 24);
  const maxFontPx = Number(extras.maxFontPx ?? 240);
  const thousandSep = (extras.thousandSeparator as string) ?? "";
  const valueFontRole = (extras.valueFontRole as string) === "mono" ? "mono" : "heading";
  const holdAfterCountUpFrames = Math.max(0, Number(extras.holdAfterCountUpFrames ?? 24));

  // Signature + land-punch + entrance knobs.
  const showAccentLine = extras.showAccentLine !== false;
  const accentLineDelay = Math.max(0, Number(extras.accentLineDelayFrames ?? 0));
  const accentLineDuration = Math.max(1, Number(extras.accentLineDurationFrames ?? 18));
  const accentLineWidthPct = Math.min(100, Math.max(0, Number(extras.accentLineWidthPct ?? 62)));
  const accentLineThickness = Math.max(1, Number(extras.accentLineThicknessPx ?? 2));
  const landPunch = extras.landPunch !== false;
  const landPunchScale = Number(extras.landPunchScale ?? 1.02);
  const landPunchDuration = Math.max(1, Number(extras.landPunchDurationFrames ?? 7));
  const anticipationFrames = Math.max(0, Number(extras.anticipationFrames ?? 6));
  const anticipationScale = Number(extras.anticipationScale ?? 0.92);
  const labelAfterLand = extras.labelAfterLand !== false;

  // Element overrides folded into a Map for O(1) lookup.
  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const findOv = (id: string): ElementOverride | undefined => overrideMap.get(id);
  const labelText = findOv("label")?.text ?? "";

  // "value" timing drives the count-up span; "label" lifts in after the land.
  const valueTiming = resolveTiming(findOv("value"), g, 6, 20, 0, 6);
  const labelTiming = resolveTiming(findOv("label"), g, 22, 14, 1, 6);

  const valSize = resolveSize(findOv("value"), theme.sizeScale);
  const labelSize = resolveSize(findOv("label"), theme.sizeScale);

  const valFontPx = Math.min(
    maxFontPx,
    valSize.fontSize ?? (fontSizes?.headline ?? 96) * valSize.scale,
  );
  const labelFontPx = labelSize.fontSize ?? (fontSizes?.body ?? 28) * labelSize.scale;

  // When thousand-separator digits need column alignment, switch to the
  // mono font (falls back to JetBrains Mono if the project defines none).
  const valFamily = valueFontRole === "mono"
    ? pickFont(null, theme, "mono", "JetBrains Mono")
    : pickFont(null, theme, "heading", "Inter");
  const labelFamily = pickFont(null, theme, "body", "Poppins");
  const valColor = pickColor(findOv("value")?.color, theme, "text", "#FFFFFF");
  const labelColor = pickColor(findOv("label")?.color, theme, "muted", "#9CA3AF");
  const accentColor = pickColor(null, theme, "secondary", "#00BFA6");

  // Count-up: ease-out-expo 0 -> target. Eases saturate early (expo hits
  // 99% by ~53% of duration), so we split the timeline:
  //   - `countEnd`  = the mathematical end (the eased value finally equals 1.0)
  //   - `landFrame` = the perceptual land (~62% through, where the eye reads
  //                   completion). All land events — punch, hairline, label —
  //                   fire from `landFrame`, so there is no perceived dead air
  //                   between "the number arrives" and "the underline draws".
  //   The remaining ~38% of the eased curve silently crawls from ~95% to
  //   100% — sub-pixel, imperceptible. Reads as the number settling into
  //   place alongside the underline drawing in.
  const countupFrames = Math.round(durSec * fps);
  const countStart = valueTiming.delay;
  const countEnd = countStart + countupFrames;
  const landFrame = countStart + Math.round(countupFrames * LAND_FRACTION);
  const easedT = interpolate(frame, [countStart, countEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT_EXPO,
  });
  const currentValue = countUp ? targetValue * easedT : targetValue;
  const finalFormatted = formatNumber(targetValue, decimals, thousandSep);
  const currentFormatted = countUp
    ? formatNumber(currentValue, decimals, thousandSep)
    : finalFormatted;

  // Reserve digit-column width from the FINAL formatted string so commas
  // appearing mid-count never shift the centre. minWidth is in em units so
  // it scales with the font-size cap. 0.62em is the tabular-nums digit
  // advance for most sans/mono faces at heavy weights (digit width tighter
  // than 1ch when letterSpacing is -0.02em).
  const finalDigitChars = finalFormatted.replace(/[.,\s]/g, "").length;
  const minWidthEm = finalDigitChars * 0.62;

  // Anticipation: number is held at `anticipationScale`, opacity 0, for
  // `anticipationFrames` before the entrance pop. A held breath — gives the
  // eye a beat to find the centre and stores energy for the entrance.
  const tEntry = countStart - anticipationFrames;
  const valOpacity = interpolate(
    frame,
    [tEntry, tEntry + Math.max(6, countupFrames / 3)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Entrance pop: spring scale settle from `anticipationScale` -> 1.0.
  // Damping 18 / stiffness 140 = tight, fast settle with no wobble. The
  // number arrives as a solid object rather than a synthetic bounce.
  const popSpring = pop
    ? spring({
        frame,
        fps,
        delay: tEntry,
        config: { damping: 18, mass: 1, stiffness: 140 },
        durationInFrames: Math.max(16, countupFrames),
        from: anticipationScale,
        to: 1,
      })
    : 1;
  const popScale = typeof popSpring === "number" && isFinite(popSpring) ? popSpring : 1;

  // Land punch: micro scale tap once the number *visibly* lands. 1 ->
  // landPunchScale -> 1 across `landPunchDuration` frames, symmetric (ease
  // in-out cubic so the tap and the return mirror). 1.02 ≈ a 2-pixel tap
  // on a 200px number — enough that the eye registers weight without it
  // reading as a bounce. Fire from `landFrame` (perceptual), not `countEnd`.
  const punchT = interpolate(
    frame,
    [landFrame, landFrame + landPunchDuration],
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

  // Accent hairline — the signature. 2px accent underline, centred under the
  // number, width = `accentLineWidthPct` of the resolved font-size (a soft
  // proxy for the number bbox). Grows via scaleX 0 -> 1 with ease-out-quint
  // so the draw-in slows as it reaches full width (matches eye sweep).
  // Opacity fades open over the first 4 frames to avoid a hard pop.
  const accentStart = landFrame + accentLineDelay;
  const accentT = interpolate(
    frame,
    [accentStart, accentStart + accentLineDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT_QUINT },
  );
  const accentOp = interpolate(
    frame,
    [accentStart, accentStart + Math.min(4, accentLineDuration)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const accentWidthPx = (valFontPx * accentLineWidthPct) / 100;

  // Label: lift + fade, fired from `landFrame` (NOT the authored delay) when
  // `labelAfterLand` is true. The label reveals *what the number means* — it
  // must follow the number's arrival, not compete with it. Callers who want
  // the label up early can pass `labelAfterLand: false` and use the normal
  // `labelTiming.delay`.
  const labelAfterLandOffset = 2;
  const labelStart = labelAfterLand
    ? landFrame + labelAfterLandOffset
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

  // `holdAfterCountUpFrames` is observed by the scene-level DurationInFrames
  // (the template renders the static landed frame for `holdAfterCountUpFrames`
  // after `countEnd`). We expose it here so callers composing custom scenes
  // understand the contract; nothing to apply at render time.
  void holdAfterCountUpFrames;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Number assembly: prefix | digits | suffix, baseline-aligned and
          centred as one block. The digit span reserves its final width so
          commas appearing mid-count never shift the centre of mass. */}
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
          <span style={{ color: accentColor, marginRight: "0.04em" }}>{prefix}</span>
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
          <span style={{ color: accentColor, marginLeft: "0.04em" }}>{suffix}</span>
        ) : null}
      </div>

      {/* Accent hairline — the signature. Thin, accent-coloured, draws in
          once the number lands and holds. The one piece of decoration
          outside the number itself. */}
      {showAccentLine ? (
        <div
          style={{
            width: accentWidthPx,
            height: accentLineThickness,
            backgroundColor: accentColor,
            marginTop: Math.round(rowGapPx * 0.55),
            opacity: accentOp,
            transform: `scaleX(${accentT})`,
            transformOrigin: "center",
            borderRadius: accentLineThickness / 2,
          }}
        />
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
            marginTop: showAccentLine ? Math.round(rowGapPx * 0.45) : rowGapPx,
            maxWidth: 800,
            textAlign: "center",
            letterSpacing: "0.01em",
          }}
        >
          {labelText}
        </div>
      ) : null}
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
