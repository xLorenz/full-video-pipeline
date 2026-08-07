# Animation Template System

A catalog of **hard-to-hand-code, high-end animation templates** for the full-video-pipeline. Each template is a data-driven Remotion component. You customize by editing JSON — you never touch the `.tsx` per video.

## When to use a template

Reach for a template when your scene's `visual_notes` describe a **complex, multi-element, hard-to-build** animation:
- Data visualizations (racing bars, count-ups, comparison grids)
- Judgment cards (right-vs-wrong, before-vs-after)
- Sequential multi-step reveals (timelines, marching markers)
- Anything you could not trivially one-shot by composing `Background`/`TextReveal`/`StatReveal` yourself.

**For trivia** — hooks, title cards, kinetic big-text reveals — just write `SceneXX.tsx` directly using the foundation primitives. Templates exist for the gap in between.

## Available templates

> Catalog index lives in [`CATALOG.md`](./CATALOG.md). Each template also has its own `animation.md` with full field docs and recipes.

| Template | Path | One-line |
|---|---|---|
| Right-wrong card | [`right-wrong-card/animation.md`](./right-wrong-card/animation.md) | Two-card verdict reveal with stamp/shake/glow options |
| Data bars | [`data-bars/animation.md`](./data-bars/animation.md) | Racing bar chart for ranked quantities |
| Count-up stat | [`count-up-stat/animation.md`](./count-up-stat/animation.md) | Animated numerical reveal with sub-label |
| Before-after split | [`before-after-split/animation.md`](./before-after-split/animation.md) | Wipe-reveal contrast of two halves |
| Timeline marker | [`timeline-marker/animation.md`](./timeline-marker/animation.md) | Horizontal milestone drop-in sequence |
| Comparison grid | [`comparison-grid/animation.md`](./comparison-grid/animation.md) | N×M matrix of tumbling-in cells |
| Kinetic title mosaic | [`kinetic-title-mosaic/animation.md`](./kinetic-title-mosaic/animation.md) | Multi-word kinetic typography with per-word motion variants |
| Radial pulse rings | [`radial-pulse-rings/animation.md`](./radial-pulse-rings/animation.md) | Concentric pulse rings emit from a focal node |
| Rolling digit counter | [`rolling-digit-counter/animation.md`](./rolling-digit-counter/animation.md) | Slot-machine tumbling numeral columns snap to target |
| Orbit chip cloud | [`orbit-chip-cloud/animation.md`](./orbit-chip-cloud/animation.md) | Labelled pill chips orbit a focal node on an ellipse |
| Bar code scan | [`bar-code-scan/animation.md`](./bar-code-scan/animation.md) | Scanline sweeps decoding barcode segments one by one |

(Tag index in [`CATALOG.md`](./CATALOG.md).)

## The contract: JSON config, never JSX

Every template instance is a **JSON config + a one-line `<Template config={...} />` use**. The agent customizes by editing JSON values; the `.tsx` is read-only shipped. Two reasons:
1. Predictability — lint + schema catch bad inputs; renames in the agent-generated code are avoided.
2. Per-video portability — the same config can be lifted into any video that has the template published.

### The DeepConfig shape

```jsonc
{
  "theme": {
    "palette":  { "primary": "#hex", "secondary": "#hex", ... },   // optional; falls back to styles.ts COLORS
    "fonts":    { "heading": "Inter", "body": "Poppins" },          // optional; falls back to styles.ts FONTS
    "sizes":    { "scale": 1.0 }                                    // multiplies FONT_SIZES
  },
  "global": {
    "speed": 1.0,            // multiplies ALL timing (delays + durations)
    "delayOffset": 0,       // frames added to every delay in this instance
    "easing": "ease-out-cubic"  // global default; element overrides win
  },
  "elements": [
    {
      "id": "title",         // stable id from the template's animation.md
      "text": "Earth has rings",
      "delay": null,         // null → auto-stagger from parent timing
      "duration": null,
      "easing": null,
      "position": { "x": null, "y": null },  // null → template default layout
      "size":      { "fontSize": null, "scale": null },
      "color": null,         // hex; null → theme resolves
      "hidden": false,
      "custom": { }          // template-specific (see this template's schema.json)
    }
  ],
  "extras": { }             // template-specific globals (e.g. { "showCount": true })
}
```

Full schema: [`schemas/animations.schema.json`](../schemas/animations.schema.json).
Per-template extensions: `<template>/config/schema.json`.
Human-readable field guide: [`SCHEMA.md`](./SCHEMA.md).

## How the agent uses a template

