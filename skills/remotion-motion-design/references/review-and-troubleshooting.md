# Review, troubleshooting & delivery

You cannot judge motion from code. Code that "looks right" routinely renders with an orphan word, an empty beat between scenes, or a font that never loaded. **Look at frames.** Many defects below (blank first frame, orphaned words, ghosting at a crossfade, an empty beat between scenes, text colliding in a handoff, timid vertical type, faux-bold, misaligned charts) were found exactly this way while building the starter; the rest are well-known failure modes.

Contents: 1 The review loop · 2 Director's checklist · 3 Symptom → cause → fix · 4 Rendering & delivery · 5 Sandbox / CI quirks

---

## 1. The review loop (mandatory; ≥ 2 passes)

```bash
python <skill>/scripts/motion_lint.py src                          # static: determinism + motion anti-patterns
python <skill>/scripts/filmstrip.py . MyComp --count 12 --energy   # contact sheet + pacing graph, then OPEN the PNG
python <skill>/scripts/filmstrip.py . MyComp --range 60:120 --count 12 --scale 0.5   # zoom into one beat
python <skill>/scripts/filmstrip.py . MyCompVertical --frames 0,40,90,150            # other formats
```
1. **Lint** → fix every ERROR and WARN.
2. **Filmstrip + energy.** View the PNG with your image viewer. Critique it with §2.
3. **Zoom into entrances and transitions** (a transition frame range is where ghosting, empty beats and collisions hide).
4. **Fix → re-run.** Pass 1 fixes *composition & hierarchy*; pass 2 fixes *timing & polish*.
5. **Other formats** if more than one is delivered.
6. Render the final once, at full size, and spot-check 3 frames from the **output file** (not just the stills).

### Reading the energy graph
Bars = how much the picture changed vs. the previous sample; blue normal, amber very busy, red near-still.
- **Skyline with valleys** after each landing → good tempo.
- **Red in the middle** with nothing ambient → dead air; add ambient life or tighten the timing.
- **Red at the very end** → the hold. Good if it follows a landing and lasts ≥ 1.5 s.
- **Amber everywhere** → too busy; one hero per beat.
- **Whole-frame spikes** at scene boundaries are normal (a crossfade changes every pixel).

---

## 2. Director's checklist (answer each by *looking*)

**Hierarchy**
- [ ] In each sampled frame, what do you see first? Is it the intended hero?
- [ ] Is there exactly one primary mover per beat?
- [ ] Can you read the headline in the **25%-size** contact sheet?

**Type & layout**
- [ ] Real fonts loaded (no Arial/Liberation fallback)? No faux-bold on single-weight faces?
- [ ] No orphans/widows; lines broken by meaning; nothing clipped by the frame or mask?
- [ ] Inside the safe area for this format? Sizes ≥ 84 / 44 px (more on vertical)?
- [ ] Equal cards have equal heights and aligned text?

**Motion**
- [ ] Entrances decelerate, exits accelerate; no linear tweens except camera/ambient?
- [ ] One bounce level across the whole piece?
- [ ] Siblings staggered and the group launches within 0.6 s?
- [ ] Text rests long enough to read (`max(0.8, 0.3 × words)` s)?
- [ ] First frame is a composition (not blank); last frame is a resolved poster that held ≥ 1.5 s?

**Transitions**
- [ ] No ghosting (old text visible under new); no pop at the end of a crossfade?
- [ ] No empty frame between scenes; hero of the new scene lands first?
- [ ] Same-spot text in old/new scenes isn't colliding?

**Finish**
- [ ] Not a flat background: gradient + light + grain? Dark gradients free of banding?
- [ ] Palette: one accent per scene, contrast fine at small size?
- [ ] Ambient motion slower and quieter than hero motion?

**Technical**
- [ ] Render deterministic (no `Math.random`)? Same frame renders identically twice?
- [ ] Durations are constants; composition length = Σ scenes − Σ transition overlaps?
- [ ] Audio (if any) fades in/out, hits land on beats, loudness ≈ −14 LUFS?

---

## 3. Symptom → cause → fix

