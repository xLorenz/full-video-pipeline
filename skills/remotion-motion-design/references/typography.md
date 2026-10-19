# Typography for motion

Type is roughly half of what makes a motion piece look designed or cheap. In video it is judged small (phones), compressed (H.264 smears thin strokes) and briefly (seconds). That changes the rules.

Contents: 1 Rules · 2 Font pairings (verified) · 3 Recipes · 4 Details that separate pro from amateur · 5 Fitting & measuring · 6 Pitfalls

---

## 1. Rules (sizes in px on a 1080 px **short side**; multiply by `u`)

| thing | rule |
|---|---|
| headline | **≥ 84**; typical 110–170. Bold (700–800) on a tight tracking |
| supporting text | **≥ 44**. Anything below ~34 is unreadable on a phone: keep it decorative/tertiary |
| labels / kickers | 26–34, uppercase, **tracking +0.14 to +0.28em**, mono or grotesk |
| hierarchy | **≤ 3 sizes per scene** (hero · support · label), adjacent levels **≥ 2× apart** (148 → 44 is 3.4×) |
| display tracking | **−0.03 to −0.045em** for sizes ≥ 96; text sizes 0; uppercase labels positive |
| line-height | display **0.95–1.05**; supporting 1.25–1.4 |
| line length | headlines **≤ 6 words/line, ≤ 3 lines**; support ≤ 12 words/line |
| colour roles | `fg` headline · `muted` support · `accent` on **one** word/phrase per scene |
| contrast | `fg/bg ≥ 7:1`, `muted/bg ≥ 4.5:1` (palettes in `theme.tsx` already pass) |
| dark backgrounds | light text looks bolder (irradiation): drop one weight for thin faces |
| vertical (9:16) | go **15–25% bigger** than your landscape sizes and **stack** words; tall canvases reward scale, not extra whitespace |

**Break lines by meaning**, not by width: `"Make motion / feel inevitable."` Use `\n` in `SplitText`. Add `text-wrap: balance` to headlines and short paragraphs so the last line is never one orphaned word; use `text-wrap: pretty` on longer copy. (Both ship in Chromium 117+; `balance` was verified in a render while building the starter. Confirm `pretty` on your renderer before relying on it.)

---

## 2. Font pairings (all verified to exist in `@remotion/google-fonts`, weights checked)

Pattern: **one characterful display face + one neutral text face (+ optional mono for labels).** Two families max.

| personality | display | text | mono / accent |
|---|---|---|---|
| **Precise / tech** *(starter default)* | `InterTight` 600–800 | `Inter` 400–600 | `JetBrainsMono` 500 |
| | `SpaceGrotesk` 300–**700** (no 800) | `Inter` | `SpaceMono` 400/700 |
| | `Geist` 100–900 | `Geist` | `GeistMono` |
| **Cinematic / luxury** | `InstrumentSerif` **400 only** (+italic) | `Inter` 300–400 | wide-tracked caps labels |
| | `CormorantGaramond` 300–700 | `Manrope` 300–500 | |
| | `Fraunces` 100–900 (soft serif) | `Inter` | |
| **Playful / consumer** | `BricolageGrotesque` 200–800 | `DMSans` | |
| | `Outfit` 100–900 | `Figtree` 300–900 | |
| | `Unbounded` 200–900 (wide, chunky) | `DMSans` | |
| | `YoungSerif` **400 only** (friendly serif) | `DMSans` | |
| **Kinetic / hype** | `Anton` or `BebasNeue` **400 only** (condensed) | `Archivo` 100–900 | `DMMono` |
| | `BigShouldersDisplay` 100–900 | `Archivo` | |
| | `Syne` 400–800 (wide, quirky) | `Inter` | |
| **Editorial** | `PlayfairDisplay` 400–900 / `DMSerifDisplay` **400 only** / `Newsreader` 200–800 | `HankenGrotesk` / `Inter` | `IBMPlexMono` |
| | `Gloock` **400 only** / `BodoniModa` 400–900 (high contrast) | `Inter` | |
| **Warm explainer** | `PlusJakartaSans` 200–800 | `DMSans` | |
| | `Onest` 100–900 / `Lexend` 100–900 (very readable) | same | |
| hand-made accent (sparingly) | `Caveat` 400–700 | | |

Load pattern (module level, so a `delayRender` is registered and no frame is captured early):
```ts
import {loadFont} from '@remotion/google-fonts/InstrumentSerif';
const {fontFamily} = loadFont('normal', {weights: ['400'], subsets: ['latin']});   // italic: loadFont('italic', ...)
```
- **Single-weight faces** (`Anton`, `BebasNeue`, `InstrumentSerif`, `DMSerifDisplay`, `Gloock`, `YoungSerif`) ship **only weight 400**. Never set `fontWeight: 700/800` on them: the browser *fakes* a bold and smears the glyphs.
- Request **only** the weights/subsets you use (fewer network fetches, faster renders). The TS signature autocompletes valid weights.
- Fonts blocked (restricted sandbox)? `scripts/setup_offline_fonts.sh` + `fonts.offline.ts` (see SKILL.md). Always **look at a rendered frame** and confirm the font is real: Arial/Helvetica/Liberation fallback means it didn't load.

