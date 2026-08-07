import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveEasing,
  resolveSize,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
  type EasingName,
} from "../_shared";

/**
 * RadialPulseRings — concentric pulse rings emit out from a focal node.
 *
 * A central circle (the "node") sits at the canvas center; rings expand
 * outward from its edge in a paced emit pattern, each ring fading from
 * full alpha to zero as its radius grows past the canvas's far corner.
 * A label can sit above or below the node, and a "scanline" hint can sweep
 * across the canvas if you want the rings read as radar/sonar.
 *
 * Built-in rhythm:
 *   - ringEmitSeconds: each ring takes this long to expand+fade
 *     (default 1.6). Rings emit every ringGapSeconds (default 0.55)
 *     so a steady stream of pulses animate outward over the scene.
 *   - ringEasing: defaults to ease-out-cubic — rings decelerate outward,
 *     which reads as a "transmission" beat.
 *   - holdAfterLastEmitFrames (default 18): after the final ring leaves
 *     the frame, the rest of the scene holds the static node + label
 *     for this long so the viewer reads the labeled focal point before
 *     cutting. (!) Unlike the prior implementation, this is now honored
 *     — the node/label fade only starts after this hold elapses.
 *
 * Refinements (the "perfect" pass):
 *   - Perceptual fade: ring opacity uses ease-out-quint, so rings drop
 *     in fast and tail off slowly — real sonar/tracer reading, NOT a
 *     mechanical linear fade.
 *   - Stroke taper: each ring's stroke width shrinks slightly as the
 *     ring expands (1 -> 0.35 over its lifetime) so distant rings
 *     read as thinner traces, not identical circles.
 *   - Emission halo: the node gets a brief soft glow each time a ring
 *     emits — visually ties the rings to the source. Single accent
 *     moment per emit; rings themselves stay "steady transmission" color.
 *   - Inner accent ring is bracketed inside the node after the pop so
 *     the node sits as a clear focal mark with its accent read.
 *   - Scanline guide circle is anchored to the ring start radius (not
 *     an arbitrary canvas fraction), so the radar visual is consistent
 *     with the emission geometry.
 *
 * Recognized element ids:
 *   - "node-glyph"    a small unicode glyph rendered inside the node
 *   - "node-label"    the caption rendered above/below the node
 *
 * Optional extras (declared in config/schema.json):
 *   - ringCount:             integer 2-12       (default 5)
 *   - ringEmitSeconds:        number 0.5-8       (default 1.6)
 *   - ringGapSeconds:         number 0-4         (default 0.55)
 *   - ringEasing:             EasingName         (default ease-out-cubic)
 *   - ringStrokeWidthPx:     number 1-32         (default 3)
 *   - ringStrokeColor:       hex / null          (theme.text)
 *   - ringStartRadiusPx:     number 0-400        (default 60) — rings emit
 *                            from this radius (a touch outside the node edge
 *                            so the gap reads)
 *   - ringMaxRadiusPx:       number 100-2000     (default canvas diagonal)
 *   - ringGlow:              boolean              (default false) — opt-in
 *                            soft halo on each ring. Off by default; only
 *                            useful for vibrant-pulse accents.
 *   - nodeRadiusPx:          number 8-200         (default 56)
 *   - nodeFill:              hex / null           (theme.primary)
 *   - nodeStroke:            hex / null           (theme.text)
 *   - nodeStrokeWidthPx:    number 0-16          (default 0)
 *   - nodeGlow:             boolean              (default true) — ONE soft
 *                            halo around the node reads as the "energy
 *                            source." Set false for a flat node.
 *   - nodeLabelPosition:    "above" | "below"    (default "above")
 *   - nodeLabelGapPx:       number 0-200          (default 24)
 *   - scanline:             boolean              (default false) — radar
 *                            sweep: a thin line rotates 360° around the
 *                            focal node, plus a static radar frame
 *                            (concentric guide circles + crosshair).
 *   - scanlineStartSeconds: number 0-30          (default 0)
 *   - scanlineDurationSeconds: number 0.4-30     (default 6) — period of
 *                            one full 360° rotation of the sweep line.
 *   - scanlineColor:       hex / null            (theme.accent)
 *   - scanlineStrokeWidthPx: number 1-10         (default 2)
 *   - accentColor:         hex / null             (theme.accent)
 *   - holdAfterLastEmitFrames: integer ≥0         (default 18)
 *   - ringFadeToCenter:    boolean                (default true) — each
 *                            ring's stroke uses a SVG radialGradient
 *                            anchored at the node, fading from
 *                            transparent (inner edge) to opaque (outer).
 *   - scanlineFadeToTip:   boolean                (default true) — the
 *                            sweep line uses a linearGradient that
 *                            fades to transparent at the outer tip.
 *   - radarDots:           array of {angle, radius, title, color?}    —
 *                            radar contact dots that reveal when the
 *                            sweep reaches their angle. Each card
 *                            floats radially outside the dot.
 */

