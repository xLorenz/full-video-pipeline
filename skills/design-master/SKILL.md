---
name: design-master
description: >
  Pick a visual design language for a video and translate it into a concrete
  Remotion/pipeline style (color palette, fonts, backgrounds, animation
  character). Use this skill whenever deciding the look of a video, writing
  STYLES.md (pipeline Step 7), setting lib/styles.ts, styling SceneXX.tsx, or
  choosing thumbnail colors — even if the request only says "style the video",
  "pick colors and fonts", "make it look premium/playful/technical", names a
  mood or brand vibe, or asks to browse or compare the bundled website design
  references.
---

# Design Master — Video Style Router

You route across 20 website style references and translate exactly ONE of
them into a video style the pipeline can render. The references are web
designs; your job is to reinterpret them as motion-video decisions, not to
rebuild the website.

## Golden rules

1. **Read the table first, then exactly ONE reference file.** Never read all
   20 files, never skim several "just to compare" — the one-line vibes below
   are enough to choose. Comparing full files wastes context and the files
   are long on purpose.
2. **Never edit anything under `references/`.** Those files are frozen source
   material. Your output goes into the video project (`STYLES.md`,
   `lib/styles.ts`, `SceneXX.tsx`), never back into the reference.
3. **Read cheaply.** Open only the sections you need via slices (header +
   `Tokens — Colors` + `Tokens — Typography` + `Do's and Don'ts` first).
   `reflect-notes.md` contains ~20 KB starfield `box-shadow` lines — they are
   decorative data, not design tokens; skip any line longer than ~500 chars.
4. **One design per video.** Mixing two references produces mud. If torn
   between two, pick the one whose *background theme* (dark/light) fits the
   thumbnail contrast plan, and note the runner-up in one sentence.

## Where this plugs into the pipeline

- **Step 7 (`STYLES.md`) is the destination.** This skill decides the style;
  the phase brief (`skills/full-video-pipeline/references/phase-3-visuals-render.md`)
  defines the artifact. The brief's CTR rules always win on conflict:
  3–5 hex codes, high-contrast pairings legible at 168×94px, 30–40% negative
  space with one focal point, 1–2 font families (Google Fonts or web-safe),
  one animation character (smooth, snappy, minimal, or bold).
- **`lib/styles.ts` stays the single source of truth** once you write code.
  Templates under `remotion/src/components/animations/` read it via the
  shared helper — keep per-instance overrides minimal.
- **Phase 4 reuses this palette** for the thumbnail. Choose CTR-safe contrast
  now (a ≤3-word overlay must read on the background) or you will redo it later.
- **Unaffected rules:** scenes still render silent video (no `<Audio>` in
  `SceneXX.tsx`); SFX/BGM cues still live in `scenes.json` and still get
  mood-checked against `style.mood` — so pick a reference whose mood you can
  honestly name (e.g. `tense`, `playful`, `elegant`), not just colors.

## How to choose (in order)

**1. Lock the theme from the thumbnail plan.** Dark video on a dark
reference family, light video on a light one. Mixed references work when the
video alternates (e.g. light explainer with dark data chambers).

**2. Match topic energy using the catalog.** Find the row whose "best for"
fits the video's subject and emotional register, not the company name.

**3. Break ties by typography.** Mono/terminal faces suit engineering
credibility; giant condensed display suits hype; serif broadsheets suit
trust/institutions; pastel pills suit friendliness. The font personality
carries further on video than any single hex code.

### Catalog (one line each — choose from here, then open the file)

