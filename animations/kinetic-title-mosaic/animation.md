# Kinetic title mosaic

N words fly in and settle onto a **stack**, **grid**, or **mosaic** layout. Each slot can pick its own motion variant — `slide-up`, `slide-left`, `fade-zoom`, `mask-wipe` (a CSS clip-path inset wipe), `blur-burn` (focus-pull from an 8px blur), or `scale-pop` (a damped spring). Built for **topic-agnostic kinetic openers** — title cards, hook reveals, and pattern-interrupt beats where typography *is* the visual.

A redesigned choreography across the v2 redesign:

- **Anticipation breath + tight opacity lift** — each word is fully solid at 70% of its duration (no late arrival ghosting).
- **`phrasing`** controls how consecutive words chain together: `"phrase-land"` (default) lets the previous word settle before the next begins, with `phraseLandOverlap` sliding 0 → 0.5 to gate the overlap. `"staggered"` reverts to the literal `staggerSeconds`.
- **`accentStyle: "eyebrow"`** (new default, supersedes `"color"`) draws a hairline accent rule above or below the accent word — a structural beat that beats the chromatic accent-on-dark cliché. `accentStyle: "color"` reverts to a pure color swap.
- **Final settle tap.** On the last word's land, the whole mosaic does one micro settle (`finalSettleScale` over `finalSettleFrames`, ease-in-out) AND the accent eyebrow draws in synchronised via `scaleX` with the resolved `EASE_OUT_QUINT` over `finalEyebrowDuration` frames.
- **`mosaic` layout** — a wrapping justified flex flow where each word carries its own `weightTier` (`"light"` 0.7×, `"medium"` 1.0×, `"heavy"` 1.4×) for deliberate asymmetric composition.

## When to use

Reach for this when your scene's `visual_notes` says something like:
- "the words fly in one by one and lock into a mosaic"
- a kinetic big-text reveal with **multiple** words at once (use `TextReveal` for a single phrase)
- a high-energy opener where each word should land differently
- a "title card with personality" beat — a phrase, a name, a list of three

Don't use it for: a single sentence that should reveal as one block (`TextReveal`), a single large stat (`count-up-stat`), or a data rank (`data-bars`). It's specifically for **multi-word kinetic typography mosaics**.

## Holds & visual design notes

- **Variants, not a single motion.** Six motion choices let one config read as a quiet stack (`slide-up` everywhere) or a loud kinetic opener (`scale-pop` on word 2 with `mask-wipe` on word 4). One signature accent word (`custom.accent: true`) carries the brand — don't accent every word.
- **Spring only on `scale-pop`.** The other five variants interpolate with the resolved easing — springs on `.blur()` and `clip-path` reads as a CSS-animation. Per the timing rule, springs belong where physics land; everything else eased. The pop spring params (`popDamping`, `popStiffness`, `popMass`) are global, not per-word.
- **Built-in breath.** `holdAfterLandFrames` (default 18 ≈ 0.6s @ 30fps) — the assembled mosaic holds so the viewer reads the full phrase before the scene cuts.
- **No decorative halos.** Type is the focal element — let it breathe. The single signature accent is a **hairline rule** drawn under (or above) the accent word — structural decoration over chromatic. `accentStyle: "color"` reverts to a pure color swap if your palette demands it.
- **`fps` aware.** Per-slot duration and stagger derive from `useVideoConfig().fps`, so 24/60 deliverables pace identically to the 30fps preview.
- **Sentence-case by default.** `textTransform` defaults to `"none"` (the redesign favors sentence-case for a less shouty opener); set `"uppercase"` for the kinetic-opener feel of the old template.

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { KineticTitleMosaic } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-01-mosaic.json";

export const Scene01: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <KineticTitleMosaic config={config}
      styles={{colors: COLORS, fonts: FONTS}}
      fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

`scene-01-mosaic.json`:
```json
{
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "word-0", "custom": { "variant": "fade-zoom", "weightTier": "light" } },
    { "id": "word-1", "custom": { "variant": "slide-up", "weightTier": "medium" } },
    { "id": "word-2", "custom": { "variant": "scale-pop", "accent": true, "weightTier": "heavy" } }
  ],
  "extras": {
    "words": ["the", "new", "era"],
    "layout": "mosaic",
    "phrasing": "phrase-land",
    "accentStyle": "eyebrow",
    "accentSide": "below",
    "perSlotDurationSeconds": 0.5,
    "staggerSeconds": 0.12,
    "holdAfterLandFrames": 24
  }
}
```

