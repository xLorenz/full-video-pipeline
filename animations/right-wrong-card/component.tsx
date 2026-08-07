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
  type ResolvedGlobal,
} from "../_shared";

/**
 * RightWrongCard — N-card verdict reveal.
 *
 * Cards slide in from their assigned edge, hold briefly while text fades up,
 * then each card's verdict stamp lands INDEPENDENTLY (so e.g. wrong stamps
 * first, right stamps later). Each card carries its own win/lose/none
 * verdict, stamp timing, effects, and optional custom render-prop content.
 *
 * N-card mode (`extras.cards`):
 *   - Replaces the two-card-only assumption. Cards flow as a row grid;
 *     `placement` overrides default position.
 *   - Each card has INDEPENDENT `verdictAt` so stamps land in sequence.
 *   - Each card has its own verdict stamp, effects, and timing.
 *
 * Legacy mode (no `extras.cards`):
 *   - Detects and synthesizes the old `leftIsWinner` + five-element-id
 *     config into `cards: [{id:"left",...}, {id:"right",...}]` so existing
 *     scenes keep rendering identically.
 *
 * DESIGN — spend the boldness in ONE place. The watermark stamp IS the
 * signature element; everything else is intentionally quiet so the verdict
 * reads at a glance. N cards means N coordinated beats, not a wall of glows.
 *
 * Per-card extras (default overrides):
 *   cardPaddingPx, cardGapPx, cornerRadiusPx, cardElevationPx,
 *   loserDesaturate, loserShrink, loserFade, winnerBorderWidthPx,
 *   watermarkGlyphPx, watermarkOpacity, preEnterHoldFrames,
 *   cardGradient, loserShadowTint, impactFlash.
 * Per-card keys override each from card spec.
 */

type Verdict = "win" | "lose" | "none";
type StampStyle = "stamp" | "shake" | "glow" | "none";

interface CardSpec {
  id: string;
  verdict?: Verdict;
  placement?: "left" | "right" | "top" | "bottom" | number;
  label?: string;
  body?: string;
  labelColor?: string | null;
  bodyColor?: string | null;
  hidden?: boolean;
  enterDelay?: number;
  verdictAt?: number;
  verdictDuration?: number;
  stampGlyph?: string;
  stampStyle?: StampStyle;
  stampForce?: number;
  stampColor?: string | null;
  stampSize?: number;
  stampOpacity?: number;
  winnerBorderWidthPx?: number;
  winnerGlowPx?: number;
}

export interface CardRenderCtx {
  index: number;
  id: string;
  verdict: Verdict;
  isWinner: boolean;
  isLoser: boolean;
  frame: number;
  fps: number;
  verdictAt: number;
  verdictProgress: number;
  cardOpacity: number;
  labelOpacity: number;
  bodyOpacity: number;
  cardBg: string;
  bodyColorToken: string;
  mutedColor: string;
  headingFont: string;
  bodyFont: string;
  fontSizeDisplay: number;
  fontSizeBody: number;
  cardPaddingPx: number;
  cornerRadiusPx: number;
  rect: { x: number; y: number; w: number; h: number };
}

export interface RightWrongCardProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
  /** When provided, replaces the default label+body block with custom JSX per card.
   *  The card's chrome (border, gradient, flash, stamp) still renders around it. */
  renderCard?: (ctx: CardRenderCtx) => React.ReactNode;
}

interface ResolvedCard {
  spec: CardSpec;
  index: number;
  id: string;
  verdict: Verdict;
  isWinner: boolean;
  isLoser: boolean;
  label: string;
  body: string;
  labelColor: string;
  bodyColor: string | null;
  hidden: boolean;
  enterDelay: number;
  verdictAt: number;
  verdictDuration: number;
  stampStyle: StampStyle;
  stampForce: number;
  stampGlyph: string;
  stampColor: string | null;
  stampSizePx: number;
  stampOpacity: number;
  winnerBorderWidthPx: number;
  winnerGlowPx: number;
  placement: number | string;
}

