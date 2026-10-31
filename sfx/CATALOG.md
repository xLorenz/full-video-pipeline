# SFX Catalog

Every sound in `sfx/sounds/` — **91 entries** (30 synthesized, 61 samples).
Generated: `python scripts/sfx_catalog.py --write-catalog-md` (never hand-edit). Pick by tag + mood, then read the sound's `sfx.md`.

**Engine note (catalog v11):** `backend: "tone"` renders on the
Tone.js/WebAudio engine (`sfx/sounds/<id>/recipe.mjs`, batched into one `node`
invocation, seeded per cue, byte-identical per cue). `backend: "sample"` plays a
bundled MP3 (decoded via ffmpeg, SHA-256 pinned in `assets/manifest.json`).
Both are mixed under the 9 BGM beds at stitch time. Sample levels are matched
to the measured voiceover at mix time, so `default_volume` sets relative prominence,
never an absolute dB value (law in [`SCHEMA.md`](./SCHEMA.md)).

## Synthesized (`tone`)

| Sound | Moods | Tags | One-line |
|---|---|---|---|
| `page_turn` | neutral, calm | transition, accent | Paper flip gesture — airy rising flip + soft landing tap; before/after reveals, card flips. |
| `riser` | serious, tense, neutral | riser, transition | Long upward tension build (tone + noise) for punch-ins or pattern interrupts. |
| `swell` | calm, serious, neutral | ambient, transition | Slow tone+noise swell — emotional bridges. |
| `whoosh` | neutral, calm | transition, emphasis | Rising band-passed noise sweep, ~0.7s. The 'something arrived' transition whoosh. Tone-neutral. |
| `whoosh_down` | neutral, tense | transition, accent | Falling band-passed noise sweep — 'something leaves / resets'. |
| `boom` | serious, tense, neutral | impact, emphasis | Deep sub boom — big reveals, chapter breaks. |
| `impact` | serious, tense, neutral | impact, emphasis | Hard low hit — verdicts, stamps, confirmations. |
| `punch` | tense, upbeat, neutral | impact | Sharp mid transient — beats land, words hit. |
| `stamp` | serious, tense, playful, neutral | emphasis, impact | Authority stamp (~0.25s): low thump 130 to 55 Hz + paper slap + metallic clunk — verdicts, final answers, seals. |
| `thud` | serious, calm, neutral | impact | Soft low knock — card lands, panel drops in. |
| `chime` | calm, neutral | ui, emphasis | Softer bell — completions, gentle success. |
| `ding` | calm, neutral, serious | ui, emphasis | Bell-like confirm — success moments, milestones. |
| `success` | playful, upbeat, neutral | ui, emphasis | Ascending major-third chime (C5 to E5, ~0.5s) with a bell sparkle partial — correct answers, milestones, positive confirms. |
| `scan` | tense, glitch, neutral | riser, glitch | Frequency sweep — scanning / decoding (barcode-scan templates). |
| `click` | neutral | ui | Button/press click — damped knock at cutoff + 2 ms attack spike. |
| `error` | tense, glitch, serious | ui, glitch | Descending buzzy fail tone — wrong answers, errors, denials. |
| `pop` | playful, upbeat, neutral | ui, accent | Bright cork-pop — chips appear, badges. |
| `sonar_ping` | calm, neutral, serious | accent, ui | Clean location ping — 880 Hz sine + octave shimmer, long tail; map pins, radar sweeps. |
| `tick` | neutral, calm | ui, accent | Clean short tick — list items, progress steps. |
| `toggle` | neutral, playful | ui | Springy flip sweep 300 to 850 Hz with overshoot settle (~0.18s) — before/after flips, switches, mode changes. |
| `warning` | tense, serious, neutral | ui | Double mid-range pulse, falling 750 to 520 Hz (~0.3s) — caution beats, 'careful', attention calls. |
| `glitch_burst` | glitch, tense, playful, neutral | glitch | Digital stutter burst — micro-blips, dropouts, bit-crushed tail. |
| `laser` | tense, playful, glitch, neutral | glitch, accent | Sweeping laser blip — targeting, scanning. |
| `zap` | glitch, tense, playful, neutral | glitch, accent | Electric snap — crackle burst + arc sizzle. |
| `glass` | tense, glitch, playful | organic | Glass shatter — crystalline crack + shard cascade. |
| `rain` | calm, tense, serious | organic, ambient | Steady procedural rain (5 s field). Use for tense/reflective ambience; place cues every 5 s for longer rain. |
| `shimmer` | calm, playful, upbeat | accent, ambient | High sparkle — magic, bright reveals. |
| `bounce` | playful, upbeat, humorous, neutral | accent | Rubber-ball bounce (~0.7s): 4 decreasing pitch-drop hits settling with a soft strike tick — playful entrances, bouncy moments. |
| `heartbeat` | tense, serious | accent | Low lub-dub — paired 68/58 Hz thumps + strike click; countdowns, tension pulses. |
| `sparkle` | playful, upbeat, humorous | accent | Random twinkles — celebration moments. |