| File | Theme | Vibe in one line | Best for video topics |
|------|-------|------------------|-----------------------|
| `references/axiom.md` | dark | Terminal at midnight, mono type, one ember-orange cursor | Dev tools, CLI, infra, code explainers, engineering credibility |
| `references/raycast.md` | dark | Power-tool cockpit, near-black + single coral pulse | Productivity apps, AI tools, shortcuts/keynote-style demos |
| `references/dope-security.md` | dark | Midnight terminal, violet signal beacons, travel-editorial type | Cybersecurity, AI infrastructure, technical launches |
| `references/resend.md` | dark | Black velvet, violet neon + rainbow text accents | Email/APIs, developer SaaS, changelogs |
| `references/basedash.md` | dark | Data observatory, violet + mint signals on black | Dashboards, metrics, analytics walkthroughs |
| `references/authkit.md` | dark | Frosted-glass cathedral, blueprint grid, one violet CTA | Auth/SaaS launches, product announcements |
| `references/active-theory.md` | dark | Cosmic void, chrome whispers, luminous portal content | Creative studios, WebGL/showcase, cinematic intros |
| `references/21-tsi.md` | dark | Crimson void, single silhouette, fashion editorial | Fashion, luxury, music, high-drama brand pieces |
| `references/reflect-notes.md` | dark | Starlit violet cosmos, notes as constellations | Note-taking, PKM, calm productivity, essay videos |
| `references/hungry-tiger.md` | dark | Turmeric graffiti on tandoor rust, giant poster type | Food, street culture, bold opinion pieces |
| `references/miranda.md` | light | Old-world broadsheet on warm cream, ink banners | Journalism, biography, literary essays |
| `references/wispr-flow.md` | mixed | Cream broadsheet + dark velvet chambers, lavender CTA | Voice/AI apps, editorial product stories |
| `references/home-new-form.md` | light | Financial broadsheet, neon-green highlighter on bone white | Finance explainers, markets, editorial data stories |
| `references/structured.md` | mixed | Renaissance gallery on putty paper, black-ink frames | Crypto/finance with heritage framing, institutions |
| `references/evergreen.md` | light | Sunlit greenhouse on linen, didone serif + friendly sans | Wellness, hiring/HR, sustainability, feel-good explainers |
| `references/duna.md` | light | Sunset watercolor over warm marble compliance doc | Legal/compliance made human, calm institutional topics |
| `references/agence-foudre.md` | light | Magazine splash, lipstick pink + deep forest green | Agencies, portfolios, bold feminist/pop statements |
| `references/flying-papers.md` | light | Saturday-cartoon riso on violet, confetti + poster type | Kids/education, playful explainers, channel intros |
| `references/phantom.md` | mixed | Lavender candy pills, pastel buttons, mischievous ghost | Crypto wallets, onboarding, friendly fintech |
| `references/openserv.md` | light | Bright blueprint on white, violet + mint pulse | Robotics/AI services, clean tech launches, docs-style videos |

If the video topic matches nothing above, default by energy: tense/technical →
`axiom.md`; premium/calm → `duna.md` or `reflect-notes.md`; fun/loud →
`flying-papers.md`; trustworthy/institutional → `miranda.md`.

## How to read the chosen reference (section map)

Every reference file has the same anatomy. Extract only what the row says —
web-only detail (nav bars, footers, hover states, Tailwind blocks) is
deliberately left behind.

