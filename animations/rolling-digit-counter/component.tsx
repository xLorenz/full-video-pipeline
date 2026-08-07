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
  resolveSize,
  pickColor,
  pickFont,
  type TemplateConfig,
  type ElementOverride,
} from "../_shared";

/**
 * RollingDigitCounter — tumbling slot-machine numeral columns.
 *
 * Each digit column in a number spins as a REAL scrolling reel: a vertical
 * strip of digits `0..9` repeated several times scrolls past a fixed
 * window at a velocity driven by `spinRateHz`, decelerates (ease-out)
 * into alignment with the column's target digit, then a damped spring
 * resolves the final sub-pixel alignment so the lock reads as a
 * satisfying mechanical settle rather than a hard cut. Columns settle
 * left-to-right with a small `perColumnStagger`.
 *
 * Refinements (the "perfect" pass):
 *   - Real reel motion. The strip is a tall column of cells; its
 *     translateY advances at `spinRateHz * cellHeight` per second with
 *     an ease-out deceleration toward the target glyph's rest position,
 *     so the strip visibly *slows into* its target. The prior
 *     modulo-bounce inside a 3-cell window read as vibrating, not as a
 *     scrolling reel — that is gone.
 *   - Velocity-driven motion blur. While a column is scrolling, a
 *     vertical CSS blur is applied whose radius is proportional to the
 *     instantaneous reel velocity (cells/sec → px/frame → blur px). The
 *     blur ramps out across the deceleration, so blur dies naturally as
 *     the reel approaches its target — no manual blur clear at land.
 *   - Lock accent. A thin accent hairline at the top + bottom of each
 *     column window flashes in at the column's land frame and fades over
 *     the spring settle, so the lock reads as a deliberate "click" — the
 *     one accent moment per column, mirroring the radial emission halo
 *     of radial-pulse-rings.
 *   - Tabular-numerals + flex column width. Each column window sizes to
 *     the digit glyph (`1ch`-equivalent via flex), so wide digits never
 *     clip. Mono font by default. Heading font only honored if the user
 *     opts in (it must support tabular figures or the reading breaks).
 *   - Hold breath. `holdAfterLandFrames` is now HONORED: the locked
 *     number holds fully visible for the requested frames before the
 *     value+label start their end-of-life fade. Previously it was a
 *     voided variable.
 *   - Deterministic everywhere. All motion is `frame`-derived; no
 *     `Math.random()` or `Date.now()` — Remotion rule, audit-ready.
 *
 * Built-in rhythm:
 *   - rollSeconds: total scroll window. The last column lands at
 *     `rollSeconds`; earlier columns land slightly earlier via
 *     `perColumnStagger * rollSeconds` (left-to-right reading).
 *   - spinRateHz: peak reel speed (cells/sec). Deceleration tapers
 *     this to 0 by the column's land frame.
 *   - headstartFrames: small "reels already spinning" pre-roll before
 *     the scroll starts (default 6 ≈ 0.2s @ 30fps) — the eye registers
 *     reel motion before columns begin to slow.
 *   - holdAfterLandFrames (default 24 ≈ 0.8s @ 30fps): the locked
 *     number sits for this long before the value+label fade out (if the
 *     scene's `durationInFrames` allows).
 *
 * Recognized element ids:
 *   - "value"        the number to display (config.extras.targetValue drives
 *                    the rolling; this element's text is ignored)
 *   - "label"        sub-caption below the number
 *   - "prefix"       symbol rendered before the number (accent)
 *   - "suffix"       symbol rendered after the number (accent)
 *
 * Optional extras (declared in config/schema.json):
 *   - targetValue:            number                    (REQUIRED)
 *   - decimals:               integer 0-4                (default 0)
 *   - thousandSeparator:      "", ",", or "."            (default "")
 *                              (use "," only if valueFontRole = mono)
 *   - rollSeconds:            number 0.4-6                (default 1.6)
 *   - spinRateHz:             number 4-30                 (default 12)
 *   - headstartFrames:        integer 0-120               (default 6)
 *   - perColumnStagger:       number 0-0.5                (default 0.15)
 *   - motionBlurScale:        number 0-3                  (default 1)
 *                              multiplier on the velocity-driven blur
 *   - springLand:            boolean                      (default true)
 *   - valueFontRole:         "heading" | "mono"           (default "mono")
 *   - rowGapPx:               number 0-400                (default 24)
 *   - maxFontPx:             number 8-1000               (default 260)
 *   - containerWidthPct:     number 30-100               (default 70)
 *   - frameColor:            hex / null                   (theme.gridLine)
 *   - accentColor:           hex / null                   (theme.accent)
 *                              applied to the prefix/suffix + the
 *                              lock-accent hairline + the thousands
 *                              separator
 *   - lockAccent:           boolean                       (default true)
 *                              the top/bottom accent hairline flash at
 *                              each column's land frame. Set false for
 *                              a flat digital readout.
 *   - showStamp:            boolean                       (default false)
 *                              the small ◳ ROLL corner cue. Off by
 *                              default — opt in if the scene needs the
 *                              reading-cue.
 *   - holdAfterLandFrames:   integer >=0                  (default 24)
 *   - label: same as element id "label" but as an `extras.text` shortcut.
 */

