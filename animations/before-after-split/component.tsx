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
 * BeforeAfterSplit — two-panel divider wipe that reveals a contrast.
 *
 * Two halves fill the screen; a vertical or horizontal dividing bar sweeps
 * from one side to the other to expose the second panel. Optional labels
 * ride along at the start of each panel.
 *
 * Recognized element ids:
 *   - "before-label"     headline text on the FIRST panel (left / top)
 *   - "after-label"      headline text on the SECOND panel (right / bottom)
 *
 * extras.* (declared in config/schema.json):
 *   - direction:        "horizontal" | "vertical"      (default "vertical")
 *   - sweepDurationSeconds: number 0.3-8              (default 1.2)
 *   - dividerStyle:     "line" | "gradient"           (default "line")
 *   - dividerColor:     hex string                    (default theme.accent)
 *   - beforeColor:      hex string                    (default theme.danger)
 *   - afterColor:       hex string                    (default theme.success)
 *   - dividerWidthPx:   number 1-32                   (default 4)
 *   - panelPaddingPx:   number 0-200                  (default 96)
 *   - labelOpacityDuringSweep: number 0-1             (default 0.6) — label dim
 *                       while the wipe is in progress, full opacity after.
 */

export interface BeforeAfterSplitProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

export const BeforeAfterSplit: React.FC<BeforeAfterSplitProps> = ({
  config,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const direction = (extras.direction as string) === "horizontal" ? "h" : "v";
  const sweepDurSec = Math.max(0.3, Number(extras.sweepDurationSeconds ?? 1.2));
  const dividerStyle = (extras.dividerStyle as string) ?? "line";
  const fps = 30;
  const sweepDur = Math.round(sweepDurSec * fps);
  const beforeColor = pickColor(extras.beforeColor as string | undefined, theme, "danger", "#EF4444");
  const afterColor = pickColor(extras.afterColor as string | undefined, theme, "success", "#10B981");
  const dividerColor = pickColor(extras.dividerColor as string | undefined, theme, "accent", "#FFB300");
  const dividerWidthPx = Math.max(1, Number(extras.dividerWidthPx ?? 4));
  const panelPaddingPx = Math.max(0, Number(extras.panelPaddingPx ?? 96));
  const labelDim = Math.max(0, Math.min(1, Number(extras.labelOpacityDuringSweep ?? 0.6)));

  // Sweep runs from frame 0 (post any delayOffset) to sweepDur (after speed).
  const sweepStart = g.delayOffset;
  const sweepProgress = interpolate(
    frame,
    [sweepStart, sweepStart + sweepDur],
    [0, 1],
    {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: resolveEasing(g.easing),
    },
  );

  const findOv = (id: string): ElementOverride | undefined =>
    config.elements?.find((e) => e.id === id);
  const beforeText = findOv("before-label")?.text ?? "Before";
  const afterText = findOv("after-label")?.text ?? "After";

  // Labels fade in at scene start, then dim slightly during sweep, then
  // return to full opacity once sweep completes.
  const labelFadeIn = interpolate(
    frame, [sweepStart, sweepStart + 12], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const labelOpacity = labelFadeIn * interpolate(
    frame, [sweepStart, sweepStart + sweepDur, sweepStart + sweepDur + 12],
    [labelDim, labelDim, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const labelFontPx = (fontSizes?.body ?? 56) * theme.sizeScale;

  const isHorizontal = direction === "h";

  // Sweep progress from 0 to 1. At 0: "before" panel fills the frame
  // and "after" is hidden. At 1: "after" fills the frame and "before" is hidden.
  // The divider position is exactly at sweepProgress * 100%.
  // We achieve this by clipping each panel to the correct side of the divider.
  const dividerPositionPct = sweepProgress * 100;

  // Clipping approach: both panels are full-screen AbsoluteFill, but each is
  // clipped to its side of the moving divider. This guarantees perfect
  // alignment between the visual split and the divider line.
  //
  // Vertical: divider sweeps left→right. "Before" is the area to the right of
  //   the divider (shrinks as divider moves right). "After" is the area to the
  //   left of the divider (grows as divider moves right).
  // Horizontal: divider sweeps top→bottom. "Before" is the area below the
  //   divider (shrinks). "After" is the area above the divider (grows).
  //
  // inset(top right bottom left)
  const beforeClip = isHorizontal
    ? `inset(0 0 ${100 - dividerPositionPct}% 0)`   // clip bottom; before shrinks from bottom
    : `inset(0 0 0 ${dividerPositionPct}%)`;        // clip left; before shrinks from left
  const afterClip = isHorizontal
    ? `inset(${dividerPositionPct}% 0 0 0)`         // clip top; after grows upward
    : `inset(0 ${100 - dividerPositionPct}% 0 0)`;  // clip right; after grows from left

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* BEFORE panel — full frame, clipped to left/top side of divider */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: beforeColor,
        display: "flex",
        padding: panelPaddingPx,
        boxSizing: "border-box",
        justifyContent: "center",
        alignItems: "center",
        clipPath: beforeClip,
      }}>
        <div style={{
          fontFamily: headingFont,
          fontWeight: 800,
          fontSize: labelFontPx,
          color: "rgba(255,255,255,0.96)",
          opacity: labelOpacity,
          textShadow: "0 4px 18px rgba(0,0,0,0.45)",
          textAlign: "center",
        }}>
          {beforeText}
        </div>
      </div>

      {/* AFTER panel — full frame, clipped to right/bottom side of divider */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: afterColor,
        display: "flex",
        padding: panelPaddingPx,
        boxSizing: "border-box",
        justifyContent: "center",
        alignItems: "center",
        clipPath: afterClip,
      }}>
        <div style={{
          fontFamily: headingFont,
          fontWeight: 800,
          fontSize: labelFontPx,
          color: "rgba(255,255,255,0.96)",
          opacity: labelOpacity,
          textShadow: "0 4px 18px rgba(0,0,0,0.45)",
          textAlign: "center",
        }}>
          {afterText}
        </div>
      </div>

      {/* Divider — sits exactly at the sweep position */}
      <div style={{
        position: "absolute",
        ...(isHorizontal
          ? { top: `${dividerPositionPct}%`, left: 0, right: 0, height: dividerWidthPx, width: "auto" }
          : { left: `${dividerPositionPct}%`, top: 0, bottom: 0, width: dividerWidthPx, height: "auto" }),
        background: dividerColor,
        boxShadow: dividerStyle === "gradient"
          ? `0 0 ${dividerWidthPx * 6}px ${dividerColor}, 0 0 ${dividerWidthPx * 3}px ${dividerColor}`
          : `0 0 ${dividerWidthPx * 2}px ${dividerColor}80`,
        pointerEvents: "none",
      }} />
    </AbsoluteFill>
  );
};
