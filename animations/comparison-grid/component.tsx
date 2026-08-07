import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from "remotion";
import {
  resolveTheme,
  resolveGlobal,
  resolveEasing,
  pickColor,
  pickFont,
  diagonalOrder,
  spiralOrder,
  type TemplateConfig,
  type ElementOverride,
  type EasingName,
} from "../_shared";

/**
 * ComparisonGrid — rows × cols matrix of cells that tumble into place.
 *
 * Each cell lands via an X-axis flip driven by a damped spring, then a brief
 * accent top-edge bloom flashes on landing. Cells can be sequenced row-major,
 * diagonal, or spiral. Optional heading block (eyebrow + title) reads above
 * the matrix; an optional `winnerRow` reveals an accent rail on that row's
 * left edge after the matrix settles — the signature beat that draws the eye
 * to the result.
 *
 * Rhythm (built-in):
 *   - Frames 0..~15: eyebrow + title fade/slide up.
 *   - After title lands, cells flip in over `flipDurationSeconds` each,
 *     staggered by `staggerSeconds` along `sequenceOrder`.
 *   - Each cell's flip lands via `spring({damping: 14, mass: 1})`; an accent
 *     top-edge bloom flashes in the 8 frames after landing.
 *   - `postFlipHoldFrames` (default 18) holds the assembled matrix; if
 *     `winnerRow` is set, the post-settle beat is used to reveal the accent
 *     rail instead of a static breath.
 *
 * Recognized element ids (one per cell, by `r-c` index):
 *   - "cell-0-0", "cell-0-1", ... up to "cell-(R-1)-(C-1)"
 *   Each cell's `text` overrides cells[i][j]; `color` overrides the cell's
 *   text color; `custom.mono: true` enables tabular-nums for numeric cells;
 *   `custom.weight: number` adjusts the font weight per cell.
 *
 * Required extras:
 *   - rows:  int 1-6
 *   - cols:  int 1-6
 *   - cells: string[][]  (labels by row; should match rows × cols)
 * Alternatively pass cells via elements[].text overrides plus `rows` + `cols`
 * (with `cells` left empty or all-placeholder).
 *
 * Optional extras:
 *   - eyebrow:            string | null                         (default null)
 *                         Small mono-uppercase eyebrow line above the title.
 *   - title:              string | null                         (default null)
 *                         Headline above the matrix.
 *   - sequenceOrder:      "rowMajor" | "diagonal" | "spiral"    (default "diagonal")
 *   - flipDurationSeconds:  number 0.2-2                        (default 0.42)
 *   - staggerSeconds:       number 0-2                          (default 0.07)
 *   - cellGapPx:            number 0-40                         (default 8)
 *   - cellBackground:      theme.background if null
 *   - cellBorder:          theme.gridLine   (default subtle 6%-white hairline;
 *                          the broadsheet look is off). Set to a stronger
 *                          color if your brief calls for explicit rules.
 *   - cellRadiusPx:        number 0-40                         (default 10)
 *   - cellPaddingPx:       number 0-120                         (default 24)
 *   - headerCellPaddingPx: number 0-120                        (default 16)
 *   - headerRowRatio:      number 0.3-1.5                       (default 0.7)
 *                         Height of the header row relative to body rows
 *                         (with `headerRow: true`). 0.7 = a banner shorter
 *                         than its data rows; 1 = uniform heights.
 *   - headerEmphasis:     "none" | "fill" | "border" | "both"   (default "none")
 *                         Header emphasis.
 *                         `"none"` (NEW DEFAULT): accent-color text + an accent
 *                         rule UNDER the header row spanning the grid width —
 *                         reads like a real table header, not a banner.
 *                         `"fill"` accent background + body text (legacy).
 *                         `"border"` body fill + accent top border.
 *                         `"both"` double emphasis (rare).
 *   - flipEasing:         EasingName                           (default "ease-out-cubic")
 *                         Eased fallback for the flip (the spring drives the
 *                         actual rotateX); the eased value drives the text
 *                         reveal opacity timing.
 *   - accentLandFlash:    boolean                              (default true)
 *                         Brief accent top-edge bloom when each cell lands.
 *   - rowSeparators:      boolean                              (default false)
 *                         Faint hairline between body rows.
 *   - winnerRow:          int | null                           (default null)
 *                         Index of the body row to spotlight post-settle.
 *                         After the matrix settles, an accent rail grows from
 *                         the row's left edge + the row's text brightens from
 *                         muted to the accent color. The signature moment.
 *   - winnerRowDurationFrames: number ≥4                        (default 14)
 *                         Duration of the winner-row reveal, in frames.
 *   - cellBorderless:     boolean                              (default false)
 *                         Drop body-cell borders (grid reads by spacing + fills).
 *   - postFlipHoldFrames: integer ≥0                           (default 18)
 *   - containerWidthPct:  number 50-100                        (default 88)
 *                         Grid container width, percent of scene canvas.
 *   - containerHeightPct: number 30-100                        (default 64)
 *                         Grid container height, percent of scene canvas
 *                         AFTER the heading block is reserved — so the grid
 *                         sits in the lower 64% of canvas rather than claiming
 *                         the entire frame.
 *   - columnWidths:       number[] | null                      (default null)
 *                         Relative width weights per column (e.g.
 *                         [0.85, 1, 1, 1] for a narrow option column with
 *                         three equal data columns). Falls back to all-equal
 *                         when null or mismatched-length.
 *   - columnAlign:        ("left"|"center"|"right")[] | null   (default "center")
 *                         Per-column text alignment (e.g. ["left","right","right"]
 *                         for left-aligned labels and right-aligned numbers).
 */

