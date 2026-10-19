# Composition, colour, depth & finish

Contents: 1 Formats & safe zones · 2 Layout · 3 Colour · 4 Depth · 5 Finish · 6 Render cost · 7 Quick looks

---

## 1. Formats & safe zones

Design everything in `u` (1u = 1px at a 1080 px **short side**) and take margins from `useLayout().safe`, and one scene file serves every format.

| format | size | typical use | `safe` (x / top / bottom) |
|---|---|---|---|
| 16:9 | 1920×1080 | YouTube, web hero, presentations, TV | 6% (115 px) / 8% / 8% |
| 9:16 | 1080×1920 | Reels, TikTok, Shorts, Stories | 7% (76 px) / **13% (250 px)** / **20% (384 px)** |
| 4:5 | 1080×1350 | Instagram/LinkedIn feed | 7% all round |
| 1:1 | 1080×1080 | feed, ads | 7% all round |

- **9:16:** platform UI (username, caption, buttons) covers the top ~13% and bottom ~20–25%; on TikTok/Reels the lower-right edge also holds action buttons, so keep text in the lower half **off the far right** (≈ approximate figures; when in doubt, be more conservative).
- **fps:** 30 default · 60 for screen recordings / UI motion (smoother scrolling and cursors) · 24 for a cinematic look. Author timing in seconds so it survives a change.
- Compose for the **smallest screen**: squint at the contact sheet. If the hero isn't obvious at 25% size, it won't be on a phone.

---

## 2. Layout

- **One layout archetype per scene:** hero-left (editorial) · centred lockup · split (text | visual) · 3-up cards · stat + chart · full-bleed visual + lower third. Don't invent a new structure per scene; vary the *archetype*, keep the *grid*.
- **Grid:** margins = `safe`; 12 columns; gutters 24–40u; align to column lines. Spacing in a base-8 scale (8 · 16 · 24 · 32 · 48 · 64 · 96).
- **Negative space:** a hero scene should be ≥ 35–40% empty. Crowding reads as cheap; emptiness reads as confident.
- **Optical centre sits above geometric centre** (~45% from the top). Perfectly centred content looks like it's sinking.
- **Focal point on a third line**, or the optical centre for lockups. Supporting items hang off the same lines.
- **Scale contrast:** if two items are close in size, make them equal or make the gap obvious (≥ 2×). Near-misses look like mistakes.
- **Reading path:** top-left → bottom-right for Latin scripts. Order staggers and camera moves along it.
- **Vertical:** stack and enlarge rather than centring a landscape layout in a tall frame (see `Hook` in `Showcase.tsx`).
- **Equal cards, equal heights, equal line counts.** Break titles by hand so bodies align across a row.

---

## 3. Colour

### Rules
- **60 / 30 / 10:** 60% background · 30% surfaces and text · 10% accent. **One hero accent per scene**; `accent2` ≤ ~10% of the pixels.
- **Tinted neutrals, not pure black/white.** `#000`/`#FFF` glare, band, and look unfinished. Palettes use near-black with a hue and near-white with a warmth.
- **Contrast for video:** body `≥ 7:1`, secondary `≥ 4.5:1`, large accent text/graphics `≥ 3:1`. Compression and small screens eat contrast.
- **Dark backgrounds** read premium and hide compression noise; **light** reads friendly/editorial. Whichever you pick, test legibility at 25% size.
- **Colour is meaning:** keep green/red for good/bad *only*; reuse the same accent for the same role across scenes.
- **Gradients: one hue family**, two stops, soft. Rainbow and the default purple→blue "AI gradient" are the cliché; pick a hue relationship on purpose.

### Palettes (in `theme.tsx`; contrast measured)
| palette | mode | bg | fg | muted | accent | accent2 | fg/bg | muted/bg | accent/bg | accent2/bg | text-on-accent |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `midnight` | dark | `#07080D` | `#F3F5FA` | `#8F98B0` | `#7C8DFF` | `#47E5C2` | 18.3 | 6.9 | 6.8 | 12.6 | 6.8 |
| `ember` | dark | `#0B0706` | `#FFF2E8` | `#A8938A` | `#FF5A36` | `#FFC24D` | 18.3 | 6.9 | 6.5 | 12.5 | 6.5 |
| `paper` | light | `#F3EEE4` | `#15130F` | `#6A645A` | `#E5400C` | `#1F3FBF` | 16.0 | 5.1 | 3.6 | 7.2 | 4.5 |
| `aurora` | dark | `#050711` | `#EDF2FF` | `#8C9BC4` | `#5BF0C5` | `#9A7BFF` | 17.9 | 7.3 | 14.1 | 6.4 | 14.1 |
| `noirgold` | dark | `#0A0A0A` | `#F3EFE8` | `#8D8880` | `#DDB56E` | `#F3EFE8` | 17.3 | 5.6 | 10.3 | 17.3 | 10.3 |
| `sunrise` | light | `#FFF3E3` | `#1C1930` | `#6A667F` | `#E8431B` | `#3A4DFF` | 15.6 | 5.0 | 3.7 | 5.2 | 4.3 |

Mood: `midnight` tech/SaaS · `ember` launches/consumer/sports · `paper` editorial/fashion · `aurora` creative/AI/music · `noirgold` luxury/cinematic · `sunrise` friendly explainers/education/wellness.

