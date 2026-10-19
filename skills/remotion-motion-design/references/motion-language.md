# Motion language: curves, springs, durations, choreography

The curve and spring numbers (§1, §2, §7) were **measured** with Remotion 4.0.532's own `Easing.bezier`, `spring()` and `interpolate()` (30 fps unless stated); re-measure if you change fps or config. §3 (durations, staggers, holds) and §6 (personalities) are **design heuristics**, applied and visually checked in the starter. The code is in `assets/starter/src/motion/language.ts` and `choreography.ts`.

Contents: 1 Curves · 2 Springs · 3 Durations, staggers, holds · 4 Entrance/exit grammar · 5 Choreography patterns · 6 Personalities · 7 Interpolation tricks

---

## 1. Curves

"@25%" = how much of the travel is complete after a quarter of the duration. **Front-loading is what separates expensive-feeling motion from sluggish motion.**

| name | bezier | @25% | @50% | @75% | job |
|---|---|---|---|---|---|
| `enter` | .16, 1, .3, 1 (expo-out) | **83%** | 97% | 100% | hero entrances: launches fast, lands softly |
| `enterSoft` | .22, 1, .36, 1 (quint-out) | 76% | 96% | 100% | big / heavy elements, counters, calmer |
| `move` | .65, 0, .35, 1 (cubic in-out) | 7% | 50% | 93% | A→B while staying on screen; deliberate camera moves |
| `drift` | .37, 0, .63, 1 (sine in-out) | 14% | 50% | 86% | slow cinematic drift |
| `exit` | .32, 0, .67, 0 (cubic-in) | 2% | 13% | 42% | leaving: accelerates away |
| `pop` | .34, 1.56, .64, 1 (back-out) | 82% | 109% | 106% | one gentle ~10% overshoot, no spring needed |
| *css ease-out* | 0, 0, .58, 1 | **38%** | 68% | 91% | the web default; why default animation feels laggy |

### Choosing
| situation | use |
|---|---|
| something arrives | `enter` (small/fast) or `enterSoft` (large/heavy) |
| something leaves | `exit`, at ~65% of the entrance duration (leaving is faster than arriving) |
| something travels between two on-screen positions | `move` |
| camera creep, ambient drift, rotation loops, tickers, progress bars | `linear` (constant speed is *correct* here) |
| friendly pop with a little life | `pop`, or `spr.snappy` |

### Don't
- Plain ease-in-out for entrances: slow start reads as lag. Use it only for A→B moves.
- `interpolate()` with no `easing`: it is **linear**, which looks mechanical.
- The same curve in and out: arriving and leaving are different gestures.
- Mixing more than ~4 curves in one piece: variety reads as inconsistency.

---

## 2. Springs