export interface RadialPulseRingsProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

export const RadialPulseRings: React.FC<RadialPulseRingsProps> = ({
  config, styles, fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: canvasWidth, height: canvasHeight, durationInFrames } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  // Ring emission:
  //   - ringCount === null -> "continuous" mode. Emit rings at ringGapSeconds
  //     cadence for the WHOLE scene. Useful for radar/signal that should run
  //     throughout, not stop after a fixed number.
  //   - ringCount integer  -> emit that many rings from scene start.
  const ringEmitSec = Math.max(0.5, Number(extras.ringEmitSeconds ?? 3.5));
  const ringGapSec = Math.max(0.05, Number(extras.ringGapSeconds ?? 1.6));
  const ringGapFramesBase = Math.max(1, Math.round(ringGapSec * fps * g.speed));
  const ringEmitFramesBase = Math.max(1, Math.round(ringEmitSec * fps * g.speed));
  const durationWrap = Math.max(ringEmitFramesBase + ringGapFramesBase, durationInFrames);
  const ringCountIn = extras.ringCount === null ? null : (extras.ringCount ?? null);
  let ringCount: number;
  if (ringCountIn === null || ringCountIn === undefined) {
    // Continuous: enough rings to fill the scene, plus one so the last
    // emitted ring fully fades before scene end.
    ringCount = Math.max(
      2,
      Math.min(60, Math.ceil(durationWrap / ringGapFramesBase) + 2),
    );
  } else {
    ringCount = Math.max(2, Math.min(60, Number(ringCountIn)));
  }
  void ringCountIn;
  const ringEasingName = (extras.ringEasing as EasingName) ?? "ease-out-cubic";
  const ringStrokeWidthPx = Math.max(1, Number(extras.ringStrokeWidthPx ?? 3));
  const ringStrokeColorOverride = (extras.ringStrokeColor as string | undefined) ?? null;
  const ringStartRadiusPx = Math.max(0, Number(extras.ringStartRadiusPx ?? 60));
  const canvasDiag = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
  const ringMaxRadiusPx = Math.max(100, Number(extras.ringMaxRadiusPx ?? canvasDiag));
  const ringGlow = Boolean(extras.ringGlow ?? false);
  const ringFadeToCenter = extras.ringFadeToCenter !== false;
  const scanlineFadeToTip = extras.scanlineFadeToTip !== false;
  const radarDotsRaw = useMemo(
    () => (Array.isArray(extras.radarDots) ? extras.radarDots : []),
    [extras.radarDots],
  );
  const nodeRadiusPx = Math.max(8, Number(extras.nodeRadiusPx ?? 56));
  const nodeFillOverride = (extras.nodeFill as string | undefined) ?? null;
  const nodeStrokeOverride = (extras.nodeStroke as string | undefined) ?? null;
  const nodeStrokeWidthPx = Math.max(0, Number(extras.nodeStrokeWidthPx ?? 0));
  const nodeGlow = extras.nodeGlow !== false;
  const nodeLabelPosition = (extras.nodeLabelPosition as string) === "below" ? "below" : "above";
  const nodeLabelGapPx = Math.max(0, Number(extras.nodeLabelGapPx ?? 24));
  const scanline = Boolean(extras.scanline);
  const scanlineStartSec = Math.max(0, Number(extras.scanlineStartSeconds ?? 0));
  const scanlineDurSec = Math.max(0.4, Number(extras.scanlineDurationSeconds ?? 6));
  const scanlineColorOverride = (extras.scanlineColor as string | undefined) ?? null;
  const scanlineStrokeWidthPx = Math.max(1, Number(extras.scanlineStrokeWidthPx ?? 2));
  const accentOverride = (extras.accentColor as string | undefined) ?? null;
  const holdAfterLastEmitFrames = Math.max(0, Math.round(Number(extras.holdAfterLastEmitFrames ?? 18)));

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");

  const ringStrokeColor = pickColor(ringStrokeColorOverride, theme, "text", "#FFFFFF");
  const nodeFill = pickColor(nodeFillOverride, theme, "primary", "#0F1B2D");
  const nodeStroke = pickColor(nodeStrokeOverride, theme, "text", "#FFFFFF");
  const accent = pickColor(accentOverride, theme, "accent", "#FFB300");
  const scanlineColor = pickColor(scanlineColorOverride, theme, "accent", accent);
  const labelColor = pickColor(null, theme, "text", "#FFFFFF");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");

  // Per-element override lookup.
  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const glyphOv = overrideMap.get("node-glyph");
  const labelOv = overrideMap.get("node-label");
  const glyphOvHidden = glyphOv?.hidden === true;
  const labelOvHidden = labelOv?.hidden === true;
  const glyph = (!glyphOvHidden && glyphOv?.text) ? glyphOv.text : "";
  const labelText = (!labelOvHidden && labelOv?.text) ? labelOv.text : "";
  const glyphSize = resolveSize(glyphOv, theme.sizeScale);
  const labelSize = resolveSize(labelOv, theme.sizeScale);
  const glyphFontPx = glyphSize.fontSize ?? (nodeRadiusPx * 1.4 * glyphSize.scale);
  const labelFontPx = labelSize.fontSize ?? ((fontSizes?.body ?? 32) * labelSize.scale);

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  // Per-frame emit + gap durations (fps-aware via g.speed).
  const ringEmitFrames = Math.round(ringEmitSec * fps * g.speed);
  const ringGapFrames = Math.round(ringGapSec * fps * g.speed);

  // The node pops in with a real spring settle (damping 12). Ditch the
  // awkward durationInFrames coupling to ringEmitFrames — the spring
  // settles naturally in ~24 frames at this config; letting it overshoot
  // and settle reads as the energy source "arriving."
  const nodePopSpring = spring({
    frame, fps,
    delay: g.delayOffset,
    config: { damping: 12, mass: 1, stiffness: 140 },
  });
  const nodeScale = interpolate(nodePopSpring, [0, 1], [0.6, 1],
    { extrapolateRight: "clamp" });
  const nodeOpacity = interpolate(nodePopSpring, [0, 0.55], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Emission halo: a soft glow at the node edge that brightens for ~10
  // frames each time a ring emits. This is THE one accent moment tied to
  // the rings — rings themselves stay "steady transmission" color, but a
  // brief accent flash at the source sells the emit rhythm. 333ms reads
  // as a deliberate "tick," not a jitter; the sin curve gives a peak in
  // the middle and clean ease-in/out of the flash.
  const emitFadeFrames = Math.max(6, Math.round(fps * (1 / 3) * g.speed)); // ~333ms @ 30fps
  let emitHalo = 0;
  for (let i = 0; i < ringCount; i++) {
    const startFrame = g.delayOffset + i * ringGapFrames;
    if (frame < startFrame || frame >= startFrame + emitFadeFrames) continue;
    const local = (frame - startFrame) / emitFadeFrames;
    // sin gives a smooth 0 -> 1 -> 0 arc across [0,1].
    const flash = Math.sin(Math.PI * local);
    if (flash > emitHalo) emitHalo = flash;
  }

  // Build the ring list. Each ring emits at frame = startFrame,
  // expands ringStart -> ringMax with the resolved easing, and fades
  // with an ease-out-quint perceptual curve (fast-in, slow-out tail).
  // The stroke also tapers from full width to 0.35× as it expands,
  // so distant rings read as thinner traces (real sonar reading).
  const fadeEasing = resolveEasing("ease-out-quint");
  const strokeMinScale = 0.35;

  type Ring = {
    i: number;
    radius: number;
    opacity: number;
    strokeWidth: number;
  };
  const rings: Ring[] = [];
  for (let i = 0; i < ringCount; i++) {
    const start = g.delayOffset + i * ringGapFrames;
    const t = interpolate(
      frame, [start, start + ringEmitFrames], [0, 1],
      {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
        easing: resolveEasing(ringEasingName),
      },
    );
    if (t >= 1) continue;
    if (t < 0) continue;
    // Perceptual opacity curve: rings emerge near-full and tail off
    // slowly. ease-out-quint gives the "fades into the noise floor"
    // tail that linear `1-t` lacks.
    const opacity = 1 - fadeEasing(t);
    if (opacity <= 0.01) continue;
    const radius = ringStartRadiusPx + (ringMaxRadiusPx - ringStartRadiusPx) * t;
    if (radius >= ringMaxRadiusPx) continue;
    // Stroke taper: full at emit, thinning to strokeMinScale at the end.
    const strokeScale = 1 - (1 - strokeMinScale) * t;
    const strokeWidth = ringStrokeWidthPx * strokeScale;
    rings.push({ i, radius, opacity, strokeWidth });
  }

  // lastEmitEndFrame: when the final ring fully fades (t=1).
  const lastEmitStart = g.delayOffset + (ringCount - 1) * ringGapFrames;
  const lastEmitEnd = lastEmitStart + ringEmitFrames;
  // nodeHoldEnd: scene + hold breath. Node + label only fade late.
  const nodeHoldEnd = lastEmitEnd + holdAfterLastEmitFrames;

  // Label opacity: fade in early (frames 8-22 after delayOffset), sit at
  // full through the entire emission sequence + hold, then fade out in
  // the last 12 frames of the hold. Decomposed into two interpolations
  // so the keys can never invert when holdAfterLastEmitFrames is short.
  const labelFadeInFrames = g.delayOffset + 8;
  const labelFullFrames = g.delayOffset + 22;
  const labelFadeOutStart = nodeHoldEnd;
  const labelFadeOutEnd = nodeHoldEnd + 12;
  const labelOpacity =
    interpolate(frame, [labelFadeInFrames, labelFullFrames], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    * (labelFadeOutEnd > labelFadeOutStart
        ? interpolate(frame, [labelFadeOutStart, labelFadeOutEnd], [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        : 1);

  // Scanline: a thin line rotates continuously around the focal node —
  // a slow 360° sweep that reads as a real radar/sonar station rather
  // than a single half-arc fade. `scanlineDurationSeconds` is now the
  // period of one full revolution (default 6s). The sweep stays visible
  // for the whole scene after `scanlineStartSeconds` (no fade in/out);
  // only the faint guide circle + sweep read clearly while the rings
  // expand underneath.
  let scanlineAngle = 0;
  let scanlineOpacity = 0;
  if (scanline) {
    const slStart = g.delayOffset + Math.round(scanlineStartSec * fps * g.speed);
    const slDur = Math.max(
      Math.round(scanlineDurSec * fps * g.speed),
      Math.round(0.4 * fps * g.speed),
    );
    // Continuous rotation: angle = ((frame - slStart) / slDur) * 360, with
    // linear extrapolation (the sweep keeps rotating past the first turn).
    // A short fade-in over the first ~6% of one revolution hides the
    // "snap to visible" frame; it then stays at full opacity forever.
    const slT = interpolate(
      frame, [slStart, slStart + slDur], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "extend" },
    );
    scanlineAngle = slT * 360;
    const fadeInFrames = Math.max(3, Math.round(0.06 * slDur));
    scanlineOpacity = interpolate(
      frame, [slStart, slStart + fadeInFrames], [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }
  // Faint guide circle anchored to the emission geometry so the radar
  // visual is consistent with the ring start radius (not an arbitrary
  // canvas fraction). Drawn statically — the radar "shell".
  const guideRadius = Math.max(
    ringStartRadiusPx + 24,
    Math.min(canvasWidth, canvasHeight) * 0.34,
  );
  // A second, larger faint guide circle adds the "outer radar shell" so
  // the rotating sweep has a perceptual cap to read against.
  const guideRadiusOuter = Math.min(
    Math.min(canvasWidth, canvasHeight) * 0.46,
    ringMaxRadiusPx * 0.6,
  );

  // Radar dots: each contact sits at (angle, radius) from the center.
  // It reveals when the scanline first sweeps through its angle. Each
  // dot then stays revealed for the rest of the scene, with a small
  // scale-in + label-card fade-in. If scanline is off, dots reveal
  // together at g.delayOffset.
  type RadarDot = {
    angle: number;            // radians, normalized to [0, 2π)
    angleDegRaw: number;      // user's original angle in degrees
    radius: number;           // px from center
    title: string;
    description: string;
    color: string;
    // Absolute frame the dot reveals.
    revealFrame: number;
    // Visible position of the dot on canvas.
    x: number;
    y: number;
    // Per-dot index (for keys + staggering).
    i: number;
  };
  const radarDots: RadarDot[] = useMemo(() => {
    const dotsRaw: any[] = radarDotsRaw as any;
    if (!dotsRaw || dotsRaw.length === 0) return [];
    // Compute scanline timing (mirror of the scanline code above).
    const slStart = scanline
      ? g.delayOffset + Math.round(scanlineStartSec * fps * g.speed)
      : g.delayOffset;
    const slDur = scanline
      ? Math.max(
          Math.round(scanlineDurSec * fps * g.speed),
          Math.round(0.4 * fps * g.speed),
        )
      : 1;
    return dotsRaw.map((raw, i) => {
      const angleDegRaw = Number(raw.angle ?? 0);
      const angleRad = (angleDegRaw * Math.PI) / 180;
      const radius = Math.max(
        nodeRadiusPx + 12,
        Math.min(ringMaxRadiusPx * 0.92, Number(raw.radius ?? 320)),
      );
      // Normalize dot angle to [0, 360) to match the sweep convention.
      const thetaNorm = ((angleDegRaw % 360) + 360) % 360;
      const revealFrame = scanline
        ? slStart + Math.round((thetaNorm / 360) * slDur)
        : g.delayOffset;
      const x = cx + radius * Math.cos(angleRad);
      const y = cy + radius * Math.sin(angleRad);
      const dotColor = pickColor(raw.color ?? null, theme, "accent", accent);
      return {
        angle: angleRad,
        angleDegRaw,
        radius,
        title: String(raw.title ?? ""),
        description: String(raw.description ?? ""),
        color: dotColor,
        revealFrame,
        x,
        y,
        i,
      };
    });
  }, [
    radarDotsRaw, scanline, g.delayOffset, g.speed, scanlineStartSec,
    scanlineDurSec, fps, nodeRadiusPx, ringMaxRadiusPx, cx, cy, theme, accent,
  ]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <svg
        width={canvasWidth}
        height={canvasHeight}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        shapeRendering="geometricPrecision"
      >
        <defs>
          {/*
            Radial gradient for ring strokes. Anchored at the canvas center
            (in userSpaceOnUse), so the gradient's stops are placed per-ring
            on the SAME radial axis as the ring's own radius. Stop 0 (center
            of canvas) is transparent, stop 1 (ringMaxRadiusPx) is the full
            ring color. Each ring's stroke weight spans a tiny slice of this
            gradient at its radius, so the inner edge of the stroke is more
            transparent and the outer edge is more opaque — reading as
            rings fading toward the center.
          */}
          {ringFadeToCenter ? (
            <radialGradient
              id="ring-stroke-fade"
              cx={String(cx)} cy={String(cy)}
              r={String(ringMaxRadiusPx)}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={withAlpha(ringStrokeColor, 0)} />
              <stop offset="100%" stopColor={withAlpha(ringStrokeColor, 1)} />
            </radialGradient>
          ) : null}
          {/*
            Linear gradient for the sweep line. Opaque at cx (the central
            node), fading to transparent at the outer tip. Drawn along the
            +x axis from cx to cx+ringMaxRadiusPx in userSpaceOnUse — the
            line rotates around the center via the parent <g>'s rotation,
            so the gradient get's applied in the rotated coordinate frame
            exactly along the line.
          */}
          {scanline && scanlineFadeToTip ? (
            <linearGradient
              id="scanline-fade"
              x1={String(cx)} y1={String(cy)}
              x2={String(cx + ringMaxRadiusPx)} y2={String(cy)}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={withAlpha(scanlineColor, 1)} />
              <stop offset="65%" stopColor={withAlpha(scanlineColor, 0.55)} />
              <stop offset="100%" stopColor={withAlpha(scanlineColor, 0)} />
            </linearGradient>
          ) : null}
        </defs>
        {/* Rings — drawn before the node so they sit behind it. */}
        {rings.map((r) => (
          <circle
            key={r.i}
            cx={cx}
            cy={cy}
            r={r.radius}
            fill="none"
            stroke={ringFadeToCenter ? "url(#ring-stroke-fade)" : ringStrokeColor}
            strokeWidth={r.strokeWidth}
            opacity={r.opacity}
            style={ringGlow ? ringGlowStyle : undefined}
          />
        ))}
        {/* Static radar guide frame: two faint concentric circles + a
            thin crosshair. Drawn statically (not gated by opacity) so
            the radar reading is supported even before the sweep starts. */}
        {scanline && (
          <g opacity={scanlineOpacity > 0 ? 1 : 0.6}>
            <circle
              cx={cx} cy={cy} r={guideRadius}
              fill="none"
              stroke={withAlpha(scanlineColor, 0.16)}
              strokeWidth={1}
            />
            {guideRadiusOuter > guideRadius && (
              <circle
                cx={cx} cy={cy} r={guideRadiusOuter}
                fill="none"
                stroke={withAlpha(scanlineColor, 0.10)}
                strokeWidth={1}
              />
            )}
            <line
              x1={cx - guideRadiusOuter} y1={cy}
              x2={cx + guideRadiusOuter} y2={cy}
              stroke={withAlpha(scanlineColor, 0.08)}
              strokeWidth={1}
            />
            <line
              x1={cx} y1={cy - guideRadiusOuter}
              x2={cx} y2={cy + guideRadiusOuter}
              stroke={withAlpha(scanlineColor, 0.08)}
              strokeWidth={1}
            />
          </g>
        )}
        {/* Rotating sweep — a thin line from cx going outward, with a
            faint trailing wedge (a thin pie slice that trails ~22°
            behind the line) so the sweep reads with a real radar tail. */}
        {scanline && scanlineOpacity > 0 && (
          <g opacity={scanlineOpacity}>
            <g transform={`rotate(${scanlineAngle} ${cx} ${cy})`}>
              {/* Trailing wedge — a thin path spanning ~22° behind the
                  line. Drawn as an SVG path arc from the line outward. */}
              {(() => {
                const trailDeg = 22;
                const r = ringMaxRadiusPx;
                const aHead = 0; // line points along +x at rotation 0
                const aTrail = -trailDeg * Math.PI / 180;
                const xHead = cx + r * Math.cos(aHead);
                const yHead = cy + r * Math.sin(aHead);
                const xTrail = cx + r * Math.cos(aTrail);
                const yTrail = cy + r * Math.sin(aTrail);
                const pathD =
                  `M ${cx} ${cy} L ${xHead} ${yHead} ` +
                  `A ${r} ${r} 0 0 0 ${xTrail} ${yTrail} Z`;
                return (
                  <path
                    d={pathD}
                    fill={withAlpha(scanlineColor, 0.06)}
                    stroke="none"
                  />
                );
              })()}
              {/* Sharp sweep line */}
              <line
                x1={cx} y1={cy}
                x2={cx + ringMaxRadiusPx} y2={cy}
                stroke={scanlineFadeToTip ? "url(#scanline-fade)" : withAlpha(scanlineColor, 0.85)}
                strokeWidth={scanlineStrokeWidthPx}
                strokeLinecap="round"
              />
            </g>
          </g>
        )}
        {/* Radar contact dots — each dot is hidden until the sweep
            reveals its angle, then scales in with a short ease and
            stays revealed for the rest of the scene. Each dot has a
            ringed aura (small inner disc + outer ring). Sits over the
            radar frame + sweep, but under the node halo + node. */}
        {radarDots.map((d) => {
          if (frame < d.revealFrame) return null;
          const local = frame - d.revealFrame;
          const dotScale = interpolate(local, [0, 10], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: resolveEasing("ease-out-cubic"),
          });
          const dotOpacity = interpolate(local, [0, 6], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const rInner = 8 * dotScale;
          const rOuter = 16 * dotScale;
          return (
            <g key={`dot-${d.i}`} opacity={dotOpacity}>
              {/* Filled contact disc */}
              <circle
                cx={d.x} cy={d.y}
                r={rInner}
                fill={withAlpha(d.color, 0.95)}
              />
              {/* Outer ring — larger fainter circle so the read is a
                  contact dot with a halo. */}
              <circle
                cx={d.x} cy={d.y}
                r={rOuter}
                fill="none"
                stroke={withAlpha(d.color, 0.55)}
                strokeWidth={1.5}
              />
              {/* Tiny connector line from the dot back to the center
                  so the radial placement reads even before the card
                  appears. */}
              <line
                x1={cx} y1={cy}
                x2={d.x} y2={d.y}
                stroke={withAlpha(d.color, 0.15)}
                strokeWidth={1}
                strokeDasharray="3 5"
              />
            </g>
          );
        })}
        {/* Emission halo — soft accent ring around the node that pulses
            briefly each time a ring emits. Sits *behind* the node fill. */}
        {emitHalo > 0.001 && (
          <circle
            cx={cx} cy={cy}
            r={nodeRadiusPx * nodeScale + 6}
            fill="none"
            stroke={withAlpha(accent, 0.55 * emitHalo * nodeOpacity)}
            strokeWidth={Math.max(2, nodeRadiusPx * 0.18)}
            style={emitHaloStyle}
          />
        )}
        {/* Node fill */}
        <circle
          cx={cx} cy={cy}
          r={nodeRadiusPx * nodeScale}
          fill={nodeFill}
          opacity={nodeOpacity}
          stroke={nodeStrokeWidthPx > 0 ? nodeStroke : "none"}
          strokeWidth={nodeStrokeWidthPx}
          style={nodeGlow ? nodeGlowStyle : undefined}
        />
        {/* Inner accent ring — bracketed inside the node at a
            proportional 0.85× of the scaled radius, so the inner read
            is stable across the spring pop and across node sizes. */}
        <circle
          cx={cx} cy={cy}
          r={Math.max(4, nodeRadiusPx * nodeScale * 0.85)}
          fill="none"
          stroke={withAlpha(accent, 0.55 * nodeOpacity)}
          strokeWidth={2}
        />
      </svg>

      {/* HTML overlay for glyph + label (renders with the project fonts) */}
      {glyph && (
        <div
          style={{
            position: "absolute",
            left: cx, top: cy,
            transform: `translate(-50%, -50%) scale(${nodeScale})`,
            fontFamily: headingFont,
            fontWeight: 800,
            fontSize: glyphFontPx,
            color: labelColor,
            letterSpacing: "-0.02em",
            opacity: nodeOpacity,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {glyph}
        </div>
      )}
      {labelText && (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: nodeLabelPosition === "above"
              ? cy - nodeRadiusPx - nodeLabelGapPx
              : cy + nodeRadiusPx + nodeLabelGapPx,
            transform: `translate(-50%, ${nodeLabelPosition === "above" ? "-100%" : "0"})`,
            textAlign: "center",
            fontFamily: bodyFont,
            fontWeight: 500,
            fontSize: labelFontPx,
            color: labelOv?.color ?? labelColor,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: labelOpacity,
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "pre-wrap",
            maxWidth: canvasWidth * 0.7,
          }}
        >
          {labelText}
        </div>
      )}
      {/* Radar-dot cards — title + description on each contact.
          Card placed radially outside the dot, clamped to canvas.
          Text alignment depends on dot side (so the card signature
          reads as pointing outward from the center). Card fades in
          shortly after the dot reveals. */}
      {radarDots.map((d) => {
        if (frame < d.revealFrame + 6) return null;
        const local = frame - (d.revealFrame + 6);
        const cardOpacity = interpolate(local, [0, 12], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        const cardW = 280;
        const cardH = 90;
        const dirX = Math.cos(d.angle);
        const dirY = Math.sin(d.angle);
        const cardOutward = 168; // dotRadius + gap + cardHalfWidth
        let ccx = d.x + dirX * cardOutward;
        let ccy = d.y + dirY * cardOutward;
        // Clamp card center to the canvas with 40px margin so the card
        // never overflows the visible frame.
        ccx = Math.max(40 + cardW / 2, Math.min(canvasWidth - 40 - cardW / 2, ccx));
        ccy = Math.max(40 + cardH / 2, Math.min(canvasHeight - 40 - cardH / 2, ccy));
        // Text alignment side — left if dot is on right, right if dot on left,
        // center if pure up/down.
        const align = Math.abs(dirX) < 0.2
          ? "center"
          : dirX > 0 ? "left" : "right";
        // Final box: left/top corner of an absolutely-positioned div whose
        // width is cardW. We computed ccx/ccy as the card center, so the
        // corner is offset by -cardW/2 / -cardH/2. (ccx already clamped to
        // canvas margin so the card never overflows.)
        const cardLeft = ccx - cardW / 2;
        const cardTop = ccy - cardH / 2;
        return (
          <div
            key={`dot-card-${d.i}`}
            style={{
              position: "absolute",
              left: cardLeft,
              top: cardTop,
              width: cardW,
              minHeight: cardH,
              padding: "16px 18px",
              borderRadius: 8,
              // Subtle dark glass so the text reads on the radar grid.
              backgroundColor: withAlpha(d.color, 0.08),
              border: `1px solid ${withAlpha(d.color, 0.4 * cardOpacity)}`,
              backdropFilter: "blur(2px)",
              color: labelColor,
              pointerEvents: "none",
              userSelect: "none",
              opacity: cardOpacity,
              textAlign: align,
              fontFamily: bodyFont,
              lineHeight: 1.25,
              boxShadow: `0 4px 20px ${withAlpha(d.color, 0.12 * cardOpacity)}`,
            }}
          >
            <div
              style={{
                fontFamily: headingFont,
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "-0.01em",
                color: d.color,
                marginBottom: 4,
              }}
            >
              {d.title}
            </div>
            {d.description ? (
              <div
                style={{
                  fontFamily: bodyFont,
                  fontWeight: 400,
                  fontSize: 14,
                  color: mutedColor,
                  letterSpacing: "0.01em",
                }}
              >
                {d.description}
              </div>
            ) : null}
          </div>
        );
      })}
      {/* Tiny corner badge — quiet reading-cue, reads as the radar
          figurine without committing to a literal radar visual. */}
      <div style={{
        position: "absolute",
        bottom: 32, left: 32,
        fontFamily: bodyFont,
        fontSize: 16,
        color: mutedColor,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        opacity: 0.45,
        pointerEvents: "none",
        userSelect: "none",
      }}>
        ◉ PULSE
      </div>
    </AbsoluteFill>
  );
};

/** Soft halo on a ring — opt-in only. */
const ringGlowStyle: React.CSSProperties = {
  filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))",
};
const nodeGlowStyle: React.CSSProperties = {
  filter: "drop-shadow(0 0 24px rgba(255,255,255,0.25))",
};
const emitHaloStyle: React.CSSProperties = {
  filter: "drop-shadow(0 0 12px rgba(255,179,0,0.35))",
};

/** Always pass hex with explicit alpha for SVG stroke; pass through if not hex. */
function withAlpha(hex: string, alpha: number): string {
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  if (/^#([0-9a-fA-F]{8})$/.test(hex)) return hex;
  return hex;
}
