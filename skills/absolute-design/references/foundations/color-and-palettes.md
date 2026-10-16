# Color & Palettes

Color is the fastest emotional channel a design has — read before type, before image. It is also the most common place where design looks arbitrary. The cure is to think in **roles** (what a color does) rather than in hues (what a color is).

---

## 1. Model thinking

Work in **HSL/OKLCH**, not RGB hex-editing. Hue is the *what*, saturation is the *how much*, lightness is the *how loud* — and lightness does most of the hierarchical work.

- **OKLCH/OKLab** (preferred when available): perceptually uniform, so "same lightness" actually looks the same across hues. Great for generating ramps and ensuring contrast.
- **HSL** is the practical fallback everywhere CSS exists.
- Decide **lightness structure first**: a piece usually needs a light field + dark ink + one or two mid-lightness accents. Saturation wars are what make amateur color look cheap.

---

## 2. Harmonies — the reliable constructions

| Harmony | Construction | Character |
|---|---|---|
| **Monochromatic** | one hue, varied lightness/saturation | calm, sophisticated, cohesive; risky if flat |
| **Analogous** | 2–4 adjacent hues (30–60° apart) | harmonious, natural, low tension |
| **Complementary** | opposite hues | maximum contrast/energy; handle with discipline (one dominant, one accent) |
| **Split-complementary** | base + two beside its complement | contrast with less vibration; a workhorse |
| **Triadic** | 120° apart | vibrant, balanced; desaturate one or two for control |
| **Tetradic / double-complementary** | two complementary pairs | rich, complex; needs a dominant role or it fragments |
| **Neutral + accent** | 90% neutrals, 10% one hue | premium, editorial, Swiss; the safest "expensive" look |

Then apply the **60-30-10** distribution heuristic as a *starting shape*, not a ceiling: ~60% dominant (usually the field/neutral), ~30% secondary (surfaces, supporting type), ~10% accent (the eye's destination). Ratio beats variety — but for posters, covers and expressive work, feel free to push toward 50-30-20 or add a second accent used boldly. A single timid accent on an empty ground is a common cause of "too simple, too bland".

**Two disciplines, not one.** Scarcity of accent is a *UI and brand-system* rule: in interfaces, colour must stay meaningful, so accents are rationed. In posters, editorial, packaging and social graphics, colour is content — use it with confidence (fields, bands, blocks, duotones, second accents). Choose the discipline that matches the format.

---

## 3. Temperature, mood, meaning

- **Warm** (red/orange/yellow): energy, urgency, appetite, intimacy. Advances toward the viewer.
- **Cool** (blue/green/violet): trust, calm, technology, clinical. Recedes.
- **Dark grounds:** drama, premium, night, focus; lighter accents pop harder against them.
- **Light grounds:** clarity, openness, editorial, retail.
- **Muted/desaturated:** sophistication, heritage, restraint. **High saturation:** youth, urgency, play, warning.

Cultural codes matter: white = purity in some contexts, mourning in others; red = luck in Chinese contexts, danger in many Western ones; purple = luxury in the West, mourning in parts of Asia; green = nature/growth globally but also religious meaning regionally. When the audience is global and the stakes are high, lean on structure and neutral dominance rather than symbolic hue.

---

## 4. Contrast & accessibility

Contrast is both a hierarchy tool and an ethical obligation.

- **WCAG AA:** body text ≥ 4.5:1 against its background; large text (≥18.66px bold or ≥24px) ≥ 3:1; UI components and meaningful graphics ≥ 3:1.
- **AAA** (7:1 / 4.5:1) for premium legibility contexts.
- Never encode meaning in hue alone (success/error/selection states need shape, icon, label, or weight too) — ~8% of men have a red-green deficiency.
- Check the *actual* pairings used (text-on-surface, icon-on-surface), not just the swatches. A 500-weight accent that passes as a swatch may fail as 12px label text.
- For dark themes, remember pure white on pure black glows and fatigues: prefer off-white (#F5F5F4-ish) on near-black (#121212–#1C1C1E).

---

## 5. Building a palette with roles

A palette is a *set of jobs*, not a set of chips. Build it in this order:

1. **Anchor hue** — the color of the brand's intent (trust→blue, energy→red-orange, growth→green, luxury→deep violet/black-gold, etc.). Start at moderate saturation (~60–80% HSL), then tune.
2. **Neutral ramp** — 8–10 steps from near-white to near-black, slightly tinted toward the anchor (a warm-gray vs. cool-gray choice is a whole mood difference). Use for text, borders, surfaces, shadows.
3. **Light/dark step pairs** for the anchor (a "container"/tint and a "container on" color) — this is how you get depth without shadows.
4. **Support hues** — secondary (analogous or complementary-dominant) and tertiary/accent (often the complementary of the anchor at lower saturation, used only for small high-attention moments).
5. **Semantic roles** — success, warning, error, info; each needs a hue *and* a tinted surface *and* an "on" color.
6. **Dark variant** — recompute lightness relationships rather than inverting.

The role names to define (a slimmed material-style set works universally):

```
background, surface, surface-2, outline
text-primary, text-secondary, text-disabled
primary, on-primary, primary-container, on-primary-container
accent, on-accent
success / warning / error (each: base, container, on-container)
```

Emit these as tokens (see `references/craft/production.md`) — then every asset in the system stays coherent.

---

## 6. Dark mode

Don't invert. Rebuild:

- Surfaces become *elevated by lightening* (a light gray layer on darker ground), not by shadow alone.
- Reduce saturation of accents slightly; bright colors vibrate on dark grounds.
- Keep text off-white, never #FFF on #000.
- Preserve the *hierarchy of lightness roles* — primary stays the most prominent, containers stay lighter than the ground.
- Test every pairing; dark mode is where contrast bugs live.

---

## 7. Anti-patterns

- **Purple→blue gradients everywhere** (the AI default). If you use a gradient, it should be derived from brand hues and directionally meaningful, not a mood-light.
- **Full rainbow "brand palettes"** of 6+ saturated hues with no hierarchy. One dominant hue is a system; six is a toy box.
- **Gray #808080 secondary text on white** (fails contrast and looks dusty). Use a tinted gray at 60% lightness or darker.
- **Over-saturated digital primaries** (pure #0000FF, #FF00FF) in body-scale UI — they buzz. Reserve maximum saturation for tiny accents.
- **Color-by-moodboard copy-paste** — a palette sampled from an unrelated photo rarely survives contact with type. Always run the contrast audit after sampling.

---

## 8. Working from an existing brand

If brand colors are given: build the neutral ramp *to match their temperature*, derive tints/shades from the anchor (10% lightness steps in OKLCH), and use the brand hues in their given roles — don't introduce a competing hue for decoration. If the brand palette is weak (e.g. two saturated primaries at similar lightness), keep the hues but fix the *lightness hierarchy* so the design has room to work.

If no brand exists: anchor hue → neutral ramp → one or two accents. Three hues is a calm default for systems and UI; posters and expressive work routinely run 4–6 hues with confidence (see `../styles/expressive-modes.md` and `contemporary-modes.md` for the palettes that license it). What is never negotiable is hierarchy — many hues must still resolve into dominant / secondary / accent, or the piece fragments.
