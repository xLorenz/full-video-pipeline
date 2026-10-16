# Typography

Type is the voice of the piece — before any image is read, the letterforms have already told the viewer what kind of thing this is. Choosing "a font" is a tone decision; building a type *system* is a structural one. Both matter, in that order.

---

## 1. Classification — what each class says

Choose by voice, then by legibility, then by licensing/availability.

### Serif

| Class | Traits | Says | Reference faces |
|---|---|---|---|
| **Old-style / humanist** | angled stress, moderate contrast, calligraphic roots | tradition, warmth, literary | Garamond, Palatino, Sabon, Caslon |
| **Transitional** | vertical stress, sharper serifs, more contrast | authority, editorial credibility | Baskerville, Times, Georgia |
| **Didone / modern** | extreme contrast, hairline serifs, vertical axis | fashion, luxury, drama | Bodoni, Didot, Playfair |
| **Slab** | heavy rectangular serifs, low contrast | sturdy, industrious, confident | Rockwell, Sentinel, Archer, Zilla |

### Sans-serif

| Class | Traits | Says | Reference faces |
|---|---|---|---|
| **Grotesque** | early sans, quirky terminals, slight irregularity | honest, editorial, engineered | Akzidenz-Grotesk, Franklin Gothic |
| **Neogrotesque** | rationalized, neutral, closed apertures | objective, institutional, default-modern | **Helvetica**, Univers, Inter, Roboto |
| **Geometric** | circle/square-based, single-weight logic | modernist, systematic, Bauhaus-descended | Futura, Avenir, Poppins, Century Gothic |
| **Humanist sans** | open apertures, calligraphic skeleton | friendly, legible, humane | Frutiger, Gill Sans, Open Sans, Lato |
| **Display / poster** | extreme weight or width or detail | attitude (use at large sizes only) | Druk, GT America, Bebas, Impact |

### Other

- **Monospace / typewriter:** technical, raw, computational, brutalist (IBM Plex Mono, Space Mono, Courier, JetBrains Mono).
- **Script / hand-lettered:** personal, artisanal, festive — Arts & Crafts, mid-century, punk scrawl. Almost never for UI or body text.
- **Variable fonts:** one file, continuous axes (weight/width/optical size). Ideal for design systems and for tuning display type optically.
- **Blackletter / ornamental:** historical or ceremonial; a specific reference, not a neutral choice.

**Practical default positions:** Neogrotesque sans for anything screen/UI or institutional; transitional serif for editorial/literary; geometric sans for modernist systems; humanist sans for approachable product voice. Avoid the over-familiar defaults (Poppins/Montserrat/Inter everywhere) unless the register is "generic tech" — they read as template.

---

## 2. Type scale — build the ramp first

Sizes should relate to each other by ratio, not by taste per element. Pick a **modular scale**:

| Ratio | Character | Use |
|---|---|---|
| 1.125–1.2 | tight, text-heavy, systematic | UI, documentation, dashboards |
| 1.25 (major third) | balanced, versatile | general purpose |
| 1.333 (perfect fourth) | editorial, expressive | posters, magazines, marketing |
| 1.5 (perfect fifth) | dramatic | display-dominant, few elements |
| 1.618 (golden) | high contrast, ceremonial | luxury, covers (handle with care) |

**How to build it:** define the body size first (16–18px screen, 9–11pt print), then multiply/divide by the ratio to get the ramp. Name the roles — they are what you'll use when composing:

```
display    3.5rem   (600–800 weight, tight tracking)
headline   2.25rem  (600)
title      1.5rem   (600)
subhead    1.125rem (600, often tracked +0.04em or uppercased)
body       1rem     (400, leading 1.5–1.65)
caption    0.875rem (400–500)
label      0.75rem  (600, uppercase, tracked +0.08em)
```

(For design-system work, `references/systems/material-design.md` defines a 15-style ramp and `references/systems/apple-hig.md` the Dynamic Type styles — use those instead of inventing one.)

### Hierarchy from type

Encode hierarchy with **exactly 2–3** of these levers, used consistently:

1. Size (largest lever)
2. Weight (bold vs. regular)
3. Color/contrast (primary vs. secondary text)
4. Case & tracking (UPPERCASE + wide tracking = label voice; never for paragraphs)
5. Position & isolation (whitespace confers rank)
6. Family contrast (a display face against a text face)

