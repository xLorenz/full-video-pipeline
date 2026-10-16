# Production — SVG, HTML/CSS, tokens

How to actually build the asset so it survives contact with the real world. Format-specific craft is where "nice concept" becomes "finished file".

---

## 1. Deliverable structure — ship a package

Completeness is a design quality. A user judging two outputs side by side will call the one with more well-made material "more complete", even if the other's hero asset is craftier. So deliver breadth *and* craft: a package of designed artifacts, where every file is itself a designed object.

**The package:**

1. **Hero asset** — the thing that was asked for, as editable vector source (SVG) or styled markup (HTML).
2. **One file per lockup/variant** — do not cram every lockup into a single presentation sheet. `logo-primary.svg`, `logo-horizontal.svg`, `logo-symbol.svg`, `logo-reversed.svg` are each independently usable; a single sheet is a *nice extra*, not a substitute.
3. **Visual palette specimen** — an SVG swatch sheet showing each colour with its role name and hex, plus the contrast pairings. A markdown table is documentation; a swatch sheet is a deliverable.
4. **Type specimen sheet** — an SVG showing each type role at scale (display → body → label) with the family/weight/tracking named. Same reasoning.
5. **Application mockups** — at least two, not one (e.g. the requested bag *and* a card or social tile). Mockups are where the system proves it is a system.
6. **Machine tokens** — `tokens.css` + `tokens.json`.
7. **Raster proof** — a PNG of the hero asset at a usable size, so the work can be seen without an SVG renderer or a browser.
8. **Design note** — `design-note.md`: the concept sentence + the 3–4 decisions that matter. Text supports the package; it does not lead it.

Suggested layout:

```
out/
├── hero.svg
├── hero-proof.png
├── logo-primary.svg
├── logo-horizontal.svg
├── palette-specimen.svg
├── type-specimen.svg
├── mockup-*.svg
├── tokens.css
├── tokens.json
└── design-note.md
```

A rule that settles most packaging disputes: **if a deliverable would be presented to a client, make it a designed object.** Notes, specs and token files are the supporting layer.

## 2. Self-contained files — nothing depends on a sibling

Every file must render correctly on its own. Review tooling, clients, and inboxes routinely show one file in isolation, and a preview that breaks there is a defect in the deliverable, not in the tooling.

- **HTML previews:** inline all CSS (including tokens) into a `<style>` block. Never `<link rel="stylesheet" href="tokens.css">`. If the file uses `var(--color-x)`, those variables must be defined *in the same file*.
- **SVG:** no external font, image, or CSS references. Fonts are either outlined or embedded via an in-document `@font-face`; colours are literals matching the token values.
- **Fallbacks everywhere:** if a custom property could be missing, supply a literal fallback (`color: var(--color-ink, #1D1B17)`).
- **Test it the cruel way:** open the file alone, with its siblings renamed. If anything renders black, unstyled, or blank, it is not ready to ship.

The symptom this prevents is specific and embarrassing: an HTML preview whose background is `var(--color-background)` with the stylesheet unloaded renders as a black rectangle. Always give it a literal.

## 3. Tokens — the source of truth

Define once, reference everywhere. `tokens.css`:

```css
:root {
  /* color roles */
  --color-bg: #FBFBF9;
  --color-surface: #FFFFFF;
  --color-text: #17171A;
  --color-text-2: #5B5B62;
  --color-primary: #1F3AE0;
  --color-on-primary: #FFFFFF;
  --color-primary-container: #E1E6FF;
  --color-accent: #C2410C;

  /* type scale (ratio 1.25) */
  --step--1: 0.8rem;
  --step-0: 1rem;
  --step-1: 1.25rem;
  --step-2: 1.5625rem;
  --step-3: 1.953rem;
  --step-4: 2.441rem;
  --step-5: 3.052rem;

  /* spacing (4/8 base) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;
  --space-12: 48px; --space-16: 64px;

  /* shape & depth */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-full: 999px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / .06);
  --shadow-2: 0 4px 12px rgb(0 0 0 / .08);

  /* type roles */
  --font-display: "…", serif;
  --font-text: "…", sans-serif;
}
```

`tokens.json` mirrors the same roles for non-CSS consumers. When a design decision changes mid-project, change the token — not 40 scattered literals.

---

## 4. SVG craft

