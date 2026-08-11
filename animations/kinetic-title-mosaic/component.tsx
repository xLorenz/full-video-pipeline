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
  resolveEasing,
  resolveSize,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
  type EasingName,
} from "../_shared";

/**
 * KineticTitleMosaic — multi-word kinetic typography mosaic.
 *
 * Subject: a kinetic *opener* — a phrase that builds word-by-word. Type is
 * the subject. The signature is the build itself: a deliberate phrase-level
 * rhythm plus one tie-together "phrase is whole" beat at the final land.
 *
 * Choreography:
 *   1. Each word flies in on its motion variant + a tight opacity lift that
 *      fully lands before the position reaches 1.0 (no ghosting). The eye
 *      reads the word as solid AS IT arrives, not a ghost trailing the move.
 *   2. `phrasing: "phrase-land"` (default) sequences words so the previous
 *      word's settle has fully landed before the next begins — `phraseLandOverlap`
 *      (0..0.5) gates the overlap window. Strict-at-0 reads Typeracer; ~0.1
 *      reads "rolling reveal"; `phrasing: "staggered"` reverts to the
 *      authored `staggerSeconds` pay-out.
 *   3. The accent word carries a hairline "eyebrow" rule drawn under it in
 *      the accent color — NOT a color swap (`accentStyle: "color"` reverts).
 *      The eyebrow encodes "this is the word to remember" structurally rather
 *      than chromatically — structural reads deliberate where color-swap-on-
 *      dark-bg reads as the AI-default kinetic cliché.
 *   4. On the FINAL word's land, the whole mosaic does one micro settle tap
 *      (1.0 → `finalSettleScale` → 1.0 over `finalSettleFrames`, ease-in-out
 *      cubic) AND the accent eyebrow draws in (synchronised). The tie-together
 *      says "the phrase is whole now" — one signature event, not a collection
 *      of independent word landings.
 *
 * Motion variants (six):
 *   - slide-up      : translateY from below + fade (tighter 0.7× fade window)
 *   - slide-left    : translateX from right + fade
 *   - fade-zoom      : scale 0.6→1 + fade
 *   - mask-wipe     : clip-path inset wipe in `wipeDirection` (left/right/top/bottom)
 *   - blur-burn     : blur 8px→0 + fade (focus pull, not broken broadcast)
 *   - scale-pop     : spring scale 0 → 1; damping 14 stiffness 160 by default
 *
 * Layouts (three):
 *   - stack    : single column, real `wordGapPx` vertical gap (default 8×
 *                tighter reads as one phrase, not a list)
 *   - grid      : gridColumns columns, real `rowGapPx` / `wordGapPx` gaps
 *   - mosaic   : wrapping justified horizontal flow; per-word `weightTier`
 *                 (`"light" | "medium" | "heavy"`) sizes each word so the
 *                 composition looks deliberately composed rather than uniform
 *
 * `holdAfterLandFrames` holds the static landed frame at the end.
 *
 * Non-default design choices (vs. the cliché kinetic opener):
 *   - `textTransform: "none"` (was `"uppercase"`) — sentence-case reads as a
 *      real title, not a YouTube shout.
 *   - `accentStyle: "eyebrow"` (was `"color"`) — the structural accent beats
 *      the chromatic swap.
 *   - The accent default is `accentSide: "below"` — eyebrow under the word.
 *
 * Recognized element ids (one per word slot, by index):
 *   - "word-0", "word-1", ... up to "word-(N-1)"
 *   - `text` overrides the word; `color` overrides the word's color;
 *     `custom.variant` overrides that word's motion variant;
 *     `custom.weight` overrides font weight;
 *     `custom.accent: true` flags the accent word (one per scene);
 *     `custom.weightTier` (mosaic only) scales that word to a deliberate size;
 *     `custom.wipeDirection` (mask-wipe only) sets the wipe side.
 */

export interface KineticTitleMosaicProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

type Variant =
  | "slide-up"
  | "slide-left"
  | "fade-zoom"
  | "mask-wipe"
  | "blur-burn"
  | "scale-pop";

