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
} from "../_shared";

/**
 * TimelineMarker — horizontal runway with milestones dropping in sequence.
 *
 * Rhythm (built-in):
 *   1. The track sweeps in left→right with an ease-out-cubic curve, a faint
 *      leading-edge luminance riding the head of the sweep, plus an inner
 *      highlight stripe so the track reads as a *material* rail, not a CSS bar.
 *   2. Each marker drops from above via a damped spring (stiffness 130,
 *      damping 11) that gives one tiny overshoot — it reads as a marker
 *      *land* on the track, not a CSS translateY. As it lands:
 *        - the dot pops with a one-frame squash→settle on its own micro-spring,
 *        - a translucent ring expands outward from the contact point and fades
 *          (the "lock" pulse),
 *        - a soft ripple travels along the track past the dot's x,
 *        - the label fades up *after* the dot lands, so the eye reads
 *          "the mark, then the meaning."
 *   3. holdAfterLastMarkerFrames (default 18) lets the assembled timeline
 *      breathe before the scene cuts.
 *
 * The motion is seek-safe and deterministic: every visual derives from
 * `useCurrentFrame()` + `useVideoConfig().fps`. No CSS animations, no state.
 *
 * Recognized element ids:
 *   - "event-0", "event-1", ... up to "event-{N-1}"
 *   - `text` overrides the marker label; `color` overrides that dot's color;
 *     `delay` overrides the auto-staggered drop start; `easing` overrides
 *     the drop curve (the lock-pulse + ripple still ride the spring so the
 *     landing stays physical).
 *
 * Required extras:
 *   - events: events[]  (label, time? for relative position; otherwise
 *                        evenly spaced; icon? for per-event glyph;
 *                        caption? for second-line under the label)
 *
 * Optional extras:
 *   - trackColor:                  theme.primary if null
 *   - trackHeightPx:                number 1-32   (default 4)
 *   - trackInnerHighlight:          boolean       (default true) — a 1px
 *                                  lighter top edge so the track reads as
 *                                  a struck rail rather than a flat bar.
 *   - trackLeadingGlow:             boolean       (default true) — a soft
 *                                  luminance ride at the leading edge of the
 *                                  sweep. Lower-cost than trackGlow and reads
 *                                  as material rather than neon.
 *   - trackGlow:                    boolean       (default false) — opt-in soft
 *                                  halo on the whole track. Use when the brief
 *                                  calls for a light strip; by default the
 *                                  track reads as a clean hairline.
 *   - dotColor:                    theme.text if null (per-event `color` overrides)
 *   - dotRadiusPx:                 number 4-80   (default 18)
 *   - dotRingOnLand:               boolean       (default true) — the
 *                                  translucent expanding ring at the contact
 *                                  point on land.
 *   - trackRippleOnLand:           boolean       (default true) — a short
 *                                  luminance ripple travels along the track
 *                                  outward from each landing dot.
 *   - focusPulse:                  "last" | "none" | number  (default "last")
 *                                  which event keeps a slow ambient pulse after
 *                                  landing to mark the focal point of the
 *                                  timeline. Use a number for an explicit
 *                                  index, "none" to disable.
 *   - labelColor:                  theme.text
 *   - markerDropDurationSeconds:    number 0.2-4  (default 0.6)
 *   - staggerSeconds:               number 0-6   (default 0.4)
 *   - iconGlyph:                    string       (default "") — BACKUP glyph
 *                                  for events that haven't set `icon`;
 *                                  per-event `ev.icon` wins.
 *   - foregroundLabel:              string
 *   - foregroundLabelColor:         theme.text
 *   - trackSweepSeconds:             number 0.2-3 (default 0.8)
 *   - holdAfterLastMarkerFrames:    integer ≥0   (default 18)
 */

export interface TimelineMarkerProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

interface TimelineEvent {
  label: string;
  time?: number;
  icon?: string;
  caption?: string;
}

const slotId = (i: number) => `event-${i}`;

type FocusPulse = "last" | "none" | number;