const DefaultTimings: Record<string, { delay: number; duration: number }> = {
  "left-label": { delay: 6, duration: 14 },
  "left-body": { delay: 14, duration: 12 },
  "right-label": { delay: 12, duration: 14 },
  "right-body": { delay: 20, duration: 12 },
  "verdict-stamp": { delay: 48, duration: 18 },
};

const DefaultCardText: Record<string, string> = {
  "left-label": "Old way",
  "left-body": "What you've been doing",
  "right-label": "New way",
  "right-body": "What actually works",
};

function synthesizeLegacyCards(
  config: TemplateConfig,
  extras: Record<string, unknown>,
): CardSpec[] {
  const leftIsWinner = Boolean(extras.leftIsWinner ?? false);
  const overrideMap = new Map<string, ElementOverride>();
  for (const e of config.elements ?? []) overrideMap.set(e.id, e);
  const leg = (id: string) => overrideMap.get(id);
  const t = (id: string, fallback: string) => {
    const ov = leg(id);
    return ov?.text ?? DefaultCardText[id] ?? fallback;
  };
  const stampOv = leg("verdict-stamp");
  const verdictDelay =
    stampOv?.delay ?? DefaultTimings["verdict-stamp"].delay;
  const verdictDur =
    stampOv?.duration ?? DefaultTimings["verdict-stamp"].duration;

  const makeCard = (
    id: string,
    verdict: Verdict,
    labelId: string,
    bodyId: string,
  ): CardSpec => ({
    id,
    verdict,
    label: t(labelId, ""),
    body: t(bodyId, ""),
    labelColor: leg(labelId)?.color ?? null,
    bodyColor: leg(bodyId)?.color ?? null,
    hidden: Boolean(leg(labelId)?.hidden && leg(bodyId)?.hidden),
    enterDelay: undefined,
    verdictAt: verdictDelay,
    verdictDuration: verdictDur,
  });

  return [
    makeCard("left", leftIsWinner ? "win" : "lose", "left-label", "left-body"),
    makeCard("right", leftIsWinner ? "lose" : "win", "right-label", "right-body"),
  ];
}