### Damping ratio is personality
`ζ = damping / (2·√(stiffness·mass))`  ·  overshoot `= exp(−π·ζ/√(1−ζ²))` (checked against Remotion's `spring()`: exact).

| ζ | overshoot | feel | use |
|---|---|---|---|
| ≥ 1 | 0% | smooth, controlled, expensive | default for UI, text, cards |
| 0.9 | 0.2% | same, to the eye | |
| 0.8 | 1.5% | crisp | tech / product |
| 0.7 | 4.6% | a hint of life | **snappy** UI, badges |
| 0.6 | 9.5% | visible bounce | friendly / consumer |
| 0.5 | 16% | cartoon | **Remotion's default**; use only on purpose |
| 0.4 | 25% | rubber | kids, comedy |

### Remotion specifics (verified)
1. **Every ζ ≥ 1 is treated as critically damped**: extra `damping` changes nothing, so `damping: 20`, `200` and `1000` are identical. **Speed comes from `stiffness` (and `mass`)**: `t90 ≈ 3.89 · fps / √(stiffness/mass)` frames. Want it faster? Raise stiffness, not damping.
2. **The default config (`damping 10, stiffness 100, mass 1`) is ζ = 0.5 = +16% bounce.** Always pass a config.
3. **`durationInFrames` pins any spring to your timing grid.** A critically damped spring is 57% done at 25% of that duration, 90% at 50%, 98% at 75%. So the *perceived* landing is at about **50–60% of `durationInFrames`**; plan holds from there, not from the end.
4. **`Easing.spring(config)` works inside `interpolate()`**: you choose `[start, end]`, the spring supplies the shape. Same family as `spring()`, but stretched to your range. This is what `spr.*` in `language.ts` uses.
5. `measureSpring({fps, config})` returns frames until rest. Use it to size a scene around a spring.

### Presets (measured at 30 fps with `spring()`)
| preset | config | ζ | overshoot | t50 | t90 | rest |
|---|---|---|---|---|---|---|
| `smooth` | `{damping:200, stiffness:100}` | ≥1 | 0 | 6f | 12f | 23f |
| `quick` | `{damping:200, stiffness:300}` | ≥1 | 0 | 3f | 7f | 13f |
| `snappy` | `{damping:20, stiffness:200}` | 0.71 | +4% | 4f | 6f | 15f |
| `heavy` | `{damping:40, stiffness:120, mass:1.5}` | ≥1 | 0 | 6f | 14f | 25f |
| `playful` | `{damping:14, stiffness:140}` | 0.59 | +10% | 4f | 6f | 24f |
| `bouncy` | `{damping:10, stiffness:100}` (default) | 0.50 | +16% | 4f | 7f | 28f |

**One bounce level per piece.** If cards overshoot 4% and the logo overshoots 16%, it looks like two different brands.

---

## 3. Durations, staggers, holds (30 fps; author in seconds)

| token | s | frames | use |
|---|---|---|---|
| `micro` | 0.20 | 6 | icon pop, state change |
| `quick` | 0.35 | 10 | chips, supporting text, exits |
| `base` | 0.55 | 17 | most entrances |
| `hero` | 0.85 | 26 | the one big thing in a beat |
| `slow` | 1.30 | 39 | cinematic reveals, draw-ons, camera settle |
| scene transition | 0.4–0.6 | 12–18 | (hype 0.15–0.25 · cinematic 0.8–1.2) |
| stagger | char 0.03 · word 0.09 · item 0.12 | 1 · 3 · 4 | whole group launches within **0.6 s** |
| counter | ≥ 1.2 | 36 | shorter isn't perceived as counting |

- **Bigger / farther / more important → longer, but sub-linearly** (double the distance ≈ +40% duration).
- **Reading time.** After text has fully landed, hold `max(0.8, 0.3 × words)` seconds. A 6-word line needs ~1.8 s at rest. A single glance-word ("Faster.") needs ~0.8 s.
- **Rest is not dead.** ≥ 0.5 s of stillness after a landing is *good* (it lets the eye settle). Dead is the same stillness with nothing ambient and no purpose.
- **Final scene holds ≥ 1.5 s** with nothing arriving.

---

## 4. Entrance / exit grammar

- **Nothing just appears.** Every element comes *from* somewhere: below, a mask edge, a defocus, a scale. Pick **one or two** vocabularies per piece (e.g. mask for headlines, rise for support) and stay inside them.
- **Opacity leads motion**: fully visible by ~60% of the travel, so the eye locks on early (built into `Reveal`).
- **Exits continue the entrance direction** (rose in from below → leaves upward), and are shorter. Often skip per-element exits and let the scene transition carry them.
- **At rest, remove residue**: no `blur(0)`, no leftover transforms. Text must be razor sharp during the hold (`Reveal` switches residue off by *time*, not value, so overshooting easings don't snap).
- Direction carries meaning: forward / progress = left→right or upward; keep one axis per piece.

---

## 5. Choreography patterns (all in `choreography.ts` / `Extras.tsx` / `Showcase.tsx`)

| pattern | rule | where |
|---|---|---|
| **One hero** | exactly one primary mover per beat (largest, first, longest); ≤ 2 secondaries (smaller, later, shorter); ambient is slower and lower contrast | every Showcase scene |
| **Overlap** | start the next move when the previous is 40–60% done, never after it finishes | `at = prev + dur * 0.5` |
| **Stagger** | 80–130 ms between siblings, group capped at 0.6 s; order = reading order or travel direction | `staggerDelay`, `SplitText` |
| **Radial stagger** | emerging from a centre | `fromCenter` |
| **Secondary action** | child moves *after* the parent lands (icon pops 0.3 s after its card) | `Ideas` scene |
| **Follow-through** | parent stops, children settle 3–6 frames later with a softer curve | nested `Reveal` |
| **Anticipation** | a ~6% wind-up in the opposite direction for ~5 frames before a big move | `anticipate()` |
| **Squash & stretch** | ±10% on impact, returns by spring; seasoning, not the meal | `useSquash` |
| **Ambient life** | float ±5u (period ~5 s), camera creep 3–6%, backdrop orbs (periods 15–27 s) | `Ideas`, `CameraRig`, `Backdrop` |
| **Beat pulse** | `1 + 0.03–0.08 × pulse`; subtle on every beat beats huge on some | `useBeat` |

**Motion budget per beat:** 1 hero move · 1–2 supporting moves · ambient. If a beat has two things fighting for attention, delay or shrink the weaker one.

---

## 6. Personalities: pick one, write it down, obey it

| personality | curves | springs | entrance | stagger | camera | transitions | typical subjects |
|---|---|---|---|---|---|---|---|
| **Precise** | `enter`, `move` | `smooth`, `quick` | 0.45–0.7 s | word 0.08 | creep 3–5% | crossfade, wipe, slide | SaaS, dev tools, fintech |
| **Cinematic** | `enterSoft`, `drift` | `heavy` | 1.0–1.6 s | 0.15–0.25 | slow drift + parallax | long dissolves 0.8–1.2 s, blur | luxury, film, travel, real estate |
| **Playful** | `pop` | `snappy`/`playful` | 0.4–0.6 s | 0.10–0.15 | none or tiny bob | slide, iris | consumer, kids, food, social |
| **Kinetic / hype** | `enter` (fast), `exit` | `quick`, `snappy` | 0.2–0.35 s | 0.03–0.06 | shake, punch-ins, whip pans | hard cuts on beat, `pushCut`, zoom-blur | sports, music, launches, trailers |
| **Editorial** | `move`, `enterSoft` | none | 0.5–0.8 s | 0.10 | static | wipes, hard cuts, rules/lines | news, fashion, essays, reports |
| **Warm explainer** | `enterSoft` | `smooth`, `snappy` | 0.5–0.7 s | 0.12 | gentle pan | crossfade, slide | education, health, HR, onboarding |

If the brief doesn't say, infer from subject. Write the choice as one sentence in your storyboard ("Precise: crisp expo-out, no bounce, 0.6 s entrances, crossfades") and check every scene against it.

**Add a concept.** A personality sets *how* it moves; a concept sets *what it's about*, a one-line metaphor that unifies motion and visuals ("everything locks to a grid", "ink on paper, drawn on imperfectly, animated on threes", "light sweeping across glass", "broadcast: cuts on the beat"). It is the difference between a template and a design.

---

## 7. Interpolation tricks (verified in 4.0.532)

- **`output: 'perceptual-scale'`** for big scale changes. Linear scale tweens look like they start slowly then rush; this front-loads: 1→4 reaches **2.18×** at the quarter mark (linear: 1.75×); 0.2→1 reaches 0.53 (linear 0.40). Irrelevant for subtle 0.9→1.
- **String outputs interpolate numbers inside CSS values**: `interpolate(f,[0,10],['0px 0px','100px 40px'])` → `'50px 20px'`; `'0deg'→'90deg'`, `'0%'→'50%'` work too.
- **Tuple outputs**: `interpolate(f,[0,10],[[0,0],[100,200]])` → `[50,100]`: animate x/y together.
- **`posterize: 3`** steps the output every 3 frames ("animating on threes", a hand-made / stop-motion look): `0 0 0 30 30 30 60 60 60 90`. Great for a paper / ink concept.
- **Easing per segment**: `easing: [easingA, easingB]` for a multi-keyframe input range (used by `anticipate`).
- **`extrapolate*: 'wrap'`** repeats; combine with integer-cycle sines for seamless loops.
- **Always clamp** (`extrapolateLeft/Right: 'clamp'`) or use `prog()`, which does. Default is `'extend'`.
- Prefer the individual CSS properties **`translate`, `scale`, `rotate`** over a `transform` string: they compose independently and avoid string concatenation (all primitives here do).
