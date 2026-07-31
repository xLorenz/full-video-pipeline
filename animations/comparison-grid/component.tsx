import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveEasing,
  pickColor,
  pickFont,
  gridCells,
  diagonalOrder,
  spiralOrder,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * ComparisonGrid — rows × cols matrix of cells that tumble into place.
 *
 * Each cell flips on its X axis (a 3D-feel reveal) and settles to reveal
 * the cell's text. Cells can be sequenced row-major, diagonal, or spiral
 *
 * Recognized element ids (one per cell, by `r-c` index):
 *   - "cell-0-0", "cell-0-1", ... up to "cell-(R-1)-(C-1)"
 *   Each cell's `text` overrides the corresponding cells[i][j].label.
 *
 * Required extras:
 *   - rows:    integer 1-6
 *   - cols:    integer 1-6
 *   - cells:   string[][]  (labels by row; MUST match rows × cols)
 * Alternatively, the agent may pass cells via elements[].text overrides
 * and provide `rows` + `cols` plus an all-placeholder cells array.
 *
 * Optional extras:
 *   - sequenceOrder:   "rowMajor" | "diagonal" | "spiral"   (default "rowMajor")
 *   - flipDurationSeconds: number 0.2-2                     (default 0.4)
 *   - staggerSeconds:  number 0-2                           (default 0.08)
 *   - cellGapPx:        number 0-40                          (default 16)
 *   - cellBackground:   theme.background if null
 *   - cellBorder:       theme.gridLine
 *   - cellRadiusPx:      number 0-40                         (default 16)
 *   - cellPaddingPx:    number 0-120                        (default 28)
 *   - flipEasing:       EasingName                           (default "ease-out-back")
 *   - headerRow:        boolean — first row of cells becomes
 *                        a header row (larger, accent color).
 */

export interface ComparisonGridProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const slotId = (r: number, c: number) => `cell-${r}-${c}`;

export const ComparisonGrid: React.FC<ComparisonGridProps> = ({
  config, styles, fontSizes,
}) => {
  const frame = useCurrentFrame();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const rows = Math.max(1, Math.min(6, Number(extras.rows ?? 2)));
  const cols = Math.max(1, Math.min(6, Number(extras.cols ?? 2)));
  const cells = (extras.cells as string[][]) ?? [];
  const sequenceOrder = (extras.sequenceOrder as string) ?? "rowMajor";
  const flipDurSec = Math.max(0.2, Number(extras.flipDurationSeconds ?? 0.4));
  const staggerSec = Math.max(0, Number(extras.staggerSeconds ?? 0.08));
  const cellGapPx = Math.max(0, Number(extras.cellGapPx ?? 16));
  const cellBg = pickColor(extras.cellBackground as string | undefined, theme, "background", "#0A1220");
  const cellBorder = pickColor(extras.cellBorder as string | undefined, theme, "gridLine", "#1A2744");
  const cellRadiusPx = Math.max(0, Number(extras.cellRadiusPx ?? 16));
  const cellPaddingPx = Math.max(0, Number(extras.cellPaddingPx ?? 28));
  const flipEasingName = (extras.flipEasing as string) ?? "ease-out-back";
  const headerRow = Boolean(extras.headerRow ?? false);

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const accentColor = pickColor(null, theme, "accent", "#FFB300");
  const textColor = pickColor(null, theme, "text", "#FFFFFF");

  const elementFor = (r: number, c: number): ElementOverride | undefined =>
    config.elements?.find((e) => e.id === slotId(r, c));
  const cellText = (r: number, c: number): string => {
    const ov = elementFor(r, c);
    if (ov?.text !== null && ov?.text !== undefined && ov.text !== "") return ov.text;
    return cells[r]?.[c] ?? "";
  };

  // Sequence order — calculate per-sequence index for each cell.
  let order: number[];
  if (sequenceOrder === "diagonal") order = diagonalOrder(rows, cols);
  else if (sequenceOrder === "spiral") order = spiralOrder(rows, cols);
  else order = Array.from({ length: rows * cols }, (_, i) => i);
  // permutations vary, so build a (cellLinearIndex -> sequenceIndex) map
  const sequenceIndex = new Map<number, number>();
  order.forEach((cellIdx, i) => sequenceIndex.set(cellIdx, i));

  const fps = 30;
  const flipDur = Math.round(flipDurSec * fps * g.speed);
  const stagger = Math.round(staggerSec * fps * g.speed);

  // The grid fills a centered region that leaves breathing room.
  const containerRect = { width: 1600, height: 800 };
  const cellRects = gridCells(rows, cols, containerRect, cellGapPx);

  const baseLabelFontPx = (fontSizes?.body ?? 32) * theme.sizeScale;
  const labelFontPx = baseLabelFontPx;

  return (
    <AbsoluteFill style={{
      justifyContent: "center", alignItems: "center", overflow: "hidden",
    }}>
      <div style={{
        position: "relative",
        width: containerRect.width, height: containerRect.height,
      }}>
        {cellRects.map((rect, idx) => {
          const r = Math.floor(idx / cols);
          const c = idx % cols;
          const seqIdx = sequenceIndex.get(idx) ?? idx;
          const flipStart = g.delayOffset + seqIdx * stagger;
          const flipT = interpolate(
            frame, [flipStart, flipStart + flipDur], [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp",
              easing: resolveEasing(flipEasingName as any) },
          );
          const isHeaderCell = headerRow && r === 0;
          const cellColor = elementFor(r, c)?.color ?? (isHeaderCell ? accentColor : cellBg);
          const textColorForCell = pickColor(
            elementFor(r, c)?.color, theme,
            isHeaderCell ? "accent" : "text",
            isHeaderCell ? "#FFB300" : "#FFFFFF",
          );
          // Flip on X-axis: rotate from 90deg (edge-on, invisible) to 0deg (full face).
          const rotateX = interpolate(flipT, [0, 1], [90, 0]);
          const opacity = interpolate(flipT, [0, 0.2, 1], [0, 0.1, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const textOpacity = interpolate(flipT, [0.5, 1], [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div
              key={idx}
              style={{
                position: "absolute",
                left: rect.x, top: rect.y, width: rect.width, height: rect.height,
                boxSizing: "border-box",
                padding: cellPaddingPx,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: cellColor,
                border: isHeaderCell ? `2px solid ${accentColor}` : `1px solid ${cellBorder}`,
                borderRadius: cellRadiusPx,
                transform: `perspective(800px) rotateX(${rotateX}deg)`,
                transformOrigin: "center top",
                opacity,
                textAlign: "center",
              }}
            >
              <div style={{
                opacity: textOpacity,
                fontFamily: isHeaderCell ? headingFont : headingFont,
                fontSize: isHeaderCell ? labelFontPx * 1.15 : labelFontPx,
                fontWeight: isHeaderCell ? 800 : 600,
                color: isHeaderCell ? textColor : textColorForCell,
                lineHeight: 1.2,
                maxWidth: "100%",
              }}>
                {cellText(r, c)}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