## Samples (`sample`)

| Sound | Moods | Tags | One-line |
|---|---|---|---|
| `airy_woosh` | calm, neutral, serious | transition, organic | Breathy airy whoosh with soft highs — a light swipe between scenes, a title drifting in. |
| `cinematic_boom` | serious, tense, neutral | impact, transition, emphasis | Deep sub-heavy cinematic boom with long tail — title cards, hard cuts, trailer-style reveals. |
| `dark_riser` | tense, serious | riser, transition | Low ominous build that swells in pitch and volume — approaching threat, reveal of a problem, pre-drop tension. |
| `deep_woosh` | serious, tense, neutral | transition, impact | Long low cinematic whoosh with a dark tail — a heavy camera move, big scene change. |
| `impact_transition` | serious, tense, neutral | transition, impact | Hit-and-whoosh combo that slams then sweeps forward — a hard section change with forward momentum. |
| `metallic_riser` | tense, serious, neutral | riser, transition | Scraping metallic rise that tightens into a peak — machinery accelerating, tech building to a reveal. |
| `open_home` | playful, neutral, calm | ui, transition | Soft rising app-open swell — a phone screen opens, home menu slides in, app launches. |
| `reality_riser` | tense, serious | riser, ambient, transition | Long escalating drone that climbs to a wall of noise — a long suspense build into a hard reveal. |
| `riser_reverb` | tense, serious, neutral | riser, transition | Reverb-drenched swell that widens and lifts — a spacious build into a scene change or emotional peak. |
| `sci_fi_woosh` | neutral, serious, calm | transition, ui | Smooth synth whoosh with a futuristic shimmer — a tech interface swiping, futuristic UI panels moving. |
| `short_woosh` | neutral, calm, playful | transition, accent | Quick tight whoosh with a clean taper — a fast object swipe, smaller transition, text flipping in. |
| `slo_motion` | tense, serious, neutral | transition, accent | Pitch-dropping time-stretch swirl — speed ramps down into slow motion, or footage drops into a dramatic beat. |
| `unique_woosh` | neutral, playful, humorous | transition, accent | Flanged, slightly warped whoosh with a curious texture — a playful transition with a bit of character. |
| `wind_woosh` | calm, neutral, serious | transition, organic | Long gusting wind swell that rises and fades — airy scene transitions, outdoor drift, passage of time. |
| `creeper_explode` | humorous, playful, tense | impact, emphasis | Minecraft creeper hiss into a chunky blocky explosion — an 'uh oh' beat, plan blowing up, sudden chaos. |
| `deep_bass` | serious, tense, neutral | impact, emphasis | Short sub-bass punch with weight, little high end — a claim landing hard, a logo or stat thumping in. |
| `energy_burst` | upbeat, tense, playful | impact, emphasis | Explosive energy burst with a bright crack and fast decay — a power-up, a sudden blast of motion or light. |
| `mc_crit` | playful, upbeat, tense | impact, emphasis | Minecraft critical-hit thwack with a bright ping — a hit landing extra hard, a crit bonus landing. |
| `mc_hit` | playful, tense, neutral | impact, accent | Dull Minecraft-style damage thud, dry and blocky — a hit connecting, damage dealing in gameplay. |
| `mc_oof` | humorous, playful | impact, accent | The Minecraft 'oof' hurt grunt — someone takes damage or a plan fails comically. |
| `metallic_hit` | serious, tense, neutral | impact, accent | Ringing metallic clang with a long shimmer — metal striking metal, an industrial or mechanical impact. |
| `orchestra_hit` | serious, tense, playful | impact, emphasis | Brass-and-strings orchestral stab with reverb — a dramatic punchline, epic reveal, mock-cinematic moment. |
| `ratchet` | neutral, tense, serious | accent, impact | Tight metallic ratchet notch, one firm click — settings locking in, dial stepping, tool tightening. |
| `suspense_thud` | tense, serious | impact, ambient | Heavy muffled thud with a long dark tail — a bad-news beat, a pause for dread, a heavy landing. |
| `sword_sling` | tense, playful, neutral | accent, impact | Metallic blade swish through air — a sword drawn or swung, a slashing action beat. |
| `cash_register` | upbeat, playful, neutral | emphasis, accent | Classic ka-ching till with drawer clack — revenue, sale closed, money-on-screen reveals. |
| `charge_up` | tense, upbeat, neutral | riser, emphasis | Rising electronic whine that builds and peaks — a meter filling, battery charging, power building before a reveal. |
| `eshop_ding` | playful, upbeat, neutral | ui, emphasis | Chirpy Nintendo eShop style purchase chime — buying something in a game or app, store confirmation. |
| `flash` | upbeat, playful, neutral | accent, emphasis | Camera flash pop with sharp shutter snap — photo captured, screenshot taken, freeze-frame moment. |
| `mc_level_up` | upbeat, playful, neutral | emphasis, ui | Minecraft XP level-up chime burst — a rank gained, subscription tier unlocked, progress milestone hit. |
| `minecraft_chest` | playful, upbeat, neutral | ui, emphasis, accent | Minecraft chest creak and open with loot sparkle — a container of goodies revealed, reward unlocked. |
| `pay_ding` | calm, neutral, playful | ui, emphasis | Bright two-note Apple Pay confirm chime — checkout success, payment accepted, 'transaction complete' beats. |
| `pokemon_ding` | playful, upbeat, neutral | ui, emphasis | Retro chiptune two-note ding — stat restored, correct answer, item obtained in a pokemon-style beat. |
| `ui_pop` | playful, neutral, upbeat | ui, emphasis | Soft rising bloop-pop with a friendly tail — small success toasts, chips appearing, gentle confirmations. |
| `ethereal_riser` | calm, neutral, serious | riser, ambient | Shimmering airy swell with a soft choir-like top — an uplifting build into a hopeful or wondrous reveal. |
| `mind_riser` | tense, serious, neutral | riser, accent | Warping pitch-bend rise with an eerie sway — a realization forming, a mind racing, a twist approaching. |
| `device_click` | neutral, calm | ui, accent | Soft plastic hardware click with slight body — pressing a physical button, switch or remote on screen. |
| `digital_click` | neutral, calm, playful | ui, accent | Clean mid-pitch digital click, quick and unobtrusive — the default click for buttons and tab switches. |
| `digital_click_high` | neutral, playful, calm | ui, accent | Tiny bright digital tick with glassy top end — cursor moving, selection snapping, fast UI actions. |
| `digital_click_low` | neutral, serious, calm | ui, accent | Muted low digital click, soft and round — committing an action, confirm button, deeper UI step. |
| `game_click` | playful, neutral, upbeat | ui, accent | Chunky console menu select click with a bright ping — picking an option in a game menu or app. |
| `game_pop` | playful, humorous, neutral | ui, accent | Ultra-short bubbly pop blip — a counter increments, a coin or point collected on screen. |
| `minecraft_click` | playful, neutral, humorous | ui, accent | Wooden Minecraft UI button clunk — a menu option pressed in blocky game-style graphics. |
| `mouse_click` | neutral, calm | ui, accent | Dry mouse-button click, thin and short — someone clicking through an app, browser or spreadsheet. |
| `pop_up` | playful, neutral, upbeat | ui, accent | Round plastic pop as something appears — notification bounces in, tooltip opens, card pops up. |
| `radio_beep` | tense, serious, neutral | ui, accent | Short clipped radio beep, dry and square — comms opening, alert acknowledged, walkie-talkie cue. |
| `glitch_loop` | glitch, tense, neutral | glitch, ambient | Stuttering digital corruption bed with bitcrushed snaps — screen tearing, broken data, system failure visuals. |
| `stutter` | glitch, humorous, tense | glitch, accent | Rapid stuttered repeat with digital grit — audio or video caught buffering, a beat getting stuck. |
| `bubble` | calm, playful | organic | Water bubbles — underwater, droplets template. |
| `crowd` | serious, tense, upbeat | organic, ambient | Room tone of a crowd — statistics 'millions of people'. |
| `dog_bark` | humorous, playful | organic, accent | Single chunky Minecraft-style dog bark, blocky and clipped — a dog in gameplay, attention-grabbing pet beat. |
| `door` | tense, serious, calm | organic | Door closing thud — reveals, entrances. |
| `footsteps` | tense, serious | organic | Three footsteps — approach, walking scenes. |
| `gears` | serious, tense, neutral | accent, organic | Gritty interlocking gear grind, metallic and low — machinery starting, systems grinding into motion. |
| `mc_eat` | humorous, playful, neutral | organic, accent | Minecraft eating crunch, chompy and cartoonish — someone eats or drinks on screen, food gags. |
| `paper` | calm, neutral | organic | Paper rustle / page flip — documents, letters. |
| `phone_typing` | neutral, calm, playful | organic, accent | Soft touchscreen tap-typing bed — someone texting on a phone, search bar filling, message composing. |
| `sheep_bleat` | humorous, playful | organic, accent | Warbly Minecraft-style sheep baa — a farm animal in gameplay, a silly animal-noise beat. |
| `siren` | serious, tense | organic | Distant siren — warning beats, security. Not for playful content. |
| `typing` | neutral, calm, serious | organic, accent | Mechanical keyboard clatter bed, steady keystrokes — coding, writing, search terms entered on a desktop. |
| `clock_tick` | tense, serious, neutral | ambient, accent | Steady mechanical clock tick loop — a countdown, deadline or waiting beat under narration. |