## Recognized element ids

| id pattern | Role |
|---|---|
| `word-0`, `word-1`, ... up to `word-(N-1)` | One per word slot, by index. `text` overrides the word, `color` overrides the word's color, `custom.variant` overrides that word's motion variant, `custom.weight` overrides the font weight (100-900), `custom.weightTier` sets the per-word font scale (mosaic only — `"light"` / `"medium"` / `"heavy"` ≈ 0.7× / 1.0× / 1.4×), `custom.wipeDirection` sets the `mask-wipe` direction (`"left"` / `"right"` / `"top"` / `"bottom"`), `custom.accent: true` flags this word as the signature accent. |

Unmatched ids are ignored silently — a warning is logged at preview time.

## `extras.*`

| Key | Type | Default | Description |
|---|---|---|---|
| `words` | string[] 1-36 | (REQUIRED) | The words of the mosaic. Required so the layout has a count. |
| `defaultVariant` | enum | `"slide-up"` | Motion variant used when a word's `custom.variant` is unset. |
| `layout` | `"stack"` / `"grid"` / `"mosaic"` | `"stack"` | Stack = single column, words share the container height in order. Grid = `gridColumns` columns, row-major fill. Mosaic = wrapping justified flex flow with per-word `weightTier` font scaling. |
| `gridColumns` | int 1-6 | `2` | Columns when `layout: "grid"`. |
| `phrasing` | `"phrase-land"` / `"staggered"` | `"phrase-land"` | `phrase-land` waits until the previous word has settled before starting the next; `staggered` reverts to the literal `staggerSeconds`. |
| `phraseLandOverlap` | number 0-0.5 | `0` | When `phrasing: "phrase-land"`, gates how much of the previous word's settle the next word's anticipation may overlap. |
| `perSlotDurationSeconds` | number 0.2-3 | `0.5` | Each word's active motion span, in seconds (speed applies). |
| `staggerSeconds` | number 0-3 | `0.12` | Offset between consecutive words, in seconds (speed applies — only used when `phrasing: "staggered"`). |
| `wordGapPx` | number 0-400 | `16` | Stack: y gap between words; Grid/Mosaic: column gutter. |
| `rowGapPx` | number 0-400 | `32` | Grid/Mosaic: row gap. (Stack ignores this.) |
| `align` | `"left"` / `"center"` / `"right"` | `"center"` | Horizontal alignment within each slot box. |
| `containerWidthPct` | number 40-100 | `88` | Container width as % of the scene canvas width. |
| `containerHeightPct` | number 30-100 | `70` | Container height as % of the scene canvas height. |
| `wordFontRole` | `"heading"` / `"body"` | `"heading"` | Which font family to resolve from `theme.fonts`. |
| `textTransform` | `"none"` / `"uppercase"` | `"none"` | CSS text-transform applied to every word. Sentence-case by default; flip to `"uppercase"` for the kinetic-opener feel. |
| `accentStyle` | `"eyebrow"` / `"color"` | `"eyebrow"` | When a word is accent-flagged: `"eyebrow"` keeps the word color and draws a hairline accent rule above or below it (the structural beat — default); `"color"` swaps the word's color to the accent (the chromatic alternative). |
| `accentSide` | `"below"` / `"above"` | `"below"` | Where to draw the eyebrow rule relative to the accent word. |
| `eyebrowThicknessPx` | int 1-20 | `3` | Thickness in px of the eyebrow rule. |
| `eyebrowGapEm` | number 0-4 | `0.18` | Gap between the accent word and the eyebrow in `em` units (relative to the word's font-size). |
| `popDamping` | number 4-30 | `14` | Spring damping for the `scale-pop` variant only. |
| `popStiffness` | number 40-600 | `160` | Spring stiffness for the `scale-pop` variant only. |
| `popMass` | number 0.2-5 | `1` | Spring mass for the `scale-pop` variant only. |
| `accentColor` | hex / null | `theme.accent` | The accent color used when a word opts in via `custom.accent: true`. Falls back to `theme.accent`. |
| `finalSettle` | boolean | `true` | On the last word's land, perform a one-shot micro settle on the whole mosaic. |
| `finalSettleScale` | number 1-1.5 | `1.015` | Scale factor of the final settle tap (1.015 = 1.5% overshoot). |
| `finalSettleFrames` | int 1-60 | `8` | Duration of the settle tap in frames (ease-in-out cubic). |
| `finalEyebrowDuration` | int 1-120 | `18` | Duration in frames for the eyebrow rule's `scaleX` to draw fully in (resolved with `EASE_OUT_QUINT`), starting at the last word's land. |
| `holdAfterLandFrames` | integer ≥0 | `18` | Built-in breath — the assembled mosaic renders the static settled frame for this long after the last word lands. |

## Customization recipes

### Showcase — three words, three variants, mosaic, eyebrow accent (canonical preview)
```json
{
  "extras": {
    "words": ["signal", "noise", "repeat"],
    "layout": "mosaic",
    "phrasing": "phrase-land", "phraseLandOverlap": 0.1,
    "accentStyle": "eyebrow", "accentSide": "below",
    "perSlotDurationSeconds": 0.55,
    "holdAfterLandFrames": 30
  },
  "elements": [
    { "id": "word-0", "custom": { "variant": "slide-up", "weightTier": "light" } },
    { "id": "word-1", "custom": { "variant": "scale-pop", "accent": true, "weightTier": "heavy" } },
    { "id": "word-2", "custom": { "variant": "mask-wipe", "wipeDirection": "left", "weightTier": "medium" } }
  ]
}
```

### Loud opener — three words, three different variants
```json
{
  "extras": { "words": ["LIGHT", "SPEED", "GO"] },
  "elements": [
    { "id": "word-0", "custom": { "variant": "fade-zoom" } },
    { "id": "word-1", "custom": { "variant": "mask-wipe" } },
    { "id": "word-2", "custom": { "variant": "scale-pop", "accent": true } }
  ]
}
```

### Quiet stack — same motion, one accent word
```json
{
  "extras": { "words": ["the", "future", "is", "now"], "defaultVariant": "slide-up" },
  "elements": [
    { "id": "word-2", "custom": { "accent": true } }
  ]
}
```

### Grid 3-up of feature names — zap-in
```json
{
  "extras": {
    "words": ["FAST", "CLEAN", "OPEN", "SMART", "SAFE", "LOUD"],
    "layout": "grid", "gridColumns": 3,
    "defaultVariant": "scale-pop", "staggerSeconds": 0.08,
    "popDamping": 9
  }
}
```

### Focus-pull opener — every word blurs in
```json
{ "extras": { "words": ["WHAT", "WE", "SAW"], "defaultVariant": "blur-burn" } }
```

### Color-swap the accent word instead of drawing an eyebrow
```json
{
  "extras": { "accentStyle": "color" },
  "elements": [ { "id": "word-2", "custom": { "accent": true } } ]
}
```

### Speed up the entire mosaic for a fast-talking video
```json
{ "global": { "speed": 1.4 } }
```

### Bigger fonts only for this scene, keep palette
```json
{ "theme": { "sizes": { "scale": 1.25 } } }
```

## Pitfalls

- `extras.words` is **required**. The schema rejects configs that omit it. The per-element `text` overrides should match the slots you actually want to show — if `words` has 5 entries but you only override `word-0..2`, the last two slots fall back to `words[3]` / `words[4]`.
- **One accent word per scene.** Accenting every word defeats the single-signature-accent rule. Pick one word to carry the brand — and prefer placing it inside the phrase (word 2 of 5), not always first, which reads as the AI-default cliché.
- **`blur-burn` on long phrases** can read as broken text on lower-bitrate renders. Keep it under 6 words on a 1920×1080 canvas, and test on a small preview before the full render. (The redesign tightened the blur from 24px → 8px to read as focus-pull, not macro-block noise.)
- **`mask-wipe` uses `clip-path`**, which Remotion rasterizes correctly, but reduces render speed by ~10% on scenes with many slots. Fine for an opener; don't use it for a dense grid.
- The `scale-pop` variant is the only spring-driven variant — its `popDamping` / `popStiffness` / `popMass` are global, not per-word. If you need different pop dynamics per word, that's a future template (don't fork this one).
- `accentStyle: "eyebrow"` needs the accent color in your `theme.palette.accent` (or set `extras.accentColor`) — otherwise it falls back to `#FFB300` (amber), which is the AI-default amber-on-near-black look. Pick a deliberate brand color, not the amber fallback.

## To preview

See the optional-preview instructions in [`../README.md`](../README.md). Set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 8.
