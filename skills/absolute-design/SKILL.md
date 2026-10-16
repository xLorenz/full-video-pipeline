---
name: absolute-design
description: Professional graphic-design engine for producing beautifully crafted visual assets — posters, brand identities, logos, editorial layouts, social/marketing graphics, thumbnails, covers, icons, infographics, charts, presentation slides, UI mockups, and design-token systems — grounded in real design culture (grid theory, Swiss/International, Bauhaus, Art Deco, Memphis, brutalism, maximalism, Material 3, Apple HIG). Use this skill whenever the user asks to design, style, beautify, lay out, brand, illustrate, restyle, or "make it look good / professional / premium / clean / bold", or asks for a color palette, typography pairing, layout, poster, thumbnail, logo, brand guide, mockup, slide, icon set, chart styling, or any visual asset — even when they never say the words "graphic design" (e.g. "make this chart look nicer", "turn this into a poster", "pick colors for my app", "design the hero section", "why does this look cheap?"). Also use it when asked to critique, audit, or improve an existing design, to pick or apply a visual style, or to define reusable design tokens. Do not treat this as an optional stylistic flourish — visual quality is the entire deliverable here, so route through this skill whenever the output will be seen by human eyes.
---

# Absolute Design

This skill turns design requests into assets that look *made*, not *generated*. The difference is not tooling — it is that a human designer builds an invisible system first (a grid, a type scale, a palette with roles) and only then places pixels. Every visible decision is downstream of a structural one. This skill encodes that order of operations.

## What "absolute" means here

Three commitments, in priority order:

1. **Structure before surface.** Decide the grid, the type scale, and the color roles before drawing a single element. The grid is the design's skeleton — as Williamson's history of the grid shows, the same matrix has meant "divine order", "rational law", or "something to smash" depending on the era. Choose deliberately which of those you mean.
2. **Every decision has a reason.** A style is not decoration; it is a vocabulary with cultural meaning. Swiss says institutional authority. Grunge says authenticity over polish. Art Deco says metropolitan luxury. Pick the dialect that fits the brief and can say why.
3. **Craft is visible in the last 5%.** Optical alignment, consistent rhythm, tuned contrast, no default fonts, no leftover placeholder energy. That last 5% is what separates professional work from competent work.

Two things the three commitments do **not** say — and which quietly wreck otherwise-correct work:

- **Clean is not the goal; bland is a failure mode.** Restraint is one strategy among several, chosen per brief — and for anything that must earn attention (poster, cover, thumbnail, social, ad, editorial spread), it is usually the *wrong* default. A correct-but-sparse canvas reads as "too simple, too bland" to clients and audiences. Build **visual richness**: plan several distinct visual events per canvas — a motif or illustration, a texture layer, a secondary graphic device (a badge, a panel, a rule system, a pattern band), layered typographic treatments, and confident use of the whole palette. One idea does not mean one element. Richness is what makes work feel *made*.
- **A great asset in a thin package loses to a good asset in a complete one.** Completeness is a design quality: the user judges the work partly by how much well-made material arrives with it. Ship the package described in `references/craft/production.md` — one file per lockup, a visual palette specimen, a type specimen, mockups, machine tokens — not one hero file plus notes.

## The workflow

Run the stages in order. Skipping to "make it pretty" is the single most common failure.

### 1. Brief — extract the real constraint