### Brand colours? A custom palette in five steps
1. Take the brand's **one** strongest colour as `accent` (lift lightness to ~62–76% on dark backgrounds so it clears 3:1).
2. `bg` = same hue, saturation 25–45%, lightness 3–6% (dark) · `bgLift` = lightness 10–16% (centre of the backdrop glow).
3. `fg` = same hue at 15–30% saturation, lightness ~95% · `muted` = lightness 62–68%.
4. `accent2` = hue ± 150–180° (complement/split) at 70–90% saturation: used sparingly.
5. **Check the numbers** (fg/bg ≥ 7, muted/bg ≥ 4.5, accent/bg ≥ 3), add it to `palettes`, and re-run the filmstrip.
Using a supplied brand kit: honour its colours/fonts exactly; add only neutrals derived from them.

---

## 4. Depth

A flat solid background is the single most common tell of generic generated motion. Build depth in layers:

1. **Backdrop** (`<Backdrop>`): gradient lit from above, 2–3 slow light orbs (periods 15–27 s), optional drifting grid, vignette, grain. Keep it **outside** `CameraRig` so content moves against it.
2. **Surfaces** (`<Surface>`): translucent top-lit gradient + 1px hairline + inset top highlight + **two shadows** (large soft for lift, small tight for contact). Radius ≥ 24u.
3. **Parallax** (`<Parallax depth>`): 2–3 layers, near layers move more; travel 60–160u; negative depth for strong separation.
4. **Atmospheric perspective:** far layers smaller, softer (blur 2–6u), lower contrast; near layers sharper and brighter.
5. **One light direction** (top-left): highlights on top/left edges, shadows falling down/right, on every element.
6. **Perspective tilt** (`<TiltCard>`): ≤ 15° gives flat UI presence; more is a gimmick.
7. **Colour glow:** `box-shadow: 0 18u 50u -14u accent@0.7` under key buttons/marks (see the CTA pill).

---

## 5. Finish

| device | recipe | notes |
|---|---|---|
| **Grain** | `<Grain opacity={0.06–0.12}>` | texture **and** dithering: breaks up H.264 banding in dark gradients. Updates on twos (12–15 Hz) like film |
| **Vignette** | radial `transparent 52% → rgba(0,0,0,.5)` (dark) / `rgba(70,45,20,.10)` (light) | pulls the eye to centre; built into `Backdrop` |
| **Glow** | coloured soft shadow; `PathStroke glow` | restrained: a glow on everything is a glow on nothing |
| **Chromatic aberration** | RGB split of 2–4u for **4–8 frames** on a hit | seasoning; `@remotion/effects` has `chromaticAberration()` |
| **Light leak / film burn** | `LightLeak` via `TransitionSeries.Overlay`, or the `filmBurn` transition | warm, organic; suits cinematic/nostalgic personalities |
| **Motion blur** | `DirectionalBlur` (cheap) / `@remotion/motion-blur` (accurate) | see `transitions-camera.md` |

`@remotion/effects` (WebGL2, ~70 effects: `blur`, `glow`, `noise`, `speckle`, `vignette`, `shine`, `lightLeak`, `chromaticAberration`, `dropShadow`…) attach via `effects={[...]}` to `Solid`, `CanvasImage`, `Video`, `HtmlInCanvas`. Render with `--gl=angle` (or `Config.setChromiumOpenGlRenderer('angle')`). HTML-in-canvas needs Chrome 149+ with `chrome://flags/#canvas-draw-element` for the Studio preview. **Not exercised in this skill's tests** (the build environment's Chromium is 141): read the current official effects docs before relying on them, and fall back to the CSS/SVG recipes here.

---

## 6. Render cost (what slows frames down)

| cheap | moderate | expensive |
|---|---|---|
| `transform`/`translate`/`scale`/`opacity` · gradients · small tiled SVG (grain) · hairlines | a few large soft shadows · SVG `feGaussianBlur` on small elements (`DirectionalBlur`) · many DOM nodes | **`backdrop-filter`** · `filter: blur()` on **large** areas or many layers · full-frame `feTurbulence` · huge unscaled images · sub-frame motion blur on a complex tree (multiplies cost by `samples`) |

Iterating: render at `--scale=0.5`, sample frames with `filmstrip.py`, and render the final at full size once.

---

## 7. Quick looks (combinations that work)

| look | recipe |
|---|---|
| **Precision tech** | `midnight`, `Backdrop variant="grid"`, `InterTight`+`JetBrainsMono`, `Surface` cards, `enter`/`move`, no bounce |
| **Neon night** | `aurora`, glow strokes (`PathStroke glow`), `ShineText` on the accent word, grain 0.1 |
| **Luxury** | `noirgold`, `InstrumentSerif` display (400, large, light), wide-tracked caps labels, `enterSoft`, long dissolves, lots of negative space |
| **Paper / editorial** | `paper`, flat (no glow), hairline rules, high-contrast serif, `posterize: 3` on strokes, hard cuts and wipes |
| **Friendly explainer** | `sunrise`, `BricolageGrotesque`+`DMSans`, rounded `Surface`, `pop`/`playful`, iris transitions |
| **Hype** | `ember`, `Anton`, scale-punch on `useBeat`, `DirectionalBlur` whips, hard cuts on the beat, shake |