## By tag

- `transition` (19) — `airy_woosh`, `cinematic_boom`, `dark_riser`, `deep_woosh`, `impact_transition`, `metallic_riser`, `open_home`, `page_turn`, `reality_riser`, `riser`, `riser_reverb`, `sci_fi_woosh`, `short_woosh`, `slo_motion`, `swell`, `unique_woosh`, `whoosh`, `whoosh_down`, `wind_woosh`
- `impact` (19) — `boom`, `cinematic_boom`, `creeper_explode`, `deep_bass`, `deep_woosh`, `energy_burst`, `impact`, `impact_transition`, `mc_crit`, `mc_hit`, `mc_oof`, `metallic_hit`, `orchestra_hit`, `punch`, `ratchet`, `stamp`, `suspense_thud`, `sword_sling`, `thud`
- `emphasis` (22) — `boom`, `cash_register`, `charge_up`, `chime`, `cinematic_boom`, `creeper_explode`, `deep_bass`, `ding`, `energy_burst`, `eshop_ding`, `flash`, `impact`, `mc_crit`, `mc_level_up`, `minecraft_chest`, `orchestra_hit`, `pay_ding`, `pokemon_ding`, `stamp`, `success`, `ui_pop`, `whoosh`
- `riser` (9) — `charge_up`, `dark_riser`, `ethereal_riser`, `metallic_riser`, `mind_riser`, `reality_riser`, `riser`, `riser_reverb`, `scan`
- `ui` (28) — `chime`, `click`, `device_click`, `digital_click`, `digital_click_high`, `digital_click_low`, `ding`, `error`, `eshop_ding`, `game_click`, `game_pop`, `mc_level_up`, `minecraft_chest`, `minecraft_click`, `mouse_click`, `open_home`, `pay_ding`, `pokemon_ding`, `pop`, `pop_up`, `radio_beep`, `sci_fi_woosh`, `sonar_ping`, `success`, `tick`, `toggle`, `ui_pop`, `warning`
- `glitch` (7) — `error`, `glitch_burst`, `glitch_loop`, `laser`, `scan`, `stutter`, `zap`
- `organic` (16) — `airy_woosh`, `bubble`, `crowd`, `dog_bark`, `door`, `footsteps`, `gears`, `glass`, `mc_eat`, `paper`, `phone_typing`, `rain`, `sheep_bleat`, `siren`, `typing`, `wind_woosh`
- `ambient` (9) — `clock_tick`, `crowd`, `ethereal_riser`, `glitch_loop`, `rain`, `reality_riser`, `shimmer`, `suspense_thud`, `swell`
- `accent` (41) — `bounce`, `cash_register`, `clock_tick`, `device_click`, `digital_click`, `digital_click_high`, `digital_click_low`, `dog_bark`, `flash`, `game_click`, `game_pop`, `gears`, `heartbeat`, `laser`, `mc_eat`, `mc_hit`, `mc_oof`, `metallic_hit`, `mind_riser`, `minecraft_chest`, `minecraft_click`, `mouse_click`, `page_turn`, `phone_typing`, `pop`, `pop_up`, `radio_beep`, `ratchet`, `sheep_bleat`, `shimmer`, `short_woosh`, `slo_motion`, `sonar_ping`, `sparkle`, `stutter`, `sword_sling`, `tick`, `typing`, `unique_woosh`, `whoosh_down`, `zap`

