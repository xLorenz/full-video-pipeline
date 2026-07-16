import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveTiming,
  resolveEasing,
  resolvePosition,
  resolveSize,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
  type ResolvedGlobal,
  type EasingName,
} from "../_shared";

/**
 * RightWrongCard — judge-style two-card verdict reveal.
 *
 * Two cards slide in from opposite sides, hover briefly, then the verdict
 * drops (winner glows; loser desaturates + shrinks). The verdict stamp
 * can be a check/cross, a shake-out, or a glowing border ring. Aimed at
 * "which one is correct?" / "X vs Y" / "the right way vs the wrong way"
 * scenes that recur in educational and list-style videos.
 *
 * Recognized element ids (see animation.md):
 *   - "left-label"     headline text on the left card
 *   - "left-body"      supporting body text on the left card
 *   - "right-label"    headline text on the right card
 *   - "right-body"    supporting body text on the right card
 *   - "verdict-stamp"  the verdict glyph ("✓" / "✗") that drops in
 *
 * extras.* (declared in config/schema.json):
 *   - leftIsWinner:       boolean         (REQUIRED — which card is correct)
 *   - stampStyle:         "stamp" | "shake" | "glow" | "none"
 *   - stampGlyph:         string           (e.g. "✓" or "✔" — falls back per card)
 *   - stampForce:         number           (0..1 stamp pop intensity)
 *   - cardPaddingPx:      number           (gut card content padding)
 *   - cardGapPx:          number           (gap between the two cards)
 *   - cornerRadiusPx:    number
 *   - bgRgbaAlpha:        number           (0..1 — backplate opacity under cards)
 *   - loserDesaturate:    boolean
 *   - loserShrink:        number           (scale factor applied to the losing card after verdict)
 *   - winnerGlowWidthPx:  number           (for stampStyle="glow")
 */

export interface RightWrongCardProps {
  config: TemplateConfig;
  /** Theme source (per-video styles.ts). Templates import COLORS/FONTS at the
   *  call site and pass them in so the component stays free of side-effecty
   *  imports — keeps preview.tsx able to render in isolation. */
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  /** Optional FONT_SIZES map (per-video). Pass-through to size scaling; not
   *  stored on the config so the same config is portable across videos. */
  fontSizes?: Record<string, number>;
}

const ELEM_IDS = [
  "left-label",
  "left-body",
  "right-label",
  "right-body",
  "verdict-stamp",
] as const;

interface ResolvedElement {
  id: string;
  text: string;
  timing: { delay: number; duration: number; easing: EasingName };
  color: string | null;
  position: { x: number; y: number } | null;
  size: { fontSize: number | null; scale: number };
  hidden: boolean;
}

function findOverride(config: TemplateConfig, id: string): ElementOverride | undefined {
  return config.elements?.find((e) => e.id === id);
}

const DefaultCardText = {
  "left-label": "Wrong way",
  "left-body": "What you've been doing",
  "right-label": "Right way",
  "right-body": "What actually works",
  "verdict-stamp": "",
} as const;

const DefaultTimings: Record<string, { delay: number; duration: number }> = {
  "left-label": { delay: 6, duration: 14 },
  "left-body": { delay: 14, duration: 12 },
  "right-label": { delay: 12, duration: 14 },
  "right-body": { delay: 20, duration: 12 },
  "verdict-stamp": { delay: 48, duration: 18 },
};

