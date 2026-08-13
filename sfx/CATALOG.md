# SFX Catalog

Every sound in `sfx/sounds/`. Read the README first, then pick by task + mood. Each row links
to the sound's manual (`sfx.md`) with parameters and examples.

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
| `tick` | neutral, calm | ui, accent | Clean short tick — list items, progress steps |
| `click` | neutral | ui | Button/press click — minimal UI land |
| `pop` | playful, upbeat, neutral | ui, accent | Bright small pop — chips appear, badges |
| `zap` | glitch, tense, playful, neutral | glitch, accent | Electric snap — errors, sci-fi pulses |
| `laser` | tense, playful, glitch, neutral | glitch, accent | Sweeping laser blip — targeting, scanning |
| `ding` | calm, neutral, serious | ui, emphasis | Bell-like confirm — success moments, milestones |
| `chime` | calm, neutral | ui, emphasis | Softer bell — completions, gentle success |
| `shimmer` | calm, playful, upbeat | accent, ambient | High sparkle — magic, bright reveals |
| `scan` | tense, glitch, neutral | riser, glitch | Frequency sweep — scanning / decoding (barcode-scan templates) |
| `glitch_burst` | glitch, tense, playful, neutral | glitch | Digital stutter burst — glitch-rip / VHS templates |
| `sparkle` | playful, upbeat, humorous | accent | Random twinkles — celebration moments |
| `error` | tense, glitch, serious | ui, glitch | Two descending dings — wrong answer, fail states |
| `swell` | calm, serious, neutral | ambient, transition | Slow tone+noise swell — emotional bridges |
| `rain` | calm, tense, serious | organic | Recorded rain bed — tense/ambient scenes |
| `paper` | calm, neutral | organic | Paper rustle — documents, letters |
| `footsteps` | tense, serious | organic | Footsteps — approach, walking scenes |
| `crowd` | serious, tense, upbeat | organic | Room tone of a crowd — statistics "millions of people" |
| `glass` | tense, glitch, playful | organic | Glass shatter — shatter/glitch-rip templates |
| `door` | tense, serious, calm | organic | Door thud/creak — reveals, entrances |
| `siren` | serious, tense | organic | Distant siren — warning beats, security |
| `bubble` | calm, playful | organic | Water bubbles — underwater, droplets template |

## By tag

- `transition` — `whoosh`, `whoosh_down`, `riser`, `swell`
- `emphasis` — `whoosh`, `impact`, `boom`, `ding`, `chime`
- `impact` — `impact`, `thud`, `boom`, `punch`
- `ui` — `tick`, `click`, `pop`, `ding`, `chime`, `error`
- `organic` — `rain`, `paper`, `footsteps`, `crowd`, `glass`, `door`, `siren`, `bubble`
- `riser` — `riser`, `scan`
- `glitch` — `zap`, `laser`, `scan`, `glitch_burst`, `error`
- `ambient` — `shimmer`, `swell`
- `accent` — `whoosh_down`, `tick`, `pop`, `zap`, `laser`, `shimmer`, `sparkle`

## Aliases

| Alias | Canonical |
|---|---|
| `swoosh`, `sweep`, `swish`, `whoosh-up` | `whoosh` |
| `whoosh-down`, `swish-down` | `whoosh_down` |
| `boom-stamp`, `hit`, `stamp` | `impact` |
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