---

## 3. Recipes (all in the starter; preview them in the `Gallery` composition)

| goal | use | notes |
|---|---|---|
| headline reveal | `<SplitText text="Make motion\nfeel inevitable." by="word" variant="mask" />` | the editorial classic; mask doesn't clip descenders |
| two-tone headline | two `SplitText` blocks, second with `color: accent` and `at` +0.15 s | the colour change does the emphasis |
| short loud word | `by="char" stagger={0.03}` | ≤ ~14 chars; splits kerning pairs, so keep it short |
| dreamy / premium | `variant="blur"` | defocus → focus; pairs with `enterSoft`, slow |
| number | `<Counter to={4.2} decimals={1} prefix="$" suffix="M" />` | tabular-nums, `enterSoft`, ≥ 1.2 s |
| terminal / code | `<Typewriter text="npm run motion" at={0.3} />` | cursor solid while typing, blinks at rest |
| emphasis | `<Marker at={0.4}>word</Marker>` | highlighter stripe wipes in; sized in `em` |
| shine | `<ShineText text="Premium" at={0.3} />` | on saturated type (the accent word), after it landed |
| rotating slot | `<WordSwap words={['teams','makers','you.']} at={0.2} />` | reserves the longest word's width; ≥ 0.9 s per word |

Rules of thumb: **one** emphasis device per scene (marker *or* shine *or* colour, not all); **word-level** motion for sentences, **char-level** only for short words; whatever the device, the final state must hold still long enough to read (see reading time in `motion-language.md`).

---

## 4. Details that separate pro from amateur

- **No orphans, no widows, no hyphen-ish breaks.** Check the *rendered* frame, not the code.
- **Curly quotes and real dashes:** “ ” ’ — –, never `"` `'` `--`. Non-breaking space between number and unit: `4.2\u00A0M`, `10\u00A0s`.
- **Tabular numerals for anything that changes** (`fontVariantNumeric: 'tabular-nums'`): otherwise digits jitter sideways as they tick.
- **Optical alignment.** Big type shows its side-bearing; nudge display text left by ~`0.04em` so the *glyph edge* sits on the grid line, not the text box.
- **Uppercase needs tracking.** Uppercase labels with default tracking look cramped; add +0.14–0.28em.
- **Contrast of scale beats contrast of weight.** A 3× size jump reads instantly; bold-vs-regular at the same size barely registers in motion.
- **Animate `scale`/`translate`/`opacity`, never `fontSize` or `letterSpacing`** (they re-layout every frame and jitter). Tiny tracking drift on an entrance (≤ 0.02em) is the one safe exception.
- **Don't animate `font-weight`** unless you've confirmed the font loaded as a variable font. To emphasise: change colour, scale ≤ 1.06, add a marker, or crossfade two layers.
- **Rounded text on motion:** fractional pixel positions soften text in motion (fine), but make sure it **resolves to a crisp state at rest** (`Reveal` removes transform/blur residue after landing).
- **Captions / subtitles:** treat as a separate system (≥ 44 px, ≤ 2 lines, ≤ 42 chars/line, bottom third, safe from platform UI, 0.3–0.35 s per word). For word-timed captions use `@remotion/captions` (see the official `remotion-captions` skill).

---

## 5. Fitting & measuring (`@remotion/layout-utils`, verified signatures)

```ts
import {fitText, measureText} from '@remotion/layout-utils';
const {fontSize} = fitText({text: 'inevitable.', withinWidth: safeWidth, fontFamily: fonts.display, fontWeight: 800, letterSpacing: '-0.035em'});
const {width, height} = measureText({text, fontFamily, fontSize, fontWeight, letterSpacing});
```
- The font must be **loaded first** (it measures real glyphs; `validateFontIsLoaded` guards this).
- Use `fitText` for dynamic copy (user-supplied names, translated strings, data-driven titles) so nothing overflows; compute once per text, not per frame.
- Always test the **longest** string the template will receive.

---

## 6. Pitfalls checklist
- [ ] Font actually loaded (not a system fallback)?
- [ ] No faux-bold on single-weight faces?
- [ ] Headline ≥ 84 px, support ≥ 44 px (vertical: bigger)?
- [ ] Lines broken by meaning; no orphan on the last line?
- [ ] Text inside the safe area for this format?
- [ ] Final state held ≥ `max(0.8, 0.3 × words)` s?
- [ ] ≤ 3 sizes, ≤ 2 families, one emphasis device per scene?