## Aliases

| Alias | Sound |
|---|---|
| `8bit-ding` | `pokemon_ding` |
| `achievement` | `success` |
| `air-swipe` | `airy_woosh` |
| `airy-build` | `ethereal_riser` |
| `alarm` | `siren` |
| `app-open-whoosh` | `open_home` |
| `apple-pay` | `pay_ding` |
| `bass-drop` | `boom` |
| `bass-drop-boom` | `cinematic_boom` |
| `bass-hit` | `deep_bass` |
| `beat-hit` | `punch` |
| `bell` | `ding` |
| `big-build` | `riser_reverb` |
| `blade-swish` | `sword_sling` |
| `blast-hit` | `energy_burst` |
| `blip` | `laser` |
| `blip-pop` | `game_pop` |
| `blocky-bleat` | `sheep_bleat` |
| `blocky-click` | `minecraft_click` |
| `blocky-hit` | `mc_hit` |
| `boing` | `bounce` |
| `boom-stamp` | `impact` |
| `brass-hit` | `orchestra_hit` |
| `breeze-transition` | `wind_woosh` |
| `breeze-whoosh` | `airy_woosh` |
| `bright-tick` | `digital_click_high` |
| `bubble-pop` | `pop` |
| `bubbles` | `bubble` |
| `buffer-stutter` | `stutter` |
| `build` | `riser` |
| `build-up` | `riser` |
| `button` | `click` |
| `button-press` | `device_click` |
| `camera-flash` | `flash` |
| `caution` | `warning` |
| `charging` | `charge_up` |
| `checkout-ding` | `cash_register` |
| `chest-reveal` | `minecraft_chest` |
| `cinematic-whoosh` | `deep_woosh` |
| `clock-loop` | `clock_tick` |
| `code-typing` | `typing` |
| `cognitive-build` | `mind_riser` |
| `cogs-turning` | `gears` |
| `coin-pop` | `game_pop` |
| `comms-beep` | `radio_beep` |
| `computer-click` | `mouse_click` |
| `confirm` | `success` |
| `console-click` | `game_click` |
| `corruption-loop` | `glitch_loop` |
| `creeper-boom` | `creeper_explode` |
| `creeper-explosion` | `creeper_explode` |
| `crit-hit` | `mc_crit` |
| `critical-strike` | `mc_crit` |
| `crowd-murmur` | `crowd` |
| `dark-build` | `dark_riser` |
| `dark-tick` | `digital_click_low` |
| `datamosh` | `glitch_loop` |
| `deep-boom` | `boom` |
| `desktop-click` | `mouse_click` |
| `digital-glitch` | `glitch_loop` |
| `digital-tick` | `digital_click` |
| `ding-dong` | `chime` |
| `door-close` | `door` |
| `door-slam` | `door` |
| `dread-thud` | `suspense_thud` |
| `dream-riser` | `ethereal_riser` |
| `drop` | `boom` |
| `eating-crunch` | `mc_eat` |
| `electric` | `zap` |
| `energy-charge` | `charge_up` |
| `epic-hit` | `orchestra_hit` |
| `epic-long-build` | `reality_riser` |
| `error-sound` | `error` |
| `fail` | `error` |
| `flanged-whoosh` | `unique_woosh` |
| `flip` | `toggle` |
| `food-chomp` | `mc_eat` |
| `future-whoosh` | `sci_fi_woosh` |
| `game-ui-select` | `game_click` |
| `gear-grind` | `gears` |
| `glass-break` | `glass` |
| `glitch` | `glitch_burst` |
| `gust-whoosh` | `wind_woosh` |
| `hardware-click` | `device_click` |
| `heart-beat` | `heartbeat` |
| `heavy-swoosh` | `deep_woosh` |
| `hi-click` | `digital_click_high` |
| `high-ui-click` | `digital_click_high` |
| `hit` | `impact` |
| `home-open` | `open_home` |
| `hurt-grunt` | `mc_oof` |
| `keyboard-typing` | `typing` |
| `keystrokes` | `typing` |
| `knock` | `thud` |
| `laser-blip` | `laser` |
| `levelup-jingle` | `mc_level_up` |
| `light-whoosh` | `airy_woosh` |
| `lo-click` | `digital_click_low` |
| `long-riser` | `reality_riser` |
| `loot-chest` | `minecraft_chest` |
| `low-boom` | `cinematic_boom` |
| `low-end-hit` | `deep_bass` |
| `low-thud` | `suspense_thud` |
| `low-ui-click` | `digital_click_low` |
| `low-whoosh` | `deep_woosh` |
| `lub-dub` | `heartbeat` |
| `machine-riser` | `metallic_riser` |
| `machinery` | `gears` |
| `magic` | `sparkle` |
| `mc-button-click` | `minecraft_click` |
| `mc-chest-open` | `minecraft_chest` |
| `mc-critical-hit` | `mc_crit` |
| `mc-dog-bark` | `dog_bark` |
| `mc-eat` | `mc_eat` |
| `mc-hit` | `mc_hit` |
| `mc-level-up` | `mc_level_up` |
| `mc-oof` | `mc_oof` |
| `mc-sheep` | `sheep_bleat` |
| `menu-open` | `open_home` |
| `menu-select-click` | `game_click` |
| `metal-build` | `metallic_riser` |
| `metal-clang` | `metallic_hit` |
| `metal-strike` | `metallic_hit` |
| `minecraft-damage` | `mc_hit` |
| `minecraft-dog` | `dog_bark` |
| `minecraft-explosion` | `creeper_explode` |
| `minecraft-ui-click` | `minecraft_click` |
| `mobile-typing` | `phone_typing` |
| `mouse-press` | `mouse_click` |
| `nintendo-ding` | `eshop_ding` |
| `notch-click` | `ratchet` |
| `notification-pop` | `pop_up` |
| `odd-whoosh` | `unique_woosh` |
| `ominous-build` | `dark_riser` |
| `ominous-pulse` | `suspense_thud` |
| `oof-sound` | `mc_oof` |
| `orchestral-stab` | `orchestra_hit` |
| `pad-swell` | `swell` |
| `page` | `paper` |
| `page-flip` | `page_turn` |
| `paper-flip` | `page_turn` |
| `paper-rustle` | `paper` |
| `payment-ding` | `pay_ding` |
| `photo-snap` | `flash` |
| `ping` | `sonar_ping` |
| `pixel-ding` | `pokemon_ding` |
| `pokemon-heal-ding` | `pokemon_ding` |
| `pop-sound` | `pop` |
| `power-burst` | `energy_burst` |
| `power-up-charge` | `charge_up` |
| `psych-riser` | `mind_riser` |
| `quick-whoosh` | `short_woosh` |
| `radar-ping` | `sonar_ping` |
| `radio-chirp` | `radio_beep` |
| `rain-sound` | `rain` |
| `rainfall` | `rain` |
| `ratchet-click` | `ratchet` |
| `register-ka-ching` | `cash_register` |
| `repeat-stutter` | `stutter` |
| `reverb-build` | `riser_reverb` |
| `rise` | `swell` |
| `riser-up` | `riser` |
| `room-tone` | `crowd` |
| `rubber` | `bounce` |
| `scan-sweep` | `scan` |
| `sci-fi-swoosh` | `sci_fi_woosh` |
| `section-slam` | `impact_transition` |
| `shatter` | `glass` |
| `sheep-baa` | `sheep_bleat` |
| `shimmer-riser` | `ethereal_riser` |
| `shine` | `shimmer` |
| `shock-burst` | `energy_burst` |
| `shop-ding` | `eshop_ding` |
| `shutter-flash` | `flash` |
| `signal-beep` | `radio_beep` |
| `slam` | `punch` |
| `slam-transition` | `impact_transition` |
| `slow-mo` | `slo_motion` |
| `slowdown-whoosh` | `slo_motion` |
| `soft-click` | `digital_click` |
| `soft-pop` | `ui_pop` |
| `sonar` | `sonar_ping` |
| `sparkle-up` | `shimmer` |
| `stamp-hit` | `stamp` |
| `steel-hit` | `metallic_hit` |
| `steel-riser` | `metallic_riser` |
| `step` | `tick` |
| `steps` | `footsteps` |
| `store-purchase-ding` | `eshop_ding` |
| `stutter` | `glitch_burst` |
| `stutter-glitch` | `stutter` |
| `sub-drop` | `deep_bass` |
| `success-sound` | `success` |
| `suspense-build` | `reality_riser` |
| `sweep` | `whoosh` |
| `swell-riser` | `riser_reverb` |
| `swipe-short` | `short_woosh` |
| `swish` | `whoosh` |
| `swish-down` | `whoosh_down` |
| `switch` | `toggle` |
| `swoosh` | `whoosh` |
| `swoosh-fast` | `short_woosh` |
| `sword-whoosh` | `sword_sling` |
| `tap` | `click` |
| `tech-swoosh` | `sci_fi_woosh` |
| `texting` | `phone_typing` |
| `textured-swoosh` | `unique_woosh` |
| `thought-riser` | `mind_riser` |
| `thump` | `thud` |
| `tick-tock` | `tick` |
| `ticking-clock` | `clock_tick` |
| `till` | `cash_register` |
| `time-warp` | `slo_motion` |
| `tiny-game-pop` | `game_pop` |
| `toggle-click` | `device_click` |
| `touchscreen-typing` | `phone_typing` |
| `trailer-boom` | `cinematic_boom` |
| `transaction-chime` | `pay_ding` |
| `transition-hit` | `impact_transition` |
| `twinkle` | `sparkle` |
| `ui-blip` | `ui_pop` |
| `ui-click` | `digital_click` |
| `ui-popup` | `pop_up` |
| `upward-pop` | `ui_pop` |
| `verdict` | `stamp` |
| `walking` | `footsteps` |
| `warning` | `siren` |
| `warning-sound` | `warning` |
| `water-bubble` | `bubble` |
| `weapon-swish` | `sword_sling` |
| `whoosh-down` | `whoosh_down` |
| `whoosh-up` | `whoosh` |
| `wind-swoosh` | `wind_woosh` |
| `wolf-bark` | `dog_bark` |
| `wrench-click` | `ratchet` |
| `xp-level-up` | `mc_level_up` |
| `zap-sound` | `zap` |
