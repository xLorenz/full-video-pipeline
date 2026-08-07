# Right-wrong card

Two-card verdict reveal: two opposing cards slide in head-to-head from left/right, hover briefly while text fades up, then a verdict drops in — winner glows or stamps a check, loser desaturates and shrinks. Built for educational / listicles / debate scenes that hit a "which is correct?" / "X vs Y" / "the right way vs the wrong way" beat.

## When to use

Reach for this when your scene's `visual_notes` say something like:
- "show the wrong way vs the right way"
- "compare the common mistake with the proper technique"
- "did this hypothesis pan out, or did it fail?"
- "this is correct / this is incorrect" put-up-or-shut-up moment
- arena-style head-to-head with a single winner

Don't use it for: a simple two-column comparison card with no verdict (just compose two `TextReveal`s side-by-side), or anything with more than two sides (use `comparison-grid` instead).

## Quick start (copy into your scene)

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { SceneTiming } from "remotion-foundation";
import { Background } from "../components/Background";
import { RightWrongCard } from "../components/animations";
import { COLORS, FONTS, FONT_SIZES } from "../lib/styles";
import config from "../scene-assets/scene-04-rightwrong.json";

export const Scene04: React.FC<{ scene: SceneTiming }> = () => (
  <AbsoluteFill>
    <Background backgroundColor={COLORS.background} />
    <RightWrongCard config={config} styles={{colors: COLORS, fonts: FONTS}} fontSizes={FONT_SIZES} />
  </AbsoluteFill>
);
```

Save the config at `videos/<title>/remotion/src/scene-assets/scene-04-rightwrong.json`:

```json
{
  "theme": {},
  "global": { "speed": 1.0 },
  "elements": [
    { "id": "left-label",  "text": "Hot take",      "delay": 6,  "duration": 14 },
    { "id": "left-body",   "text": "Drink more coffee", "delay": 14 },
    { "id": "right-label", "text": "Truth",         "delay": 12 },
    { "id": "right-body",  "text": "Sleep 8 hours", "delay": 20 },
    { "id": "verdict-stamp", "text": "",            "delay": 48 }
  ],
  "extras": {
    "leftIsWinner": false,
    "stampStyle": "stamp",
    "loserShrink": 0.85,
    "winnerBorderWidthPx": 4
  }
}
```

> `fontSizes` is optional — if `FONT_SIZES` doesn't exist in your `lib/styles.ts`, the template falls back to defaults (headline=64px, body=28px, stamp=180px). Better: add a `FONT_SIZES` constant to `lib/styles.ts` (the rings example does this; see `videos/what-if-earth-had-rings/remotion/src/lib/styles.ts`).

## Holds & visual design notes

- **Built-in rhythm.** `preEnterHoldFrames` (12) → cards slide in → text reveals stagger → `verdict-stamp` lands → `postVerdictHoldFrames` (30) holds before the scene cuts. The verdict is the climax — *let it land*. Tightening the hold below 18 reads rushed; the feedback rubric leans toward longer holds, never faster.
- **Single signature accent.** The winning card's solid accent border (`winnerBorderWidthPx`) carries the verdict at a glance. We deliberately cut the per-card box-shadow glow cascade from earlier releases — it made every card "lit" and the verdict lost its uniqueness. Set `winnerBorderWidthPx: 0` only if the stamp glyph alone is loud enough.
- **Type hierarchy encodes the verdict.** The winner's headline is `weight 800`/`letter-spacing -0.01em`; the loser's is `weight 500`/`letter-spacing 0.01em`. You can read who won before the stamp drops. Don't override both labels back to the same weight.
- **Default palette is no longer red/green + amber.** The winner color falls through to `theme.secondary`; the loser to a quiet `theme.danger` (now a slate color in the bundled defaults, not a saturated red). Override per-element with `element.color` if your video has a brand-red "loser" cue.
- **`fps` aware.** The entry and spring timings derive from `useVideoConfig().fps`, so 24/60 deliverables keep the same perceived pacing as the 30fps preview.
- **Spring on `shake`.** The "shake" stamp style uses Remotion's `spring()` for the pop-and-settle — a real damped settle replaces the hand-tuned wobble from earlier releases.

## All fields

The core `theme`/`global`/`elements`/`extras` fields are documented in [`../SCHEMA.md`](../SCHEMA.md). Below are the **recognized `elements[].id` values** and **`extras.*` keys** for THIS template.

### Recognized `elements[].id`

| id | Role | Default text | Default timing |
|---|---|---|---|
| `left-label` | Headline on the left card (the "wrong" side by default) | `"Wrong way"` | delay 6, dur 14 |
| `left-body` | Body/sub-caption under the left label | `"What you've been doing"` | delay 14, dur 12 |
| `right-label` | Headline on the right card | `"Right way"` | delay 12, dur 14 |
| `right-body` | Body/sub-caption under the right label | `"What actually works"` | delay 20, dur 12 |
| `verdict-stamp` | The verdict glyph (✓ on the winner, ✗ on the loser). Use `text` only if you want a custom glyph *applied to both cards* (use `extras.stampGlyph` for that). Hidden via `"hidden": true` removes the drop entirely. | `""` | delay 48, dur 18 |

Stable element ids — reference these when overriding. Any other `elements[].id` you set is ignored silently (you'll get a preview-time warning).

### `extras.*` (template-level)

| Key | Type | Default | Description |
|---|---|---|---|
| `leftIsWinner` | boolean | `false` (REQUIRED) | Which card wins the verdict. `true` → left card gets the ✓ + glow; `false` → right card. |
| `stampStyle` | enum: `stamp` `shake` `glow` `none` | `"stamp"` | Verdict entrance style. `stamp` = scale-from-zero + slight rotate; `shake` = back-overshoot + wobble; `glow` = winner-only border glow (no glyph); `none` = no verdict (use for a "decide for yourself" beat — winner/loser will still desaturate/shrink based on `leftIsWinner`). |
| `stampGlyph` | string | `""` | Override the verdict glyph for BOTH cards (e.g. `"✔"`, `"❌"`, `"🏆"`). Default empty → auto-pick `"✓"` for the winner and `"✗"` for the loser. |
| `stampForce` | number 0-2 | `1` | Multiplier on the stamp pop intensity. Use 1.3 for emphasis. |
| `cardPaddingPx` | number 0-200 | `48` | Padding inside each card. |
| `cardGapPx` | number 0-400 | `64` | Pixel gap between the two cards (symmetric; subtracted from each card's width). |
| `cornerRadiusPx` | number 0-200 | `24` | Border-radius. |
| `cardElevationPx` | number 0-32 | `16` | Quiet elevation under each card (a single soft drop, the only shadow on the template). Set `0` for a flat design. |
| `loserDesaturate` | boolean | `true` | Whether the losing card desaturates after the verdict. |
| `loserShrink` | number 0.1-1.5 | `0.92` | Scale factor the losing card eases down to after verdict. Set to `1` for a "stay still, but greyed" feel. |
| `winnerBorderWidthPx` | number 0-8 | `3` | Width of the solid accent border on the winning card. **This border is the single signature accent on the template** — set to `0` only if the stamp glyph alone must carry the verdict. |
| `preEnterHoldFrames` | integer 0-600 | `12` | Hold before the cards slide in. Gives the "before" beat a breath. The total entry beat now reads: hold → slide → text → verdict, instead of slide → text → verdict. |
| `postVerdictHoldFrames` | integer 0-600 | `30` | Hold after the verdict lands (≥1s by default). The verdict is the climax — let it land before the scene cuts. |

### Per-element `custom.*`

Per-element `custom` is reserved but currently unused on this template. The `colors` helpers fall back per-element via `element.color`, so per-element overrides don't need a `custom` slot for color.

## Customization recipes

### Flip the winner to the left card
```json
{ "extras": { "leftIsWinner": true } }
```

### Use a trophy instead of a check
```json
{ "extras": { "stampGlyph": "🏆" } }
```

### Emphasize the verdict with a shake + bigger pop
```json
{ "extras": { "stampStyle": "shake", "stampForce": 1.4 } }
```

### Soft "decide for yourself" mode — no verdict, just visual contrast
```json
{ "extras": { "stampStyle": "none", "leftIsWinner": false } }
```
Both cards will desaturate after the verdict timing, but neither gets a winner glow.

### Speed up the whole animation for a fast-talking video
```json
{ "global": { "speed": 1.4 } }
```

### Change per-card text without touching other fields
```json
{
  "elements": [
    { "id": "left-label",  "text": "Myth" },
    { "id": "right-label", "text": "Fact" }
  ]
}
```

### Recolor only one card's headline (e.g. winner = success palette)
```json
{
  "theme": {
    "palette": { "success": "#E0FB50" }
  },
  "elements": [
    { "id": "right-label", "color": "#E0FB50" }
  ]
}
```

### Hide the verdict stamp entirely
```json
{ "elements": [ { "id": "verdict-stamp", "hidden": true } ] }
```

### Make cards thinner / bigger gap (e.g. for a left-side subject + right-side info)
```json
{ "extras": { "cardGapPx": 160, "cardPaddingPx": 80 } }
```

### Add bigger fonts only for this scene
```json
{ "theme": { "sizes": { "scale": 1.3 } } }
```

## Pitfalls

- **`leftIsWinner` is required.** The schema rejects configs that omit it. If you want ambiguity, use `"stampStyle": "none"` and set `leftIsWinner` either way (cosmetic only).
- **One signature, not many.** The winner reads via *one* of: border (`winnerBorderWidthPx`), stamp glyph, or text-weight hierarchy. Stacking all three defeats the verdict's clarity. Pick the strongest one for the brief.
- **`loserDesaturate: false` + `loserShrink: 1`** = a single-color verdict-style (no visual loser cue). The viewer still sees the ✓/✗, so this is fine if your scene is fast-paced.
- **`stampStyle: "none"` + hidden `verdict-stamp` element** = no verdict at all — the cards just slide in and stay. Use this only if you want a pure side-by-side.
- **`speed` > 2 may make the text reveal too fast to read** — bump `delayOffset: 30` to give it air, or override per-element `duration`s.
- **Old `bgRgbaAlpha` / `winnerGlowWidthPx` extras are removed.** Replace `winnerGlowWidthPx` with `winnerBorderWidthPx` (a solid accent border, not a glow halo). Replace `bgRgbaAlpha` with `cardElevationPx` (single soft drop, not a colored shadow cascade).

## To preview

This template ships with `preview/preview.tsx` — a 90-frame (3s @ 30fps) composition exercising the template with `leftIsWinner: true` + a per-element text override. To preview:

```bash
# Set this in pipeline_state.json, then complete Step 8:
#   "animations_preview_requested": true
# Then run:
python3 pipeline.py continue <title>
# Previews render into videos/<title>/.animation-previews/right-wrong-card*.mp4
```