- Set `viewBox` to the composition's coordinate space and use `width/height` or `preserveAspectRatio` deliberately. Design in the target aspect ratio from the start (no post-hoc stretching).
- **Group logically** (`<g id="grid">`, `<g id="type">`, `<g id="ornament">`) — aids editing and testing.
- **No leftover transforms:** bake rotations/translations into coordinates where possible; if not, keep the transform chain shallow.
- **Colors as literals matching tokens** (SVG can use `var(--x)` only in HTML-embedded SVG; standalone SVG needs literal hex — keep them identical to the token values).
- **Text:** use `<text>` with explicit `font-family`, `font-size`, `font-weight`, `letter-spacing`, `text-anchor`. Set `dominant-baseline` intentionally. For multi-line, use `<tspan x dy>` per line — do not rely on automatic wrapping (SVG has none).
  - If the SVG must render anywhere without font guarantees: either convert type to outlines (when it's display type / logotype) or embed the font (`@font-face` with base64 in a `<style>` block) for text that must remain live.
- **Stroke discipline:** set `vector-effect="non-scaling-stroke"` when strokes must stay constant; otherwise scale stroke-width with the design. Align strokes to half-pixel coordinates for crisp 1px hairlines (`x=10.5`).
- **Clip, don't erase.** Use `<clipPath>` / `<mask>` for crops and fades; keep them in `<defs>`.
- **Gradients & filters** go in `<defs>`, referenced by id. Prefer 2–3 stop gradients (the sheen = a sharp light stop).
- **File hygiene:** no `width="100%"` hacks, no editor metadata bloat, no unused defs. Remove `id`s that nothing references.
- **Optical polish:** overshoot circles past square neighbors by ~1–2%; align `H/M` stems to the margin exactly; let `O/C/S` hang slightly.

## 5. HTML/CSS craft

- Layout with CSS Grid for structure (define the column grid explicitly in `grid-template-columns`) and Flexbox inside components. The grid in the CSS *is* the design grid — keep them the same object.
- Type sizing: `clamp()` for fluid display type; rem for scale; letter-spacing as em; `text-wrap: balance` for headlines, `text-wrap: pretty` for paragraphs where supported.
- Spacing rhythm only from the token scale. If you find yourself writing `margin: 13px`, the system is wrong.
- **Shadows and radius from tokens** — one radius family per piece.
- Responsive: design the desktop and the narrow case both; the narrow case decides whether the grid is real. Collapse columns by redefining spans, not by shrinking everything.
- **Fonts:** preload the display face; pair with a system text stack if licensing is uncertain. `font-display: swap`. Never ship Times/Arial as the display face of a designed piece.
- Prefer `:where()` for lower-specificity resets; keep one level of BEM-ish naming discipline so the file remains editable.
- **Self-contained previews (see §2):** any HTML meant for viewing gets its tokens inlined in a `<style>` block — never a relative `<link>`. A preview that renders black because a sibling stylesheet is missing is a shipped bug.
- Test at 3 zoom levels and at 50% — cheap preview of the thumbnail test.

## 6. Icon craft

- Draw on a 24×24 grid (16 for small, 48 for feature): 2px stroke or solid shape; consistent corner radius; consistent optical weight (squares look heavier than circles — lighten them).
- Metaphor before geometry: the icon must read at 16px. If it needs a label to be understood, it's a decoration.
- One visual language per set (SF Symbols-style rounded, Material-style geometric, or hand-drawn — never mixed).
- Optical centering: circles slightly above the mathematical center; triangles slightly below.

## 7. Format dimensions (start here, don't guess)

| Asset | Size (px) | Ratio | Notes |
|---|---|---|---|
| Instagram post | 1080×1080 | 1:1 | safe area: keep type ≥ 96px in from edges |
| Instagram portrait | 1080×1350 | 4:5 | strongest feed format |
| Story / Reel / TikTok | 1080×1920 | 9:16 | keep content out of top 250px / bottom 320px (UI chrome) |
| YouTube thumbnail | 1280×720 | 16:9 | legible at 210×118px display size |
| YouTube channel banner | 2560×1440 | 16:9 | safe area 1546×423 centered |
| X/Twitter post | 1600×900 | 16:9 | 1:1 also widely used |
| Facebook cover / LinkedIn banner | 1600×900 / 1584×396 | — | crop-proof the center |
| Hero web banner | 1920×800 (or 2400×1000) | ~2.4:1 | design mobile crop too |
| App icon | 1024×1024 | 1:1 | no transparency; system masks corners |
| Favicon | 512×512 (render 32) | 1:1 | silhouette must survive 16px |
| Presentation slide | 1920×1080 | 16:9 | type ≥ 24pt at projection distance |
| A4 print (300dpi) | 2480×3508 | 1:√2 | 3mm bleed, 5mm safe |
| A3 print (300dpi) | 3508×4961 | 1:√2 | poster minimum for type ≥ 24pt |
| Poster 18×24in (300dpi) | 5400×7200 | 3:4 | check type at 3m viewing distance |
| Business card (300dpi) | 1063×638 (89×51mm) | — | 3mm bleed |
| Email header | 1200×600 | 2:1 | keep CTA above the fold logic |
| OG image (link preview) | 1200×630 | 1.91:1 | readable at 400×210 render |

Design at the target aspect ratio from the first frame. For anything that appears in a feed, design the thumbnail case first — the full-size case is the variant.

## 8. Export & output

- **Raster export** for delivery when needed: SVG → PNG at 1×/2×/3× of the *target display size* (or 300dpi for print). Check the file at 100% *and* at 25%.
- **Print:** convert to CMYK-aware workflow, bleed 3mm, safe area ≥ 5mm, text ≥ 6pt, and confirm spot-color/foil notes if relevant.
- **Screen/social:** export at the exact platform dimensions (do not let a platform scale your art). Keep type out of the outer 5% margin where UI chrome may overlap.
- Name files by role and size: `hero-1600x900.png`, `mark.svg`, `tokens.css`.

## 9. Pre-delivery gate

- [ ] Package complete (§1): hero + per-lockup files + palette specimen + type specimen + ≥2 mockups + tokens + proof PNG + design note
- [ ] Every file renders standalone (§2) — tested with siblings hidden
- [ ] Every color/type/spacing value traces to a token
- [ ] SVG has no unused defs, no editor cruft, text handled (outlined or embedded)
- [ ] Exported at the right sizes; checked at 100% and 25%
- [ ] Design note written (concept + 3–4 key decisions)
- [ ] Runs clean through `critique.md`, including the impact check