export interface ComparisonGridProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

const slotId = (r: number, c: number) => `cell-${r}-${c}`;

const HEADING_INTRO_FRAMES = 12;
const HEADING_HOLD_AFTER_FRAMES = 6;
const LAND_FLASH_FRAMES = 8;

export const ComparisonGrid: React.FC<ComparisonGridProps> = ({
  config, styles, fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;
  const rows = Math.max(1, Math.min(6, Number(extras.rows ?? 2)));
  const cols = Math.max(1, Math.min(6, Number(extras.cols ?? 2)));
  const cells = (extras.cells as string[][]) ?? [];
  const eyebrow = (extras.eyebrow as string | null | undefined) ?? null;
  const title = (extras.title as string | null | undefined) ?? null;
  const subtitle = (extras.subtitle as string | null | undefined) ?? null;
  const sequenceOrder = (extras.sequenceOrder as string) ?? "diagonal";
  const flipDurSec = Math.max(0.2, Number(extras.flipDurationSeconds ?? 0.42));
  const staggerSec = Math.max(0, Number(extras.staggerSeconds ?? 0.07));
  const cellGapPx = Math.max(0, Number(extras.cellGapPx ?? 8));
  const sceneBg = pickColor(null, theme, "background", "#0A1220");
  const cellBg = pickColor(extras.cellBackground as string | undefined, theme, "background", sceneBg);
  const cellBorder = pickColor(extras.cellBorder as string | undefined, theme, "gridLine", "rgba(255,255,255,0.05)");
  const cellRadiusPx = Math.max(0, Number(extras.cellRadiusPx ?? 10));
  const cellPaddingPx = Math.max(0, Number(extras.cellPaddingPx ?? 24));
  const headerCellPaddingPx = Math.max(0, Number(extras.headerCellPaddingPx ?? 16));
  const headerRowRatio = Math.min(1.5, Math.max(0.3, Number(extras.headerRowRatio ?? 0.7)));
  const flipEasingName = (extras.flipEasing as EasingName) ?? "ease-out-cubic";
  const headerRow = Boolean(extras.headerRow ?? false);
  const headerEmphasis = (extras.headerEmphasis as string) ?? "none";
  const cellBorderless = Boolean(extras.cellBorderless ?? false);
  const accentLandFlash = extras.accentLandFlash !== false;
  const rowSeparators = Boolean(extras.rowSeparators ?? false);
  const winnerRowRaw = extras.winnerRow;
  const winnerRow =
    typeof winnerRowRaw === "number" && winnerRowRaw >= 0 && winnerRowRaw < rows
      ? Math.floor(winnerRowRaw)
      : null;
  const winnerRowDurationFrames = Math.max(4, Number(extras.winnerRowDurationFrames ?? 14));
  const postFlipHoldFrames = Math.max(0, Number(extras.postFlipHoldFrames ?? 18));
  const containerWidthPct = Math.min(100, Math.max(50, Number(extras.containerWidthPct ?? 88)));
  const containerHeightPct = Math.min(100, Math.max(30, Number(extras.containerHeightPct ?? 64)));
  const columnWidthsRaw = (extras.columnWidths as number[] | null | undefined) ?? null;
  const columnAlignRaw = (extras.columnAlign as string[] | null | undefined) ?? null;

  // Fonts — keep the visual hierarchy of the brochures in mind.
  const headingFont = pickFont(null, theme, "heading", "Inter");
  const bodyFont = pickFont(null, theme, "body", "Inter");
  const monoFont = pickFont(null, theme, "mono", "JetBrains Mono");
  const accentColor = pickColor(null, theme, "accent", pickColor(null, theme, "primary", "#00E5B4"));
  const textColor = pickColor(null, theme, "text", "#FFFFFF");
  const mutedColor = pickColor(null, theme, "muted", "#8B95A7");

  // Element overrides hot path.
  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const elementFor = (r: number, c: number): ElementOverride | undefined =>
    overrideMap.get(slotId(r, c));
  const cellText = (r: number, c: number): string => {
    const ov = elementFor(r, c);
    if (ov?.text !== null && ov?.text !== undefined && ov.text !== "") return ov.text;
    return cells[r]?.[c] ?? "";
  };
  const cellMono = (r: number, c: number): boolean =>
    Boolean((elementFor(r, c)?.custom as { mono?: boolean } | undefined)?.mono);
  const cellWeightOverride = (r: number, c: number): number | null => {
    const w = (elementFor(r, c)?.custom as { weight?: number } | undefined)?.weight;
    return typeof w === "number" ? w : null;
  };

  // Sequence order — diagonal by default feels rigorously editorial.
  let order: number[];
  if (sequenceOrder === "spiral") order = spiralOrder(rows, cols);
  else if (sequenceOrder === "rowMajor") order = Array.from({ length: rows * cols }, (_, i) => i);
  else order = diagonalOrder(rows, cols);
  const sequenceIndex = new Map<number, number>();
  order.forEach((cellIdx, i) => sequenceIndex.set(cellIdx, i));

  const flipDur = Math.round(flipDurSec * fps * g.speed);
  const stagger = Math.round(staggerSec * fps * g.speed);
  void postFlipHoldFrames;

  // Heading block reservation. When eyebrow/title are present we reserve
  // a top strip for them so the container moves down accordingly.
  const headingPresent = Boolean(eyebrow || title || subtitle);
  const headingBlockPx = headingPresent
    ? Math.round(canvasHeight * 0.16)
    : 0;

  // Container rect — derived from canvas so vertical + non-16:9 deliverables
  // don't break. Reserved a top strip for the heading block first.
  const containerRect = useMemo(() => ({
    width: Math.round(canvasWidth * containerWidthPct / 100),
    height: Math.round((canvasHeight - headingBlockPx) * containerHeightPct / 100),
    x: Math.round(canvasWidth * (100 - containerWidthPct) / 200),
    y: headingBlockPx + Math.round((canvasHeight - headingBlockPx) * (100 - containerHeightPct) / 200),
  }), [canvasWidth, canvasHeight, containerWidthPct, containerHeightPct, headingBlockPx]);

  // Row heights with header ratio. Header row uses `headerRowRatio` of a body
  // row's height. Body rows share equally among (rows - headerRow ? 1 : 0) Irish.
  const bodyRowCount = headerRow ? rows - 1 : rows;
  const rowHeights: number[] = useMemo(() => {
    const out: number[] = [];
    // total non-gap height = container.height - gap*(rows-1)
    const nonGap = containerRect.height - cellGapPx * (rows - 1);
    // weighted: header row counts as `headerRowRatio` body-units; body rows as 1 each.
    const totalUnits = (headerRow ? headerRowRatio : 0) + bodyRowCount * 1;
    const unit = nonGap / totalUnits;
    for (let r = 0; r < rows; r++) {
      if (headerRow && r === 0) out.push(Math.round(unit * headerRowRatio));
      else out.push(Math.round(unit));
    }
    return out;
  }, [containerRect.height, cellGapPx, rows, headerRow, headerRowRatio, bodyRowCount]);

  // Column widths with relative weights. All-equal when null or mismatched.
  const columnWeights: number[] = useMemo(() => {
    if (columnWidthsRaw && columnWidthsRaw.length === cols) {
      return columnWidthsRaw.map((w) => Math.max(0.05, w));
    }
    return new Array(cols).fill(1);
  }, [columnWidthsRaw, cols]);
  const columnWidths: number[] = useMemo(() => {
    const nonGap = containerRect.width - cellGapPx * (cols - 1);
    const totalW = columnWeights.reduce((a, b) => a + b, 0) || 1;
    return columnWeights.map((w) => (w / totalW) * nonGap).map((v) => Math.round(v));
  }, [columnWeights, cellGapPx, containerRect.width, cols]);

  // cellRects computed here rather than via `gridCells` since we now vary both
  // row heights (headerBanner ratio) and column widths.
  const cellRects: { x: number; y: number; width: number; height: number }[] = useMemo(() => {
    const out: { x: number; y: number; width: number; height: number }[] = [];
    let y = containerRect.y;
    for (let r = 0; r < rows; r++) {
      let x = containerRect.x;
      for (let c = 0; c < cols; c++) {
        out.push({ x, y, width: columnWidths[c], height: rowHeights[r] });
        x += columnWidths[c] + cellGapPx;
      }
      y += rowHeights[r] + cellGapPx;
    }
    return out;
  }, [rows, cols, containerRect, columnWidths, rowHeights, cellGapPx]);

  // Column text alignment.
  const columnAlign = useMemo<("left" | "center" | "right")[]>(() => {
    const fallback: ("left" | "center" | "right")[] = new Array(cols).fill("center");
    if (!columnAlignRaw) return fallback;
    const aligned: ("left" | "center" | "right")[] = columnAlignRaw
      .slice(0, cols)
      .map((v) => (v === "left" || v === "right" || v === "center" ? v : "center"));
    while (aligned.length < cols) aligned.push("center");
    return aligned;
  }, [columnAlignRaw, cols]);

  // Per-cell timing: each cell starts at g.delayOffset + headingIntro +
  // seqIdx*stagger. The heading intro reserves the first ~18 frames so the
  // eyebrow+title land BEFORE any cell starts flipping.
  const headingIntroFrames = headingPresent ? HEADING_INTRO_FRAMES + HEADING_HOLD_AFTER_FRAMES : 0;
  const cellStartFor = (idx: number) => {
    const seqIdx = sequenceIndex.get(idx) ?? idx;
    return g.delayOffset + headingIntroFrames + seqIdx * stagger;
  };

  // Last cell lands at start + flipDur; winnerRow reveal kicks at lastLand+4.
  let lastLand = 0;
  for (let idx = 0; idx < rows * cols; idx++) {
    lastLand = Math.max(lastLand, cellStartFor(idx) + Math.round(flipDurSec * fps));
  }
  const winnerStart = winnerRow !== null
    ? g.delayOffset + (order.length - 1) * stagger + flipDur + headingIntroFrames + 4
    : Number.POSITIVE_INFINITY;

  const baseLabelFontPx = (fontSizes?.body ?? 28) * theme.sizeScale;
  const eyebrowFontPx = Math.round((fontSizes?.caption ?? 16) * theme.sizeScale);
  const titleFontPx = Math.round((fontSizes?.headline ?? 52) * theme.sizeScale);
  const subtitleFontPx = Math.round((fontSizes?.body ?? 28) * 0.62 * theme.sizeScale);

  // Heading intro timings (eyebrow first, then title, then rule slide).
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
  const underlineT = interpolate(
    frame, [g.delayOffset + 6, g.delayOffset + 6 + HEADING_INTRO_FRAMES], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Winner-row reveal — accent rail grows from row's left edge to its full
  // height, then the row's text brightens from muted to accent over the same
  // window. The rail crossfades through the divider-live states of the cell.
  const winnerT = winnerRow === null
    ? 0
    : interpolate(
        frame, [winnerStart, winnerStart + winnerRowDurationFrames], [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1) },
      );
  const winnerRailGrow = interpolate(winnerT, [0, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const winnerTextBrighten = interpolate(winnerT, [0.25, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{
      backgroundColor: sceneBg,
      justifyContent: "flex-start",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Heading block — eyebrow → title → horizontal accent rule.
          Reserves headingBlockPx (top 16% of canvas) so the grid below
          sits below the heading rather than overlapping it. */}
      {headingPresent && (
        <div style={{
          position: "absolute",
          left: containerRect.x,
          top: Math.round(canvasHeight * 0.06),
          width: containerRect.width,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: eyebrowT,
          transform: `translateY(${(1 - eyebrowT) * 14}px)`,
        }}>
          {eyebrow && (
            <div style={{
              fontFamily: monoFont,
              fontSize: eyebrowFontPx,
              fontWeight: 500,
              color: accentColor,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: eyebrowT,
            }}>
              {eyebrow}
            </div>
          )}
          {title && (
            <div style={{
              fontFamily: headingFont,
              fontSize: titleFontPx,
              fontWeight: 700,
              color: textColor,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              opacity: titleT,
              transform: `translateY(${(1 - titleT) * 14}px)`,
            }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{
              fontFamily: bodyFont,
              fontSize: subtitleFontPx,
              fontWeight: 400,
              color: mutedColor,
              letterSpacing: "0",
              opacity: titleT * 0.9,
              transform: `translateY(${(1 - titleT) * 14}px)`,
              marginTop: 4,
            }}>
              {subtitle}
            </div>
          )}
          {/* Accent underline that extends from the left edge after the
              title settles — gives the header structure + a beat for the eye
              to follow from eyebrow → title → grid. */}
          <div style={{
            marginTop: 10,
            width: `${underlineT * 28}%`,
            height: 2,
            background: accentColor,
            opacity: underlineT * 0.85,
          }} />
        </div>
      )}

      {/* Optional faint row separators between body rows — hairline tints
          spanning the full grid width, sitting ON the gap between rows. */}
      {rowSeparators && bodyRowCount > 1 && cellRects.map((_rect, idx) => {
        const r = idx === 0 ? -1 : Math.floor(idx / cols);
        const c = idx % cols;
        if (c !== 0 || r < 0) return null;
        if (headerRow && r === 0) return null; // skip just-after-header (the header underline takes over below)
        const prev = cellRects[idx - cols];
        if (!prev) return null;
        const sepY = prev.y + prev.height + cellGapPx / 2 - 0.5;
        return (
          <div key={`sep-${r}`} style={{
            position: "absolute",
            left: containerRect.x,
            top: sepY,
            width: containerRect.width,
            height: 1,
            background: cellBorder,
            opacity: 0.7,
            pointerEvents: "none",
          }} />
        );
      })}

      {/* Accent rule UNDER the header row (when headerEmphasis = "none"):
          spans the FULL grid width as a single continuous hairline at the
          bottom of row 0 → reads as a table header, not a per-cell border. */}
      {headerRow && headerEmphasis === "none" && cellRects.length >= cols && (() => {
        const lastHeaderIdx = cols - 1;
        const r = cellRects[lastHeaderIdx];
        const ruleY = r.y + r.height + cellGapPx / 2 - 0.5;
        // reveal the rule when the last header cell lands.
        const ruleStart = cellStartFor(lastHeaderIdx);
        const ruleT = interpolate(
          frame, [ruleStart, ruleStart + HEADING_INTRO_FRAMES], [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1) },
        );
        return (
          <div style={{
            position: "absolute",
            left: containerRect.x,
            top: ruleY,
            width: containerRect.width * ruleT,
            height: 2,
            background: accentColor,
            opacity: 0.95 * ruleT,
            pointerEvents: "none",
          }} />
        );
      })()}

      {/* Cells */}
      {cellRects.map((rect, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const flipStart = cellStartFor(idx);
        const ov = elementFor(r, c);
        const flipSpring = spring({
          frame,
          fps,
          delay: flipStart,
          config: { damping: 14, mass: 1, stiffness: 120 },
          durationInFrames: flipDur,
        });
        const isHeaderCell = headerRow && r === 0;
        const useFill = isHeaderCell && (headerEmphasis === "fill" || headerEmphasis === "both");
        const useBorder = isHeaderCell && (headerEmphasis === "border" || headerEmphasis === "both");
        const useRule = isHeaderCell && headerEmphasis === "none";

        // Winner-row brighten — text shifts from body/muted toward accent.
        const isWinnerCell = winnerRow !== null && r === winnerRow && !isHeaderCell;
        const winnerTextColor = useFill ? textColor : (isWinnerCell
          ? mixHex(textColor, accentColor, winnerTextBrighten * 0.85)
          : isHeaderCell
            ? (useRule || useFill ? accentColor : textColor)
            : (c === 0 ? textColor : mutedColor));

        // Body cells use the body background. Header cells: with `fill` they
        // get the accent surface; with `none`/`border` they keep the cell bg.
        const cellFill = useFill
          ? accentColor
          : (ov?.color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(ov.color)
              ? ov.color
              : cellBg);

        const cellHeaderTextColor = useFill ? pickColor(null, theme, "background", "#0A1220") : accentColor;
        const resolvedTextColorForCell = isHeaderCell
          ? cellHeaderTextColor
          : winnerTextColor;

        const rotateX = interpolate(flipSpring, [0, 1], [80, 0]);
        const opacity = interpolate(flipSpring, [0, 0.18, 1], [0, 0.12, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        // Text reveal: eased path on `flipEasing` lands a touch after the
        // rotate front settles so the text never appears mid-flip. The spring
        // owns the rotateX; `flipEasing` controls the typographic reveal.
        const easedFlip = interpolate(
          frame, [flipStart, flipStart + flipDur], [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: resolveEasing(flipEasingName) },
        );
        const textOpacity = interpolate(easedFlip, [0.55, 1], [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

        // Land flash — an accent top-edge bloom that blooms in the LAND_FLASH_FRAMES
        // after the spring hits ≥0.85, then fades by +LAND_FLASH_FRAMES+6.
        const landProgress = interpolate(flipSpring, [0.85, 1], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        const landFlashT = accentLandFlash
          ? interpolate(
              frame,
              [flipStart + Math.round(flipDur * landProgress), flipStart + Math.round(flipDur * landProgress) + LAND_FLASH_FRAMES, flipStart + Math.round(flipDur * landProgress) + LAND_FLASH_FRAMES + 6],
              [0, 0.65, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : 0;

        const cellBorderCss = isHeaderCell
          ? (useBorder ? `0 0 0 0 ${accentColor}` : "none")
          : (cellBorderless ? "none" : `1px solid ${cellBorder}`);

        const effectivePadding = isHeaderCell ? headerCellPaddingPx : cellPaddingPx;
        const colAlign = columnAlign[c];

        // Per-cell font choice — mono cells use the mono family (numeric
        // alignment), body cells use the body font, header cells use heading.
        const cellFontFamily = isHeaderCell
          ? headingFont
          : (cellMono(r, c) ? monoFont : bodyFont);

        const cellFontWeight = (() => {
          const w = cellWeightOverride(r, c);
          if (w !== null) return w;
          return isHeaderCell ? 800 : 500;
        })();

        // Cell text size — header (heading font, accent text, monospaced
        // tracking) vs body (smaller, body or mono font).
        const cellFontSize = isHeaderCell
          ? Math.round(baseLabelFontPx * 0.92)
          : Math.round(baseLabelFontPx);

        // Winner-row rail — drawn AS PART OF the row's first cell so it sits
        // between the grid background and the cell text. An accent vertical
        // bar grows from the row's TOP toward the row's bottom along the LEFT
        // OUTER edge of the first cell's bounds (= at x = containerRect.x - 6).
        const winnerRailPx = (isWinnerCell && c === 0 && winnerRow !== null) ? (() => {
          const railWidth = 4;
          const railX = containerRect.x - railWidth - 6;
          const railFullH = rowHeights[r];
          const railH = winnerRailGrow * railFullH;
          const railY = rect.y + (railFullH - railH) / 2;
          return { railWidth, railX, railY: Math.round(railY), railH: Math.round(railH) };
        })() : null;

        return (
          <React.Fragment key={idx}>
            {winnerRailPx && (
              <div style={{
                position: "absolute",
                left: winnerRailPx.railX,
                top: winnerRailPx.railY,
                width: winnerRailPx.railWidth,
                height: winnerRailPx.railH,
                background: accentColor,
                borderRadius: railWidthFor(winnerRailPx.railWidth),
                opacity: 0.95,
                boxShadow: `0 0 16px 2px ${withAlpha(accentColor, 0.32)}`,
                pointerEvents: "none",
              }} />
            )}

            <div style={{
              position: "absolute",
              left: rect.x, top: rect.y, width: rect.width, height: rect.height,
              boxSizing: "border-box",
              padding: effectivePadding,
              display: "flex",
              alignItems: "center",
              justifyContent:
                colAlign === "left" ? "flex-start" :
                colAlign === "right" ? "flex-end" : "center",
              background: cellFill,
              border: cellBorderCss,
              borderRadius: cellRadiusPx,
              transform: `perspective(900px) rotateX(${rotateX}deg)`,
              transformOrigin: "center top",
              opacity,
              textAlign: colAlign,
              overflow: "hidden",
            }}>
              {/* Land-flash — a thin accent band at the cell's top edge that
                  blooms briefly when this cell lands. mask off the bottom so
                  the bloom doesn't bleed into the body content area. */}
              {(landFlashT > 0 || isWinnerCell) && (
                <div style={{
                  position: "absolute",
                  left: 0, right: 0, top: 0,
                  height: "44%",
                  background: `linear-gradient(to bottom, ${withAlpha(accentColor, Math.max(landFlashT, isWinnerCell ? winnerT * 0.10 : 0))} 0%, ${withAlpha(accentColor, 0)} 100%)`,
                  pointerEvents: "none",
                }} />
              )}
              <div style={{
                opacity: textOpacity,
                fontFamily: cellFontFamily,
                fontSize: cellFontSize,
                fontWeight: cellFontWeight,
                color: resolvedTextColorForCell,
                lineHeight: 1.18,
                letterSpacing: isHeaderCell ? "0.06em" : (cellMono(r, c) ? "0.01em" : "0"),
                fontVariantNumeric: cellMono(r, c) ? "tabular-nums" : "normal",
                maxWidth: "100%",
                position: "relative",
                zIndex: 1,
              }}>
                {cellText(r, c)}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

/** Hex color → hex+alpha. Accepts 3/6/8 digit hex; passthrough otherwise. */
function withAlpha(hex: string, alpha: number): string {
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  if (/^#([0-9a-fA-F]{8})$/.test(hex)) return hex;
  return hex;
}

/** Linear-blend two hex colors. t=0 → a, t=1 → b. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a) ?? [255, 255, 255];
  const pb = parseHex(b) ?? [0, 0, 0];
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Round corner for an accent rail that's N px wide — visually fine radius. */
function railWidthFor(w: number): number {
  return Math.max(1, Math.min(3, w / 2));
}
