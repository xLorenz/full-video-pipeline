# Bar code scan

N vertical bars of varying widths sit on a horizontal **spine** (baseline, bottom-aligned); a **scanline beam** sweeps horizontally across the canvas, and each bar **decodes** in three stages as the beam crosses its center: a brief pre-decode brighten over the 8 frames before crossing, a bloom flash at crossing (a softened white halo + bright top-cap rule), then a settle into the decoded accent color with a subtle **6% height-bounce spring** — the bar physically lifts and lands. Bars with `custom.value` set are sized by value (taller bars for bigger numbers, normalized to `barcodeHeightPct`); bars without values stay at a uniform muted height. Optionally each bar's label counts up to its target value after decoding, rendered below the spine in a tabular-nums mono. Built for **topic-agnostic "adds-up-to / decodes under one sweep / wait for it" beats** — ranked spectators, periodic breakdowns, sequential segments that build into a whole.

## When to use

Reach for this when your scene's `visual_notes` says something like:
- "the segments decode under a scanning line"
- "a list adds up to N — under one sweep"
- "barcode-style enumerate over rank"
- "the system scans and reveals the items one by one"
- a desktop-tutorial "system meter" / load profile / transfer bar

Don't use it for: a single bar racing to a value (`data-bars` is the better fit; this template is multi-bar sequential decoding). Use it for sequential scanner reveals where the bars build to a whole.

## Holds & visual design notes

- **Sequential reveal via one sweep.** The sweep is the *single* motion across the scene. Each bar's decode triggers in three stages as the scanline crosses its center: pre-decode brighten (8 frames before), bloom flash at crossing, settle into decoded color with a height-bounce spring. This avoids the synchronous-wave-of-overshoots reading that classical "all bars fall in at once" gives.
- **Value-driven bar heights.** When any bar has `custom.value` set, all valued bars normalize against the max value — bigger value = taller bar. Bars without `custom.value` sit at a uniform ~62% muted height. Without any values, the row is uniform.
- **One accent on the decoded color.** Idle bars read in `theme.muted`; the moment they decode they flip to `theme.accent` (or per-bar override). Set `custom.value` on a bar to also drive a count-up on its label.
- **Spring-bloom on decode.** Each bar's decode includes a 14-frame bloom flash (a soft feGaussianBlur halo + bright top-cap rule) and a 26-frame height-bounce spring (`damping 14`) that overshoots upward by 6% then settles. A flash of recognition at decode time, then steady decoded color.
- **Spine baseline.** A 1.5px `theme.gridLine` baseline hairline draws the row's bottom; bars anchor to it and grow upward. Faint evenly-spaced spine ticks (optional via `showSpineTicks`) read as a measurement axis.
- **Scan trail.** As the beam crosses each bar, a faint vertical guide is dropped at the bar's center, persisting briefly so the viewer can see what's been decoded.
- **Custom-width bars.** Each bar's `custom.width` is a fractional weight against the others (range 0.05–4). With all widths at 1, the row is uniform; one bar set to 3 and another to 0.5 gives proportionally wider/narrower bars (a true barcode-style weight pattern).
- **Built-in breath.** `holdAfterScanFrames` (default 30 ≈ 1.0s @ 30fps) — after the sweep finishes, the decoded bars + labels hold so the viewer reads the result; the scene duration owns the actual cut.
- **Single accent.** Bar's decoded color falls back to `theme.accent`. Don't override per-bar unless you genuinely have a category axis.
- **`fps` aware.** `scanStartSeconds` + `scanLineSeconds` derive from `useVideoConfig().fps`.
- **SVG + HTML overlay.** Bars + scanline + spine are SVG — precise positioning at any canvas size. Labels are HTML so the project fonts render with `font-variant-numeric: tabular-nums` baked in for mono labels with count-up values.
- **Ambient vignette + UI corners.** A faint radial vignette under the barcode eases in with the scan; a small "SCAN · NN%" indicator (with a blinking dot) sits in the bottom-left and a "DECODED N/M" tally sits in the bottom-right, both quiet and unobtrusive.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { BarCodeScan } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-05-scan.json";