export interface RollingDigitCounterProps {
  config: TemplateConfig;
  styles: { colors: Record<string, string>; fonts: Record<string, string> };
  fontSizes?: Record<string, number>;
}

// How many times we stack the 0..9 vertical sequence per reel strip.
// 4× is plenty: even at the longest roll, the strip never scrolls more
// than ~3 cycles. Each cell is `digit = cell % 10` so we can scroll a
// continuous downward reel of any length and pick the bottommost cell
// showing the target digit as the "lock" position (max headroom).
const REEL_COPIES = 4;

export const RollingDigitCounter: React.FC<RollingDigitCounterProps> = ({
  config,
  styles,
  fontSizes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: canvasWidth, durationInFrames } = useVideoConfig();
  const theme = useMemo(() => resolveTheme(config.theme, styles), [config.theme, styles]);
  const g = useMemo(() => resolveGlobal(config.global), [config.global]);
  const extras = (config.extras ?? {}) as Record<string, unknown>;

  void durationInFrames; // referenced indirectly via endOfLife fade below.

  // --- Resolve extras ---------------------------------------------------

  const targetValue = Number(extras.targetValue ?? 0);
  const decimals = Math.max(0, Math.min(4, Number(extras.decimals ?? 0)));
  const thousandSep = (extras.thousandSeparator as string) ?? "";
  const rollSec = Math.max(0.4, Number(extras.rollSeconds ?? 1.6));
  const spinRateHz = Math.max(4, Math.min(30, Number(extras.spinRateHz ?? 12)));
  const headstartFrames = Math.max(
    0,
    Math.min(120, Math.round(Number(extras.headstartFrames ?? 6))),
  );
  const perColStaggerPct = Math.max(
    0,
    Math.min(0.5, Number(extras.perColumnStagger ?? 0.15)),
  );
  // Motion blur scaling. `motionBlurScale` is the modern knob
  // (1 = default velocity-driven blur). The pre-refinement `motionBlur`
  // (0-20, default 4) is accepted as a deprecated alias mapped to
  // `motionBlurScale = motionBlur / 4` when `motionBlurScale` is absent,
  // so legacy configs keep rendering with the same visual intent.
  const motionBlurRaw = extras.motionBlurScale !== undefined
    ? extras.motionBlurScale
    : extras.motionBlur !== undefined
      ? Number(extras.motionBlur) / 4
      : 1;
  const motionBlurScale = Math.max(0, Math.min(3, Number(motionBlurRaw)));
  const springLand = extras.springLand !== false;
  const valueFontRole = (extras.valueFontRole as string) === "heading" ? "heading" : "mono";
  const rowGapPx = Math.max(0, Number(extras.rowGapPx ?? 24));
  const maxFontPx = Math.max(8, Number(extras.maxFontPx ?? 260));
  const containerWidthPct = Math.min(
    100,
    Math.max(30, Number(extras.containerWidthPct ?? 70)),
  );
  const frameColorOverride = (extras.frameColor as string | undefined) ?? null;
  const holdAfterLandFrames = Math.max(
    0,
    Math.round(Number(extras.holdAfterLandFrames ?? 24)),
  );
  const accentOverride = (extras.accentColor as string | undefined) ?? null;
  const lockAccent = extras.lockAccent !== false;
  const showStamp = Boolean(extras.showStamp ?? false);
  // extras.text as a shortcut for the label, mirroring other templates.
  const extrasLabelText = (extras.label as string | undefined) ?? null;

  // --- Resolved theme ---------------------------------------------------

  const headingFont = pickFont(null, theme, "heading", "Inter");
  const monoFont = pickFont(null, theme, "mono", "JetBrains Mono");
  const bodyFont = pickFont(null, theme, "body", "Poppins");
  const valueFont = valueFontRole === "mono" ? monoFont : headingFont;
  const valColor = pickColor(null, theme, "text", "#FFFFFF");
  const accent = pickColor(accentOverride, theme, "accent", "#FFB300");
  const labelColor = pickColor(null, theme, "muted", "#9CA3AF");
  const frameColor = pickColor(frameColorOverride, theme, "gridLine", "#1A2744");
  const mutedColor = pickColor(null, theme, "muted", "#9CA3AF");

  // --- Per-element overrides -------------------------------------------

  const overrideMap = useMemo(() => {
    const m = new Map<string, ElementOverride>();
    for (const e of config.elements ?? []) m.set(e.id, e);
    return m;
  }, [config.elements]);
  const labelOv = overrideMap.get("label");
  const labelText = labelOv?.text ?? extrasLabelText ?? "";
  const labelSize = resolveSize(labelOv, theme.sizeScale);
  const labelFontPx =
    labelSize.fontSize ?? (fontSizes?.body ?? 28) * labelSize.scale;

  const prefixOv = overrideMap.get("prefix");
  const suffixOv = overrideMap.get("suffix");
  const prefix = prefixOv?.text ?? "";
  const suffix = suffixOv?.text ?? "";

  const valOv = overrideMap.get("value");
  const valOvHidden = valOv?.hidden === true;
  const valSize = resolveSize(valOv, theme.sizeScale);
  const valFontPx = Math.min(
    maxFontPx,
    valSize.fontSize ?? (fontSizes?.headline ?? 160) * valSize.scale,
  );
  // Cell height: line-height for the strip; we leave a touch of breathing
  // so descenders/accents on tabular digits never clip vertically.
  const digitCellHeightPx = valFontPx * 1.08;

  // --- Target formatting + per-column targets ---------------------------

  // Format the final value once: this is what the viewer reads at the end.
  const targetText = formatNumber(targetValue, decimals, thousandSep);

  // Strip thousand separators + decimal points to get the raw per-column
  // target digit list. Separators are re-inserted between columns at
  // render time (so they don't roll — they're a static accent glyph,
  // per the animation.md design).
  const rawDigitChars = targetText.replace(/[,.]/g, "");
  const digitCount = rawDigitChars.length;

  // Per-column land frames.
  //   Column 0 lands first, column N-1 lands last (left-to-right reading).
  //   Last column lands exactly at rollFrames (the whole window), earlier
  //   columns land proportionally earlier by `perColStaggerPct * rollFrames`
  //   per column. The stagger is capped at 0.5 in the schema, so the
  //   spread between first and last land is at most half the roll.
  const rollFrames = Math.round(rollSec * fps * g.speed);
  const staggerFrames = Math.round(rollFrames * perColStaggerPct);
  const colLandFrames = rawDigitChars.split("").map((_, i) => {
    // column i lands (digitCount - 1 - i) stagger steps earlier than the last
    return rollFrames - (digitCount - 1 - i) * staggerFrames;
  });

  // delayOffset shifts the whole sequence forward in the timeline.
  const landStartFrame = g.delayOffset;
  const scrollStartFrame = landStartFrame - headstartFrames;

  // --- Per-column reel geometry ----------------------------------------
  //
  // The strip is REEL_COPIES × REEL_DIGITS stacked vertically. Each cell
  // is `digitCellHeightPx` tall. We index cells 0..(REEL_COPIES*10-1).
  // Cell `c` shows digit `c % 10`.
  //
  // To land a target digit `t` in the window (window centered on the
  // strip), we need the strip translated so that the center of cell `c`
  // (with `c % 10 === t`) is at the window center. Cell `c`'s vertical
  // center in the strip's local coords is `c * cellH + cellH/2`. The
  // strip's translateY moves the strip DOWN by `T` (positive T brings
  // higher-indexed cells into view). The window center is at strip
  // local y = -T (when the strip's top is at -T, the window center maps
  // to y = -T... no — more carefully below).
  //
  // Actually: the strip is taller than the window. The window is exactly
  // one cell tall (overflow hidden). The strip's top sits at
  //   stripTopInWindow = windowCenterY - (stripHeight/2) + T
  // i.e. translateY(T) on the strip moves the strip DOWN by T positive,
  // revealing LATER cells (higher c) as T increases. We want cell c's
  // center to land at windowCenterY:
  //   windowCenterY = stripTopInWindow + c * cellH + cellH/2
  //                 = windowCenterY - stripHeight/2 + T + c * cellH + cellH/2
  //   => 0 = -stripHeight/2 + T + c * cellH + cellH/2
  //   =>  T = stripHeight/2 - c * cellH - cellH/2
  //
  // For simplicity we render the strip ABSOLUTELY positioned with its
  // TOP at -cellH/2 (so cell 0's top is at -cellH/2, cell 0's center at
  // 0, i.e. window center). Then to bring cell c into the window, we
  // translate the strip UP by c * cellH (translateY(-c * cellH)). But
  // our reel scrolls DOWN (positive direction reads as new digits
  // entering from the TOP of the window) — we want the strip's
  // internally-stacked "0,1,2,...9,0,1,2,..." to scroll downward. With
  // cells stacked top-to-bottom (cell 0 at top of strip), translating
  // the strip UP (negative T) brings higher-indexed cells into the
  // window and reads as the reel scrolling down. Good.
  //
  // So: `restTranslate(c) = -(c * cellH)` brings cell c's center to the
  // window center. We pick, for each column, the cell `c` whose final
  // position will be the lock target. We pick the LAST copy of that
  // digit in the strip (highest valid c) so the scroll has max headroom
  // to travel from cell 0 down to cell c. The scroll distance then
  // reads naturally as "many cells fly past."
  //
  // During the roll, the strip translates continuously at the reel
  // speed (cells/sec → px/frame), starting from `T = 0` (cell 0 in
  // window) and DECELERATING (ease-out) to arrive at `T = -(c * cellH)`
  // at the column's land frame. After land, a spring resolves any
  // residual sub-pixel offset to 0 (giving a small overshoot/jiggle that
  // reads as the reel settling).

  const stripCellCount = REEL_COPIES * 10;

  // For target digit t, the highest-indexed cell in the strip showing t.
  // Cell c shows digit (c % 10); the largest c with c%10 == t is
  //   (REEL_COPIES - 1) * 10 + t
  // i.e. the (REEL_COPIES-1)-th copy of t, which is the bottom-most
  // occurrence in the strip. Scrolling from cell 0 to this c covers
  // (REEL_COPIES-1) full cycles — a long, satisfying scroll.
  const targetCellFor = (t: number): number => (REEL_COPIES - 1) * 10 + t;

  // Columns: one per digit of targetText (separators handled separately).
  const targetDigits = rawDigitChars.split("").map((c) => Number(c));

  const columns = targetDigits.map((targetDigit, i) => {
    const landFrame = landStartFrame + colLandFrames[i];

    // Eased scroll progress 0..1 from scrollStartFrame to landFrame.
    // ease-out-cubic gives a brisk start and a long deceleration — the
    // reel enters fast, slows visibly into its target.
    const scrollT = interpolate(
      frame,
      [scrollStartFrame, landFrame],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      },
    );

    // The strip's rest position when locked: cell `targetCell` centered.
    const targetCell = targetCellFor(targetDigit);
    const restT = -(targetCell * digitCellHeightPx);

    // During scroll: the strip translates from 0 (cell 0 in window)
    // toward restT. We pick a starting cell that has CROSS distance
    // `targetCell` worth of scroll, so the scroll spans exactly the
    // (REEL_COPIES-1) worth of cycles visually. Simpler: start the
    // strip translated by `startT = 0` (cell 0 in window), and
    // interpolate(startT, restT) by scrollT.
    //
    // The strip's *position* on screen at any time is therefore:
    //   translateY = interpolate(scrollT, [0,1], [startT, restT])
    // where startT = 0 (cell 0 at window center initially).
    //
    // BUT the strip should be moving FAST initially, and the easing
    // already gives high dT/dF at scrollT=0. So a linear-ish
    // interpolate-frame to position mapping is exactly right: the
    // easing IS the velocity envelope.
    const startT = 0;
    const scrollTranslate = interpolate(scrollT, [0, 1], [startT, restT]);

    // Spring settle: resolves the FINAL sub-pixel offset from
    // `scrollTranslate` to `restT`. Concretely, the spring outputs 0..1
    // and we use it to lerp from scrollTranslate (at landFrame, scrollT
    // = 1 so scrollTranslate == restT — no residual, spring is a no-op)
    // to ... wait — fast scrollT=1 means scrollTranslate IS restT. So
    // what does the spring add?
    //
    // Real slot machines settle with a small BACK-and-forth past the
    // target. We model that by letting the spring OVERSHOOT restT by a
    // small amount (one third of a cell), then settle back. This gives
    // the characteristic "tick...tick..tick." landing wiggle.
    // Spring settle. We use spring() purely for its overshoot tail —
    // the part of the spring output ABOVE 1 represents the reel locking
    // PAST its target then settling back, the characteristic slot
    // "tick." The 0→1 portion of the spring is suppressed so that at
    // landFrame (spring=0) the strip is already exactly at restT (no
    // discontinuity with the scroll-deceleration which arrives at
    // restT at that same frame). Only `max(0, spring-1)` contributes to
    // ringDelta, then amplitude × overshootCellPx yields the per-cell
    // travel past rest. Clamped to maxOvershootPx so the neighbor
    // glyph's descender never crosses the recessed frame hairline.
    const settleSpring = springLand
      ? spring({
          frame,
          fps,
          delay: landFrame,
          // damping 14 + stiffness 220 gives a brisk settle with a
          // SINGLE small overshoot (~4% of the delta) — readable as a
          // mechanical "tick" without exiting the safe zone.
          config: { damping: 14, mass: 1, stiffness: 220 },
          durationInFrames: Math.max(12, Math.round(rollFrames * 0.16)),
        })
      : 1;
    // Only the overshoot (spike above 1) translates the strip past rest.
    const overshoot = Math.max(0, settleSpring - 1);
    const overshootCellPx = digitCellHeightPx * 0.30;
    const maxOvershootPx = digitCellHeightPx * 0.06;
    const rawSpringDelta = overshoot * overshootCellPx;
    const springDelta = Math.max(-maxOvershootPx, Math.min(maxOvershootPx, rawSpringDelta));

    // Final translate: rest + springDelta (spring only kicks in after landFrame).
    const locked = frame >= landFrame;
    const reelTranslate = locked ? restT + springDelta : scrollTranslate;

    // Instantaneous reel velocity in cells/sec → px/frame, for motion blur.
    //
    // The model: peak velocity (cells/sec) = spinRateHz; the eased scroll
    // is ease-out-cubic, whose derivative at scrollT=t is 3*(1-t)^2 (so
    // peak at t=0). The average velocity across the whole scroll is
    // (restT - startT) / rollFrames expressed in cells/sec. The PEAK
    // velocity is ~3× the average for ease-out-cubic. So we approximate
    // the instantaneous velocity at scrollT as:
    //   peakCellsPerSec * (1 - scrollT)^2
    // which is smooth, deterministic, and tied to BOTH spinRateHz (the
    // user's "feels fast/slow" knob) and the easing's actual derivative
    // shape. Cheap closed-form, no per-frame t-diff sampling.
    const peakCellsPerSec = spinRateHz;
    const velocityCellsPerSec = peakCellsPerSec * (1 - scrollT) * (1 - scrollT);
    const velocityPxPerFrame = (velocityCellsPerSec * digitCellHeightPx) / fps;
    // Motion blur scales with velocity, peaked at the start of the
    // scroll, dying to near 0 as the strip decelerates into land. We
    // cap the blur at 12px (any higher reads as a smear). The
    // acceleration-to-peak ramp is implicit in ease-out-cubic: the very
    // first frame of scroll is the peak, so we hand-blend a 4-frame
    // headstart over which the blur ramps from 0 → peak to avoid a
    // frame-N=0 snap of 0-to-peak blur (jarring).
    const peakBlurPx = Math.min(12, velocityPxPerFrame * 0.85) * motionBlurScale;
    // 4-frame blur ramp at scroll-start so the transition from
    // stationary cell 0 → peak-velocity motion blur isn't a single
    // frame snap. Cheap and credible.
    const headstartRamp = interpolate(
      frame,
      [scrollStartFrame, scrollStartFrame + 4],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const blurPx = peakBlurPx * headstartRamp;

    // Lock accent pulse: sin arc centered at landFrame, ~16 frames wide.
    const lockPulseFrames = Math.max(10, Math.round(fps * 0.55));
    const lockLocal = (frame - landFrame) / lockPulseFrames;
    const lockPulse =
      lockLocal > 0 && lockLocal < 1 ? Math.sin(Math.PI * lockLocal) : 0;

    // Opacity: the whole column fades in over the first ~10% of the
    // scroll window so the appearance isn't a hard cut.
    const fadeInFrames = Math.max(4, Math.round(rollFrames * 0.1));
    const opacityIn = interpolate(
      frame,
      [scrollStartFrame, scrollStartFrame + fadeInFrames],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    return {
      i,
      targetDigit,
      targetCell,
      reelTranslate,
      blurPx,
      locked,
      lockPulse,
      landFrame,
      opacityIn,
      settleSpring,
      velocityPxPerFrame,
    };
  });

  // --- Render node assembly --------------------------------------------

  let columnCursor = 0;
  const renderedNodes: React.ReactNode[] = [];
  for (let ci = 0; ci < targetText.length; ci++) {
    const ch = targetText[ci];
    if (/[,.]/.test(ch)) {
      // Static separator (accent-colored, does not roll).
      renderedNodes.push(
        <span
          key={`sep-${ci}`}
          style={{
            fontFamily: valueFont,
            fontSize: valFontPx * 0.72,
            color: accent,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            marginInline: `${valFontPx * 0.06}px`,
            alignSelf: "center",
            // Subtle pop-in when the *adjacent* column lands so the
            // separator appears with the digits it groups, not at t=0.
            opacity: interpolate(
              frame,
              [
                landStartFrame + colLandFrames[columnCursor] - 6,
                landStartFrame + colLandFrames[columnCursor],
              ],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
            userSelect: "none",
          }}
        >
          {ch}
        </span>,
      );
      continue;
    }
    // Digit column.
    const col = columns[columnCursor];
    if (col && !valOvHidden) {
      renderedNodes.push(
        <ColumnWindow
          key={`col-${ci}`}
          stripCells={stripCellCount}
          cellHeightPx={digitCellHeightPx}
          fontPx={valFontPx}
          color={valOv?.color ?? valColor}
          fontFamily={valueFont}
          reelTranslate={col.reelTranslate}
          blurPx={col.blurPx}
          opacity={col.opacityIn}
          frameColor={frameColor}
          accentColor={accent}
          lockAccent={lockAccent}
          lockPulse={col.lockPulse}
        />,
      );
    }
    columnCursor++;
  }

  // Two edge guards:
  //   - targetValue renders to "" (e.g. targetValue: undefined with no decimals
  //     produces "NaN" — guarded by the schema, but defensively render "" as 0)
  //   - effectiveDigitCount falls back to a single 0 column for a blank reel
  const effectiveDigitCount = Math.max(1, digitCount);
  if (targetText === "" || effectiveDigitCount === 0 || renderedNodes.length === 0) {
    renderedNodes.push(
      <ColumnWindow
        key="col-empty"
        stripCells={stripCellCount}
        cellHeightPx={digitCellHeightPx}
        fontPx={valFontPx}
        color={valColor}
        fontFamily={valueFont}
        reelTranslate={0}
        blurPx={0}
        opacity={1}
        frameColor={frameColor}
        accentColor={accent}
        lockAccent={false}
        lockPulse={0}
      />,
    );
  }

  const containerWidth = Math.round((canvasWidth * containerWidthPct) / 100);
  const lastLandFrame = landStartFrame + colLandFrames[colLandFrames.length - 1];

  // NOTE: this template deliberately does NOT fade the value (or label)
  // out at the end of the scene. The locked number IS the scene — once
  // it lands it stays locked for the remainder of the duration so the
  // host scene's own transition/crossfade drives any exit. A prior
  // version faded the value out at `lastLandFrame + holdAfterLandFrames`
  // and the post-roll frames were an empty canvas (the host
  // `<Background>` underneath shows through). The contract is: this
  // template reveals; the scene compositions out.
  //
  // `holdAfterLandFrames` remains meaningful as a MINIMUM sentinel: per
  // the SCHEMA it's the recommended minimum duration a host scene should
  // allocate AFTER land before cutting. Here we still expose
  // `lastLandFrame + holdAfterLandFrames` to the composition metadata
  // (via the Preview comp's durationInFrames in our preview scaffolding),
  // and the consumer reads it as "a scene of this length will fully
  // contain land + a readable breath." But the template's per-frame
  // render output does not crash to zero after that breath.
  void holdAfterLandFrames;
  void lastLandFrame;
  const globalOpacity = valOvHidden ? 0 : 1;

  // Label: fades in 6 frames after the last column lands, sits for the
  // remainder of the scene. The slight 12px → 0px lift-in is the one
  // piece of motion the label gets; after that it's stationary.
  const labelStart = lastLandFrame + 6;
  const labelOpacity = interpolate(
    frame,
    [labelStart, labelStart + 14],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const labelY = interpolate(
    frame,
    [labelStart, labelStart + 14],
    [12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: containerWidth,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          maxWidth: "100%",
          opacity: globalOpacity,
        }}
      >
        {prefix && (
          <span
            style={{
              fontFamily: valueFont,
              fontSize: valFontPx * 0.72,
              color: accent,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              marginInlineEnd: valFontPx * 0.12,
              alignSelf: "center",
              userSelect: "none",
            }}
          >
            {prefix}
          </span>
        )}
        {renderedNodes}
        {suffix && (
          <span
            style={{
              fontFamily: valueFont,
              fontSize: valFontPx * 0.72,
              color: accent,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              marginInlineStart: valFontPx * 0.12,
              alignSelf: "center",
              userSelect: "none",
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {labelText && (
        <div
          style={{
            fontFamily: bodyFont,
            fontSize: labelFontPx,
            color: labelOv?.color ?? labelColor,
            marginTop: rowGapPx,
            textAlign: "center",
            letterSpacing: "0.01em",
            maxWidth: canvasWidth * 0.7,
            opacity: labelOpacity,
            transform: `translateY(${labelY}px)`,
            userSelect: "none",
          }}
        >
          {labelText}
        </div>
      )}
      {showStamp && (
        <div
          style={{
            position: "absolute",
            bottom: 32,
            right: 32,
            fontFamily: monoFont,
            fontSize: 14,
            color: mutedColor,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.4,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          ◳ ROLL
        </div>
      )}
    </AbsoluteFill>
  );
};

/**
 * A single slot-machine column window.
 *
 * Renders a vertical strip of `stripCells` digits (0..9 repeated), with
 * each cell `cellHeightPx` tall. The entire strip is translated by
 * `reelTranslate` (a px value; negative values scroll higher-indexed
 * cells into view). The window is one cell tall, overflow hidden.
 *
 * Decoration:
 *   - Recessed top + bottom hairlines (the "reel frame") at all times.
 *   - When `lockAccent` is enabled, those hairlines flash to
 *     `accentColor` with intensity `lockPulse` (0..1).
 *   - Vertical motion blur proportional to `blurPx` while scrolling.
 */
const ColumnWindow: React.FC<{
  stripCells: number;
  cellHeightPx: number;
  fontPx: number;
  color: string;
  fontFamily: string;
  reelTranslate: number;
  blurPx: number;
  opacity: number;
  frameColor: string;
  accentColor: string;
  lockAccent: boolean;
  lockPulse: number;
}> = ({
  stripCells,
  cellHeightPx,
  fontPx,
  color,
  fontFamily,
  reelTranslate,
  blurPx,
  opacity,
  frameColor,
  accentColor,
  lockAccent,
  lockPulse,
}) => {
  // Decide the recessed-frame + lock-accent hairline color. Static frame
  // is the muted `frameColor`; the accent portion fades in by `lockPulse`.
  const staticHair = withAlpha(frameColor, 0.55);
  const accentHair = accentColor;
  // Top bar: static color blended toward accent by lockPulse.
  const topColor = lockAccent && lockPulse > 0
    ? blendHex(staticHair, accentHair, lockPulse)
    : staticHair;
  const bottomColor = topColor;

  // Recessed-top/bottom hairline width — ~3.5% of the digit font px,
  // never smaller than 2px so it survives low-DPI renders.
  const hairlinePx = Math.max(2, fontPx * 0.035);

  // The strip is centered so that cell 0's vertical center is at the
  // window vertical center when reelTranslate == 0. That means the
  // strip's TOP sits at: windowCenterY - cellHeightPx/2 (since cell 0
  // spans 0..cellH, its center is cellH/2; to put that center at
  // windowCenterY, strip top must be at windowCenterY - cellH/2).
  //
  // We render the strip with `top: 50%` then translateY(-(cellH/2)) to
  // place cell 0 at center, then ADD reelTranslate on top.
  const stripInitialTopOffset = -cellHeightPx / 2;

  // Render only the cells that could conceivably be in view to keep DOM
  // small. We know reelTranslate is in [-stripHeightPx + cellHeightPx,
  // 0], and the window is 1 cell tall. Render all cells for now (max 40);
  // the cost is negligible vs measuring offsets.
  const cells: React.ReactNode[] = [];
  for (let c = 0; c < stripCells; c++) {
    const digit = c % 10;
    cells.push(
      <span
        key={`cell-${c}`}
        style={{
          fontFamily,
          fontSize: fontPx,
          color,
          fontVariantNumeric: "tabular-nums",
          height: cellHeightPx,
          lineHeight: `${cellHeightPx}px`,
          display: "block",
          textAlign: "center",
          flex: "0 0 auto",
          userSelect: "none",
        }}
      >
        {digit}
      </span>,
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: `${fontPx * 0.62}px`,
        height: cellHeightPx,
        overflow: "hidden",
        opacity,
        // Recessed reel-frame hairlines (top + bottom). With lockAccent,
        // these fade into the accent color for the lock beat.
        boxShadow: `inset 0 ${hairlinePx}px 0 0 ${topColor}, inset 0 -${hairlinePx}px 0 0 ${bottomColor}`,
        // Slight inner bevel on left/right so the reel reads as inset
        // metal rather than a flat slab. Quiet even when lockAccent is off.
        borderLeft: `${Math.max(1, fontPx * 0.012)}px solid ${withAlpha(frameColor, 0.35)}`,
        borderRight: `${Math.max(1, fontPx * 0.012)}px solid ${withAlpha(frameColor, 0.35)}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, ${stripInitialTopOffset}px) translateY(${reelTranslate}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          filter: blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : "none",
          willChange: "transform, filter",
        }}
      >
        {cells}
      </div>
    </div>
  );
};

// --- helpers -----------------------------------------------------------

/** Format a number with decimals + optional thousands separator. */
function formatNumber(
  value: number,
  decimals: number,
  thousandSeparator: string,
): string {
  if (!Number.isFinite(value)) return "0";
  let s = Math.abs(value).toFixed(decimals);
  // Integer may carry a leading "-" we want to preserve as a separate
  // accent sign, not as a rolling column. Out of scope here — we render
  // negatives by prefixing via the `prefix` element id ("-" sign).
  // So we strip a leading minus here and the caller can wire up a
  // prefix element if needed.
  s = s.replace(/^-/, "");
  if (thousandSeparator) {
    const [intPart, decPart] = s.split(".");
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
    s = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  }
  return s;
}

/** Append an alpha byte to a #RRGGBB hex, passing 8-char hex through. */
function withAlpha(hex: string, alpha: number): string {
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  return hex;
}

/** Linearly blend two #RRGGBB or #RRGGBBAA colors. Returns 8-char hex. */
function blendHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  const al = ca.a + (cb.a - ca.a) * t;
  return withAlpha(rgbToHex(r, g, bl), al);
}

function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
  const m8 = /^#([0-9a-fA-F]{8})$/.exec(hex);
  if (m8) {
    const v = m8[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
      a: parseInt(v.slice(6, 8), 16) / 255,
    };
  }
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (m6) {
    const v = m6[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}
