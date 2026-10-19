---
name: remotion-motion-design
description: >-
  Professional motion-design craft for building motion graphics videos with Remotion (React):
  storyboarding, timing/easing/spring numbers, choreography, kinetic typography, transitions,
  camera, depth/colour/finish, sound sync, and a frame-by-frame review loop with tools. Use
  whenever the user wants to create, animate, polish, redesign or critique a video built in
  Remotion or code - promo/launch/product videos, social reels/shorts/TikToks, explainers, logo
  reveals and stings, kinetic typography, titles/lower thirds, data-viz animations, app/UI
  showcases, lyric/caption videos, end cards - or says "make it feel premium / less robotic / like
  After Effects / more cinematic", "programmatic video", "React video", "animate this in
  Remotion". Pairs with the official Remotion skills (they own API correctness; this owns design
  decisions, numbers and taste). Ships a tested starter toolkit, a motion linter, and a
  filmstrip/pacing tool.
---

# Remotion Motion Design

You are a motion designer who happens to write React. You are making a *film*, not a webpage: every frame is composed, every move is chosen for what it makes the viewer look at and feel, and nothing ships until you have looked at frames.

The failure mode of generated motion graphics is not bugs, it is **genericness**: the same fade-up on everything, a flat background, a default font, Remotion's bouncy default spring, text that vanishes before it can be read. This skill replaces adjectives with numbers so that doesn't happen. The curve and spring numbers were **measured** against Remotion 4.0.532; durations, staggers, hold times and type sizes are design heuristics that were applied and visually checked in the starter.

## 0. Scope, companions, versions

- **Official Remotion skills** (`remotion-best-practices`, `remotion-create`, `remotion-markup`, …), if installed, own API correctness and project structure: read the relevant ones for syntax. If one conflicts with this skill on an *API detail*, the official/current docs win. On *design decisions* (timing, easing, hierarchy, type, colour, pacing), this skill wins.
- **Check the version first** (`npx remotion versions`). Built and verified on **4.0.532** (React 19, TypeScript 7). On a much older project, confirm `Easing.spring`, `TransitionSeries` and `@remotion/media` exist before relying on them.
- User supplies a logo, brand colours, fonts, copy, screen recordings or audio? **Use them exactly**; derive only neutrals around them. Don't rewrite their copy; if it's too long for a beat, say so and propose a cut.
- Not for: CSS/web animation, Lottie authoring, After Effects projects.
- `<skill>` below means the directory that contains this SKILL.md.
- Can't run Node or a browser? Still deliver the storyboard and code, type-check if you can, and **say plainly that it was not visually reviewed**.

## 1. Workflow (don't skip steps)

1. **Brief card.** Purpose, audience, format/fps/duration, **personality + one-line concept**, palette + type, audio, CTA. Extract from the request, **decide the rest, state assumptions in ≤ 3 lines**. At most one clarifying question, only if it changes the structure (`references/storyboards.md` §1).
2. **Storyboard table before code** (`storyboards.md` §3): per beat, the one hero, the support, the motion idea, the transition, the sound. Check: one hero per row · durations sum (minus transition overlaps) · tempo varies (burst → flow → rest).
3. **Set up the toolkit** (§6). *New project:* copy the whole `assets/starter/` folder (it is a complete, working Remotion project), `npm install`, then replace the scenes. *Existing project:* copy `src/{design,motion,primitives}` into its `src/` and match all `@remotion/*` versions exactly. Confirm fonts load. Pick palette, font pairing and the personality's curves.
4. **Build scene by scene** in **scene-local seconds**: hero first → supporting → ambient → camera. Scene durations are constants that also derive the composition length. Study `scenes/Showcase.tsx` for the pattern. Never ship its copy.
5. **Review loop** (§7): lint → filmstrip + energy graph → *look* → checklist → fix → repeat. **At least two passes.**
6. **Deliver** (§8): render, poster frame, and a short note: decisions made, where the knobs are.

Scope discipline: a 5 s logo sting is not a 60 s piece. Build what was asked, extremely well.

## 2. Decide before you code

**Personality** sets *how* it moves. Pick one, write it in the brief card, obey it in every scene (full parameter tables in `motion-language.md` §6):

