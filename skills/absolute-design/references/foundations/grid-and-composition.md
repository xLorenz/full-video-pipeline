# Grids & Composition

The grid is not a container. It is the argument the design makes about order. Williamson's history of the grid shows the same matrix — vertical and horizontal axes intersecting — has symbolized divine order (late medieval manuscripts), rational law (Cartesian/Swiss modernism), and something to be smashed (postmodernism). When you build a grid, you inherit one of those meanings whether you intend to or not. Choose.

Read this before laying out anything larger than a badge.

---

## 1. Grid typologies

### The four structural subforms

From Williamson's structural typology. Same visual appearance, different valuation of the elements:

| Subform | The valued element | What it expresses |
|---|---|---|
| **Coordinate-based** | the point of intersection | a threshold, a focal event ("here, something happens") |
| **Intersection-based** | the crossing of axes | conjunction, meeting, synthesis |
| **Module-based** | the repeated cell | system, series, production, equality |
| **Line-based** | the axis in extension | continuity, direction, infinite field |

These pair into two major forms:

- **Point-based** (coordinate + intersection). The intersection is an *event*. Use when the composition has one or a few privileged moments — a hero object, a headline landmine, a symbolic alignment between two elements. Medieval illumination aligned the newborn John with the adult John across scenes on shared grid-lines: the grid carried meaning between separated zones.
- **Field-based** (module + line). The matrix is a *condition* — continuous, isotropic, rational. Use when content is a series (catalogs, dashboards, editorial systems, data) and the design's job is to make many items feel like one population.

**Decide which you are building before drawing columns.** A point-based design ruined by an over-specified field grid becomes bureaucratic; a field-based design with no module discipline becomes collage.

### Practical grid constructions

- **Manuscript / single column.** One text block with generous margins; margin ratio often mirrors a page proportion (2:3, 3:4, 1:√2 like A-series paper). The canon of page construction historically centers the text block using diagonal lines from corner to corner of the page — a good default for covers and single-column posters.
- **Column grid.** N equal columns (12 is the web standard; 5 and 6 are classic editorial). Gutters constant. Span anything from 1 to N columns; asymmetry of spans creates dynamic tension, symmetry creates calm.
- **Modular grid.** Columns × rows = modules. Strongest form of field logic. Use for catalogs, galleries, dashboards, data tables.
- **Hierarchical grid.** Irregular field defined by content needs — one dominant text area plus secondary fields. Fastest to build, hardest to make look systematic; anchor it to a baseline and a spacing scale or it drifts.
- **Axial / diagonal grid.** Axes at non-90° angles. High energy, low information density. Appropriate for postmodern, psychedelic, and brutalist idioms; hostile to body text.
- **Baseline grid.** A horizontal rhythm (typically the body leading — e.g. 8px or 12px or 1.5× body size) that every vertical position snaps to. This is what makes a page feel "quietly correct" even when nobody sees the grid.

### How to actually choose values

1. Start from the **format**: physical/digital size, bleed, safe area, minimum reproduction size.
2. Set **margins** as a proportion, not a pixel guess — outer margin ≈ 0.5–1× the gutter; top margin often larger than bottom (optical center of gravity); inner margin (in spreads) larger than outer.
3. Set **columns** by content: 1–3 for posters and covers, 4–6 for editorial, 12 for web/app layout, modular for repeated units.
4. Set the **gutter** wide enough that columns never collide visually at thumbnail size (typically 0.5–1.5× the body text size for print; 8/16/24px steps for screen).
5. Set the **baseline** to a multiple of your body leading.
6. Sanity-check: run 3 pieces of different content through the same grid. If only one of them works, the grid is a template, not a system.

### Function–Behavior–Structure (a way to think about grid design)

Bokil & Ranade applied the FBS design-knowledge framework to grids; it's a useful discipline:

- **Function** — what must the layout *achieve*? (Sell one idea? Sequence five steps? Compare six products? Establish institutional authority?)
- **Behavior** — how does the grid behave under content pressure? (Flexible spans, fixed modules, breakable rules, responsive reflow?)
- **Structure** — what do you actually draw? (Columns, modules, axes, baseline, margins.)

Most bad grids fail at Function: they are drawn as Structure without asking what the piece must do. Write the Function sentence first.

---

## 2. Composition

A grid gives you *where*. Composition decides *what wins*.

### Hierarchy — the only thing the viewer actually consumes

Hierarchy is a controlled inequality of attention. Create it with any of:

- **Scale** (biggest thing wins — but only if everything else is clearly smaller)
- **Weight** (a bold among regulars)
- **Color/contrast** (the only saturated thing; the only dark thing; the only light thing on a dark field)
- **Position** (top-left entry, center, the end of the reading path — the terminal point of a Z is powerful)
- **Isolation** (whitespace around an element confers status)
- **Density** (a cluster among sparse elements, or vice versa)

If two elements compete with equal force, the design has two messages and therefore none. Demote or delete.

### The reading path

Decide where the eye enters, what it reads second, and where it rests:

- **Z-path** — default for balanced layouts: entry top-left, sweep to top-right, diagonal down, exit bottom-right. Put the CTA at the exit.
- **F-path** — default for text-dense/screen layouts: horizontal headline band, then left-aligned scanning.
- **Vertical cascade** — posters and covers: headline → image → detail → footer.
- **Radial / center-out** — hero object, ceremonial, logo-centric. Use once per piece.
- **Gutenberg / terminal area** — the eye tends to drift toward the terminal (bottom-right) in Western layouts with weak cues; strong elements must counteract that drift if the exit point is elsewhere.

If the actual path doesn't match the intended path, fix hierarchy and alignment — not decoration.

### Gestalt principles — why grouping happens without borders

- **Proximity** — items close together read as a group. This is your primary grouping tool; use spacing differences (e.g. 8 / 16 / 32) to encode relationships.
- **Similarity** — same size/weight/color/shape reads as a class. Use for repeated items; break it to mark the special one.
- **Continuity** — the eye follows a line or curve. Use implied lines (aligned edges, shared axis, a row of shapes) to move attention.
- **Closure** — the mind completes partial forms. Useful for icons and marks; dangerous for legibility.
- **Figure–ground** — what reads as object vs. field. Establish early; ambiguous figure–ground is a psychedelic/postmodern device, not an accident.
- **Common fate** — elements moving (or angled) together read as one group. In static design: shared angle, shared gradient direction.

### Balance, rhythm, emphasis

- **Symmetry** = stability, formality, ceremony. **Asymmetry** = tension, modernity, energy. **Radial** = focus. Choose by register, not by habit — asymmetric balance is the modernist default but not the only correct answer.
- **Rhythm** comes from *regular spacing* and *regular repetition* (a baseline, a module, a recurring motif). Broken rhythm (one element violating the pattern) creates emphasis — the violation must be singular to be legible as intentional.
- **Emphasis** = one dominant focal point per piece (plus possible secondary accents in a clear ratio, roughly 1:3:9 of visual weight).

### Whitespace

Whitespace is structure, not emptiness. It: (a) creates groups via proximity, (b) confers status via isolation, (c) sets the pace of reading, (d) carries the composition's temperature (dense = urgent/abundant, open = calm/premium). Beginners under-use it; the fix is not "add space everywhere" but to *vary* it deliberately — tight within groups, generous between them.

### Composition templates that reliably work

1. **Hero + support.** One dominant element (type block or image) occupying ~60% of visual weight; details below/right in a strict sub-grid.
2. **Rule of thirds / 3×3.** Place focal points on thirds intersections. Honest caveat: it's a heuristic for avoiding dead-centering, not a law — golden-ratio placement (≈0.618) is an alternative; both work because they break symmetry.
3. **Diagonal tension.** Two mass clusters on opposing corners, connected by an implied diagonal (or an actual rule/arrow).
4. **Centered ceremonial.** Symmetric stack: kicker → display → rule → subhead. Works for covers, invitations, luxury. Requires superb type; symmetry exposes weak type.
5. **Modular field.** Repeated units of equal weight with one unit modified (color, scale, content) to carry the message.
6. **Bleed + edge tension.** Element cropped by the format edge implies continuation beyond the frame — modernist device; use one deliberate bleed, not several competing ones.

### Break the grid on purpose, once

A grid that is never broken is bureaucratic; a grid broken everywhere is noise. If the piece needs tension: establish the system clearly (visible alignment, consistent rhythm), then violate it exactly once — an oversized word crossing a margin, a rotated axis, an element bleeding off — and know what it means. In the postmodern idiom (Weingart, Greiman) a *tilted or fractured grid is the message itself*: it dramatizes the destruction of rational order. That is a stylistic choice with a history, not a way to look dynamic.

---

## 3. Checklist before composing

- [ ] Function sentence written (what the layout must achieve)
- [ ] Point-based or field-based chosen
- [ ] Margins / columns / gutters / baseline specified as numbers
- [ ] Hierarchy planned: exactly one dominant element named
- [ ] Reading path named, and the terminal point named
- [ ] Break-the-grid moment: none, or exactly one, and justified