Do **not** vary size ad-hoc ("this one 23px, that one 21px"). If two levels are within ~15% of each other, either merge them or separate them further.

---

## 3. Pairing

Good pairs create contrast of voice with unity of structure.

- **One family, two weights (or two widths).** Safest and often the most sophisticated. A display weight + a text weight of the same superfamily is a complete system.
- **Contrast of classification.** Serif + sans (editorial + interface). Didone display + neogrotesque text (fashion). Slab + humanist (industrial warmth).
- **Shared skeleton.** Geometric sans + geometric-leaning serif share x-height logic and sit together quietly.
- **Match by x-height.** The most common pairing failure: faces with wildly different x-heights look mismatched no matter how much you adjust size.
- **Cap the family count at 2** (3 in maximalist/postmodern idioms where clash is the point).

Text-face requirements that display faces can skip: open apertures, distinguishable il1/O0, even color (no blotchy texture), true italics if used.

---

## 4. Micro-typography — the craft layer

This is where professional work separates from competent work.

- **Measure (line length):** 45–75 characters per line for body text (66 is classic). Longer = fatigue; shorter = choppy.
- **Leading:** body text 1.4–1.65× the font size; display type tighter (0.95–1.15×) so big words hold together as shapes. Never let two lines of display type gap awkwardly.
- **Tracking:** negative for large display type (−0.02 to −0.04em); positive for small caps/labels (+0.06 to +0.12em); near-zero for body. Bigger type needs tighter tracking; smaller type needs looser.
- **Kerning:** fix pairs in display type — AV, TA, WA, LY, P., "f" followed by space, and any word with a diagonal adjacent to a horizontal.
- **Optical alignment over mathematical:** a round letter (O, C, S) should hang slightly past the left margin; a stem (H, I, M) sits exactly on it; a pointed letter (A, W, V) overhangs a bit. Aligning mathematically to a bounding box is what makes left edges look ragged.
- **Hanging punctuation:** pull opening quotes and small punctuation outside the text block so the edge reads as a straight line.
- **Widows & orphans:** a single word alone on the last line of a paragraph is a defect. Fix by editing copy, nudging measure, or — last resort — manual line breaks in static art.
- **Rivers & rag:** check for vertical whitespace channels in justified text (use justified only with hyphenation support and a comfortable measure; flush-left/ragged-right is the modernist and safer default).
- **Baseline discipline:** every text baseline lands on the baseline grid. Optical nudges (a bullet, a small icon) may break it — once, deliberately.
- **Ligatures & features:** enable standard ligatures in display type; enable tabular figures for numbers in tables/columns; oldstyle figures for running prose if the face has them.
- **Case discipline:** sentence case for headlines is humane; Title Case is institutional/ceremonial; ALL CAPS is emphatic but costs reading speed — use for labels and short bursts only.

---

## 5. Type on screen vs. in print

- **Screen:** define sizes in rem/clamp(); respect user scaling (Dynamic Type on Apple, browser zoom elsewhere); body never below 14px / 0.875rem; rely on system-ui stacks for UI text when custom faces aren't licensed, but pick the *display* face deliberately.
- **Print:** sizes in pt; leading in pt or a baseline multiple; always convert to the correct resolution for rasterization; confirm minimum legible size for the reproduction method (newsprint ≠ coated stock).
- **Small-format (thumbnails, avatars, badges):** test at the smallest size it will ever appear. Big display type collapses gracefully; small text collapses to gray noise. Design the thumbnail case explicitly for anything that appears in a feed.

---

## 6. Quick audit

- [ ] Scale is a ratio-derived ramp, not a list of arbitrary sizes
- [ ] Hierarchy uses 2–3 levers consistently; no two levels too close in size
- [ ] Measure 45–75 chars; leading set for size class
- [ ] Tracking tuned per size (tight display, loose labels)
- [ ] Optical alignment applied at the left edge and at cap-height/overshoot
- [ ] No widows; no default-font display type; no stretched/squeezed faux-bold or faux-italic
- [ ] Pairing: ≤2 families (or 3 with stated clash intent), matched x-heights