| Section in the file | What to extract | Pipeline mapping |
|---------------------|-----------------|------------------|
| Title tagline (`> …`) + intro paragraph | Mood, energy, what the design *is for* | `style.mood` + the one-sentence rationale you write above `STYLES.md` |
| `Tokens — Colors` table | 3–5 hex codes with the strongest roles (canvas, surface, text, ONE accent) | `STYLES.md` palette + machine-readable block. Copy hex codes verbatim; never invent or "improve" one. Ignore `linear-gradient(...)` rows unless the video needs a glow — use the flat stop colors instead. |
| `Tokens — Typography` (`### Name — …` + Substitute line) | Display face role + body face role | Headlines/Body/Captions in `STYLES.md`. **Always use the `Substitute:` value** (Google Fonts / web-safe) — never ship the proprietary name (e.g. write `Bebas Neue`, not `Salmond`; `JetBrains Mono`, not `BerkeleyMono`; `Playfair Display`, not `Canopee`). Keep 1–2 families, bold weights for overlays. |
| `Tokens — Spacing & Shapes` (radii) | Sharp (2px) vs soft (pill/16px+) geometry | `Layout Rules` + `lib/styles.ts` radii. Sharp suits terminal/editorial; pills suit playful/friendly. |
| `Components` | Card, badge, button *structure* (layering, borders, accent placement) | Scene cards, lower thirds, stat callouts in `SceneXX.tsx`. Translate web chrome: nav bars → top safe-area labels; hero → title card; cards → full-frame panels. Never port a component literally. |
| `Do's and Don'ts` | Hard constraints ("never gradients", "one accent only") | Binding constraints on every scene. Quote the 1–2 that matter most in `STYLES.md` so future scenes stay consistent. |
| `Surfaces` + `Elevation` | Background layering (flat vs glass vs glow) | `Background` treatment: solid, subtle gradient, or pattern. Video prefers flat or faint texture — heavy web shadows become muddy on encode. |
| `Imagery` + `Layout` | Composition habits (full-bleed vs centered column, focal placement) | `Scene Visual Template`: focal point, safe margins, text alignment. Preserve the reference's negative-space habit (sparse poster vs dense terminal). |
| `Agent Prompt Guide` / `Quick Color Reference` / `Example Prompts` | Pre-distilled tokens and copy-paste phrasing | Shortcut when present — still verify hex codes against the Colors table before writing `STYLES.md`. |
| `Similar Brands` | Vibe fallback | Use only if the reference file itself is ambiguous; never cite in `STYLES.md`. |
| `Quick Start` CSS | Hex/font source of truth | Read values from here when the tables are long (especially `reflect-notes.md`). Ignore the Tailwind/`@theme` wrapper — the pipeline consumes `lib/styles.ts`, not CSS. |

## Translation recipe (reference → STYLES.md)

1. **Palette (3–5 hex):** Background = the reference canvas; Text = its
   primary reading color; pick Surface only if scenes need layered panels;
   keep exactly ONE chromatic accent (the file's "only chromatic" / "single
   accent" color). Check every text-on-background pair for mobile-thumbnail
   contrast before committing.
2. **Typography (1–2 families):** Headline = reference display face's
   *substitute*; Body/Captions = reference body face's *substitute* (or the
   same family at smaller weight). Record name + px + weight.
3. **Background (one sentence):** Name the treatment the Surfaces section
   implies (e.g. "flat void-black with faint arrow-glyph texture" for axiom,
   "warm linen canvas, cards one step lighter, no shadows" for evergreen).
4. **Animation character (pick one word + one sentence):** Derive it, don't
   invent it — flat terminal systems cut hard with fast 0.2 s fades;
   editorial broadsheets slide/fade slowly (0.5 s ease-out); playful systems
   pop with springs; cosmic systems drift/glow. Write e.g. "Snappy: 0.25 s
   hard cuts, mono text types on, accent bar wipes left-to-right."
5. **Layout rules + scene template:** Safe margins, alignment, spacing from
   the reference's Layout habits, plus the default scene structure
   (background → focal → caption zone). Keep 30–40% of the frame empty.

### Mini-example (shape, not content)

Chosen `references/axiom.md` becomes: Background `#000000`, Surface
`#111111`, Text `#eeeeee`, Accent `#da5c2c`; Headlines `JetBrains Mono`
700, Body `JetBrains Mono` 400; "Flat black canvas, hairline `#202020`
dividers, 2px corners, arrow-glyph texture only"; "Minimal: hard cuts,
0.2 s fades, type-on reveals"; layout left-aligned with 120 px side
margins and one focal panel per scene.

## Index

All files live in `references/`: `21-tsi.md`, `active-theory.md`,
`agence-foudre.md`, `authkit.md`, `axiom.md`, `basedash.md`,
`dope-security.md`, `duna.md`, `evergreen.md`, `flying-papers.md`,
`home-new-form.md`, `hungry-tiger.md`, `miranda.md`, `openserv.md`,
`phantom.md`, `raycast.md`, `reflect-notes.md`, `resend.md`,
`structured.md`, `wispr-flow.md`. Removed as exact duplicate during tidy-up:
the second `Wispr Flow` copy (former `DESIGN (13).md`).