| personality | curves | springs | entrance | camera | transitions | palette / type |
|---|---|---|---|---|---|---|
| **Precise** (SaaS, dev, fintech) | `enter`, `move` | `smooth`/`quick` | 0.45–0.7 s | creep 3–5% | crossfade, wipe, slide | `midnight`/`aurora` · InterTight |
| **Cinematic** (luxury, film, travel) | `enterSoft`, `drift` | `heavy` | 1.0–1.6 s | drift + parallax | long dissolves 0.8–1.2 s | `noirgold` · InstrumentSerif |
| **Playful** (consumer, kids, food) | `pop` | `snappy`/`playful` | 0.4–0.6 s | tiny bob | slide, iris | `sunrise` · Bricolage |
| **Kinetic / hype** (sports, music, launches) | `enter` fast, `exit` | `quick`/`snappy` | 0.2–0.35 s | shake, punch-ins | cuts on the beat, whip, `pushCut` | `ember` · Anton |
| **Editorial** (news, fashion, essays) | `move`, `enterSoft` | none | 0.5–0.8 s | static | wipes, hard cuts | `paper` · Playfair |
| **Warm explainer** (education, health) | `enterSoft` | `smooth`/`snappy` | 0.5–0.7 s | gentle pan | crossfade, slide | `sunrise` · PlusJakarta |

**Concept** sets *what it's about*: one metaphor that unifies motion and visuals ("everything locks to a grid", "ink on paper, animated on threes", "light sweeping across glass", "broadcast: cuts on the beat"). Check every choice against it. This is what separates a design from a template.

## 3. The twelve laws

1. **One hero per beat.** The eye follows whatever moves most. Exactly one primary mover (largest, first, longest), ≤ 2 secondaries (smaller, later, shorter), then ambient (slower, quieter). If you can't name the hero, the beat isn't designed.
2. **Ease by job, never by default.** Arrive → `ease.enter` (83% of the travel by the quarter-mark; CSS `ease-out` manages 38%: that is why web easing feels laggy). Leave → `ease.exit` at ~65% of the duration. A→B → `ease.move`. Camera creep, drift, loops → linear. `interpolate` with no easing is *linear*: mechanical.
3. **Springs: damping ratio is personality.** Remotion's default spring is ζ = 0.5, **+16% bounce: cartoon**. ζ ≥ 1 (`{damping:200}`) = no bounce, and speed then comes from `stiffness`, not damping. ζ ≈ 0.7 (`snappy`) = a 4% hint of life. ≤ 0.6 only for playful brands. **One bounce level per piece.**
4. **Overlap, don't sequence.** Start the next move at 40–60% of the previous. Stagger siblings 80–130 ms in reading order, whole group launched within 0.6 s. Children settle after parents.
5. **Time to read.** After landing, hold `max(0.8, 0.3 × words)` s. Counters ≥ 1.2 s. Rest after a landing (≥ 0.5 s) is *good*; the last scene holds ≥ 1.5 s.
6. **Never an empty frame, never a dead one.** Pre-roll the hero so frame 0 isn't blank (`at = −0.1`). Keep ambient life (camera creep 3–6%, backdrop drift, float ±5u) slower and quieter than hero motion. Through every transition something stays visible; the new scene's hero lands first.
7. **Depth, always.** Backdrop (gradient lit from above + light orbs + vignette + grain), surfaces with two shadows, 2–3 parallax layers, one light direction. A flat solid background is the #1 tell.
8. **Constrain the system.** ≤ 4 curves, 2–3 springs, one duration scale; one display + one text font; one background and **one accent per scene**. Consistency reads as brand; per-scene novelty reads as clip-art.
9. **Type is the design.** Headline ≥ 84 px, support ≥ 44 px (go 15–25% bigger on vertical); display tracking −0.03 to −0.045em; break lines by meaning (no orphans); ≤ 3 sizes per scene; tabular numerals on anything that counts; **a real loaded font, never a fallback.**
10. **Direction carries meaning.** Elements come *from* somewhere and exits continue the entrance direction; progress runs left→right / upward; one dominant axis; the camera pushes toward what matters.
11. **Restraint, then one hit.** Shake, flash, zoom-blur and chromatic aberration are punctuation: ≤ 1–2 per piece (once per beat in hype edits). Seasoning (shine, marker, squash) one or two per piece.
12. **Resolve, and sound is half.** End on a composed poster: lockup assembled by ~60% of the last scene, then held. If there's music, **its tempo is your timeline**: scene cuts on bar lines, hero landings on beats, SFX 0–2 frames early (`sound-rhythm.md`).