type WipeDir = "left" | "right" | "top" | "bottom";
type Phrasing = "staggered" | "phrase-land";
type AccentSide = "above" | "below";
type WeightTier = "light" | "medium" | "heavy";
type LayoutMode = "stack" | "grid" | "mosaic";

const VALID_VARIANTS: Variant[] = [
  "slide-up", "slide-left", "fade-zoom",
  "mask-wipe", "blur-burn", "scale-pop",
];

const slotId = (i: number) => `word-${i}`;

const isVariant = (v: unknown): v is Variant =>
  typeof v === "string" && (VALID_VARIANTS as string[]).includes(v);

const EASE_OUT_QUINT = Easing.out(Easing.poly(5));

const WEIGHT_SCALES: Record<WeightTier, number> = {
  light: 0.7,
  medium: 1.0,
  heavy: 1.4,
};

function asWeight(w: unknown): WeightTier {
  if (w === "light" || w === "medium" || w === "heavy") return w;
  return "medium";
}

export const KineticTitleMosaic: React.FC<KineticTitleMosaicProps> = ({
  config, styles, fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  const words = Array.isArray(extras.words) ? (extras.words as string[]) : [];
  const defaultVariant = isVariant(extras.defaultVariant) ? (extras.defaultVariant as Variant) : "slide-up";
  const layout = ((extras.layout as string) === "grid" ? "grid"
    : (extras.layout as string) === "mosaic" ? "mosaic" : "stack") as LayoutMode;
  const gridColumns = Math.max(1, Math.min(6, Number(extras.gridColumns ?? 2)));
  const perSlotDurSec = Math.max(0.2, Number(extras.perSlotDurationSeconds ?? 0.5));
  const staggerSec = Math.max(0, Number(extras.staggerSeconds ?? 0.12));
  const wordGapPx = Math.max(0, Number(extras.wordGapPx ?? (layout === "stack" ? 8 : 32)));
  const rowGapPx = Math.max(0, Number(extras.rowGapPx ?? 32));
  const phrasing: Phrasing = (extras.phrasing as string) === "staggered" ? "staggered" : "phrase-land";
  const phraseLandOverlap = Math.min(0.5, Math.max(0, Number(extras.phraseLandOverlap ?? 0.0)));
  const align = (extras.align as string) === "left" ? "left"
    : (extras.align as string) === "right" ? "right" : "center";
  const containerWidthPct = Math.min(100, Math.max(40, Number(extras.containerWidthPct ?? 88)));
  const containerHeightPct = Math.min(100, Math.max(30, Number(extras.containerHeightPct ?? 70)));
  const wordFontRole = (extras.wordFontRole as string) === "body" ? "body" : "heading";
  const accentStyle = (extras.accentStyle as string) === "color" ? "color" : "eyebrow";
  const accentSide: AccentSide = (extras.accentSide as string) === "above" ? "above" : "below";
  const eyebrowThickness = Math.max(1, Math.min(20, Number(extras.eyebrowThicknessPx ?? 3)));
  const eyebrowGapEm = Math.max(0, Math.min(4, Number(extras.eyebrowGapEm ?? 0.18)));
  const textTransform = (extras.textTransform as string) === "uppercase" ? "uppercase" : "none";
  const popDamping = Math.max(4, Math.min(30, Number(extras.popDamping ?? 14)));
  const popStiffness = Math.max(40, Math.min(600, Number(extras.popStiffness ?? 160)));
  const popMass = Math.max(0.2, Math.min(5, Number(extras.popMass ?? 1)));
  const accentColorOverride = (extras.accentColor as string | undefined) ?? null;
  const finalSettle = extras.finalSettle !== false;
  const finalSettleScale = Number(extras.finalSettleScale ?? 1.015);
  const finalSettleFrames = Math.max(1, Number(extras.finalSettleFrames ?? 8));
  const finalEyebrowDuration = Math.max(1, Number(extras.finalEyebrowDuration ?? 18));
  const holdAfterLandFrames = Math.max(0, Number(extras.holdAfterLandFrames ?? 18));
  void holdAfterLandFrames;

  // A `display` font role slots in above `heading` if the project defines
  // one; otherwise fall back to the heading family (same face is fine). The
  // caller opts into a characterful display face via `theme.fonts.display`
  // — that's where the kinetic opener can earn a face choice that doesn't
  // read as the Inter-everywhere default.
  const displayFont = pickFont(null, theme, "display", "")
    || pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const defaultWordFont = wordFontRole === "body" ? bodyFont : displayFont;

  const accent = pickColor(accentColorOverride, theme, "accent", "#FFB300");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");
  const baseTextColor = pickColor(null, theme, "text", "#FFFFFF");

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);

  const perSlotDur = Math.round(perSlotDurSec * fps * g.speed);
  const baseStagger = Math.round(staggerSec * fps * g.speed);

  // Empty-words guard.
  if (words.length === 0) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{
          fontFamily: bodyFont, fontSize: 28, color: mutedColor,
          letterSpacing: "0.04em", opacity: 0.7,
        }}>
          No words
        </div>
      </AbsoluteFill>
    );
  }
  void perSlotDur;

  const containerWidth = Math.round(canvasWidth * containerWidthPct / 100);
  const containerHeight = Math.round(canvasHeight * containerHeightPct / 100);

  // Resolve per-word metadata first — we need the timing tree to find the
  // LAST land frame for the finalSettle tie-together.
  type SlotPlan = {
    idx: number;
    text: string;
    variant: Variant;
    isAccent: boolean;
    weightTier: WeightTier;
  };
  const slotPlans: SlotPlan[] = words.map((_, idx) => {
    const ov = overrideMap.get(slotId(idx));
    const text = (ov?.text !== null && ov?.text !== undefined && ov.text !== "")
      ? ov.text
      : (words[idx] ?? "");
    const variant = isVariant(ov?.custom?.variant) ? (ov?.custom?.variant as Variant) : defaultVariant;
    const isAccent = Boolean(ov?.custom?.accent);
    const weightTier = asWeight(ov?.custom?.weightTier);
    return { idx, text, variant, isAccent, weightTier };
  });

  // Phrase-land phrasing: stagger slots so that slot[i+1] starts at
  // `slot[i].delay + perSlotDur * (1 - phraseLandOverlap)`. The standard
  // `staggered` phrasing uses the configured `staggerSeconds`.
  let cursor = 0;
  const slotTimings = slotPlans.map((_, i) => {
    const ov = overrideMap.get(slotId(i));
    const baseDelay = phrasing === "phrase-land"
      ? cursor
      : i * baseStagger;
    const t = resolveTiming(ov, g, baseDelay, perSlotDur, 0, 0);
    if (phrasing === "phrase-land") {
      cursor = t.delay + Math.round(t.duration * (1 - phraseLandOverlap));
    }
    return t;
  });
  const lastLandFrame = slotPlans.length
    ? Math.max(...slotTimings.map((t) => t.delay + t.duration))
    : 0;

  // Lay out slots.
  const slots: { x: number; y: number; w: number; h: number; idx: number }[] = [];
  if (layout === "grid") {
    const cols = gridColumns;
    const rowsN = Math.ceil(words.length / cols);
    const cellW = (containerWidth - wordGapPx * (cols - 1)) / cols;
    const cellH = (containerHeight - rowGapPx * (rowsN - 1)) / rowsN;
    for (let i = 0; i < words.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      slots.push({
        idx: i,
        x: c * (cellW + wordGapPx),
        y: r * (cellH + rowGapPx),
        w: cellW, h: cellH,
      });
    }
  } else if (layout === "stack") {
    const slotH = (containerHeight - wordGapPx * (words.length - 1)) / words.length;
    for (let i = 0; i < words.length; i++) {
      slots.push({ idx: i, x: 0, y: i * (slotH + wordGapPx), w: containerWidth, h: slotH });
    }
  } else {
    // mosaic — every slot is full-grid, layout happens via wrapping flex
    // flow in the parent; per-word weightTier scales font size.
    for (let i = 0; i < words.length; i++) {
      slots.push({ idx: i, x: 0, y: 0, w: containerWidth, h: containerHeight });
    }
  }

  // Final settle: scale tap on the parent group once when the last word
  // lands. Subliminal weight (~1.5% tap on a 200-container). Synchronised
  // with the eyebrow draw so the moment reads as one "phrase is whole" beat.
  const settleT = interpolate(
    frame,
    [lastLandFrame, lastLandFrame + finalSettleFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const settleEnvelope = finalSettle
    ? interpolate(settleT, [0, 0.5, 1], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : 0;
  const finalGroupScale = 1 + (finalSettleScale - 1) * settleEnvelope;

  // Accent eyebrow tie-together: syncs to the finalSettle fire — draws once,
  // regardless of when the accent word individually landed. Reads as the
  // moment the phrase is "whole."
  const eyebrowStart = lastLandFrame;
  const eyebrowT = interpolate(
    frame, [eyebrowStart, eyebrowStart + finalEyebrowDuration],
    [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT_QUINT },
  );
  const eyebrowOpacity = interpolate(
    frame, [eyebrowStart, eyebrowStart + Math.min(4, finalEyebrowDuration)],
    [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const baseFontPx = (fontSizes?.headline ?? 96) * theme.sizeScale;

  // Inner word renderer — one per slot, takes the precomputed per-slot
  // state so we don't re-create a closure inside .map (which would both
  // shadow a function declaration and re-mount the subtree each frame).
  const renderWordContent = (idx: number) => {
    const plan = slotPlans[idx];
    const ov = overrideMap.get(slotId(idx));
    const isAccent = plan.isAccent;
    const isEyebrow = isAccent && accentStyle === "eyebrow";
    const weightTier = plan.weightTier;

    const size = resolveSize(ov, theme.sizeScale);
    const weightScale = layout === "mosaic" ? WEIGHT_SCALES[weightTier] : 1.0;
    const slotFontScale = layout === "grid" ? 0.6
      : layout === "mosaic" ? weightScale : 1.0;
    const fontPx = size.fontSize ?? baseFontPx * size.scale * slotFontScale;

    const customWeight = typeof ov?.custom?.weight === "number"
      ? Math.max(100, Math.min(900, Number(ov?.custom?.weight)))
      : null;

    const wordColor = isAccent && accentStyle === "color"
      ? accent
      : (ov?.color ? ov.color : baseTextColor);

    return (
      <div
        style={{
          // Inline-flex column so the eyebrow sits in-flow beneath (or above)
          // the word and is properly reserved in the layout. The eyebrow row
          // uses `align-self: stretch` to span the full width of the word —
          // not absolute positioning, which can mis-clip on inline-flex
          // parents under Remotion's headless rasterizer.
          position: "relative",
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: `${eyebrowGapEm}em`,
        }}
      >
        {accentSide === "above" && isEyebrow && (
          <div style={{ width: "100%", alignSelf: "stretch" }}>
            <div
              style={{
                height: eyebrowThickness,
                width: "100%",
                backgroundColor: accent,
                opacity: eyebrowOpacity,
                transformOrigin: "left center",
                transform: `scaleX(${eyebrowT})`,
              }}
            />
          </div>
        )}
        <span
          style={{
            fontFamily: defaultWordFont,
            fontWeight: customWeight ?? (isAccent ? 800 : 700),
            fontSize: fontPx,
            color: wordColor,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            whiteSpace: "pre-wrap",
            textTransform: textTransform as "uppercase" | "none",
            display: "inline-block",
          }}
        >
          {plan.text}
        </span>
        {accentSide === "below" && isEyebrow && (
          <div style={{ width: "100%", alignSelf: "stretch" }}>
            <div
              style={{
                height: eyebrowThickness,
                width: "100%",
                backgroundColor: accent,
                opacity: eyebrowOpacity,
                transformOrigin: "left center",
                transform: `scaleX(${eyebrowT})`,
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const rendered = slots.map((slot) => {
    const t = slotTimings[slot.idx];
    const ov = overrideMap.get(slotId(slot.idx));

    const startF = t.delay;
    const eased = interpolate(frame, [startF, startF + t.duration], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: resolveEasing((ov?.easing as EasingName | null) ?? g.easing),
    });
    // Tight opacity: fully solid at 70% of the duration, so the word reads
    // as solid AS the position lands — no ghosting where opaque lags past
    // the settle.
    const fadeIn = interpolate(
      frame, [startF, startF + Math.max(4, Math.round(t.duration * 0.7))],
      [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    let transform = "";
    let opacity = fadeIn;
    let clip: string | undefined;
    let filterStr: string | undefined;

    const variant = slotPlans[slot.idx].variant;
    if (variant === "slide-up") {
      const y = interpolate(eased, [0, 1], [40, 0]);
      transform = `translateY(${y}px)`;
    } else if (variant === "slide-left") {
      const x = interpolate(eased, [0, 1], [80, 0]);
      transform = `translateX(${x}px)`;
    } else if (variant === "fade-zoom") {
      const s = interpolate(eased, [0, 1], [0.6, 1]);
      transform = `scale(${s})`;
    } else if (variant === "mask-wipe") {
      const dir: WipeDir = (ov?.custom?.wipeDirection as string) === "right" ? "right"
        : (ov?.custom?.wipeDirection as string) === "top" ? "top"
        : (ov?.custom?.wipeDirection as string) === "bottom" ? "bottom" : "left";
      const pct = interpolate(eased, [0, 1], [100, 0]);
      if (dir === "left") clip = `inset(0 ${pct}% 0 0)`;
      else if (dir === "right") clip = `inset(0 0 0 ${pct}%)`;
      else if (dir === "top") clip = `inset(${pct}% 0 0 0)`;
      else clip = `inset(0 0 ${pct}% 0)`;
      opacity = fadeIn * interpolate(eased, [0, 1], [0.5, 1]);
    } else if (variant === "blur-burn") {
      // 8px reads as focus-pull, not broken broadcast. Tighter than the
      // old 24px default that read as a macro-block at low bitrate.
      const blur = interpolate(eased, [0, 1], [8, 0]);
      filterStr = `blur(${blur}px)`;
      opacity = fadeIn * interpolate(eased, [0, 1], [0.4, 1]);
    } else if (variant === "scale-pop") {
      const popSpring = spring({
        frame, fps,
        delay: startF,
        config: { damping: popDamping, mass: popMass, stiffness: popStiffness },
        durationInFrames: Math.max(16, t.duration),
      });
      const s = interpolate(popSpring, [0, 1], [0, 1]);
      transform = `scale(${s})`;
      opacity = interpolate(popSpring, [0, 0.4], [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    }

    if (layout === "mosaic") {
      return (
        <div
          key={slot.idx}
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            margin: `0 ${wordGapPx / 2}px`,
            opacity,
            transform,
            clipPath: clip,
            filter: filterStr,
          }}
        >
          {renderWordContent(slot.idx)}
        </div>
      );
    }

    return (
      <div
        key={slot.idx}
        style={{
          position: "absolute",
          left: slot.x,
          top: slot.y,
          width: slot.w,
          height: slot.h,
          display: "flex",
          alignItems: "center",
          justifyContent: align === "left" ? "flex-start"
            : align === "right" ? "flex-end" : "center",
          opacity,
          transform,
          clipPath: clip,
          filter: filterStr,
        }}
      >
        {renderWordContent(slot.idx)}
      </div>
    );
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: containerWidth,
          height: containerHeight,
          transform: `scale(${finalGroupScale})`,
          transformOrigin: "center",
        }}
      >
        {layout === "mosaic" ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: align === "left" ? "flex-start"
                : align === "right" ? "flex-end" : "center",
              alignContent: "center",
              rowGap: rowGapPx,
              columnGap: wordGapPx,
            }}
          >
            {rendered}
          </div>
        ) : (
          rendered
        )}
      </div>
    </AbsoluteFill>
  );
};
