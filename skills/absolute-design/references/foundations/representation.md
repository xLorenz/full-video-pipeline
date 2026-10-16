# Representation — what to show, and how

Two questions decide whether a design communicates: **which representation** carries the idea, and **how that representation is staged**. The design literature (Pei et al.'s taxonomy of visual design representations; Antoine et al.'s interaction-illustration taxonomy) gives these questions real structure. Use them to avoid the default failure: a beautiful piece showing the wrong kind of thing.

---

## 1. Choosing the representation

Pei, Campbell & Evans classify design representations into four families. Each is suited to a different phase and purpose:

| Family | Definition | Fidelity | Best for | Fails at |
|---|---|---|---|---|
| **Sketch** | preliminary, rough, free-hand, key elements only, often not to scale | low | ideation, exploring possibilities, thinking | verification, specification |
| **Drawing** | formal arrangement of lines, structured, to scale, rule-based (drafted or CAD) | high | precision, verification, technical communication | speed, ambiguity/possibility |
| **Model** | reproduces rough functional properties; tangible/virtual 3D | medium | explaining function, performance, form in the round | final aesthetics, exact detail |
| **Prototype** | communicates/verifies the final outlook and functionality | final | confirmation, evaluation, persuasion | cheap iteration |

Applied to graphic assets, the same logic maps onto what you put *in* the design:

- **Sketch-like (rough, hand-drawn, loose):** signals process, humanity, approachability, craft. Use for ideation stages, artisanal brands, editorial accents, workshop/startup warmth. Punk zine energy is a stylized version of this.
- **Drawing-like (diagrammatic, geometric, technical, iconographic):** signals precision, systems, expertise. Use for infographics, product explanation, wayfinding, technical brands, UI. Swiss and Bauhaus live here.
- **Model-like (3D renders, isometric, dimensional mockups, physical objects photographed):** signals product reality, tangibility, function. Use for packaging, product launch, spatial/environmental design.
- **Prototype-like (realistic mockups, in-context photography, final-spec visuals):** signals "this exists and is ready". Use for marketing, case studies, investor material, store displays.

**Sub-decisions inside sketches** (from the same taxonomy) — pick the one matching the audience:

| Sketch type | Purpose | Use when |
|---|---|---|
| **Personal** | externalize your own thinking | working drafts, not usually shown |
| **Shared** | create a common mental image in a team | workshop artifacts, collaborative boards |
| **Persuasive** | convince stakeholders | pitches, decks, launch imagery |
| **Handover** | hand to someone for execution | specs, production drawings, developer handoff |

The failure mode this prevents: a *persuasive* deliverable built with *personal* sketch energy (looks unfinished), or a *handover* deliverable styled like a *persuasive* one (looks unserious). Match fidelity to function.

---

## 2. Staging the representation ("how" codes)

Antoine et al.'s taxonomy separates **what** is represented from **how** it is staged. Both must be decided.

### What codes (content decisions)

- **Purpose of the visual:** design space? interaction sequence? system overview? Choose one.
- **Time:** still (a moment) or moving (implied sequence — via arrows, frames, stroboscopic repetition).
- **Users:** how many, which body parts (hand, full body, none), and whether they are depicted, abstracted, or anonymized (blurred face, silhouette, omitted).
- **Activity type:** production, communication, data manipulation, driving, making, etc. — each implies props and setting.
- **Visual medium:** drawing (simplistic/realistic), rendering, photo, clipart/icon, data visualization, or text-only.

### How codes (compositional decisions)

**Point of view** — the camera. This is the single most overlooked staging decision:

| Viewpoint | Effect | Use |
|---|---|---|
| 1st person | viewer *is* the actor; immersion | tutorials, POV ads, game UI |
| 3rd person | objective observation | most product/marketing imagery |
| Over-shoulder / 3–4 | "in use, in context" | product-in-hand, workflow shots |
| Top-down | map/plan, system overview | flat-lays, site plans, dashboards |
| UI only | pure interface, no user | design specs, UI galleries |

**Layout of frames:**

- **One frame** — single moment; needs strong typographic support.
- **Multiple frames / sequence** — narrative; requires consistent camera, scale, and a clear ordinal direction (left→right, or numbered).
- **Sub-framing:** inset (picture-in-picture) for detail; magnification lens for micro-detail; UI embedded in a device; UI overlaid on reality (AR logic).
- **Juxtaposition** — side-by-side comparison: before/after, option A/B, competitor/you. Align baselines and scales exactly or the comparison is meaningless.

**Visual techniques (emphasis & clarity):**

- **Emphasize a region:** color area, arrow, highlight, exact contour line, enclosing shape.
- **De-emphasize:** gray out, blur, remove, anonymize — the background becomes literally the background.
- **Grouping and linking:** color grouping, identifiers (A/B/C or 1/2/3), grouping arrows, text annotation.
- **Dynamics of movement:** stroboscopic repetition (the same object in several positions), motion blur, trajectories, direction arrows, transition arrows, projection lines, contact shapes (showing where force lands).
- **Structure identifiers:** numbered/lettered callouts, titles, measure arrows (with dimension text).

Rules that make these techniques work: use **one** emphasis technique as primary (a color highlight OR an arrow system, not both shouting); keep annotation type smaller than the subject; keep guide/arrow lines at a consistent weight and always lighter than the content they explain.

---

## 3. Choosing medium for a graphic asset

| If the goal is… | Prefer | Because |
|---|---|---|
| Emotional/lifestyle appeal | photography (or photoreal render) | humans read faces and light fastest |
| Explain a mechanism | diagram / exploded drawing / isometric | structure beats atmosphere |
| Show a system or data | data visualization | pre-attentive encoding (length, position) is faster than color |
| Iconic/brandable identity | pure geometry + type | scales, works in one color, survives small sizes |
| Craft, humanity, warmth | hand-drawn / textured illustration | imperfection reads as authenticity |
| Absurdity, energy, subculture | collage / distortion / mixed media | clash is the message |
| Speed of comprehension at thumbnail | type + one bold shape | words and masses survive downscaling |

Hybridize deliberately: photo + Swiss type overlay is a canonical combination; illustration + Memphis pattern is another. The combination must have a dominant medium, or the piece becomes two designs fighting.

---

## 4. Practical composition of multi-element visuals

When a design contains several representations at once (photo + diagram + type):

1. Assign each element a **role**: hero, evidence, explanation, or label. Only one hero.
2. Assign each a **fidelity level** consistent with its role (hero can be photographic; explanation should be diagrammatic; label is typographic).
3. **Align them to one grid** — mixed fidelity is fine, mixed alignment is not.
4. **Scale them by importance, not by their native sizes** — a photo may need cropping aggressively so the diagram can stay legible.
5. Keep annotation/label type in **one** style across the whole piece.

---

## 5. Quick audit

- [ ] The representation family matches the purpose (sketch/drawing/model/prototype → real intent)
- [ ] Point of view chosen deliberately and stated
- [ ] One frame vs. sequence decided; sequence has a clear reading order
- [ ] One primary emphasis technique; de-emphasis used where attention must not go
- [ ] Medium matches the goal (photo for emotion, diagram for mechanism, type for identity)
- [ ] All annotations share one type/weight/arrow language