| symptom | likely cause | fix |
|---|---|---|
| Feels robotic / PowerPoint | same easing & duration on everything; all moves simultaneous | stagger siblings; overlap 40–60%; vary hierarchy; `enter` not default ease |
| Feels slow / sluggish | ease-in-out or CSS ease-out on entrances; long durations; moves start only after the previous ends | `ease.enter` (83% by the quarter); entrances 0.45–0.6 s; overlap |
| Feels chaotic | more than one hero; every element moving | choose the hero; delay or shrink the rest; slow the ambient |
| Feels cheap | flat background, default font, bouncy default spring, no shadows/grain | `Backdrop`, loaded fonts, ζ ≥ 0.7, `Surface`, grain |
| Cartoonish | Remotion's default spring (ζ = 0.5, +16% overshoot) | pass a config: `spr.smooth` / `spr.snappy` |
| Text ghosts, then pops at a crossfade | `fade()` fades only the incoming scene | `fade({shouldFadeOutExitingScene: true})` |
| Almost-empty frame between scenes | the new scene's first element is late/faint | hero first, earlier `at`, smaller `IN` |
| Words land on top of each other in a handoff | same-spot text, entries and exits simultaneous | `useTransitionStagger(…, {handoff: 0.4–0.5})` |
| Orphan word on the last line | browser line-breaking | break by hand with `\n`; `text-wrap: balance` |
| Text blurry/soft at rest | transform/blur residue left on after landing | use `Reveal` (clears residue by time); no `blur(0)`; avoid `will-change` |
| Digits jitter while counting | proportional numerals | `fontVariantNumeric: 'tabular-nums'` (`Counter`) |
| Banding in dark gradients | 8-bit H.264 | `Grain` 0.08–0.12; lower `--crf` (14–16); shorten the gradient range |
| Flicker that differs between renders | `Math.random()` / `Date.now()` | `random('seed')` from `remotion`; derive time from the frame |
| Animation snaps at the end / jumps | unclamped `interpolate` or tail of a spring | clamp both sides (`prog()`); decide "resting" by **time** not value |
| Looks like Arial | font not loaded (network blocked, wrong weight) | `fonts.offline.ts` route; request existing weights |
| Faux-bold, smeared letters | `fontWeight: 800` on a single-weight face (Anton, Bebas, Instrument Serif…) | use weight 400 only, or choose a family with the weights you need |
| Black frame at a scene's start | no `premountFor`; image/font not loaded | `premountFor={fps}`; `<Img>`; `delayRender` |
| Elements jump when the fps changes | frame-counted timing | author in seconds (`sec(s, fps)`) |
| Chart bars and line misaligned | two coordinate systems (CSS vs SVG) | draw everything in **one** viewBox |
| Text clipped by a mask reveal | tight `overflow: hidden` | `Reveal` mask pads/negative-margins by 0.16em |
| Vertical looks hollow | landscape sizes in a tall frame | stack words, size up 15–25%, respect safe zones |
| Render is very slow | big `filter: blur`, `backdrop-filter`, full-frame `feTurbulence`, huge images | radial-gradients instead of blur; tiled grain; scale images; render previews at `--scale=0.5` |
| Audio feels late | SFX placed on the frame, or after | place 0–2 frames **early** |

---

## 4. Rendering & delivery

Define the target first; **iterate low, deliver high.**

| goal | command (flags verified against the CLI in 4.0.532) |
|---|---|
| single frame / poster | `npx remotion still src/index.ts Comp out/poster.png --frame=90` |
| several frames at once | `npx remotion render src/index.ts Comp out/frames --frames=0,30,60 --image-format=png` |
| fast preview | `npx remotion render src/index.ts Comp out/preview.mp4 --scale=0.5 --crf=28` |
| **master MP4 (H.264)** | `npx remotion render src/index.ts Comp out/master.mp4 --codec=h264 --crf=16` |
| small web/social file | `… --crf=20` (`--x264-preset slower` for smaller files at the same quality) |
| GIF | `… --codec=gif --every-nth-frame=2 --scale=0.5 --number-of-gif-loops=0` |
| **transparent WebM** (overlays) | `… out/overlay.webm --codec=vp8 --image-format=png --pixel-format=yuva420p` *(verified: carries alpha)* |
| **ProRes 4444 + alpha** (editors) | `… out/overlay.mov --codec=prores --prores-profile=4444 --image-format=png --pixel-format=yuva444p10le` *(verified)* |
| silent | `--muted` |
| props / variants | `--props='{"palette":"ember"}'` |

- **CRF:** lower = better and bigger. 16–18 masters, 20–23 delivery. Gradients need the low end.
- **Transparency** requires a composition with **no background anywhere** (no `Backdrop`, no root colour).
- **`--gl=angle`** only when using `@remotion/effects` / shader transitions.
- After rendering the master, **sample frames from the file** and (if audio) measure loudness (`sound-rhythm.md` §4).
- Deliver: the master, the other aspect ratios, a poster frame, and a short note on how to change the palette/copy (`theme.tsx`, scene constants).

---

## 5. Sandbox / CI quirks (all encountered while building this skill)

- **Remotion can't download its browser** (host not allowlisted → "Host not in allowlist"). Use a local one: `--browser-executable=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`. **It must be the *headless shell*:** full Chrome fails with "Old Headless mode has been removed". `filmstrip.py` finds and uses it automatically.
- **Google Fonts blocked** → `scripts/setup_offline_fonts.sh` + `fonts.offline.ts`.
- **`remotion.media` SFX / CDN assets unreachable** → ask the user for audio files.
- **Background processes do not survive between tool calls.** Run renders in the foreground with a `timeout`. For long renders, chunk: `--frames=0-124`, `125-249`, … then `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`.
- **Few CPUs / low memory** (observed: 1 vCPU, ~4 GB): expect ~0.15 s/frame at 720p (a 12.5 s piece rendered in ~55 s). Use `--scale` for iteration. The "Detected differing memory amounts" warning is harmless.
- **No Studio in a headless environment:** the filmstrip *is* your preview.
- **Network-restricted installs:** npm works when the registry is allowed. Pin all `@remotion/*` to the **same exact version** as `remotion`.