function resolveFocusPulse(raw: unknown, eventCount: number): FocusPulse {
  if (raw === "none" || raw === null) return "none";
  if (raw === "last") return eventCount > 0 ? eventCount - 1 : "none";
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n < eventCount) return Math.floor(n);
  return eventCount > 0 ? eventCount - 1 : "none";
}

/** Hex → rgba with an explicit alpha. Falls through for unknown formats. */
function withAlpha(hex: string, alpha: number): string {
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    const r = parseInt(hex[1] + hex[1], 16);
    const g = parseInt(hex[2] + hex[2], 16);
    const b = parseInt(hex[3] + hex[3], 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return hex;
}

/** Lighten a hex color toward white. `t` ∈ [0,1]: 0 = original, 1 = white. */
function lighten(hex: string, t: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const k = Math.max(0, Math.min(1, t));
  const lr = Math.round(r + (255 - r) * k);
  const lg = Math.round(g + (255 - g) * k);
  const lb = Math.round(b + (255 - b) * k);
  return `#${lr.toString(16).padStart(2, "0")}${lg
    .toString(16)
    .padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

export const TimelineMarker: React.FC<TimelineMarkerProps> = ({
  config,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useMemo(
    () => resolveTheme(config.theme, styles),
    [config.theme, styles],
  );
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const events = (extras.events as TimelineEvent[]) ?? [];

  const trackColor = pickColor(
    extras.trackColor as string | undefined,
    theme,
    "primary",
    "#0F1B2D",
  );
  const trackHeightPx = Math.max(1, Number(extras.trackHeightPx ?? 4));
  const defaultDotColor = pickColor(
    extras.dotColor as string | undefined,
    theme,
    "text",
    "#FFFFFF",
  );
  const dotRadiusPx = Math.max(4, Number(extras.dotRadiusPx ?? 18));
  const labelColor = pickColor(
    extras.labelColor as string | undefined,
    theme,
    "text",
    "#FFFFFF",
  );
  const dropDurSec = Math.max(0.2, Number(extras.markerDropDurationSeconds ?? 0.6));
  const staggerSec = Math.max(0, Number(extras.staggerSeconds ?? 0.4));
  const iconGlyphFallback = String(extras.iconGlyph ?? "");
  const foregroundLabel = String(extras.foregroundLabel ?? "");
  const foregroundLabelColor = pickColor(
    extras.foregroundLabelColor as string | undefined,
    theme,
    "text",
    "#FFFFFF",
  );
  const trackSweepFracSec = Math.max(
    0.2,
    Number(extras.trackSweepSeconds ?? 0.8),
  );
  const trackGlow = Boolean(extras.trackGlow);
  const trackInnerHighlight =
    extras.trackInnerHighlight === undefined
      ? true
      : Boolean(extras.trackInnerHighlight);
  const trackLeadingGlow =
    extras.trackLeadingGlow === undefined
      ? true
      : Boolean(extras.trackLeadingGlow);
  const dotRingOnLand =
    extras.dotRingOnLand === undefined
      ? true
      : Boolean(extras.dotRingOnLand);
  const trackRippleOnLand =
    extras.trackRippleOnLand === undefined
      ? true
      : Boolean(extras.trackRippleOnLand);
  const holdAfterLastMarkerFrames = Math.max(
    0,
    Number(extras.holdAfterLastMarkerFrames ?? 18),
  );

  // Recompute focusPulse when event count changes (rare; cheap).
  const focusIndex = useMemo<FocusPulse>(
    () => resolveFocusPulse(extras.focusPulse, events.length),
    [extras.focusPulse, events.length],
  );

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const elementFor = (i: number): ElementOverride | undefined =>
    overrideMap.get(slotId(i));

  // Empty-events guard.
  if (events.length === 0) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontFamily: bodyFont,
            fontSize: 28,
            color: mutedColor,
            letterSpacing: "0.02em",
            opacity: 0.7,
          }}
        >
          No events
        </div>
      </AbsoluteFill>
    );
  }

  const times = events.map((e) => e.time);
  const useTimes = times.some((t) => t !== undefined && t !== null);
  const tmin = useTimes
    ? Math.min(
        ...(times.filter((t): t is number => t !== undefined) as number[]),
      )
    : 0;
  const tmax = useTimes
    ? Math.max(
        ...(times.filter((t): t is number => t !== undefined) as number[]),
      )
    : 1;
  const tspan = Math.max(1, tmax - tmin);
  const normalized = events.map((e, i) => {
    if (useTimes && e.time !== undefined) return (e.time - tmin) / tspan;
    return events.length === 1 ? 0.5 : i / (events.length - 1);
  });

  const trackPaddingPct = 8;
  const markers = normalized.map(
    (t) => trackPaddingPct + t * (100 - 2 * trackPaddingPct),
  );

  // ---- Track sweep ---------------------------------------------------------
  // Ease-out cubic so the rail accelerates out and decelerates into place;
  // honors `global.easing` if the author overrides it.
  const sweepStart = g.delayOffset;
  const trackSweepDur = Math.round(trackSweepFracSec * fps * g.speed);
  const sweepEasing =
    config.global?.easing === undefined
      ? Easing.out(Easing.cubic)
      : resolveEasing(config.global.easing);
  const trackProgress = interpolate(
    frame,
    [sweepStart, sweepStart + trackSweepDur],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: sweepEasing,
    },
  );
  const trackLeftPct = trackPaddingPct;
  const trackRightPct =
    trackPaddingPct + trackProgress * (100 - 2 * trackPaddingPct);

  // Tracks-percentage → pixel helper for shadows/ripples on the track.
  const trackPixelWidth = (pctWidth: number) =>
    (pctWidth / 100) * 1920; // preview canvas is 1920 wide; ratios hold at any res.

  const dropDur = Math.round(dropDurSec * fps * g.speed);
  const stagger = Math.round(staggerSec * fps * g.speed);

  const labelFontPx = (fontSizes?.headline ?? 36) * theme.sizeScale;
  const iconFontPx = labelFontPx * 1.2;
  const captionFontPx = labelFontPx * 0.55;

  // Per-frame track head (the leading edge of the sweep). When the sweep is
  // done, it sits at the right edge — used by the leading glow.
  const trackHeadPct = trackRightPct;

  // The post-land hold is observed by the scene's DurationInFrames.
  void holdAfterLastMarkerFrames;

  // ---- Track material styling --------------------------------------------
  const trackBg = trackGlow
    ? `0 0 ${trackHeightPx * 3}px ${withAlpha(trackColor, 0.55)}`
    : "none";
  const trackInnerColor = trackInnerHighlight
    ? lighten(trackColor, 0.55)
    : trackColor;
  const trackInnerHeight = Math.max(1, Math.min(2, trackHeightPx - 1));

  // Soft luminance ride at the leading edge of the sweep, fading out as the
  // track completes. Cost: one extra div, only present while sweeping.
  const sweepActive = frame >= sweepStart && frame <= sweepStart + trackSweepDur;
  const leadingFade =
    sweepActive && trackLeadingGlow
      ? interpolate(frame, [sweepStart, sweepStart + trackSweepDur], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  return (
    <AbsoluteFill style={{ position: "relative", overflow: "hidden" }}>
      {foregroundLabel && (
        <div
          style={{
            position: "absolute",
            top: "12%",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: headingFont,
            fontWeight: 800,
            fontSize: labelFontPx * 1.4,
            color: foregroundLabelColor,
            letterSpacing: "-0.02em",
            // The headline now arrives *with* the track — opacity + a small
            // upward drift ride the sweep curve, so the title settles exactly
            // as the rail locks into place. No more cold 0–16-frame fade.
            opacity: interpolate(
              frame,
              [sweepStart, sweepStart + Math.min(trackSweepDur, 18)],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
            transform: `translateY(${interpolate(
              frame,
              [sweepStart, sweepStart + Math.min(trackSweepDur, 18)],
              [10, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: sweepEasing,
              },
            )}px)`,
          }}
        >
          {foregroundLabel}
        </div>
      )}

      {/* Track rail. Two stacked layers (outer + inner highlight) so the rail
          reads as material — a struck line on paper — rather than a flat CSS
          bar. The leading-glow ride sits on top while sweeping. */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: `${trackLeftPct}%`,
          width: `${trackRightPct - trackLeftPct}%`,
          height: trackHeightPx,
          background: trackColor,
          borderRadius: Math.max(2, trackHeightPx * 0.75),
          boxShadow: trackBg,
          transform: "translateY(-50%)",
        }}
      />
      {trackInnerHighlight && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${trackLeftPct}%`,
            width: `${trackRightPct - trackLeftPct}%`,
            height: trackInnerHeight,
            background: trackInnerColor,
            borderRadius: Math.max(1, trackHeightPx * 0.5),
            transform: `translateY(calc(-50% - ${
              (trackHeightPx - trackInnerHeight) / 2
            }px))`,
            opacity: 0.55,
            pointerEvents: "none",
          }}
        />
      )}
      {trackLeadingGlow && sweepActive && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${trackHeadPct}%`,
            transform: "translate(-50%, -50%)",
            width: Math.max(40, trackPixelWidth(6)),
            height: Math.max(6, trackHeightPx * 2.4),
            background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${withAlpha(
              trackInnerHighlight ? lighten(trackColor, 0.7) : trackColor,
              0.55,
            )} 0%, ${withAlpha(trackColor, 0)} 70%)`,
            opacity: 0.9 * leadingFade,
            filter: "blur(2px)",
            pointerEvents: "none",
            borderRadius: "50%",
          }}
        />
      )}

      {/* Per-marker ripples on the track. Drawn here so the ripple reads as
          light travelling *along the rail* (it sits on the track layer's y),
          not as a circular burst from the dot. Each ripple fires when its
          marker's local drop spring passes ~0.55 (i.e. during the land). */}
      {trackRippleOnLand &&
        events.map((_, i) => {
          const markerDelay =
            sweepStart + Math.round(trackSweepDur * 0.4) + i * stagger;
          // The ripple window opens at first contact (spring ~0.55 of the
          // drop) and runs for ~330ms. We don't compute the spring here —
          // `dropDur*0.55` is the same frame the main marker's drop spring
          // passes ~0.55 with damping 11, so the ripple is timed to land
          // exactly at first contact.
          const rippleDur = Math.round(0.33 * fps);
          const rippleStart = markerDelay + Math.round(dropDur * 0.55);
          const inWindow =
            frame >= rippleStart && frame <= rippleStart + rippleDur;
          if (!inWindow) return null;
          const localFrame = frame - rippleStart;
          const rx = markers[i] ?? 50;
          const prog = localFrame / rippleDur;
          // The ripple band slides outward along the rail and widens. Width
          // drives the horizontal glow *along* the track; height is fixed to
          // (~3x the track thickness) so it stays a luminance band on the
          // rail rather than a circular burst around the dot.
          const bandPx = interpolate(prog, [0, 1], [0, 220], {
            extrapolateRight: "clamp",
          });
          const bandHeightPx = Math.max(6, trackHeightPx * 3.2);
          const rOpacity = interpolate(prog, [0, 1], [0.6, 0], {
            extrapolateRight: "clamp",
          });
          const rippleColor = withAlpha(
            trackInnerHighlight ? lighten(trackColor, 0.7) : trackColor,
            rOpacity,
          );
          return (
            <div
              key={`ripple-${i}`}
              style={{
                position: "absolute",
                top: "50%",
                left: `${rx}%`,
                transform: "translate(-50%, -50%)",
                width: bandPx * 2,
                height: bandHeightPx,
                // An elliptical radial gradient, stretched horizontally,
                // centered at the dot's x on the track. The result reads
                // as a short luminance pulse travelling outward *along the
                // rail* — not a ring around the dot.
                background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${rippleColor} 0%, ${withAlpha(
                  trackColor,
                  0,
                )} 70%)`,
                opacity: rOpacity,
                pointerEvents: "none",
                filter: "blur(3px)",
              }}
            />
          );
        })}

      {/* Markers */}
      {events.map((ev, i) => {
        const markerDelay =
          sweepStart + Math.round(trackSweepDur * 0.4) + i * stagger;
        const dropSpring = spring({
          frame,
          fps,
          delay: markerDelay,
          config: { damping: 11, mass: 1, stiffness: 130 },
          durationInFrames: dropDur,
        });
        // Drop translate: starts at -180px, settles to 0 with the spring.
        // The spring's natural overshoot (~1.05) gives a subtle settle bounce,
        // which we deliberately *do not* squash — the dot is supposed to
        // feel like it locks in, not bounce off.
        const dropY = (1 - dropSpring) * -180;
        const markerOpacity = interpolate(dropSpring, [0, 0.4], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Pop the dot on land: a micro-spring (faster than the drop) squashes
        // the dot from 1.4 → 1.0 around the contact point. This reads as
        // the marker pressing into the rail before locking.
        const popSpring = spring({
          frame,
          fps,
          delay: markerDelay + Math.round(dropDur * 0.45),
          config: { damping: 14, mass: 0.6, stiffness: 240 },
          durationInFrames: Math.max(8, Math.round(dropDur * 0.5)),
        });
        const dotScale =
          interpolate(dropSpring, [0, 1], [0.6, 1]) *
          interpolate(popSpring, [0, 1], [1.4, 1.0]);

        const xPct = markers[i] ?? 50;
        const above = i % 2 === 0;

        const ov = elementFor(i);
        const dotColor = pickColor(ov?.color, theme, "text", defaultDotColor);
        const markerLabel = ov?.text ?? ev.label;
        const perEventIcon = ev.icon ?? iconGlyphFallback;

        // Ambient focus pulse on the chosen event (default: the last one —
        // the "now" focal point of a chronology). A slow 3.2-s breathing
        // halo that begins only after the marker is locked — so it reads as
        // "this is the present" rather than competing with the drop.
        const isFocus = focusIndex === i;
        const isLocked = frame >= markerDelay + Math.round(dropDur * 0.85);
        const pulseScale = isFocus
          ? interpolate(
              frame % Math.round(fps * 3.2),
              [0, Math.round(fps * 1.6), Math.round(fps * 3.2)],
              [1, 1.32, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : 1;
        const pulseOpacity = isFocus
          ? interpolate(
              frame % Math.round(fps * 3.2),
              [0, Math.round(fps * 1.6), Math.round(fps * 3.2)],
              [0, 0.55, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : 0;
        const showPulse = isFocus && isLocked && pulseScale > 1.001;

        // Ring on land — translucent expanding ring at the contact point.
        const ringDur = Math.round(0.5 * fps);
        const ringStart = markerDelay + Math.round(dropDur * 0.5);
        const ringActive =
          dotRingOnLand && frame >= ringStart && frame <= ringStart + ringDur;
        const ringProg = ringActive ? (frame - ringStart) / ringDur : 0;
        const ringRadiusPx = ringActive
          ? interpolate(ringProg, [0, 1], [dotRadiusPx, dotRadiusPx * 2.8], {
              extrapolateRight: "clamp",
            })
          : 0;
        const ringOpacity = ringActive
          ? interpolate(ringProg, [0, 1], [0.55, 0], {
              extrapolateRight: "clamp",
            })
          : 0;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${xPct}%`,
              top: "50%",
              transform: `translate(-50%, -50%) translateY(${dropY}px)`,
              opacity: markerOpacity,
            }}
          >
            {/* Focus-pulse aura (drawn before the dot so the dot sits
                on top of the breathing ring). */}
            {showPulse && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: dotRadiusPx * 2,
                  height: dotRadiusPx * 2,
                  borderRadius: "50%",
                  transform: `translate(-50%, -50%) scale(${pulseScale})`,
                  background: "transparent",
                  boxShadow: `0 0 ${dotRadiusPx * 0.9}px ${withAlpha(
                    dotColor,
                    pulseOpacity,
                  )}`,
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Land-ring expansion (one-shot, fired on contact). */}
            {ringActive && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: ringRadiusPx * 2,
                  height: ringRadiusPx * 2,
                  borderRadius: "50%",
                  border: `2px solid ${withAlpha(dotColor, ringOpacity)}`,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Dot — per-event color; solid body. */}
            <div
              style={{
                width: dotRadiusPx * 2,
                height: dotRadiusPx * 2,
                borderRadius: "50%",
                background: dotColor,
                boxShadow: trackGlow
                  ? `0 0 ${dotRadiusPx}px ${withAlpha(trackColor, 0.55)}`
                  : `0 2px ${Math.max(4, dotRadiusPx * 0.35)}px ${withAlpha(
                      "#000000",
                      0.35,
                    )}`,
                transform: `scale(${dotScale})`,
              }}
            />

            {/* Per-event icon */}
            {perEventIcon && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  fontSize: iconFontPx,
                  fontFamily: headingFont,
                  fontWeight: 900,
                  color: trackColor,
                }}
              >
                {perEventIcon}
              </div>
            )}

            {/* Label + caption. The label fades up *after* the dot lands —
                the eye reads "the mark, then the meaning." A tiny eyebrow
                rule sits between dot and label so the label feels hung
                *off of* the dot, not floating independently. */}
            <MarkerLabel
              above={above}
              dotRadiusPx={dotRadiusPx}
              labelFontPx={labelFontPx}
              captionFontPx={captionFontPx}
              label={markerLabel}
              caption={ev.caption}
              headingFont={headingFont}
              bodyFont={bodyFont}
              labelColor={labelColor}
              mutedColor={mutedColor}
              dotColor={dotColor}
              opacity={interpolate(dropSpring, [0.55, 1], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Single marker label/caption block.
 *
 * A short eyebrow tick connects the label to its dot so the label hangs
 * *off of* the contact point instead of floating above/below the rail
 * in the void. This grounds the typography in the timeline — the design
 * reads as "marks along a rail with meaning hung off them" instead of
 * "rail + free-floating numbers".
 */
const MarkerLabel: React.FC<{
  above: boolean;
  dotRadiusPx: number;
  labelFontPx: number;
  captionFontPx: number;
  label: string;
  caption?: string;
  headingFont: string;
  bodyFont: string;
  labelColor: string;
  mutedColor: string;
  dotColor: string;
  opacity: number;
}> = ({
  above,
  dotRadiusPx,
  labelFontPx,
  captionFontPx,
  label,
  caption,
  headingFont,
  bodyFont,
  labelColor,
  mutedColor,
  dotColor,
  opacity,
}) => {
  const labelGapPx = Math.max(28, labelFontPx * 0.7);
  const tickHeight = Math.max(8, labelGapPx * 0.4);
  const tickWidth = 2;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    textAlign: "center",
    whiteSpace: "pre-wrap",
    maxWidth: 260,
    opacity,
  };
  if (above) {
    containerStyle.bottom = dotRadiusPx + labelGapPx;
  } else {
    containerStyle.top = dotRadiusPx + labelGapPx;
  }

  const tickStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    width: tickWidth,
    height: tickHeight,
    background: dotColor,
    opacity: 0.45,
    transform: "translateX(-50%)",
    borderRadius: 1,
  };
  // Tick hangs below the label when the label is above the dot, and above
  // the label when the label is below the dot — always bridging dot↔label.
  if (above) {
    tickStyle.bottom = -(tickHeight + 4);
  } else {
    tickStyle.top = -(tickHeight + 4);
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          fontFamily: headingFont,
          fontWeight: 700,
          fontSize: labelFontPx,
          color: labelColor,
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
        }}
      >
        {label}
      </div>
      {caption && (
        <div
          style={{
            fontFamily: bodyFont,
            fontSize: captionFontPx,
            color: mutedColor,
            marginTop: 4,
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {caption}
        </div>
      )}
      <div style={tickStyle} />
    </div>
  );
};
