# Critique — the quality bar

Design quality is not a feeling; it is a set of testable claims. Run this audit on every asset before showing it. Fix findings in order: structural first (hierarchy, grid), then typographic, then color, then texture/detail. Polishing a broken structure wastes the polish.

---

## 1. The protocol (in order)

### Pass 1 — Structure (30 seconds)

**Squint test.** Blur the image or squint until detail disappears.
- What is the dominant element? If two things compete, demote one.
- Does the composition still hold as 3 masses? If it dissolves into gray mush, hierarchy is missing.

**Thumbnail test.** Shrink to the smallest real-world size (120px wide for feeds/thumbnails).
- Is the message still readable? Is the shape language still recognizable? If not, increase contrast/scale of the primary element and delete noise.

**Format test.** Does it look native to its format (poster reads at 3m, UI reads at 40cm, badge reads at 2cm)?

### Pass 2 — Grid & alignment

- Trace the left edges of every text block and image. Do they land on shared axes? (Optical alignment allowed; random alignment not.)
- Check vertical rhythm: is spacing between groups consistent and hierarchical (tight inside, loose between)?
- Confirm the intentional grid-break is singular and evident.
- Check the margins: are they equal where they should be equal? Top-heavy margins for print; safe areas respected for screen.

### Pass 3 — Typography

- Read the hierarchy ladder: can you name each level and its job? Merge levels that differ by < 15% size.
- Check measure (45–75 chars), leading, tracking at display vs. label sizes.
- Hunt defects: widows, awkward rag, rivers (justified text), un-kerned display pairs (AV, TA, WA, P.), faux bold/italic, stretched type, ALL-CAPS paragraphs.
- Default-font detection: if display type is Arial/Calibri/Times/Poppins-by-default, replace with a chosen face.

### Pass 4 — Color

- Run the contrast audit on the actual text/surface pairs (4.5:1 body, 3:1 large/UI).
- Count the hues. ≤ 3 (+ neutrals) unless the style explicitly wants more (Memphis/psychedelic/maximalism).
- Check the accent is scarce and doing a job. If the accent appears everywhere, it is no longer an accent.
- Confirm neutrals are tinted, not dead gray; dark mode checked separately if applicable.

### Pass 5 — Craft & originality

- **Style-fidelity check** (from `../styles/styles-index.md`): does type/ornament/palette/composition all belong to the same dialect, or is there an anachronistic tell?
- **Concept check:** can you state the one-sentence conceit? If not, the piece is competent but generic.
- **Skeuomorphism of taste check:** are any effects present because they're easy (drop shadows, glassmorphism, purple gradients, emoji icons) rather than because they're chosen?
- Zoom to 400%: edges, stroke joins, halftone, grain, and text rendering must survive inspection.

### Pass 6 — Richness & impact (the check people forget)

A piece can pass every structural test and still be bland, and bland is a defect for anything that must earn attention. The failure is usually *under*-design, not over-design: one type block, one accent, a lot of empty ground. Audiences read that as "too simple, too bland".

**Count the visual events.** A rich composition carries several distinct things happening on the canvas — typically 3 or more beyond the required type:

- a **motif or illustration** (a shape system, a pictorial element, a signal-bar graph, a globe, a specimen panel)
- a **texture or pattern layer** (grain, halftone, grid overlay, pattern band, paper stock)
- a **secondary graphic device** (badge, panel, rule system, frame, band, seal, coordinate block)
- **layered typographic treatments** (two fills in one title, a kicker + display + label ladder, inline/outlined effects, mixed case)
- **confident colour** (more than one accent used boldly — colour fields, bands, blocks — not one lonely accent)

Then ask:
- Is there **one thing worth remembering** — a device, a moment, a detail a viewer would describe to someone else?
- Does the piece **use its format** (a 16:9 thumbnail is a stage, not a page; a poster is a wall object), or does it sit timidly inside safe margins with one element per zone?
- If a competitor shipped the same information in plain type on a plain ground, would ours still win on looking? If not, the design is correct and unfinished.

**Hierarchy still has to work** — that is what separates rich from chaotic. Richness is layered *under* a clear reading order, never instead of one. But do not let "one dominant element" become "one element": the dominant thing wins, and plenty else should be happening around it.

Scale richness to viewing distance: the further and faster the piece is seen, the bigger and fewer the events; the closer it is read (print, editorial, UI), the more fine detail it can carry. At feed scale that means one message plus one bold device; at poster scale it means a full composition with atmosphere.

---

## 2. The "looks generated" failure catalog

These are the tells that make work read as AI output. Each has a fix.