Before designing, establish (ask only what the brief doesn't already answer — infer the rest and state your inference):

- **Audience & context.** Who sees this, at what size, in what medium (print, screen, feed, stage, storefront)?
- **Message.** The one thing the viewer must take away. Literally one.
- **Emotional register.** Trustworthy? Energetic? Luxurious? Rebellious? Precise?
- **Format & constraints.** Dimensions, aspect ratio, file type, brand rules, accessibility requirements, production method.
- **Content inventory.** Exactly what text/imagery must appear, and its priority order.

Write the brief back in 2–4 sentences before proceeding. This forces the fuzzy request into a design problem.

### 2. Concept — the idea before the form

Great design has a *conceit*: a visual idea that unifies the piece (a grid that is also the message, a color relationship that dramatizes the topic, a typographic device that becomes the logo). State the concept in one sentence: "This will be a ______ where the design itself says ______." If you cannot fill that sentence, the work will read as generic no matter how well executed.

Draw from the representation guidance in `references/foundations/representation.md` — it covers how to choose what to show (sketch vs. drawing vs. photo vs. diagram vs. type-only) and how to show it (viewpoint, layout, emphasis techniques).

### 3. Direction — pick the visual language

Use `references/styles/styles-index.md` to diagnose and choose a style. Then load the matching deep-dive:

| Reference | Load when |
|---|---|
| `references/styles/historical-movements.md` | Arts & Crafts, Art Nouveau, Art Deco, Bauhaus, Swiss/International |
| `references/styles/expressive-movements.md` | Mid-century, Psychedelic, Punk/New Wave, Memphis, Grunge |
| `references/styles/contemporary-modes.md` | Minimalism, Flat, Brutalism, Maximalism, or mixing styles |
| `references/systems/material-design.md` | Product UI, Android/web app UI, dashboards, data-dense screens |
| `references/systems/apple-hig.md` | iOS/macOS UI, premium consumer-product feel, Apple-platform work |

Pick **one dominant style**. Hybridizing is legitimate and is how most contemporary work happens, but one style must own the grid, the primary type, and the tone; others may contribute accents only.

### 4. System — build the skeleton

Read `references/foundations/grid-and-composition.md` and construct, in this order:

1. **Grid** — canvas, margins, columns, gutters, modules, baseline rhythm. Choose point-based (coordinates/intersections as focal events) or field-based (module/line logic extending across the surface) deliberately.
2. **Type scale** — `references/foundations/typography.md`. A modular scale (1.2 / 1.25 / 1.333 / 1.5) or a named system ramp. Name the roles: display / headline / subhead / body / caption / label.
3. **Palette with roles** — `references/foundations/color-and-palettes.md`, seeded by the ready palettes in `references/assets/palettes.md`. Never "colors"; always roles: background, surface, text-primary, text-secondary, primary, accent, success/warn/error if relevant.
4. **Spacing, shape, elevation** — a spacing scale (4/8-base), a corner-radius scale, and a depth language (flat, shadow, border, layering). Consistency here is what reads as "designed".

Write these as tokens (CSS custom properties or a JSON token file) before composing — see `references/craft/production.md`. Tokens are what make a piece coherent and reusable.

### 5. Compose — hierarchy first, then detail

Apply the composition principles in `references/foundations/grid-and-composition.md`:

- Establish **one dominant element** (size/weight/contrast/position). Everything else is supporting cast.
- Design the **reading path** (Z-pattern, F-pattern, radial, or vertical cascade) so the eye lands in the right order.
- Use **contrast** to create hierarchy, and **repetition** to create unity. If everything is loud, nothing is.
- Treat whitespace as an active structural element, not leftover room.
- Break the grid **once, on purpose**, if the piece needs tension — and know that a visible/tilted/fractured grid is itself a stylistic statement (postmodern), not an accident.

### 6. Craft — the last 5%

`references/craft/production.md` covers format-specific craft (SVG, HTML/CSS, tokens). The non-negotiables: optical alignment over mathematical alignment, consistent spacing rhythm, correct tracking at display vs. text sizes, no default system fonts for display type, no lorem-ipsum energy, no unresolved edge collisions, all text legible at thumbnail size.

### 7. Critique — the quality bar

Run `references/craft/critique.md` against the finished asset before presenting it. That file is the audit protocol (squint test, thumbnail test, contrast audit, originality check, style-fidelity check) and a catalog of the failure modes that make design look AI-generated — each with its fix. Add the **impact check** from that file: a piece can pass every structural test and still be boring, and boring is a defect for anything that must earn attention.

Then deliver: the full package (see `references/craft/production.md` — assets, tokens, specimens, mockups, proof images, and a design note). Users can disagree with taste; they can't argue with reasoning.

## Reference map

```
references/
├── foundations/
│   ├── grid-and-composition.md   grid typologies, layout architectures, hierarchy & Gestalt
│   ├── typography.md             type classification, scales, pairing, micro-typography
│   ├── color-and-palettes.md     harmony, contrast, a11y, role-based palettes, dark mode
│   ├── identity-and-marks.md     logo/wordmark construction, lockups, brand systems
│   └── representation.md         what to show & how (sketch/drawing/photo/diagram; viewpoint; emphasis)
├── styles/
│   ├── styles-index.md           diagnose + choose a style; how to mix styles
│   ├── historical-movements.md   Arts & Crafts → Art Nouveau → Art Deco → Bauhaus → Swiss
│   ├── expressive-movements.md   Mid-century → Psychedelic → Punk/New Wave → Memphis → Grunge
│   └── contemporary-modes.md     Minimalism → Flat → Brutalism → Maximalism
├── systems/
│   ├── material-design.md        Material 3 (and 2) color roles, type scale, shape, motion
│   └── apple-hig.md              Apple HIG principles, SF type, layout, materials, accessibility
├── assets/
│   ├── palettes.md               ready-to-use hex palettes, neutral ramps, semantic role templates
│   └── patterns.md               reusable SVG/CSS pattern recipes (stripes, fans, halftone, noise…)
└── craft/
    ├── production.md             SVG/HTML/CSS craft, token formats, deliverable structure
    └── critique.md               the audit protocol and the "looks generated" failure catalog
```

Load only what the task needs — that is the point of the map. Foundations are near-mandatory (grid, type, color at minimum); styles and systems are situational; assets are pick-up-what-you-need.

## Task → load quick router

| If the request is… | Read first |
|---|---|
| Poster / cover / flyer / editorial spread | `foundations/grid-and-composition.md` → matching style file → `assets/palettes.md` + `assets/patterns.md` |
| Logo / wordmark / brand identity | `foundations/identity-and-marks.md` first → `foundations/typography.md` + `foundations/color-and-palettes.md` → `assets/palettes.md` |
| Social / thumbnail / banner / ad | `foundations/grid-and-composition.md` (thumbnail test!) → style file → `assets/patterns.md` |
| App / web UI / dashboard | `systems/material-design.md` *or* `systems/apple-hig.md` → `foundations/color-and-palettes.md` |
| Chart / infographic / data viz | `foundations/representation.md` + `foundations/color-and-palettes.md` → `styles/contemporary-modes.md` |
| Slide / presentation | `foundations/grid-and-composition.md` + `foundations/typography.md` → style file |
| "Make it look better" (existing asset) | `craft/critique.md` first (find what's broken), then the specific foundation it violates |
| Design tokens / style guide / palette | `foundations/color-and-palettes.md` + `assets/palettes.md` + `systems/*` for role naming |
| Icon set / illustration system | `foundations/representation.md` + matching style file |

## Working rules of thumb

- Squint test: if hierarchy collapses when you squint, no amount of polish will fix it.
- One idea per design. Ambition belongs in the concept, not in the element count — but the idea should be *carried* by something visible and memorable, not merely stated in the note.
- Restraint and excess are both valid strategies — chosen, never defaulted. For anything that competes for attention (feed, poster, cover, ad, social), **richness is the default**: several visual events, layered texture and devices, confident colour. Sparse-and-correct loses to rich-and-ordered almost every time. Minimalism is a deliberate choice you can justify, never an accident of tidiness.
- Match the production medium: print tolerates detail that screens don't; feeds reward thumbnail-strength contrast; UI punishes decoration that costs clarity.
- Every deliverable must render standalone. No file may depend on a sibling being loaded next to it — inline what it needs.
- Never invent brand constraints the user didn't give — but never leave visual decisions unowned either.
- Deliver breadth. One hero file plus notes reads as a draft; a package of designed artifacts reads as finished work.
