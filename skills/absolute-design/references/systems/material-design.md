# Material Design (M3, with M2 notes)

Google's design system. Use for Android/web product UI, dashboards, data-dense screens, and any work that needs a rigorous role-based token system. Material is Bauhaus thinking applied to interfaces: geometric shape, systematic hierarchy, function-first.

Material's core idea for this skill: **design in roles, not hues**. A component never says "use blue" — it says "use `primary`". That indirection is what makes a design system coherent and theme-able.

---

## 1. Color roles (M3)

Build palettes as *role sets*. Each hue produces a role pair: a color and its "on" (text/icon) color, plus container variants.

**Primary** — the brand's identity color; most prominent UI.
`primary`, `on-primary`, `primary-container` (tonal surface for large fills), `on-primary-container`

**Secondary** — less prominent, for less important components (chips, filter chips).
`secondary`, `on-secondary`, `secondary-container`, `on-secondary-container`

**Tertiary** — for balance / third accents (e.g. a contrasting highlight).
`tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container`

**Error** — destructive/invalid states.
`error`, `on-error`, `error-container`, `on-error-container`

**Neutral / surface** — backgrounds, text, outlines.
`background`, `surface`, `surface-dim`, `surface-bright`
`surface-container-lowest / low / default / high / highest` (successive elevation-by-lightening)
`on-surface`, `on-surface-variant`, `outline`, `outline-variant`
`inverse-surface`, `inverse-on-surface`, `inverse-primary`, `shadow`, `scrim`

**Dynamic color (M3 signature):** derive the entire role set from a single seed (or from a wallpaper image) via HCT (hue-chroma-tone) tonal palettes — each hue gets a 13-step tonal ramp (0–100 tone), and roles pick tones from it. Result: theme-able, accessible-by-construction palettes.

**Contrast requirements:** body text ≥ 4.5:1 on its surface; large text and UI boundaries/icons ≥ 3:1. Container roles exist precisely to guarantee "on" contrast.

**Light vs. dark:** in light mode, elevated surfaces get *lighter*; in dark mode, elevated surfaces get *slightly lighter than the base too* (and shadows deepen). Never pure black/white.

## 2. Type scale (M3)

15 styles in 5 classes. Use this ramp instead of inventing one for Material work (sizes in sp/rem-equivalent; line-heights in parentheses):

| Class | Large | Medium | Small |
|---|---|---|---|
| **Display** | 57 (64) | 45 (52) | 36 (44) |
| **Headline** | 32 (40) | 28 (36) | 24 (32) |
| **Title** | 22 (28) | 16 (24) | 14 (20) |
| **Body** | 16 (24) | 14 (20) | 12 (16) |
| **Label** | 14 (20) | 12 (16) | 11 (16) |

Typeface: Roboto (M2/M3 classic) or any brand-appropriate family; the *scale* is the system. Display and Headline get negative tracking; Labels get positive tracking and often uppercase.

## 3. Shape, spacing, elevation, motion

- **Shape scale:** `none 0`, `extra-small 4`, `small 8`, `medium 12`, `large 16`, `extra-large 28`, `full` (pill). Pick 2–3 corner radii per product and stick to them.
- **Spacing:** 4dp base grid; standard steps 4, 8, 12, 16, 24, 32, 48. Touch targets ≥ 48dp; icons 24dp inside them; dividers 1dp.
- **Elevation (M3):** 0–5. Prefer tonal elevation (surface-container levels) over heavy shadows; shadow is secondary.
- **State layers:** translucent overlays for interactive states — hover 8%, focus 10%, pressed 12%, dragged 16% of the state color.
- **Motion:** easing `standard cubic-bezier(0.2, 0, 0, 1)`, `decelerate (0.05, 0.7, 0.1, 1)`, `accelerate (0.3, 0, 0.8, 0.15)`. Emphasized transitions 500ms; small ones 200–300ms. Motion should explain what changed, never decorate.

## 4. Layout & components discipline

- 8dp grid; component padding typically 16dp; app bar 64dp; bottom nav 80dp; FAB 56dp.
- Hierarchy via elevation and containers, not borders.
- One primary action per screen region; use container buttons for emphasis, text buttons for tertiary.
- Icons: filled/outlined/rounded/Sharp variants — choose one style per product.
- Data density: prefer aligned numeric columns, tabular figures, and consistent row heights.

---

## 5. Material 2 notes (legacy but widely in the wild)

If the target is an existing M2 product or a classic Material look:

- **Spacing:** 8dp grid; 4dp baseline.
- **Type scale (Roboto):** Display4 112/light, Display3 56, Display2 45, Display1 34, Headline 24/medium, Subheading1 16, Subheading2 15, Body2 14, Body1 13, Caption 12, Button 14 (medium, ALL CAPS).
- **Color:** primary 500 + primary 700 (status bar); accent A200/A400/A700; gray 50–900 scale.
- **Elevation:** shadow recipes 0dp (flat) through 24dp; components have fixed elevation values (cards 2dp, app bar 4dp, FAB 6dp, dialog 24dp).
- **Ripples** as the touch feedback language.

---

## 6. When to use Material vs. something else

Use Material when: Android/web product UI, dashboards, internal tools, data-heavy screens, or the user asks for "Material". Use `../systems/apple-hig.md` for Apple platforms. For marketing/poster/brand work, Material is usually too system-bound — borrow its *role-based color thinking* instead and style from `../styles/`.