| Tell | Why it happens | Fix |
|---|---|---|
| **Purple→blue gradient background** | the default "pretty" of image models | Use a solid field, a real texture, or a brand-derived gradient with a directional purpose |
| **Default fonts everywhere** (Poppins, Montserrat, Inter, Arial) | no type decision was made | Pick faces by voice (see `../foundations/typography.md`); tune tracking |
| **Everything centered** | safe, symmetric, brainless | Use asymmetric balance, flush-left type, and a real reading path |
| **Even spacing / no rhythm** | spacing applied uniformly | Vary spacing by relationship: tight within groups, generous between |
| **No dominant element** | everything given equal size/weight | Establish one hero at 60% visual weight; demote the rest |
| **Rainbow palettes** | "colorful = designed" | One dominant hue + neutrals + one accent; 60-30-10 |
| **Gray mush text** (#808080 secondary text) | contrast not checked | Tinted gray at ≥ 4.5:1; text-secondary at ~60% lightness or darker |
| **Random decorative shapes** (floating circles, sparkles, squiggles with no role) | ornamentation as filler | Every shape must either structure, group, emphasize, or reference the style |
| **Emoji as icons** | no icon system | Draw or use a real icon set; consistent stroke/weight |
| **Glassmorphism / heavy shadow / glow by default** | effects are cheap in CSS | Use depth only to encode layering; prefer tonal surfaces (Material) |
| **Inconsistent corner radii** | radii chosen per element | One radius family per piece (tokenized) |
| **Stretched/squashed type or images** | no aspect discipline | Scale uniformly; crop instead of distort |
| **Lorem-ipsum energy / placeholder artifacts** | content not integrated | Real copy sized into the design; no filler text in delivery |
| **Clashing multiple styles** | sampling without hierarchy | One dominant style; one device from a second (see `../styles/contemporary-modes.md`) |
| **Noise/texture at visible strength** | texture used as noise, not feel | Grain ≤ 8% opacity, multiply blend |
| **Unstyled-looking UI** (generic Bootstrap/Tailwind defaults) | framework default shipped | Tokenize color/type/radius; adjust the default scale |
| **Type set without optical alignment** | math alignment to bounding boxes | Hang O/C/S slightly past the margin; overshoot circles |
| **Message unclear at thumbnail** | detail-first thinking | Increase primary contrast/scale; delete secondary elements |
| **Over-sanitized / too simple / too bland** | restraint mistaken for taste | Add visual events: motif + texture layer + secondary device + layered type + confident colour. Keep hierarchy clear while the canvas gets richer |
| **One-accent timidity** | "accent scarcity" applied to a poster | Scarce accents are a UI/brand-system discipline. For posters and expressive work, use the palette boldly — fields, bands, blocks |
| **Thin package** (one hero file plus notes) | deliverables treated as documents | Ship the full package: per-lockup files, visual palette + type specimens, ≥2 mockups, proof image |
| **Broken standalone file** (preview renders black/unstyled) | relative stylesheet or token links | Inline all CSS/tokens into the file; give every `var()` a literal fallback |
| **Markdown doing a designed job** | palette/type documented as `.md` tables | Deliver SVG specimens; text files are the supporting layer only |
| **Excessive detail in small formats** | print habits applied to screen | Strip to essentials at ≤ 2cm/120px reproduction |

---

## 3. Scoring (optional, for comparisons)

When comparing two versions of the same asset, score each 1–5 on:

1. **Hierarchy** — is the message immediate?
2. **Composition** — grid, rhythm, balance, whitespace.
3. **Typography** — voice, scale, micro-craft.
4. **Color** — roles, contrast, and *confidence* (a lonely accent on empty ground scores low).
5. **Coherence** — style fidelity and internal consistency.
6. **Originality** — is there a concept, or is it generic?
7. **Richness & impact** — how many visual events? Is it worth looking at twice? Does it use its format?
8. **Craft** — survives zoom; no defects.
9. **Completeness** — does the package arrive with the breadth of artifacts that make it feel finished?

A professional asset scores ≥ 4 on all of 1–8 and no defect-level findings in craft. When two assets are close, prefer the one that is **richer and more interesting** — a sparse piece with perfect alignment loses to a lively piece with good hierarchy. A craftier hero in a thin package also usually loses to a good hero in a full package.

---

## 4. The 20-second final gate

- [ ] I can say the concept in one sentence
- [ ] One dominant element, one reading path — and at least 3 other visual events happening
- [ ] There is one thing a viewer would remember (richness check)
- [ ] Not bland: if the canvas is basically type + one accent, it is under-designed
- [ ] Thumbnail still communicates
- [ ] Contrast audited on real pairs
- [ ] Every file renders standalone; package is complete
- [ ] No item from the failure catalog present
- [ ] Would I put this in a portfolio? (If no: name the weakest of hierarchy/type/color/richness/craft and fix only that.)