export const Scene05: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <BarCodeScan config={config}
      styles={{colors: COLORS, fonts: FONTS}}
      fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-05-scan.json` would be authored per-video; see `preview/preview.tsx` for a worked example using value-driven heights.

## Recognized element ids

| id pattern | Role |
|---|---|
| `bar-0`, `bar-1`, ... up to `bar-(N-1)` | One per barcode segment. `text` overrides the bar's label (rendered below the bar after decode). `color` overrides the bar's decoded accent fill (NOT its idle color — for that, set `extras.idleColor`). `custom.value` sets a count-up target for the bar's label post-decode. `custom.width` is a fractional weight for the bar's width relative to the row (so `1` is default, `3` is 3× the average width, `0.5` is half). |

Unmatched ids are ignored silently.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `barcodeBars` | string[] 1-12 | (REQUIRED) | The bar labels. Schema rejects configs that omit this. |
| `scanStartSeconds` | number 0-10 | `0.5` | When the sweep begins (after `global.delayOffset`). Speed applies. |
| `scanLineSeconds` | number 0.4-8 | `2.5` | Sweep duration. Speed applies. |
| `scanEasing` | EasingName | `"ease-in-out"` | Easing for the sweep. Default reads as deliberate scanning; `ease-out-expo` reads as a sharp final dash to the far edge. |
| `scanWidthPx` | number 1-6 | `3` | Scanline stroke thickness. |
| `scanColor` | hex / null | `theme.accent` | Scanline color (single signature accent). |
| `scanGlow` | boolean | `true` | Soft drop-shadow halo on the scanline. |
| `barcodeHeightPct` | number 10-80 | `50` | Height the bars reach, as % of canvas height, centered vertically on the spine. |
| `barcodeWidthPct` | number 30-100 | `80` | Width the barcode claims, as % of canvas width, centered horizontally. |
| `barBaseWidthPx` | number 4-64 | `12` | Default width per uniform bar. When per-bar `custom.width` is set, this value is ignored for the weighted layout. |
| `barGapPx` | number 0-40 | `8` | Gap between bars (CSS row gutter via flex). |
| `idleColor` | hex / null | `theme.muted` | Color of each bar BEFORE decoding. Soft and recessed so the decoded accent reads dramatically. |
| `decodedColor` | hex / null | `theme.accent` | Color each bar flips to when scanned over. Per-bar `element.color` wins. |
| `countUp` | boolean | `true` | Whether the bar's label counts up from 0 → `custom.value` over 14 frames post-decode. |
| `valueFormat` | `"int"` / `"decimals1"` / `"decimals2"` / `"percent"` | `"int"` | Number formatting for the count-up. |
| `valueFontPx` | number 8-120 | `32` | Mono number label font size (the count-up value). |
| `labelFontPx` | number 8-80 | `22` | Body label font size (the word above the value). |
| `showValueLabels` | boolean | `true` | Whether labels are shown. |
| `showSpineTicks` | boolean | `true` | Whether to render faint evenly-spaced tick marks on the spine. |
| `valueLabelColor` | hex / null | `theme.text` | Body label text color (value inherits the bar's decoded color). |
| `holdAfterScanFrames` | integer ≥0 | `24` | Built-in breath — the assembled barcode holds for this long after the last bar decodes. |

## Customization recipes

### Pure barcode — no values, just named segments
```json
{
  "extras": {
    "barcodeBars": ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON"],
    "showValueLabels": false,
    "scanLineSeconds": 2.2
  }
}
```

### Stats scoreboard — count-up each bar post-decode
```json
{
  "extras": {
    "barcodeBars": ["CPU", "GPU", "RAM", "DISK", "NET"],
    "countUp": true, "valueFormat": "percent",
    "scanLineSeconds": 2.5
  },
  "elements": [
    { "id": "bar-0", "custom": { "value": 41 } },
    { "id": "bar-1", "custom": { "value": 64 } },
    { "id": "bar-2", "custom": { "value": 23 } },
    { "id": "bar-3", "custom": { "value": 19 } },
    { "id": "bar-4", "custom": { "value": 38 } }
  ]
}
```

### Variable-weight barcode bars (true barcode pattern)
```json
{
  "elements": [
    { "id": "bar-0", "custom": { "width": 0.2 } },
    { "id": "bar-1", "custom": { "width": 1.0 } },
    { "id": "bar-2", "custom": { "width": 0.15 } },
    { "id": "bar-3", "custom": { "width": 0.5 } },
    { "id": "bar-4", "custom": { "width": 1.2 } },
    { "id": "bar-5", "custom": { "width": 0.3 } }
  ],
  "extras": { "barcodeBars": ["A", "B", "C", "D", "E", "F"], "showValueLabels": false }
}
```

### Slow dramatic sweep — 5s pass
```json
{
  "extras": {
    "scanStartSeconds": 0.8,
    "scanLineSeconds": 5.0,
    "scanEasing": "ease-in-out",
    "holdAfterScanFrames": 45
  }
}
```

### Quick zap — 1s pass with a sharp dash at the end
```json
{ "extras": { "scanLineSeconds": 1.0, "scanEasing": "ease-out-expo" } }
```

### Recolor the decoded accent (e.g. to success green)
```json
{
  "theme": { "palette": { "accent": "#10B981" } },
  "extras": { "decodedColor": "#10B981", "scanColor": "#10B981" }
}
```

### Highlight one specific bar differently (e.g. "the answer")
```json
{
  "elements": [ { "id": "bar-2", "color": "#FF6B6B" } ]
}
```

## Pitfalls

- **`extras.barcodeBars` is required.** The schema rejects configs that omit it.
- **Bars with `custom.value` and `countUp: true` need a value at `custom.value`** to render the count-up label. Bars without `custom.value` simply show the label text.
- **`barBaseWidthPx` × `barCount` + `barGapPx` × (`barCount - 1`) must fit inside `barcodeWidthPct` of canvas width.** If not, bars overflow the container; the container clips but the spine stretches, which looks broken. Drop `barBaseWidthPx` for many bars. Note: when per-bar `custom.width` overrides are set, the row switches to weighted layout and `barBaseWidthPx` is ignored.
- **Bars anchor to the spine and grow upward.** The spine sits at ~62% of canvas height ( Room above for bars, room below for labels). `barcodeHeightPct` is the **maximum** bar height — value-driven bars will scale relative to the largest value.
- **Scanline sweep must finish before the scene cuts** — compute `scanStartSeconds + scanLineSeconds + holdAfterScanFrames/fps` and ensure your `actual_duration_frames` >= that. Otherwise the bars are mid-decode when the scene ends.
- **Per-bar `color` overrides only the decoded fill.** Idle color is global via `extras.idleColor`. If you want one bar to be idle-red and the rest idle-muted, that's a future template (don't fork this one).
- **`countUp: true` with `custom.value = 0` renders `"0"` after decode.** That's not broken — the label still shows. Hide it via `showValueLabels: false` if you don't want the constant `"0"` badge.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