export const RightWrongCard: React.FC<RightWrongCardProps> = ({
  config,
  styles,
  fontSizes,
  renderCard,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: cW, height: cH } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo<ResolvedGlobal>(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  // ---- Resolve N-card array (legacy or explicit) -------------------------
  const cardGapPx = Number(extras.cardGapPx ?? 64);
  const cornerRadiusPx = Number(extras.cornerRadiusPx ?? 24);
  const cardElevationPx = clamp(Number(extras.cardElevationPx ?? 14), 0, 32);
  const loserDesaturate = extras.loserDesaturate !== false;
  const loserShrink = clamp(Number(extras.loserShrink ?? 0.95), 0, 1.5);
  const loserFade = clamp(Number(extras.loserFade ?? 0.55), 0, 1);
  const cardGradient = extras.cardGradient !== false;
  const loserShadowTint = extras.loserShadowTint !== false;
  const impactFlash = extras.impactFlash !== false;
  const stampOverride = (extras.stampStyle as StampStyle) ?? "stamp";
  const stampForceDefault = clamp(Number(extras.stampForce ?? 1), 0, 2);
  const stampGlyphDefault = (extras.stampGlyph as string) ?? "";
  const watermarkGlyphPx = Math.max(80, Number(extras.watermarkGlyphPx ?? 380));
  const watermarkOpacityDefault = clamp(Number(extras.watermarkOpacity ?? 0.22), 0, 1);
  const winnerBorderW = clamp(Number(extras.winnerBorderWidthPx ?? 4), 0, 10);
  const winnerGlowTop = clamp(Number(extras.winnerGlowPx ?? 40), 0, 96);
  const winnerGlowColor = (extras.winnerGlowColor as string) ?? "";
  const preEnterHoldFrames = Math.max(0, Number(extras.preEnterHoldFrames ?? 12));
  const cardPaddingPx = Number(extras.cardPaddingPx ?? 48);

  const rawCards: CardSpec[] = (extras.cards as CardSpec[] | undefined) ??
    synthesizeLegacyCards(config, extras);

  const cards: ResolvedCard[] = useMemo(() => rawCards.map((c, i) => {
    const isWinner = c.verdict === "win";
    const isLoser = c.verdict === "lose";
    return {
      spec: c,
      index: i,
      id: c.id ?? String(i),
      verdict: c.verdict ?? "none",
      isWinner,
      isLoser,
      label: c.label ?? DefaultCardText[`${c.id}-label`] ?? "",
      body: c.body ?? DefaultCardText[`${c.id}-body`] ?? "",
      labelColor: pickColor(c.labelColor ?? undefined, theme, "text", "#FFFFFF"),
      bodyColor: c.bodyColor ?? null,
      hidden: c.hidden ?? false,
      enterDelay: c.enterDelay ?? 0,
      verdictAt: c.verdictAt ?? DefaultTimings["verdict-stamp"].delay,
      verdictDuration: c.verdictDuration ?? DefaultTimings["verdict-stamp"].duration,
      stampStyle: c.stampStyle ?? stampOverride,
      stampForce: clamp(c.stampForce ?? stampForceDefault, 0, 2),
      stampGlyph: c.stampGlyph ?? stampGlyphDefault,
      stampColor: c.stampColor ?? null,
      stampSizePx: Math.max(80, c.stampSize ?? watermarkGlyphPx),
      stampOpacity: clamp(Number(c.stampOpacity ?? watermarkOpacityDefault), 0, 1),
      winnerBorderWidthPx: clamp(c.winnerBorderWidthPx ?? winnerBorderW, 0, 10),
      winnerGlowPx: clamp(c.winnerGlowPx ?? winnerGlowTop, 0, 96),
      placement: c.placement ?? i,
    };
  }), [rawCards, config, theme, stampOverride, stampForceDefault, stampGlyphDefault,
        watermarkGlyphPx, watermarkOpacityDefault, winnerBorderW, winnerGlowTop]);

  // ---- Layout: row-based grid for N cards -----------------------------
  const N = cards.length;
  const totalGap = cardGapPx * (N - 1);
  const cardW = N <= 4
    ? (cW - (cardGapPx / 2) * 2 - totalGap) / N
    : (cW - (cardGapPx / 2) * 2 - totalGap) / Math.ceil(N / 2);
  const cardH = cH * 0.7;
  const topY = cH * 0.15;
  const startX = cardGapPx / 2;
  const cardRects: Array<{ x: number; y: number; w: number; h: number }> = cards.map((_, i) => ({
    x: startX + i * (cardW + cardGapPx),
    y: topY,
    w: cardW,
    h: cardH,
  }));

  // Card enter timing per card (global stagger)
  const enterDuration = Math.round((20 * fps / 30) * g.speed);
  const enterStart = g.delayOffset + Math.round(preEnterHoldFrames * g.speed);
  const enterEasing = resolveEasing("ease-out-cubic");

  // Palette tokens
  const winnerColor = pickColor(null, theme, "secondary", "#00BFA6");
  const neutralStampColor = pickColor(null, theme, "muted", "#5B6473");
  const cardBg = pickColor(null, theme, "background", "#0A1220");
  const muteColor = pickColor(null, theme, "muted", "#9CA3AF");
  const bodyColorToken = pickColor(null, theme, "text", "#FFFFFF");
  const hairline = `${muteColor}40`;
  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const fontSizeBase = fontSizes?.headline ?? 64;
  const bodySizeBase = fontSizes?.body ?? 28;

  const cardFill = cardGradient
    ? `linear-gradient(180deg, ${liftColor(cardBg, 0.06)} 0%, ${cardBg} 38%, ${darkenColor(cardBg, 0.12)} 100%)`
    : cardBg;

  const cardDrop = cardElevationPx > 0
    ? `0 ${Math.floor(cardElevationPx / 2)}px ${cardElevationPx}px rgba(0,0,0,0.32)`
    : "none";

  function glyphFor(card: ResolvedCard): string {
    if (card.stampGlyph) return card.stampGlyph;
    if (card.isWinner) return "✓";
    if (card.isLoser) return "✗";
    return "";
  }

  function stampColorFor(card: ResolvedCard): string {
    if (card.stampColor) return card.stampColor;
    return card.isWinner ? winnerColor : neutralStampColor;
  }

  function renderOneCard(card: ResolvedCard, r: { x: number; y: number; w: number; h: number }) {
    const enterDelay = card.enterDelay;
    const vi = Math.max(2, Math.round((enterDelay * fps / 30)));
    // All cards enter from slightly below; they lift into place together.
    const cardXSlide = 0;
    const cardYSlide = 80;
    const enterX = interpolate(
      frame,
      [enterStart + vi, enterStart + vi + enterDuration],
      [cardXSlide, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: enterEasing },
    );
    const enterY = interpolate(
      frame,
      [enterStart + vi, enterStart + vi + enterDuration],
      [cardYSlide, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: enterEasing },
    );
    const cardOpacity = interpolate(
      frame,
      [enterStart + vi, enterStart + vi + Math.round(enterDuration * 0.6)],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    // Raw timing for stamp
    const verdictAt = card.verdictAt;
    void card.verdictDuration;

    // Post-verdict window
    const POST_DUR = 14;
    const BORDER_DELAY = Math.round(fps * 0.2 * g.speed);
    const BORDER = verdictAt + BORDER_DELAY;

    // Descent
    const DROP_DUR = Math.max(6, Math.round(fps * 0.27 * g.speed));
    const IMPACT = verdictAt + DROP_DUR;
    const WOBBLE_START = IMPACT - Math.round(fps * 0.04 * g.speed);
    const WOBBLE_DUR = Math.round(fps * 0.7 * g.speed);
    const IMPACT_DUR = Math.round(fps * 0.4 * g.speed);

    // Winner border progress
    const winnerBorderIsActive = card.isWinner && card.winnerBorderWidthPx > 0 && card.stampStyle !== "none";
    const winBorderProgress = interpolate(
      frame, [BORDER, BORDER + POST_DUR], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
    );

    // Post-verdict signal
    const pvT = interpolate(
      frame,
      [verdictAt, verdictAt + POST_DUR],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
    );

    // card opacity falloff
    let loserBodyOpacity = 1;
    if (card.isLoser) {
      loserBodyOpacity = interpolate(pvT, [0, 1], [1, loserFade]);
    }

    const loserG = card.isLoser && loserDesaturate
      ? interpolate(pvT, [0, 1], [0, 0.85])
      : 0;

    const scale = card.isLoser
      ? interpolate(pvT, [0, 1], [1, loserShrink])
      : 1;

    // Stamp extra
    const dropT = interpolate(
      frame, [verdictAt, verdictAt + DROP_DUR], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
    );
    const stampY = interpolate(dropT, [0, 1], [-260, 0]);
    const sOp = clamp(
      interpolate(frame, [verdictAt, verdictAt + 2], [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      0, 1,
    );

    const impactSpringV = spring({
      frame,
      fps,
      delay: IMPACT,
      config: { damping: 13, stiffness: 220, mass: 1 },
      durationInFrames: IMPACT_DUR,
    });
    const impactPop = clamp(impactSpringV, 0, 1.4);
    const ovShoot = 1.18 + card.stampForce * 0.22;
    const sScale =
      frame < IMPACT
        ? 1.0
        : interpolate(impactPop, [0, 0.55, 1.0, 1.25], [1.0, ovShoot, 1.0, 1.03],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

    const wobbleEnv = interpolate(
      frame, [WOBBLE_START, WOBBLE_START + WOBBLE_DUR], [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
    );
    const wobbleFreq = (Math.PI * 2) / (fps * 0.28 * g.speed);
    const shAmp = card.stampStyle === "shake" ? 18 : 9;
    const preTilt = interpolate(frame, [verdictAt, IMPACT], [-22, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
    const wobbleTerm =
      frame >= WOBBLE_START
        ? Math.sin((frame - WOBBLE_START) * wobbleFreq) * shAmp * wobbleEnv
        : 0;
    const sRot = preTilt + wobbleTerm;

    // Impact flash
    const FLASH_PEAK = clamp(Number(extras.impactFlashPeak ?? 0.85), 0, 1);
    const FLASH_DUR = Math.max(4, Math.round(fps * 0.18 * g.speed));
    const iFT = impactFlash && card.stampStyle !== "none"
      ? interpolate(
          frame,
          [IMPACT - 1, IMPACT, IMPACT + FLASH_DUR],
          [0, FLASH_PEAK, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : 0;

    const borderAlpha = card.isWinner
      ? interpolate(winBorderProgress, [0, 1], [0, 1], { extrapolateLeft: "clamp" })
      : 0;
    const borderW = card.isWinner && winnerBorderIsActive
      ? card.winnerBorderWidthPx * winBorderProgress
      : 1;
    const borderStr = card.isWinner && winnerBorderIsActive && winBorderProgress > 0.02
      ? `${borderW.toFixed(2)}px solid ${hexToRgba(winnerColor, Math.max(0.3, borderAlpha))}`
      : `1px solid ${hairline}`;

    // Glow
    const glowC = winnerGlowColor || winnerColor;
    const glowProg = card.isWinner && card.winnerGlowPx > 0 && card.stampStyle !== "none"
      ? interpolate(pvT, [BORDER_DELAY / POST_DUR, 1], [0, 1], { extrapolateLeft: "clamp" })
      : 0;
    const glowPeak = interpolate(glowProg, [0, 0.4, 1], [0, 0, 0.55], { extrapolateLeft: "clamp" });
    const glowRest = card.isWinner && glowProg >= 1 ? 0.16 : 0;
    const glowNow = Math.max(glowPeak, glowRest);
    const glowShadow = card.isWinner && card.winnerGlowPx > 0 && glowNow > 0.01
      ? `0 0 ${card.winnerGlowPx}px ${card.winnerGlowPx * 0.35}px ${hexToRgba(glowC, glowNow)}`
      : "none";

    // Loser shadow
    const lossT = card.isLoser ? pvT : 0;
    const sh = loserShadowTint && card.isLoser ? interpolate(lossT, [0, 1], [0, 0.85], { extrapolateLeft: "clamp" }) : 0;

    const stampVisible = card.stampStyle !== "none" && card.stampStyle !== "glow";
    const sFinalOpacity = stampVisible ? sOp * card.stampOpacity : 0;

    // Text animations
    const labelOpacity = interpolate(
      frame,
      [enterStart + vi, enterStart + vi + 14],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const labelY = interpolate(
      frame,
      [enterStart + vi, enterStart + vi + 14],
      [12, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    const bodyOpacity = interpolate(
      frame,
      [enterStart + vi + 8, enterStart + vi + 20],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const bodyY = interpolate(
      frame,
      [enterStart + vi + 8, enterStart + vi + 20],
      [10, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    // ctx for render-prop
    const ctx: CardRenderCtx = {
      index: card.index,
      id: card.id,
      verdict: card.verdict,
      isWinner: card.isWinner,
      isLoser: card.isLoser,
      frame,
      fps,
      verdictAt,
      verdictProgress: pvT,
      labelOpacity,
      bodyOpacity,
      cardOpacity,
      cardBg,
      bodyColorToken,
      mutedColor: muteColor,
      headingFont,
      bodyFont,
      fontSizeDisplay: fontSizeBase,
      fontSizeBody: bodySizeBase,
      cardPaddingPx,
      cornerRadiusPx,
      rect: r,
    };

    return (
      <div
        key={card.id}
        style={{
          position: "absolute",
          left: r.x,
          top: r.y,
          width: r.w,
          height: r.h,
          borderRadius: cornerRadiusPx,
          translate: `${enterX}px ${enterY}px`,
          scale: String(scale),
          opacity: cardOpacity,
          boxShadow: [cardDrop, glowShadow].filter(s => s !== "none").join(", ") || "none",
          willChange: "translate, scale, opacity, box-shadow",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: cornerRadiusPx,
            padding: cardPaddingPx,
            background: cardFill,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            filter: `grayscale(${loserG})`,
            border: borderStr,
            opacity: loserBodyOpacity,
            overflow: "hidden",
          }}
        >
          {iFT > 0.01 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: cornerRadiusPx,
                background: `radial-gradient(circle at center, ${hexToRgba(stampColorFor(card), iFT)} 0%, ${hexToRgba(stampColorFor(card), iFT * 0.4)} 35%, transparent 70%)`,
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
            />
          )}
          {sh > 0.01 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: cornerRadiusPx,
                background: `linear-gradient(180deg, rgba(0,0,0,${sh * 0.4}) 0%, rgba(0,0,0,${sh * 0.7}) 55%, rgba(0,0,0,${sh}) 100%)`,
                pointerEvents: "none",
              }}
            />
          )}
          {renderCard ? (
            <div style={{ zIndex: 1, textAlign: "center" }}>
              {renderCard(ctx)}
            </div>
          ) : (
            <>
              {!card.hidden && (
                <div
                  style={{
                    fontFamily: headingFont,
                    fontWeight: card.isWinner
                      ? interpolate(winBorderProgress, [0, 1], [500, 700], { extrapolateLeft: "clamp" })
                      : 500,
                    fontSize: fontSizeBase,
                    color: card.labelColor ?? bodyColorToken,
                    lineHeight: 1.15,
                    marginBottom: 14,
                    opacity: labelOpacity,
                    translate: `translate(0, ${labelY}px)`,
                    letterSpacing: card.isWinner
                      ? interpolate(winBorderProgress, [0, 1], ["0.01em", "-0.005em"], { extrapolateLeft: "clamp" })
                      : "0.01em",
                  }}
                >
                  {card.label}
                </div>
              )}
              {!card.hidden && card.body && (
                <div
                  style={{
                    fontFamily: bodyFont,
                    fontWeight: 400,
                    fontSize: bodySizeBase,
                    color: card.bodyColor ?? muteColor,
                    opacity: bodyOpacity,
                    lineHeight: 1.4,
                    maxWidth: 540,
                    translate: `translate(0, ${bodyY}px)`,
                  }}
                >
                  {card.body}
                </div>
              )}
            </>
          )}
        </div>
        {stampVisible && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              opacity: sFinalOpacity,
            }}
          >
            <div
              style={{
                fontFamily: headingFont,
                fontWeight: 900,
                fontSize: card.stampSizePx,
                color: stampColorFor(card),
                translate: `translate(0, ${stampY}px)`,
                rotate: `${sRot}deg`,
                scale: String(sScale),
                lineHeight: 1,
                textShadow: `0 2px 16px ${stampColorFor(card)}55`,
                userSelect: "none",
                whiteSpace: "nowrap",
                transformOrigin: "center",
              }}
            >
              {glyphFor(card)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {cards.map((card, i) =>
        !card.hidden ? renderOneCard(card, cardRects[i]) : null,
      )}
    </AbsoluteFill>
  );
};

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function hexToRgba(hex: string, alpha: number): string {
  const v = clamp(alpha, 0, 1);
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${v.toFixed(2)})`;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${v.toFixed(2)})`;
}

function mixHexLinear(hex: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const t = clamp(amt, -1, 1);
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  const nr = Math.round(r + (target - r) * k);
  const ng = Math.round(g + (target - g) * k);
  const nb = Math.round(b + (target - b) * k);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

const liftColor = (hex: string, amt: number) => mixHexLinear(hex, Math.abs(amt));
const darkenColor = (hex: string, amt: number) => mixHexLinear(hex, -Math.abs(amt));