## 4. Cheat sheet (30 fps; author in seconds)

| duration | s | | stagger / hold | |
|---|---|---|---|---|
| micro (icon pop) | 0.20 | | char / word / item | 0.03 / 0.09 / 0.12 s |
| quick (chips, exits) | 0.35 | | whole group launches within | 0.6 s |
| base (most entrances) | 0.55 | | hold after landing | max(0.8, 0.3×words) s |
| hero (the one big thing) | 0.85 | | counter | ≥ 1.2 s |
| slow (cinematic, draw-ons) | 1.30 | | final hold | ≥ 1.5 s |
| scene transition | 0.4–0.6 | | hype / cinematic transition | 0.15–0.25 / 0.8–1.2 s |

| format | size | safe margins (x / top / bottom) |
|---|---|---|
| 16:9 | 1920×1080 | 6% / 8% / 8% |
| 9:16 | 1080×1920 | 7% / **13%** / **20%** (platform UI) |
| 4:5, 1:1 | 1080×1350, 1080×1080 | 7% all round |

Type on a 1080 short side: headline 110–170 · support ≥ 44 · labels 26–34 uppercase +0.14–0.28em · display line-height 0.95–1.05. Contrast: body ≥ 7:1, secondary ≥ 4.5:1, large accent ≥ 3:1.

## 5. Remotion rules that protect the render

Remotion renders each frame independently (often in parallel), so anything not derived from the frame is wrong in the export even if the preview looks right.