export const RightWrongCard: React.FC<RightWrongCardProps> = ({
  config,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo<ResolvedGlobal>(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const stampStyle = (extras.stampStyle as string) ?? "stamp";
  const leftIsWinner = Boolean(extras.leftIsWinner ?? false);
  const stampForce = clamp(Number(extras.stampForce ?? 1), 0, 1.5);
  const cardPaddingPx = Number(extras.cardPaddingPx ?? 48);
  const cardGapPx = Number(extras.cardGapPx ?? 64);
  const cornerRadiusPx = Number(extras.cornerRadiusPx ?? 24);
  const bgRgbaAlpha = clamp(Number(extras.bgRgbaAlpha ?? 0.55), 0, 1);
  const loserDesaturate = extras.loserDesaturate !== false; // default true
  const loserShrink = Number(extras.loserShrink ?? 0.92);
  const winnerGlowWidthPx = Number(extras.winnerGlowWidthPx ?? 24);
  const stampGlyph = (extras.stampGlyph as string) ?? "";

  // Resolve each recognized element.
  const resolved: Record<string, ResolvedElement> = {};
  for (const id of ELEM_IDS) {
    const ov = findOverride(config, id);
    const dt = DefaultTimings[id];
    const t = resolveTiming(ov, g, dt.delay, dt.duration, 0, 6);
    resolved[id] = {
      id,
      text: ov?.text ?? DefaultCardText[id as keyof typeof DefaultCardText] ?? "",
      timing: t,
      color: ov?.color ?? null,
      position: resolvePosition(ov),
      size: resolveSize(ov, theme.sizeScale),
      hidden: Boolean(ov?.hidden),
    };
  }

  // Card-level entry animation: both cards slide in horizontally from their
  // outer edges over a short duration, easing out as they settle.
  const cardEnterDuration = Math.round(20 * g.speed);
  const cardEnterDelay = 0; // both cards start at scene frame 0
  const leftEnterX = interpolate(
    frame,
    [cardEnterDelay, cardEnterDelay + cardEnterDuration],
    [-640, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: resolveEasing("ease-out-cubic") },
  );
  const rightEnterX = interpolate(
    frame,
    [cardEnterDelay, cardEnterDelay + cardEnterDuration],
    [640, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: resolveEasing("ease-out-cubic") },
  );

  // Verdict moment ~ when the stamp is supposed to be at full opacity.
  const verdictAt = resolved["verdict-stamp"].timing.delay;
  const verdictEnd = verdictAt + resolved["verdict-stamp"].timing.duration;

  // Post-verdict card treatment. Loser desaturates + shrinks linearly from
  // the verdict moment through 12 frames after. Winner optionally gets a glow.
  const postVerdictT = interpolate(
    frame,
    [verdictAt, verdictAt + 12],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const loseWin = (left: boolean) => (left ? leftIsWinner : !leftIsWinner);
  const loserScale = (left: boolean) =>
    loseWin(left) ? 1 : interpolate(postVerdictT, [0, 1], [1, loserShrink]);
  const loserGrayscale = (left: boolean) =>
    loseWin(left) || !loserDesaturate ? 0 : interpolate(postVerdictT, [0, 1], [0, 1]);
  const winnerGlow = (left: boolean) =>
    loseWin(left) && stampStyle === "glow"
      ? interpolate(postVerdictT, [0, 1], [0, winnerGlowWidthPx])
      : 0;

  // Stamp animation: stamp style controls the entrance profile.
  const stampT = interpolate(
    frame,
    [verdictAt, verdictEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: stampStyle === "shake" ? Easing.out(Easing.back(2.5 * stampForce))
            : resolveEasing(resolved["verdict-stamp"].timing.easing) },
  );
  const stampScale = stampStyle === "shake"
    ? interpolate(stampT, [0, 0.4, 1], [0, 1.4 * stampForce, 1])
    : interpolate(stampT, [0, 1], [0, 1]);
  const stampOpacity = clamp(stampT * 2, 0, 1);
  const stampRotate = stampStyle === "shake"
    ? interpolate(stampT, [0, 0.3, 0.55, 0.8, 1], [0, -8, 6, -3, 0])
    : interpolate(stampT, [0, 1], [-12, 0]);

  const winnerColor = pickColor(null, theme, "success", "#10B981");
  const loserColor = pickColor(null, theme, "danger", "#EF4444");
  const accentColor = pickColor(null, theme, "accent", "#FFB300");

  const glyphFor = (left: boolean): string => {
    if (stampGlyph) return stampGlyph;
    return loseWin(left) ? "✓" : "✗";
  };
  const stampColorFor = (left: boolean): string =>
    loseWin(left) ? winnerColor : loserColor;

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const fontSizeBase = fontSizes?.headline ?? 64;
  const bodySizeBase = fontSizes?.body ?? 28;
  const stampSizeBase = fontSizes?.stamp ?? 180;

  const renderCard = (side: "left" | "right") => {
    const left = side === "left";
    const elLabel = resolved[left ? "left-label" : "right-label"];
    const elBody = resolved[left ? "left-body" : "right-body"];
    const enterX = left ? leftEnterX : rightEnterX;
    const scale = loserScale(left);
    const gray = loserGrayscale(left);
    const glow = winnerGlow(left);

    const labelText = elLabel.text;
    const bodyText = elBody.text;
    const labelColor = elLabel.color ?? (loseWin(left) ? winnerColor : loserColor);
    const labelOpacity = interpolate(
      frame,
      [elLabel.timing.delay, elLabel.timing.delay + elLabel.timing.duration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const labelY = interpolate(
      frame,
      [elLabel.timing.delay, elLabel.timing.delay + elLabel.timing.duration],
      [elLabel.size.fontSize ? 0 : 18, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const bodyOpacity = interpolate(
      frame,
      [elBody.timing.delay, elBody.timing.delay + elBody.timing.duration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    const labelFz = elLabel.size.fontSize ?? fontSizeBase * elLabel.size.scale;
    const bodyFz = elBody.size.fontSize ?? bodySizeBase * elBody.size.scale;

    const cardBg = pickColor(null, theme, "background", "#0A1220");
    const cardBorder = loseWin(left)
      ? winnerColor
      : interpolate(gray, [0, 1], [192, 96]) < 128
        ? accentColor
        : "rgba(255,255,255,0.18)";

    return (
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: left ? "50%" : "50%",
          width: `calc(50% - ${cardGapPx / 2}px)`,
          height: "70%",
          transform: `translate(${left ? "-100%" : "0%"}, -50%) translateX(${enterX}px) scale(${scale})`,
          borderRadius: cornerRadiusPx,
          padding: cardPaddingPx,
          background: cardBg,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          filter: `grayscale(${gray})`,
          border: `${loseWin(left) ? 3 : 1}px solid ${cardBorder}`,
          boxShadow: glow > 0
            ? `0 0 ${glow}px ${winnerColor}, 0 0 ${glow * 2}px ${winnerColor}`
            : `0 8px 24px rgba(0,0,0,${bgRgbaAlpha})`,
          opacity: interpolate(frame, [0, cardEnterDuration], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        {!elLabel.hidden && (
          <div
            style={{
              fontFamily: headingFont,
              fontWeight: 700,
              fontSize: labelFz,
              color: labelColor,
              lineHeight: 1.1,
              marginBottom: 16,
              opacity: labelOpacity,
              transform: `translateY(${labelY}px)`,
            }}
          >
            {labelText}
          </div>
        )}
        {!elBody.hidden && (
          <div
            style={{
              fontFamily: bodyFont,
              fontWeight: 500,
              fontSize: bodyFz,
              color: pickColor(elBody.color, theme, "text", "#FFFFFF"),
              opacity: bodyOpacity,
              lineHeight: 1.3,
              maxWidth: 540,
            }}
          >
            {bodyText}
          </div>
        )}
        {/* Verdict stamp overlay (this card's verdict, if any) */}
        {!resolved["verdict-stamp"].hidden && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) rotate(${stampRotate}deg) scale(${stampScale})`,
              fontSize: stampSizeBase * resolved["verdict-stamp"].size.scale,
              fontFamily: headingFont,
              fontWeight: 900,
              color: stampColorFor(left),
              opacity: loseWin(left) || loseWin(!left) ? stampOpacity : 0,
              textShadow: loseWin(left) ? `0 0 24px ${winnerColor}` : "none",
              pointerEvents: "none",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            {glyphFor(left)}
          </div>
        )}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {renderCard("left")}
      {renderCard("right")}
    </AbsoluteFill>
  );
};

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
