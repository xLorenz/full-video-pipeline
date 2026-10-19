# Motion starter

A tested motion-design toolkit for Remotion 4.0.532: design tokens, a motion language, primitives, and two reference compositions. Everything type-checks (TypeScript 7), lints clean with `motion_lint.py`, renders deterministically (the same frame rendered twice is byte-identical), and works at 16:9 and 9:16 from one scene file.

## Use it in a project

**New project:** copy this whole folder: it is a complete, working Remotion project (`package.json`, `tsconfig.json`, `remotion.config.ts`, `src/`). Then `npm install`, delete the compositions you don't need from `src/Root.tsx`, and build your scenes. (Alternative: `npx create-video@latest --blank`, then copy `src/design`, `src/motion`, `src/primitives` into it.)

**Existing project:** copy `src/design`, `src/motion`, `src/primitives`. Then:

```bash
npx remotion versions                       # note the version of `remotion`
# every @remotion/* package must match it EXACTLY. Add what's missing:
npx remotion add @remotion/transitions @remotion/google-fonts @remotion/noise @remotion/paths @remotion/shapes
npx tsc --noEmit
```
Optional, only if you use them: `@remotion/media` (audio/video), `@remotion/layout-utils` (`fitText`), `@remotion/motion-blur`, `@remotion/effects`.

**Fonts blocked** (sandbox/CI)? `bash <skill>/scripts/setup_offline_fonts.sh` then `cp src/design/fonts.offline.ts src/design/fonts.ts`.

## Map

| file | what it is |
|---|---|
| `design/theme.tsx` | 6 palettes (contrast-checked), `ThemeProvider`/`useTheme`, `TYPE` scale, `useLayout()` (`u` unit, safe areas), `alpha()` |
| `design/fonts.ts` / `fonts.offline.ts` | font loading (Google / local woff2) |
| `motion/language.ts` | **the vocabulary**: `ease.*`, `spr.*`, `DUR`, `STAGGER`, `prog`, `mix`, `sec`, `staggerDelay`, `useMotion` |
| `motion/choreography.ts` | `useBeat`, `snapToBeat`, `anticipate`, `useSquash`, `fromCenter`, `useTransitionStagger` |
| `motion/presentations.tsx` | custom transition: `whip()` |
| `primitives/Backdrop, Grain` | layered background, film grain/dither |
| `primitives/Reveal, SplitText, Counter` | entrance/exit grammar, kinetic type, numbers |
| `primitives/Surface, DrawPath` | material cards, stroke draw-on (`PathStroke` for shared SVGs) |
| `primitives/Camera.tsx` | `CameraRig` (push/pan/rotate/handheld), `Parallax` |
| `primitives/Extras.tsx` | `ShineText`, `Marker`, `Typewriter`, `WordSwap`, `TiltCard`, `IrisReveal`, `DirectionalBlur` |
| `scenes/Showcase.tsx` | **reference piece**: read it as a pattern library (hook → ideas → proof → CTA) |
| `scenes/Gallery.tsx` | **living style guide**: every primitive in motion (open `Gallery` in Studio) |

## Rules of the house
- Author time in **seconds** (`at={0.4}`); sizes in **`u`**; colours from the **theme**; curves from **`ease`/`spr`**.
- Don't ship the Showcase copy ("Lumen", "Make motion feel inevitable.") in someone else's video; it is a pattern, not a template.
- After any change: `python <skill>/scripts/motion_lint.py src` and `python <skill>/scripts/filmstrip.py . Showcase --energy`, then look at the image.