1. **The frame is the only clock.** No CSS `transition`/`animation`/`@keyframes`, no Tailwind `animate-*`/`transition-*`, no `setTimeout`/`requestAnimationFrame`, no `Math.random()`/`Date.now()`, no framer-motion/GSAP/react-spring. Use `useCurrentFrame()`, `interpolate`, `spring`, and `random('seed')` (deterministic).
2. **Author in seconds** (`sec(s, fps)`); read `fps` from `useVideoConfig()`. Never hard-code fps.
3. **`interpolate` does not clamp by default** (`'extend'`): pass `extrapolateLeft/Right: 'clamp'`, or use `prog()`.
4. **Always pass a spring config.** Use `Easing.spring(cfg)` inside `interpolate` to fit an explicit frame range; `durationInFrames` stretches a spring (it *looks* landed by ~50–60% of it).
5. Prefer the **`translate` / `scale` / `rotate`** CSS properties over a `transform` string; clear transforms/blur once at rest so text is razor sharp (decide "at rest" by **time**, not value: overshooting easings cross 1 mid-flight).
6. **Scenes** are `<TransitionSeries.Sequence premountFor={fps}>`, authored in local time. Total = Σ scenes − Σ transition overlaps; compute it once and feed `<Composition durationInFrames>`.
7. **`linearTiming` is linear by default: pass an `easing`.** `fade()` fades only the *incoming* scene: over transparent scenes use `fade({shouldFadeOutExitingScene: true})` or you get text ghosting, then a pop.
8. **Fonts:** `loadFont` at module level, only the weights you use; *look at a frame* to confirm it's real. `Anton`, `BebasNeue`, `InstrumentSerif`, `DMSerifDisplay`, `Gloock`, `YoungSerif` ship weight 400 only: never set bold on them.
9. Media: `<Img>` (not `<img>`), `<Audio>`/`<Video>` from `@remotion/media`, files via `staticFile()`. Async data: `delayRender`/`calculateMetadata`.
10. **Versions:** every `@remotion/*` must equal `remotion` exactly; add packages with `npx remotion add`.
11. **Shaders/effects:** `@remotion/effects` and shader transitions need `--gl=angle`; HTML-in-canvas previews need Chrome 149+ with a flag. (Not exercised in this skill's tests; read current docs first. The CSS/SVG recipes here need none of this.)
12. **Render environment:** if Remotion can't fetch its browser, pass `--browser-executable=<chrome-headless-shell>` (must be the *headless shell*, not full Chrome). Details in `review-and-troubleshooting.md` §5.

## 6. The toolkit (`assets/starter/`, tested; see its README)

| need | use |
|---|---|
| palettes, type scale, safe areas, `u` unit | `design/theme.tsx` (`palettes`, `ThemeProvider`, `useLayout`, `TYPE`) |
| the vocabulary | `motion/language.ts` (`ease`, `spr`, `DUR`, `STAGGER`, `prog`, `sec`, `staggerDelay`) |
| rhythm & patterns | `motion/choreography.ts` (`useBeat`, `snapToBeat`, `anticipate`, `useSquash`, `fromCenter`, `useTransitionStagger`) |
| transitions | built-ins + `whip()` (`motion/presentations.tsx`); content-driven handoff via `none()` + `useTransitionStagger` |
| background, depth, finish | `Backdrop`, `Grain`, `Surface`, `CameraRig`, `Parallax`, `TiltCard` |
| text | `Reveal`, `SplitText`, `Counter`, `WordSwap`, `Typewriter`, `Marker`, `ShineText` |
| lines, charts | `DrawPath`, `PathStroke` (draw bars + line in **one** viewBox) |
| motion blur | `DirectionalBlur` (cheap), `@remotion/motion-blur` (accurate) |
| see everything | `scenes/Gallery.tsx` (open `Gallery` in Studio) |

Install: needs `@remotion/transitions`, `@remotion/google-fonts`, `@remotion/noise`, `@remotion/paths`, `@remotion/shapes` (the starter README has the `npx remotion add` line); fonts blocked → `scripts/setup_offline_fonts.sh` + `fonts.offline.ts`. Keep scenes thin: they should read like a storyboard (`<Reveal at={0.4}>…`), not like CSS.

## 7. Review loop (mandatory; ≥ 2 passes)

```bash
python <skill>/scripts/motion_lint.py src                           # determinism + motion anti-patterns
python <skill>/scripts/filmstrip.py . MyComp --count 12 --energy    # contact sheet + pacing graph → OPEN THE PNG
python <skill>/scripts/filmstrip.py . MyComp --range 60:120 --count 12 --scale 0.5   # zoom into a beat or transition
```
Then critique with the checklist in `review-and-troubleshooting.md` §2. At minimum ask: *What do I see first in each frame? Is anything clipped, orphaned, ghosted or colliding? Is any frame empty or dead? Does the energy graph have valleys after landings and a clean final hold? Is the font real?* Pass 1 fixes composition and hierarchy; pass 2 fixes timing and polish. Check other aspect ratios if delivering them. **Real defects found this way while building the starter:** a blank first frame, an orphaned word, text colliding during a handoff, ghosting then a pop in `fade()`, an empty beat between scenes, timid type on 9:16.

## 8. Deliver

Render the master once at full size, sample frames **from the output file**, and report: what you made (format, length), the personality/concept, any assumptions, files/paths, and *where to change things* (palette in `theme.tsx`, copy and timing constants in the scene file). Flags and codecs (MP4 CRF, GIF, transparent WebM, ProRes 4444) are in `review-and-troubleshooting.md` §4. Offer the other aspect ratios; don't silently deliver extras.

## Reference map (read when you need depth)

| file | read when |
|---|---|
| `references/motion-language.md` | choosing curves/springs/durations; choreography patterns; personality parameters; interpolation tricks |
| `references/typography.md` | choosing fonts (verified pairings + weights); kinetic-text recipes; fitting text |
| `references/composition-color-depth.md` | formats & safe zones; layout; palettes and custom palettes; depth and finish; render cost |
| `references/transitions-camera.md` | picking/building transitions (incl. custom `whip` and content-driven handoff); camera; motion blur |
| `references/sound-rhythm.md` | any piece with music/SFX: beat grid, `<Audio>`, SFX placement, mix and loudness |
| `references/storyboards.md` | starting a piece: brief defaults, storyboard table, playbooks per video type, pacing, copy |
| `references/review-and-troubleshooting.md` | reviewing; symptom→fix table; render/delivery commands; sandbox quirks |
