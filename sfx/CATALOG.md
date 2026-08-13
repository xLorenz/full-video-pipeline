# SFX Catalog

Every sound in `sfx/sounds/`. Read the README first, then pick by task + mood. Each row links
to the sound's manual (`sfx.md`) with parameters and examples.

**Engine note (catalog v4):** `click`, `pop`, `zap`, `whoosh`, `whoosh_down`, `riser`, `error`,
`glitch_burst`, `sparkle`, `shimmer` and the five v4 additions (`success`, `warning`, `toggle`,
`bounce`, `stamp`) render on the Tone.js/WebAudio engine (`backend: "tone"`, recipe
`sfx/sounds/<id>/recipe.mjs`). Designs are 1:1 ports / skill-informed originals; output is
byte-for-byte deterministic per cue.

## Master table

| Sound | Moods | Tags | One-line |
|---|---|---|---|
| `whoosh` | neutral, calm | transition, emphasis | Rising band-passed noise sweep — the "something arrives" whoosh |
| `whoosh_down` | neutral, tense | transition, accent | Falling counterpart — "something leaves / resets" |
| `riser` | serious, tense, neutral | riser, transition | Long upward tension build for punch-ins or pattern interrupts |
| `impact` | serious, tense, neutral | impact, emphasis | Hard low hit — verdicts, stamps, confirmations |
| `thud` | serious, calm, neutral | impact | Soft low knock — card lands, panel drops in |
| `boom` | serious, tense, neutral | impact, emphasis | Deep sub boom — big reveals, chapter breaks |
| `punch` | tense, upbeat, neutral | impact | Sharp mid transient — beats land, words hit |
| `stamp` | serious, tense, playful, neutral | emphasis, impact | Authority stamp — thump + paper slap + clunk, verdicts |
| `tick` | neutral, calm | ui, accent | Clean short tick — list items, progress steps |
| `click` | neutral | ui | Button/press click — damped knock + attack spike |
| `pop` | playful, upbeat, neutral | ui, accent | Bright cork-pop — chips appear, badges |
| `success` | playful, upbeat, neutral | ui, emphasis | Ascending major-third chime C5->E5 — correct, milestones |
| `warning` | tense, serious, neutral | ui | Double mid-range pulse 750->520 — caution beats |
| `toggle` | neutral, playful | ui | Springy flip sweep 300->850 — switches, before/after |
| `bounce` | playful, upbeat, humorous, neutral | accent | Rubber-ball bounce, 4 settling hits — playful entrances |
| `zap` | glitch, tense, playful, neutral | glitch, accent | Electric snap — crackle + arc sizzle |
| `laser` | tense, playful, glitch, neutral | glitch, accent | Sweeping laser blip — targeting, scanning |
| `ding` | calm, neutral, serious | ui, emphasis | Bell-like confirm — success moments, milestones |
| `chime` | calm, neutral | ui, emphasis | Softer bell — completions, gentle success |
| `shimmer` | calm, playful, upbeat | accent, ambient | High sparkle — magic, bright reveals |
| `scan` | tense, glitch, neutral | riser, glitch | Frequency sweep — scanning / decoding (barcode-scan templates) |
| `glitch_burst` | glitch, tense, playful, neutral | glitch | Digital stutter burst — blips, dropouts, bitcrush |
| `sparkle` | playful, upbeat, humorous | accent | Random twinkles — celebration moments |
| `error` | tense, glitch, serious | ui, glitch | Descending buzzy fail tone — wrong answer, fail states |
| `swell` | calm, serious, neutral | ambient, transition | Slow tone+noise swell — emotional bridges |
| `rain` | calm, tense, serious | organic | Steady procedural rain (5 s field) — tense/ambient scenes |
| `paper` | calm, neutral | organic | Paper rustle — documents, letters |
| `footsteps` | tense, serious | organic | Footsteps — approach, walking scenes |
| `crowd` | serious, tense, upbeat | organic | Room tone of a crowd — statistics "millions of people" |
| `glass` | tense, glitch, playful | organic | Glass shatter — crystalline crack + shard cascade |
| `door` | tense, serious, calm | organic | Door thud/creak — reveals, entrances |
| `siren` | serious, tense | organic | Distant siren — warning beats, security |
| `bubble` | calm, playful | organic | Water bubbles — underwater, droplets template |

## By tag

- `transition` — `whoosh`, `whoosh_down`, `riser`, `swell`
- `emphasis` — `whoosh`, `impact`, `boom`, `ding`, `chime`, `success`, `stamp`
- `impact` — `impact`, `thud`, `boom`, `punch`, `stamp`
- `ui` — `tick`, `click`, `pop`, `ding`, `chime`, `error`, `success`, `warning`, `toggle`
- `organic` — `rain`, `paper`, `footsteps`, `crowd`, `glass`, `door`, `siren`, `bubble`
- `riser` — `riser`, `scan`
- `glitch` — `zap`, `laser`, `scan`, `glitch_burst`, `error`
- `ambient` — `shimmer`, `swell`
- `accent` — `whoosh_down`, `tick`, `pop`, `zap`, `laser`, `shimmer`, `sparkle`, `bounce`

## Aliases

| Alias | Canonical |
|---|---|
| `swoosh`, `sweep`, `swish`, `whoosh-up` | `whoosh` |
| `whoosh-down`, `swish-down` | `whoosh_down` |
| `boom-stamp`, `hit` | `impact` |
| `verdict`, `stamp-hit` | `stamp` |
| `thump`, `knock` | `thud` |
| `tick-tock`, `step` | `tick` |
| `tap`, `button` | `click` |
| `pop-sound`, `bubble-pop` | `pop` |
| `ding-dong` | `chime` |
| `bell` | `ding` |
| `laser-blip`, `blip` | `laser` |
| `zap-sound`, `electric` | `zap` |
| `scan-sweep`, `sonar` | `scan` |
| `glitch`, `stutter` | `glitch_burst` |
| `error-sound`, `fail` | `error` |
| `success-sound`, `confirm`, `achievement` | `success` |
| `warning-sound`, `caution` | `warning` |
| `flip`, `switch` | `toggle` |
| `boing`, `rubber` | `bounce` |
| `shimmer-sound`, `shine`, `sparkle-up` | `shimmer` |

Unknown sound ids get "did you mean" errors listing the closest alias.

## BGM beds

| Track | Moods | Tempo | Energy | One-line |
|---|---|---|---|---|
| `pulse_light` | neutral, calm, upbeat | 112 bpm | low | Light kick + airy pad — default safe choice |
| `pulse_dark` | serious, tense | 95 bpm | mid | Deep kick + minor pad — serious/tech content |
| `ambient_calm` | calm, serious, neutral | — | none | Drifting chord pad, no percussion — narration-forward |
| `tension_riser` | tense, serious | accelerating | rising | Rising tone + accelerating ticks — countdowns, climaxes |

Default `pulse_light` at the config volume is safe anywhere; pick `tension_riser`/`pulse_dark`
only for tense/serious content; `ambient_calm` when the voiceover should dominate. The engine
ducks the bed under the voiceover automatically.