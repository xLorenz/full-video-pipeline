# Apple Human Interface Guidelines

Use for iOS/iPadOS/macOS/watchOS/visionOS UI, and whenever the goal is a premium, content-first consumer-product feel. Apple's system is the canonical expression of **deference**: the interface serves the content, never competes with it.

Apple's three historic pillars still describe the target: **Clarity** (legibility, precise icons, unambiguous hierarchy), **Deference** (UI is quiet; content is the hero), **Depth** (layers, translucency, motion create meaning and hierarchy).

---

## 1. Layout

- **4pt grid.** All spacing, sizes, and positions land on multiples of 4 (8, 12, 16, 20, 24, 32…).
- **Standard layout margins:** 16pt on iPhone portrait (scales up on larger devices); content respects **safe areas** — never place interactive content under the notch, home indicator, or system bars.
- **Touch targets:** minimum 44×44pt (buttons often visually smaller but padded to 44). Primary actions live in the lower half of the screen for thumb reach.
- **Navigation:** navigation bar top (large titles optional, collapsing on scroll); tab bar bottom; toolbars contextual. Don't invent new navigation paradigms.
- **Lists and tables** are the workhorse layout; use grouped inset lists for settings-like content, edge-to-edge lists for media.
- **Spacing rhythm:** tight inside components (4–8pt), moderate between related groups (16pt), generous between sections (24–32pt).

## 2. Typography

- **SF Pro** (San Francisco) is the system face: SF Pro Text for body sizes, SF Pro Display for large sizes; **SF Mono** for code/telemetry; **SF Symbols** for icons (matched to text weight/size — always use symbols instead of drawing icons).
- **Dynamic Type styles** (body = 17pt default):

| Style | Size (default) | Use |
|---|---|---|
| Large Title | 34 | screen hero title |
| Title 1 / 2 / 3 | 28 / 22 / 20 | section titles |
| Headline | 17 (semibold) | emphasis within body |
| Body | 17 | default text |
| Callout / Subheadline | 16 / 15 | supporting text |
| Footnote / Caption 1 / Caption 2 | 13 / 12 / 11 | metadata, labels |

- Support **Dynamic Type scaling** — layout must reflow when the user increases text size. This is an accessibility requirement, not a nicety.
- Prefer **semantic weights** (regular/medium/semibold/bold) over arbitrary ones; align icons to cap-height.

## 3. Color & materials

- Build semantic color sets: `label`, `secondaryLabel`, `tertiaryLabel`, `quaternaryLabel`, `systemBackground`, `secondarySystemBackground`, `tertiarySystemBackground`, `separator`, `systemBlue/Green/Red/Orange/Yellow/Pink/Purple/Gray` (each with light and dark variants).
- **Both light and dark appearances are required.** Define colors as adaptive; never hardcode a hex that only works on white.
- **Materials & vibrancy:** translucent layers (ultraThin/thin/regular/thick/ultraThick) blur content beneath to establish hierarchy; vibrant label colors recede/advance appropriately. Use materials for sidebars, toolbars, overlays — not as decoration.
- **Accent color (tint):** one brand tint used for interactive elements; standard system colors imply standard meaning (red = destructive, green = success).
- Contrast: text ≥ 4.5:1 (large text and essential icons ≥ 3:1). Respect Increase Contrast and Reduce Transparency settings in spirit (avoid low-contrast grays on translucent materials).

## 4. Feedback, motion, depth

- **Depth = meaning.** Translucency, blur and shadow describe layering and modality, not "effect". Shadows stay subtle (1–3% black, soft).
- **Motion:** purposeful and short (250–350ms); easing is ease-in-out unless following a physical metaphor. Respect Reduce Motion (fall back to cross-fades).
- **Haptics & sound** as confirmation, not celebration.
- **Live feedback everywhere:** pressed states, loading states, empty states, error states. A screen without an empty/error design is unfinished.

## 5. Platform conventions that read as "Apple"

- Rounded rectangles (continuous corner radii) for cards and controls; buttons with filled/tinted/plain styles.
- Modal sheets slide up with a grabber; alerts are centered, few actions, destructive role labeled.
- Gestures: swipe to delete, pull-to-refresh, pinch to zoom — don't repurpose them.
- Copy: sentence case, concise, plain language. Never shout in ALL CAPS.
- Photography and content imagery goes edge-to-edge; UI chrome is minimal.

## 6. When to use Apple HIG vs. Material

Use HIG for Apple-platform UI or when the brief wants premium consumer calm. Use `../systems/material-design.md` for Android/web-product UI or data-dense dashboards. If the deliverable is marketing/poster/brand rather than UI, treat both systems as *token discipline* sources and style from `../styles/` instead.
