import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * OrbitChipCloud — labelled pill chips orbit a focal node on an elliptical path.
 *
 * The orbit path itself is drawn behind the chips as a dashed accent line that
 * draws ON in sync with the chips' arrival and slowly marches after settle.
 * Chips slide in from outside their slot (the path encodes the relationship:
 * each chip travels its connector line to land on the orbit). The focal node
 * pops last via a damped spring — the signature accent moment.
 *
 * Built-in rhythm (frame-accurate):
 *   - revealSeconds: chips fly in along their tangent over this window
 *   - chipsStaggerSeconds: per-chip delay between reveals
 *   - The orbit path's dash curve draws ON as reveal progresses
 *   - The orbit spins CONTINUOUSLY at `orbitDegreesPerSec` from frame 0 — chips
 *     arrive into a moving orbit, then merge with their slot
 *   - Each chip tangentially offsets behind (or ahead) of its slot and catches
 *     up as its damped spring settles — the chip "joins the flow" of the orbit
 *   - The focal node pops with a damped spring after the last chip lands
 *
 * Recognized element ids (one per chip, by index):
 *   - "chip-0", "chip-1", ... up to "chip-(N-1)"
 *   - `text` overrides the chip's label; `color` overrides the chip's pill BACKGROUND;
 *     `custom.connector: true/false` opts this chip in/out of the radial connector;
 *     `custom.mono: true` opts this chip's label into the mono font with tabular nums
 *     (good for numeric labels); `custom.accent: true` makes the chip label render in
 *     the accent color (signals "this one is special"); `custom.weight: number`
 *     overrides the per-chip font weight.
 *
 * Required extras:
 *   - chips: string[]  labels (REQUIRED) — N chips
 *
 * Optional extras (declared in config/schema.json):
 *   - eyebrow:        string | null   (default null) — small mono-uppercase above title
 *   - title:          string | null   (default null) — headline above the cloud
 *   - subtitle:        string | null   (default null) — supporting text under the title
 *   - chipsStaggerSeconds:    number 0-3           (default 0.10)
 *   - revealSeconds:          number 0.4-5          (default 0.95)
 *   - orbitStartAngleDeg:    number -180 to 180    (default -90 = top)
 *   - orbitDegreesPerSec:    number -360 to 360    (default 8)
 *                             CONTINUOUS angular velocity of the orbit. Spins from
 *                             frame 0 onward at this rate. 8 deg/s = slow CCW drift
 *                             (full lap in 45s); 24 deg/s = moderate (full lap in 15s);
 *                             0 = static orbit (chips land and stay).
 *   - orbitRadiusXPx:         number 80-2000        (default canvas.width * 0.38)
 *   - orbitRadiusYPx:         number 80-2000        (default canvas.height * 0.36)
 *   - orbitStroke:            hex / null              (default theme.muted)
 *   - orbitStrokeWidthPx:    number 0.4-4            (default 1)
 *                             the orbit ellipse stroke. 0 = no orbit path.
 *   - orbitDashOnPx:         number 0-40             (default 4)
 *   - orbitDashOffPx:        number 0-40             (default 8)
 *                             the orbit path's dash pattern. Both 0 = solid stroke.
 *   - orbitDashDriftPxPerSec: number -60 to 60       (default 6)
 *                             the orbit dash marching speed post-reveal. 0 = static
 *                             dash (the orbit is locked). 6 px/s reads as a slow
 *                             signal drift.
 *   - chipHeightPx:          number 28-200           (default 56)
 *   - chipPaddingXPx:        number 12-80            (default 32)
 *   - chipPaddingYPx:        number 4-40            (default 14)
 *                             chips size BY CONTENT + padding, not a fixed width — long
 *                             labels widen the pill.
 *   - chipFill:              hex / null              (theme primary OR surface; see below)
 *   - chipTextColor:         hex / null              (theme text)
 *   - chipStroke:            hex / null              (theme gridLine)
 *   - chipStrokeWidthPx:    number 0-8              (default 0)
 *   - chipRadiusPx:          number 0-100           (default chipHeightPx/2 = perfect pill)
 *   - chipFontWeight:        number 100-900          (default 600 — semibold)
 *   - chipFontSizeScale:     number 0.5-1.5          (default 0.42 — relative to chipHeightPx)
 *   - chipArrivalTangent:    "behind" | "ahead"      (default "behind")
 *                             entry direction along the orbit's tangent: "behind" = chip
 *                             arrives from the trailing side (its orbital direction of
 *                             motion — chip catches up with where it's supposed to be);
 *                             "ahead" = chip drops in from in front, the orbit catches
 *                             up to it. "behind" reads as catch-up arrival and is the
 *                             default — it explicitly puts the chip's arrival motion IN
 *                             the orbit's flow direction.
 *   - chipArrivalOffsetPx:   number 0-400            (default 110)
 *                             how far behind/ahead the chip starts along the tangent.
 *                             Larger = more dramatic catch-up sweep; 0 = chips pop in
 *                             exactly at their slot (no tangential slide).
 *   - chipTextShadow:      boolean                  (default false) — subtle accent drop-shadow
 *                             on chip labels when they land. Adds a touch of glow without
 *                             making the chips shouty.
 *   - nodeRadiusPx:          number 16-200           (default 70)
 *   - nodeFill:              hex / null              (theme accent)
 *   - nodeGlow:              boolean                 (default true)
 *   - nodeLabel:             string                  (default "")
 *   - nodeLabelColor:        hex / null              (theme text)
 *   - nodeLabelFontPx:       number 12-200           (default 24) — node label sits UNDER the
 *                             node, smaller than chip labels by default
 *   - connectors:            boolean                 (default true)
 *   - connectorColor:       hex / null              (theme muted at 30% alpha)
 *   - connectorWidthPx:     number 1-4              (default 1)
 *   - connectorsDrawOn:     boolean                 (default true) — connector lines DRAW ON
 *                             after their chip lands (animated strokeDashoffset), instead of
 *                             always-on. Truer to the "the path encodes the relationship" idea.
 *   - accentColor:          hex / null              (theme.accent)
 *   - surfaceColor:         hex / null              (theme.background UNLESS the host paints it,
 *                             in which case theme.surface if defined; falls back to
 *                             #14202E that pairs with #0A1220 backgrounds)
 *   - sceneBg:              hex / null              (theme background)
 *                             — used to fill the AbsoluteFill's own backgroundColor. Default
 *                             is theme.background so the canvas is never left black-void
 *                             even if no <Background> wraps the template.
 *   - holdAfterLandFrames:   integer >= 0           (default 18)
 */

export interface OrbitChipCloudProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const slotId = (i: number) => `chip-${i}`;

const HEADING_INTRO_FRAMES = 10;
const HOLD_AFTER_HEADING_FRAMES = 4;
const NODE_POP_FRAMES = 14;

export const OrbitChipCloud: React.FC<OrbitChipCloudProps> = ({
  config, styles, fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  const chipsLabels = useMemo(
    () => (Array.isArray(extras.chips) ? (extras.chips as string[]).map(String) : []),
    [extras.chips],
  );
  const eyebrow = (extras.eyebrow as string | null | undefined) ?? null;
  const title = (extras.title as string | null | undefined) ?? null;
  const subtitle = (extras.subtitle as string | null | undefined) ?? null;
  const staggerSec = Math.max(0, Number(extras.chipsStaggerSeconds ?? 0.10));
  const revealSec = Math.max(0.4, Number(extras.revealSeconds ?? 0.95));
  const orbitStartAngleDeg = Number(extras.orbitStartAngleDeg ?? -90);
  const orbitDegPerSec = Number(extras.orbitDegreesPerSec ?? 8);
  const orbitRadiusX = Number(extras.orbitRadiusXPx ?? Math.round(canvasWidth * 0.38));
  const orbitRadiusY = Number(extras.orbitRadiusYPx ?? Math.round(canvasHeight * 0.36));
  const orbitStrokeOverride = (extras.orbitStroke as string | undefined) ?? null;
  const orbitStrokeWidthPx = Math.max(0, Number(extras.orbitStrokeWidthPx ?? 1));
  const orbitDashOnPx = Math.max(0, Number(extras.orbitDashOnPx ?? 4));
  const orbitDashOffPx = Math.max(0, Number(extras.orbitDashOffPx ?? 8));
  const orbitDashDriftPxPerSec = Number(extras.orbitDashDriftPxPerSec ?? 6);
  const chipHeightPxRaw = Math.max(28, Number(extras.chipHeightPx ?? 56));
  const chipPaddingXPx = Math.max(4, Number(extras.chipPaddingXPx ?? 32));
  const chipPaddingYPx = Math.max(2, Number(extras.chipPaddingYPx ?? 14));
  const chipFillOverride = (extras.chipFill as string | undefined) ?? null;
  const chipTextColorOverride = (extras.chipTextColor as string | undefined) ?? null;
  const chipStrokeOverride = (extras.chipStroke as string | undefined) ?? null;
  const chipStrokeWidthPx = Math.max(0, Number(extras.chipStrokeWidthPx ?? 0));
  const chipRadiusPx = Math.max(0, Number(extras.chipRadiusPx ?? Math.round(chipHeightPxRaw / 2)));
  const chipFontWeight = Math.min(900, Math.max(100, Number(extras.chipFontWeight ?? 600)));
  const chipFontSizeScale = Math.min(1.5, Math.max(0.5, Number(extras.chipFontSizeScale ?? 0.42)));
  const chipArrivalTangent = ((extras.chipArrivalTangent as string) === "ahead" ? "ahead" : "behind");
  const chipArrivalOffsetPx = Math.max(0, Number(extras.chipArrivalOffsetPx ?? 110));
  const chipTextShadow = extras.chipTextShadow === true;
  const nodeRadiusPx = Math.max(10, Number(extras.nodeRadiusPx ?? 70));
  const nodeFillOverride = (extras.nodeFill as string | undefined) ?? null;
  const nodeGlow = extras.nodeGlow !== false;
  const nodeLabel = String(extras.nodeLabel ?? "");
  const nodeLabelColorOverride = (extras.nodeLabelColor as string | undefined) ?? null;
  const nodeLabelFontPx = Math.max(12, Number(extras.nodeLabelFontPx ?? 24));
  const connectors = extras.connectors !== false;
  const connectorColorOverride = (extras.connectorColor as string | undefined) ?? null;
  const connectorWidthPx = Math.max(1, Number(extras.connectorWidthPx ?? 1));
  const connectorsDrawOn = extras.connectorsDrawOn !== false;
  const accentOverride = (extras.accentColor as string | undefined) ?? null;
  const surfaceOverride = (extras.surfaceColor as string | undefined) ?? null;
  const sceneBgOverride = (extras.sceneBg as string | undefined) ?? null;

  // Fonts — Inter is the showcase default; mono fallback JetBrains.
  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Inter");
  const monoFont = pickFont(null, theme, "mono", "JetBrains Mono");

  // Palette — explicit, never fallbacks to the amber-on-near-black default.
  const accentColor = pickColor(accentOverride, theme, "accent", pickColor(null, theme, "primary", "#00D9A3"));
  const sceneBg = pickColor(sceneBgOverride, theme, "background", "#0A1220");
  const surfaceColor = pickColor(surfaceOverride, theme, "surface", "#14202E");
  const chipFill = pickColor(chipFillOverride, theme, "primary", surfaceColor);
  const chipTextColor = pickColor(chipTextColorOverride, theme, "text", "#F4F7FF");
  const chipStroke = pickColor(chipStrokeOverride, theme, "gridLine", "rgba(255,255,255,0.06)");
  const nodeFill = pickColor(nodeFillOverride, theme, "accent", accentColor);
  const nodeLabelColor = pickColor(nodeLabelColorOverride, theme, "text", "#F4F7FF");
  const connectorColor = pickColor(connectorColorOverride, theme, "muted", "#6F7B91");
  const orbitStroke = pickColor(orbitStrokeOverride, theme, "muted", "#6F7B91");
  const mutedColor = pickColor(null, theme, "muted", "#6F7B91");

  // Element override lookup.
  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const elementFor = (i: number): ElementOverride | undefined =>
    overrideMap.get(slotId(i));

  // Empty guard.
  if (chipsLabels.length === 0) {
    return (
      <AbsoluteFill style={{
        backgroundColor: sceneBg, justifyContent: "center", alignItems: "center",
      }}>
        <div style={{
          fontFamily: bodyFont, fontSize: 28, color: mutedColor,
          letterSpacing: "0.04em", opacity: 0.7,
        }}>
          No chips
        </div>
      </AbsoluteFill>
    );
  }

  const revealFrames = Math.round(revealSec * fps * g.speed);
  const staggerFrames = Math.round(staggerSec * fps * g.speed);

  // Heading block reservation (top strip when eyebrow/title present).
  const headingPresent = Boolean(eyebrow || title || subtitle);
  const headingBlockPx = headingPresent ? Math.round(canvasHeight * 0.14) : 0;
  const headingIntroFrames = headingPresent
    ? HEADING_INTRO_FRAMES + HOLD_AFTER_HEADING_FRAMES
    : 0;

  // Focal point — center of the canvas shifted down by the heading block.
  const cx = canvasWidth / 2;
  const cy = headingBlockPx + Math.round((canvasHeight - headingBlockPx) / 2);

  // Per-chip base angle around the orbit, starting at orbitStartAngleDeg.
  const chipCount = chipsLabels.length;
  const chipBaseAngle = (i: number) =>
    (orbitStartAngleDeg + (360 * i / chipCount)) * Math.PI / 180;

  // Continuous orbit rotation: the orbit spins at `orbitDegPerSec` from frame 0
  // onward — no separate "post-arrival sweep" phase. The chips' arrival motion
  // (tangential catch-up) is layered ON TOP of this constant rotation. After
  // chips merge with their slots, they ride the orbit's steady turn.
  const orbitElapsedSec = Math.max(0, (frame - g.delayOffset) / fps);
  const orbitAngleDeg = orbitDegPerSec * orbitElapsedSec;
  const orbitAngleRad = (orbitAngleDeg * Math.PI) / 180;

  // Per-chip reveal spring (one per chip).
  const chipStartFor = (i: number) =>
    g.delayOffset + headingIntroFrames + i * staggerFrames;
  const chipSpringFor = (i: number) => spring({
    frame, fps,
    delay: chipStartFor(i),
    config: { damping: 14, mass: 1, stiffness: 130 },
    durationInFrames: Math.max(14, revealFrames),
  });

  // Focal node pop spring — fires AFTER the last chip lands.
  const lastChipLand = g.delayOffset + headingIntroFrames
    + Math.max(0, chipCount - 1) * staggerFrames
    + Math.round(revealFrames * 0.75);
  const nodeSpring = spring({
    frame, fps,
    delay: lastChipLand,
    config: { damping: 16, mass: 1, stiffness: 140 },
    durationInFrames: NODE_POP_FRAMES,
  });
  const nodeScale = interpolate(nodeSpring, [0, 1], [0.35, 1]);
  const nodeOpacity = interpolate(nodeSpring, [0, 0.5], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Orbit path draw-on progress — normalized to pathLength=1.
  // Path BEGIN drawing when the first chip begins to fly in, completes slightly
  // AFTER the last chip lands so the orbit "closes" around the assembled cloud.
  const pathStartFrame = g.delayOffset + headingIntroFrames;
  const pathEndFrame = Math.max(
    pathStartFrame + 8,
    lastChipLand + Math.round(revealFrames * 0.25),
  );
  const pathRevealT = interpolate(
    frame,
    [pathStartFrame, pathEndFrame],
    [0, 1],
    {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );
  // Dash marching offset after reveal. Driven in pixels-per-second.
  // `dashOffset` is the CSS strokeDashoffset in pixels (counter-clockwise positive);
  // we accumulate `orbitDashDriftPxPerSec * elapsedSeconds` post-reveal, which makes
  // dashes march slowly along the orbit's perimeter. We clamp negatives (pre-reveal).
  const dashSecPost = (Math.max(0, frame - pathEndFrame)) / fps;
  const dashDriftPx = dashSecPost * orbitDashDriftPxPerSec;

  // Heading intro timings.
  const eyebrowT = interpolate(
    frame, [g.delayOffset, g.delayOffset + HEADING_INTRO_FRAMES], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1) },
  );
  const titleT = interpolate(
    frame, [g.delayOffset + 3, g.delayOffset + 3 + HEADING_INTRO_FRAMES], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1) },
  );
  const underlineT = (() => {
    const start = g.delayOffset + 6;
    return interpolate(frame, [start, start + HEADING_INTRO_FRAMES], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp",
        easing: Easing.bezier(0.4, 0, 0.2, 1) });
  })();

  // Connectors — drawn behind chips.
  const connectorLines: {
    x1: number; y1: number; x2: number; y2: number;
    alpha: number; drawT: number;
  }[] = [];
  // Chip slot positions + tangent vectors at each slot for use by chips. The slot
  // is the chip's *target* position on the orbit at this frame — the chip's
  // tangential catch-up offset is added on top by the chip itself. Slot tracks
  // the (already-spinning) orbit, so rendezvous points drift continuously.
  // For an ellipse param x = rx*cos(t), y = ry*sin(t):
  //   dx/dt = -rx*sin(t),  dy/dt =  ry*cos(t)
  // The unit tangent (orbit direction, increasing t) is that vector normalized.
  const chipSlots: { x: number; y: number; tx: number; ty: number }[] = [];
  for (let i = 0; i < chipCount; i++) {
    const angle = chipBaseAngle(i) + orbitAngleRad;
    const x = cx + Math.cos(angle) * orbitRadiusX;
    const y = cy + Math.sin(angle) * orbitRadiusY;
    const dxRaw = -orbitRadiusX * Math.sin(angle);
    const dyRaw = orbitRadiusY * Math.cos(angle);
    const dLen = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw) || 1;
    chipSlots.push({ x, y, tx: dxRaw / dLen, ty: dyRaw / dLen });
  }

  for (let i = 0; i < chipCount; i++) {
    const ov = elementFor(i);
    const showConnector = connectors && (ov?.custom?.connector !== false);
    if (!showConnector) {
      connectorLines.push({ x1: cx, y1: cy, x2: 0, y2: 0, alpha: 0, drawT: 0 });
      continue;
    }
    const s = chipSpringFor(i);
    // The connector draws ON after the chip lands (top 70-100% of spring).
    const drawT = connectorsDrawOn
      ? interpolate(s, [0.55, 1], [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1) })
      : interpolate(s, [0, 0.6], [0, 0.5],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const slot = chipSlots[i];
    const alpha = drawT * 0.55;
    connectorLines.push({
      x1: cx, y1: cy, x2: slot.x, y2: slot.y, alpha, drawT,
    });
  }

  // Font size helpers.
  const baseBody = (fontSizes?.body ?? 28) * theme.sizeScale;
  const baseCaption = (fontSizes?.caption ?? 16) * theme.sizeScale;
  const baseHeadline = (fontSizes?.headline ?? 64) * theme.sizeScale;
  const eyebrowFontPx = Math.round(baseCaption * 1.0);
  const titleFontPx = Math.round(baseHeadline * 0.85);
  const subtitleFontPx = Math.round(baseBody * 0.65);
  const chipFontPx = Math.round(chipHeightPxRaw * chipFontSizeScale);

  return (
    <AbsoluteFill style={{
      backgroundColor: sceneBg, overflow: "hidden",
    }}>
      {/* Heading block — eyebrow + title + subtitle, reserved headingBlockPx */}
      {headingPresent && (
        <div style={{
          position: "absolute",
          left: Math.round(canvasWidth * 0.08),
          top: Math.round(canvasHeight * 0.04),
          width: Math.round(canvasWidth * 0.84),
          display: "flex", flexDirection: "column", gap: 8,
          opacity: eyebrowT,
          transform: `translateY(${(1 - eyebrowT) * 12}px)`,
        }}>
          {eyebrow && (
            <div style={{
              fontFamily: monoFont, fontSize: eyebrowFontPx, fontWeight: 500,
              color: accentColor, letterSpacing: "0.22em", textTransform: "uppercase",
            }}>
              {eyebrow}
            </div>
          )}
          {title && (
            <div style={{
              fontFamily: headingFont, fontSize: titleFontPx, fontWeight: 700,
              color: "#F4F7FF", letterSpacing: "-0.02em", lineHeight: 1.05,
              opacity: titleT,
              transform: `translateY(${(1 - titleT) * 12}px)`,
            }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{
              fontFamily: bodyFont, fontSize: subtitleFontPx, fontWeight: 400,
              color: mutedColor, opacity: titleT * 0.85,
              transform: `translateY(${(1 - titleT) * 12}px)`,
              marginTop: 2,
            }}>
              {subtitle}
            </div>
          )}
          {/* Accent slider that extends out of the title's left edge after the
              title settles — a small editorial flourish tying heading to grid. */}
          <div style={{
            marginTop: 8,
            width: `${underlineT * 24}%`, height: 2,
            background: accentColor, opacity: underlineT * 0.85,
          }} />
        </div>
      )}

      {/* SVG: orbit path (draw-on + marching dashes) + connectors + focal node */}
      <svg
        width={canvasWidth} height={canvasHeight}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {/* Orbit path — THREE stacked ellipses (all `pathLength={1}` so dash
            math is normalized to the perimeter independent of QSize):

            A. Baseline ring — a nearly-invisible SOLID stroke that gives the
               orbit geometry from the moment chips start arriving. Its alpha
               rises with pathRevealT so the ring is never ahead of the chips.

            B. Draw-on sweep — a single growing solid dash (`dasharray="t (1-t)"`)
               that walks the perimeter 0→1 as chips arrive. The signature reveal
               moment: the orbit path "draws itself" around the cloud.

            C. Marching dashes — the visible dashed pattern (`onN offN`) that fades
               in once reveal completes (alpha 0→0.7 at pathRevealT ≥ 0.9), then
               march-tracks at `orbitDashDriftPxPerSec` post-settle. The quiet
               in-motion cue of the orbit being alive. */}
        {orbitStrokeWidthPx > 0 && (
          <ellipse
            cx={cx} cy={cy} rx={orbitRadiusX} ry={orbitRadiusY}
            pathLength={1}
            fill="none"
            stroke={orbitStroke}
            strokeWidth={orbitStrokeWidthPx}
            opacity={interpolate(pathRevealT, [0, 0.35, 1], [0, 0.22, 0.32],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        )}
        {orbitStrokeWidthPx > 0 && (() => {
          const perimeter = Math.PI * (
            3 * (orbitRadiusX + orbitRadiusY)
            - Math.sqrt(
              (3 * orbitRadiusX + orbitRadiusY) * (orbitRadiusX + 3 * orbitRadiusY),
            )
          );
          const safePeri = Math.max(1, perimeter);
          return (
            <>
              {/* B. Draw-on sweep — single growing dash from 12 o'clock (orbit
                  path origin = 3 o'clock by SVG default; rotate the dash start
                  by -25% via strokeDashoffset so reveal begins where chip 0
                  lands at the top of the orbit). */}
              {pathRevealT < 1 && (
                <ellipse
                  cx={cx} cy={cy} rx={orbitRadiusX} ry={orbitRadiusY}
                  pathLength={1}
                  fill="none"
                  stroke={withAlpha(accentColor, 0.72)}
                  strokeWidth={orbitStrokeWidthPx + 0.3}
                  strokeDasharray={`${pathRevealT} ${1 - pathRevealT}`}
                  strokeDashoffset={0.25 - 0.25 * pathRevealT}
                />
              )}
              {/* C. Marching dashes — fade in as reveal completes, drift after. */}
              {(orbitDashOnPx > 0 || orbitDashOffPx > 0) && (
                <ellipse
                  cx={cx} cy={cy} rx={orbitRadiusX} ry={orbitRadiusY}
                  pathLength={1}
                  fill="none"
                  stroke={withAlpha(accentColor, 0.7)}
                  strokeWidth={orbitStrokeWidthPx + 0.3}
                  strokeDasharray={`${orbitDashOnPx / safePeri} ${orbitDashOffPx / safePeri}`}
                  strokeDashoffset={-dashDriftPx / safePeri}
                  opacity={interpolate(pathRevealT, [0.85, 1], [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
                />
              )}
            </>
          );
        })()}

        {/* Connectors — draw ON after each chip lands (MUCH quieter than
            always-on full-alpha hairlines). */}
        {connectors && connectorLines.map((l, i) => {
          if (l.alpha <= 0) return null;
          const lineLen = Math.sqrt((l.x2 - l.x1) ** 2 + (l.y2 - l.y1) ** 2);
          const drawn = l.drawT * lineLen;
          return (
            <line
              key={`cn-${i}`}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={withAlpha(connectorColor, 0.65)}
              strokeWidth={connectorWidthPx}
              strokeLinecap="round"
              opacity={l.alpha}
              strokeDasharray={`${drawn} ${lineLen - drawn}`}
              strokeDashoffset={0}
            />
          );
        })}

        {/* Focal node halo + node */}
        {nodeGlow && nodeOpacity > 0 && (
          <circle
            cx={cx} cy={cy}
            r={nodeRadiusPx * nodeScale * 2.6}
            fill={withAlpha(nodeFill, 0.16)}
            opacity={interpolate(nodeSpring, [0, 0.5, 1], [0, 0.55, 0.85],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            pointerEvents="none"
          />
        )}
        <circle
          cx={cx} cy={cy}
          r={nodeRadiusPx * nodeScale}
          fill={withAlpha(nodeFill, 1)}
          opacity={nodeOpacity}
          style={nodeGlow
            ? { filter: `drop-shadow(0 0 ${Math.round(nodeRadiusPx * 0.35)}px ${withAlpha(nodeFill, 0.35)})` }
            : undefined}
        />
      </svg>

      {/* Node label, UNDER the node */}
      {nodeLabel && nodeOpacity > 0 && (
        <div style={{
          position: "absolute",
          left: cx, top: cy + nodeRadiusPx * nodeScale + 14,
          transform: "translate(-50%, 0)",
          fontFamily: headingFont, fontWeight: 800,
          fontSize: nodeLabelFontPx, color: nodeLabelColor,
          letterSpacing: "0.04em", textTransform: "uppercase",
          opacity: nodeOpacity, textAlign: "center", whiteSpace: "pre-wrap",
          pointerEvents: "none", userSelect: "none",
        }}>
          {nodeLabel}
        </div>
      )}

      {/* Chips — HTML overlays so project fonts render correctly */}
      {chipsLabels.map((label, i) => {
        const ov = elementFor(i);
        const s = chipSpringFor(i);
        const slot = chipSlots[i];
        // Chip arrival: tangential catch-up. The chip's TARGET position is its
        // slot on the (already-spinning) orbit. During arrival, the chip is
        // OFFSET along the orbit tangent by `(1 - spring) * arrivalPx` in the
        // direction configured by `chipArrivalTangent`:
        //   - "behind" (default) = chip starts TRAILING in the orbit's motion
        //     direction (chip-start = slot − tangent*arrivalPx); chip catches up
        //   - "ahead"             = chip starts LEADING in the orbit's motion
        //     direction (chip-start = slot + tangent*arrivalPx); orbit catches up
        // As the spring → 1, the offset → 0 and the chip merges with its slot
        // — and from that point onward the chip rides the orbit like everyone else.
        const startScale = 0.55;
        const chipScale = interpolate(s, [0, 1], [startScale, 1]);
        const chipOpacity = interpolate(s, [0, 0.45], [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const arrivalAmt = (1 - s) * chipArrivalOffsetPx;
        const tangentDir = chipArrivalTangent === "ahead" ? 1 : -1;
        const offsetX = slot.tx * tangentDir * arrivalAmt;
        const offsetY = slot.ty * tangentDir * arrivalAmt;
        const x = slot.x + offsetX;
        const y = slot.y + offsetY;

        // Per-chip overrides.
        const fill = ov?.color ?? chipFill;
        const labelText = (ov?.text !== null && ov?.text !== undefined && ov.text !== "")
          ? ov.text : label;
        const mono = Boolean((ov?.custom as { mono?: boolean } | undefined)?.mono);
        const accentLabel = Boolean((ov?.custom as { accent?: boolean } | undefined)?.accent);
        const weightOverride = ((ov?.custom as { weight?: number } | undefined)?.weight);
        const cellFontWeight = typeof weightOverride === "number" ? weightOverride : chipFontWeight;
        const cellFontFamily = mono ? monoFont : bodyFont;
        const cellTextColor = accentLabel ? accentColor : chipTextColor;
        // Uniform letter-spacing across all variants — accent chips distinguish
        // via color, not via sudden spacing changes (which read as a font swap).
        const cellLetterSpacing = "0.02em";
        // Only MONO chips uppercase — they're the "data chip" signal. Accent chips
        // keep their case so demo content like "vectors" stays readable as "vectors"
        // not "VECTORS" (color already flags importance).
        const cellTextTransform = mono ? "uppercase" : "none";

        // Land settle — small rotation wobble (deg) after the chip lands.
        const landSlip = interpolate(
          frame,
          [chipStartFor(i) + revealFrames - 4, chipStartFor(i) + revealFrames + 4],
          [2.5, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1) },
        );

        // Text-shadow accent flash on landing (very subtle).
        const textShadow = chipTextShadow
          ? `0 0 12px ${withAlpha(accentColor, 0.18 * chipOpacity)}`
          : "none";

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x, top: y,
              transform: `translate(-50%, -50%) rotate(${landSlip}deg) scale(${chipScale})`,
              opacity: chipOpacity,
              height: chipHeightPxRaw,
              borderRadius: chipRadiusPx,
              background: fill,
              border: chipStrokeWidthPx > 0
                ? `${chipStrokeWidthPx}px solid ${chipStroke}`
                : "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: `${chipPaddingYPx}px ${chipPaddingXPx}px`,
              boxSizing: "border-box",
              fontFamily: cellFontFamily,
              fontWeight: cellFontWeight,
              fontSize: chipFontPx,
              color: cellTextColor,
              letterSpacing: cellLetterSpacing,
              textTransform: cellTextTransform as React.CSSProperties["textTransform"],
              fontVariantNumeric: mono ? "tabular-nums" : "normal",
              whiteSpace: "nowrap",
              textShadow,
              pointerEvents: "none", userSelect: "none",
              willChange: "transform, opacity",
            }}
          >
            {labelText}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Pair a hex color with an alpha; pass through if not a 6-digit hex. */
function withAlpha(hex: string, alpha: number): string {
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  if (/^#([0-9a-fA-F]{8})$/.test(hex)) return hex;
  return hex;
}