During Phase 3 (Step 8) — while writing `SceneXX.tsx`:

1. Read this `README.md` and pick from the table above.
2. Open the chosen template's `animation.md` — it documents **every recognized `elements[].id`**, the `extras.*` fields, recipes for common tweaks, and a copy-paste snippet.
3. Write a per-scene config file at `videos/<title>/remotion/src/scene-assets/scene-NN-<template>.json`. (You can also inline an object literal if it's short.)
4. Drop the one-line use into `SceneXX.tsx`:
   ```tsx
   import { RightWrongCard } from "../components/animations/RightWrongCard/component";
   import config from "../scene-assets/scene-04-rightwrong.json";

   export const Scene04: React.FC<{ scene: SceneTiming }> = () => (
     <AbsoluteFill>
       <Background backgroundColor={COLORS.background} />
       <RightWrongCard config={config} />
     </AbsoluteFill>
   );
   ```
5. **Never** edit any file under `components/animations/`. If you want new behavior, create a *new* template folder in the repo-root `animations/` directory and re-publish (see "Creating a template" below).

## Where theme comes from

The **single source of truth for palette/fonts** is `remotion/src/lib/styles.ts` in each scaffolded video (`COLORS`, `FONTS`, and any per-video `FONT_SIZES` constant the agent already adds). Every template reads from `styles.ts` via the shared `resolveTheme()` helper.

- Omit `theme.*` in your config entirely → the template inherits `styles.ts` 1-to-1.
- Override individual keys in `theme.palette` / `theme.fonts` → only those keys replace the styles.ts values; the rest fall back.
- `theme.sizes.scale` is a multiplier; templates apply it to the resolved `FONT_SIZES`.

This is identical to how `Background` and `TextReveal` already consume `COLORS`/`FONTS`, so behavior stays consistent with the foundation primitives.

## How templates are published into videos

At scaffold time (`pipeline.py new`/`run --force`), `scripts/publish_animations.py` walks `animations/` and copies each template's `component.tsx` + `config/*.json` + `animation.md` into the per-video project at:
```
videos/<title>/remotion/src/components/animations/<template-name>/
```
It also generates a barrel `components/animations/index.ts` re-exporting every template so `import { X } from "../components/animations"` works.

`animations/_shared/` (theme/layout/easing helpers) is published into `components/animations/_shared/`.

Templates whose `defaults.json` fails their `schema.json` validation are **rejected** — the scaffold aborts with a clear error. This is the same validation pattern already used for `scenes.json`.

## Previewing

Lint gate (`tsc --noEmit` + eslint + `remotion compositions`) catches type/prop errors automatically — no behavior change there. For a visual check when a template was touched, set `animations_preview_requested: true` in `pipeline_state.json` before running `complete` at Step 9. Step 9.5 will render a 3-second stub of every template's `preview/preview.tsx` into `videos/<title>/.animation-previews/`. Cheap default, on-demand deep check.

## Deep customization — what "highly customizable" means here

Each template schema allows full per-element overrides. Concretely you can, per instance:
- Change the **global theme** (palette, fonts, font-size scale) — applies to all templates uniformly.
- Change the **global speed** (multiplier on every delay/duration) — fix pacing without re-tuning each element.
- **Override each element individually** (text, color, position, size, timing, easing, hidden).
- Use **element `custom`** for template-specific per-element fields (e.g. per-bar color, per-card verdict style).
- Use **template-level `extras`** for behavior knobs (`showCount`, `countUp`, `topN`, `dividerStyle`, ...).

See [`SCHEMA.md`](./SCHEMA.md) for the full field reference and recipes.

## Creating a new template

1. Make a folder `animations/<name>/` matching the [Template folder standard](#template-folder-standard) below.
2. Add the template row to [`CATALOG.md`](./CATALOG.md).
3. Re-publish to a fresh scaffold (or re-run `scripts/publish_animations.py <video-dir>`) and run `python3 pipeline.py status <title>` to verify the new template shows in the animations index.

If a template's `.tsx` is modified in the per-video copy, those changes will be lost on next scaffold — author templates in the repo-root `animations/` only.

## Template folder standard

Every template folder **must** conform to this exact layout (no extra source files):

```
<template-name>/                 kebab-case folder name
├── animation.md                  template manual: element ids, extras, recipes, pitfalls, preview
├── component.tsx                 the Remotion FC (named export, never default)
├── config/
│   ├── defaults.json             fully populated DeepConfig instance
│   └── schema.json               per-template JSON schema extending ../schemas/animations.schema.json
└── preview/
    └── preview.tsx                90-frame (3s @ 30fps) preview composition
```

**Naming rules**

| Element | Rule | Example |
|---|---|---|
| Folder name | `kebab-case` | `right-wrong-card` |
| Component file | always `component.tsx` (lowercase, fixed name) | — |
| Exported component | `export const <PascalCaseOfFolder>: React.FC<<Name>Props>` (named `const`, never `default export`) | `export const RightWrongCard: React.FC<RightWrongCardProps>` |
| Props interface | `<Name>Props` | `RightWrongCardProps` |
| Preview file | always `preview/preview.tsx` (fixed path) | — |
| Preview exports | `PREVIEW_DEFAULT_PROPS` + `Preview: React.FC` (both named) | — |
| Config files | always `config/defaults.json` + `config/schema.json` (fixed names) | — |

**What does NOT belong in the template folder:**

- **Scaffolded preview project files** (`package.json`, `Root.tsx`, `remotion.config.ts`, `tsconfig.json`, `node_modules/`). Standalone preview rendering is driven by `scripts/preview_animations.py`, which scaffolds its own throwaway project into `videos/<title>/.animation-previews/` — do not bake one into the template.
- **Scratch render output** (`frames-*/` directories, `out-*.mp4`, debug `.cjs` scripts, frame PNGs). These are working material, not part of the published template. The `.gitignore` excludes `animations/*/preview/frames-*/`; the rest should simply not be committed.
- **Secondary preview variants** (`preview-prop.tsx`, `preview-<variant>.tsx`). If you need to exercise multiple configurations, put them as comments or alternative `PREVIEW_DEFAULT_PROPS` blocks inside the single `preview/preview.tsx`. One preview per template.
- **Render outputs named anything other than `preview.mp4`**. The render artifact is always `preview/preview.mp4` (no template-name prefix, no version suffix). Unlike the scratch listed above, `preview.mp4` **is** tracked — it's regenerated by `scripts/preview_animations.py` and committed so the catalog ships with a ready-to-watch sample per template.

**File contents detail**

- `component.tsx` — a Remotion FC accepting `{ config: TemplateConfig }` (plus optional `styles`/`fontSizes` for per-video `styles.ts` injection). Use only helpers in `animations/_shared/` plus Remotion primitives (`useCurrentFrame`, `interpolate`, `spring`, `Easing`, `Sequence`). **No CSS animations or Tailwind animation classes** (same rule as everywhere else in this pipeline).
- `config/defaults.json` — a fully populated `DeepConfig` instance with sensible defaults. Must validate against `config/schema.json`.
- `config/schema.json` — extends the global `schemas/animations.schema.json` with per-template `extras.*` fields and `elements[].custom.*` fields, plus any per-id enum/range constraints. Use `$ref` to the shared schema to layer.
- `animation.md` — same section structure as the existing template(s): one-paragraph description, "When to use", "Quick start" snippet, "All fields" table (recognized `elements[].id` list with per-id docs), "Customization recipes", "Pitfalls", "To preview".
- `preview/preview.tsx` — a 90-frame (3s @ 30fps) composition rendered by the preview step. Must exercise at least one element override + one theme override + one extras value. Exports `PREVIEW_DEFAULT_PROPS` (the canonical example config) and `Preview: React.FC` (the composition component).

## Files in this folder

- `README.md` — this file (agent's master menu).
- [`CATALOG.md`](./CATALOG.md) — flat catalog with tags.
- [`SCHEMA.md`](./SCHEMA.md) — human-readable DeepConfig field guide.
- `_shared/` — TypeScript helpers consumed by every template:
  - `theme.ts` — `resolveTheme(themeOverride, stylesColors, stylesFonts)` → unified `Theme` object.
  - `timing.ts` — `resolveTiming(elem, global, fps)`, easing registry, stagger helper.
  - `layout.ts` — positioning helpers (corner anchors, thirds, stacked, grid cells).
  - `types.ts` — shared `TemplateConfig`, `ThemeOverride`, `ElementOverride`, `EasingName` types.
- `<template>/` — one folder per template.

## FAQ

**Why JSON config and not just JSX props?** Per-element overrides for tens of fields, schema validation, and theme fall-through don't fit comfortably as TSX props. JSON keeps customization as data, which validates cleanly and survives refactors.

**Can I customize the template itself for one video?** No — templates are intentionally frozen per video. If you need different animation *behavior* (not just config values), create a new template folder and reference it. Frozen templates keep the agent from writing code that breaks lint on the next scaffold.

**Why copy instead of symlink?** Cross-platform robustness (Windows symlinks are iffy) and consistency with how `remotion-foundation/` is already copied per video.
