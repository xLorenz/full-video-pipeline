import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
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
 * A horizontal track runs across the screen; one marker per `events[]`
 * input drops in from above and locks onto a target position along the
 * track. Each marker can show a label, an icon (a small unicode glyph),
 * and an optional second-line caption.
 *
 * Recognized element ids (one per milestone slot, by index):
 *   - "event-0", "event-1", "event-2", ... up to "event-{N-1}"
 *
 * Required extras:
 *   - events: events[]  (label, time? for relative position; otherwise
 *                        evenly spaced)
 *
 * Optional extras:
 *   - trackColor:       theme.accent if null
 *   - trackHeightPx:    number 1-16 (default 4)
 *   - dotColor:         theme.text if null
 *   - dotRadiusPx:      number 4-40 (default 18)
 *   - labelColor:       theme.text
 *   - markerDropDurationSeconds: number 0.2-3  (default 0.6) — drop in duration
 *   - staggerSeconds:   number 0-3 (default 0.4) — interval between markers
 *   - iconGlyph:        string                    (default "") — applied to ALL
 *   - foregroundLabel:  string                    (default "") — title above the track
 *   - foregroundLabelColor: theme.text if null
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

export const TimelineMarker: React.FC<TimelineMarkerProps> = ({
  config, styles, fontSizes,
}) => {
  const frame = useCurrentFrame();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const events = (extras.events as TimelineEvent[]) ?? [];
  const trackColor = pickColor(extras.trackColor as string | undefined, theme, "accent", "#FFB300");
  const trackHeightPx = Math.max(1, Number(extras.trackHeightPx ?? 4));
  const dotColor = pickColor(extras.dotColor as string | undefined, theme, "text", "#FFFFFF");
  const dotRadiusPx = Math.max(4, Number(extras.dotRadiusPx ?? 18));
  const labelColor = pickColor(extras.labelColor as string | undefined, theme, "text", "#FFFFFF");
  const dropDurSec = Math.max(0.2, Number(extras.markerDropDurationSeconds ?? 0.6));
  const staggerSec = Math.max(0, Number(extras.staggerSeconds ?? 0.4));
  const iconGlyph = String(extras.iconGlyph ?? "");
  const foregroundLabel = String(extras.foregroundLabel ?? "");
  const foregroundLabelColor = pickColor(
    extras.foregroundLabelColor as string | undefined, theme, "text", "#FFFFFF",
  );
  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");
  const fps = 30;

  // Track runs across the central horizontal axis. Markers are positioned
  // along it: if `events[i].time` is provided, it's normalized to the
  // range of times; otherwise markers are evenly spaced.
  const times = events.map((e) => e.time);
  const useTimes = times.some((t) => t !== undefined && t !== null);
  const tmin = useTimes ? Math.min(...(times.filter((t) => t !== undefined) as number[])) : 0;
  const tmax = useTimes ? Math.max(...(times.filter((t) => t !== undefined) as number[])) : 1;
  const tspan = Math.max(1, tmax - tmin);
  const normalized = events.map((e, i) => {
    if (useTimes && e.time !== undefined) return (e.time - tmin) / tspan;
    // Even distribution when no times present.
    return events.length === 1 ? 0.5 : i / (events.length - 1);
  });

  // The track's left/right edges leave padding for the label gutters.
  const trackPaddingPct = 8; // 8% on each side
  const markers = normalized.map((t, i) => trackPaddingPct + t * (100 - 2 * trackPaddingPct));

  const elementFor = (i: number): ElementOverride | undefined =>
    config.elements?.find((e) => e.id === slotId(i));

  const sweepStart = g.delayOffset;
  // Track itself sweeps from left→right over the first 1s of the scene.
  const trackSweepDur = Math.round(0.8 * fps * g.speed);
  const trackProgress = interpolate(
    frame,
    [sweepStart, sweepStart + trackSweepDur],
    [0, 1],
    {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: resolveEasing(g.easing),
    },
  );
  const trackLeftPct = trackPaddingPct;
  const trackRightPct = trackPaddingPct + trackProgress * (100 - 2 * trackPaddingPct);

  const dropDur = Math.round(dropDurSec * fps * g.speed);
  const stagger = Math.round(staggerSec * fps * g.speed);

  const labelFontPx = (fontSizes?.body ?? 36) * theme.sizeScale;
  const iconFontPx = labelFontPx * 1.2;
  const captionFontPx = labelFontPx * 0.55;

  return (
    <AbsoluteFill style={{ position: "relative", overflow: "hidden" }}>
      {foregroundLabel && (
        <div
          style={{
            position: "absolute",
            top: "12%", left: 0, right: 0,
            textAlign: "center",
            fontFamily: headingFont,
            fontWeight: 800,
            fontSize: labelFontPx * 1.4,
            color: foregroundLabelColor,
            opacity: interpolate(frame, [sweepStart, sweepStart + 16], [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            textShadow: "0 4px 18px rgba(0,0,0,0.45)",
          }}
        >
          {foregroundLabel}
        </div>
      )}
      {/* Track */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: `${trackLeftPct}%`,
          width: `${trackRightPct - trackLeftPct}%`,
          height: trackHeightPx,
          background: trackColor,
          borderRadius: 3,
          boxShadow: `0 0 ${trackHeightPx * 3}px ${trackColor}80`,
          transform: "translateY(-50%)",
        }}
      />
      {/* Markers */}
      {events.map((ev, i) => {
        const markerDelay = sweepStart + Math.round(trackSweepDur * 0.4) + i * stagger;
        const dropT = interpolate(
          frame,
          [markerDelay, markerDelay + dropDur],
          [0, 1],
          {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: resolveEasing(elementFor(i)?.easing ?? g.easing),
          },
        );
        const dropY = interpolate(dropT, [0, 1], [-200, 0]);
        const markerOpacity = interpolate(dropT, [0, 0.5], [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const dotScale = interpolate(dropT, [0, 1], [0.4, 1]);
        const xPct = markers[i] ?? 50;
        // Label sits above the dot for events 0,2,4,..., below for others.
        const above = i % 2 === 0;
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
            {/* Dot */}
            <div
              style={{
                width: dotRadiusPx * 2,
                height: dotRadiusPx * 2,
                borderRadius: "50%",
                background: dotColor,
                boxShadow: `0 0 ${dotRadiusPx}px ${trackColor}`,
                transform: `scale(${dotScale})`,
              }}
            />
            {/* Icon glyph inside the dot (optional) */}
            {iconGlyph && (
              <div style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: iconFontPx,
                fontFamily: headingFont,
                fontWeight: 900,
                color: trackColor,
              }}>
                {iconGlyph}
              </div>
            )}
            {/* Label + caption — single fixed gap from the dot edge.
                Same gap (labelGapPx) above and below the track, so the
                top-of-below-label and bottom-of-top-label sit equidistant
                from the track line. Anchored to the dot wrapper via
                `bottom:`/`top:` (px) so the layout is explicit, no
                percentage-of-content translation that drifts with line count. */}
            {(() => {
              const labelGapPx = 18;
              const labelStyle: React.CSSProperties = {
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                textAlign: "center",
                whiteSpace: "pre-wrap",
                maxWidth: 260,
                opacity: interpolate(dropT, [0.4, 1], [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              };
              if (above) {
                // Anchor the box's BOTTOM edge labelGapPx above the dot's top.
                labelStyle.bottom = dotRadiusPx + labelGapPx;
              } else {
                // Anchor the box's TOP edge labelGapPx below the dot's bottom.
                labelStyle.top = dotRadiusPx + labelGapPx;
              }
              return (
                <div style={labelStyle}>
                  <div style={{
                    fontFamily: headingFont, fontWeight: 700,
                    fontSize: labelFontPx, color: labelColor,
                    textShadow: "0 2px 10px rgba(0,0,0,0.6)",
                    display: "flex", flexDirection: "column", alignItems: "center",
                  }}>
                    {elementFor(i)?.text ?? ev.label}
                  </div>
                  {ev.caption && (
                    <div style={{
                      fontFamily: bodyFont, fontSize: captionFontPx,
                      color: mutedColor, marginTop: 4,
                    }}>
                      {ev.caption}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
