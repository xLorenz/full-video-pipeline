# SFX & BGM Design — the agent playbook

How to give the video sound that a) links to the visuals, b) never buries the voiceover,
c) never fights the tone. You cannot listen — so these rules + the machine checks replace
your ears.

## Engine note (catalog v11)
91 sounds across two backends: 30 cue sounds render on the Tone.js/WebAudio
engine (`backend: "tone"`, one batched `node` invocation, seeded per cue);
61 ship as sample files (`backend: "sample"`, decoded via ffmpeg) - 6 bundled
CC0 ones plus 55 imported pack one-shots (mechanical / video games / wooshes,
risers and hits).
Both backends are level-matched against the measured voiceover at mix time, so
`volume` sets relative prominence and the engine guarantees you never bury the
narration. The 9 BGM beds (`quiet_signal`, `clear_skies`, `pulse_light`, `pulse_dark`, `ambient_calm`,
`tension_riser`, `groove_light`, `drone_dark`, `neon_drop`)
render from compact Python loops, except `quiet_signal`, `clear_skies` and `neon_drop` -
pre-rendered asset beds with a head and a looping tail (`generate_sfx.py`).
Tone rendering is deterministic: same cue, same seed, byte-identical output.
`sfx/CATALOG.md` is the generated, always-current list - never hard-code sound
names from memory.

## The three rules
1. **Sound follows visuals.** Every cue should answer "what is on screen at this moment?".
   The whoosh belongs to the card sliding in, not to "the middle of the scene".
2. **Narration is king.** The voiceover is the retention engine. Cues accent it; they never
   compete with it. The engine guarantees levels — your job is restraint in cue COUNT.
3. **If you cannot justify the character, don't use it.** Moods are checked; taste is yours.

## The data model (quick reference)
- `beats` — named timing points mirroring your `interpolate()` frames. Time = seconds from
  scene start = `frame / fps`.
- `sfx` cue — {sound, when, volume?, params?, fade_out?}
  - `when`: "start" | "mid" | "end" | "beat:<name>" | <seconds>
  - `volume`: 0..1 sets relative prominence. For samples: 0.5 = the nominal
    accent (12 dB under the narration), each 0.1 ≈ 1 dB. For tone sounds:
    1.0 ≈ 10 dB below the measured voiceover peak. Omit it to use the sound's
    `default_volume` — omitting is what lets the engine lift the cue above the bed.
  - `params`: sample sounds take `duration` (trim to N s), `fade` (tail fade
    when trimmed), `offset` (skip into the file), `gain_db`, `pitch`; tone
    sounds document their own params in `sfx.md`.
    `{"params": {"duration": 1.5, "fade": 0.3}}` is how you stop a 9 s riser
    from running over the next two beats.
- `bgm` per scene: {track, volume} | null (silence). Missing key → global default bed.

## Choosing sounds
1. Open `sfx/CATALOG.md`, filter by tag (transition / impact / ui / organic / ...).
   It is generated: 91 sounds, grouped `tone` (synthesized) and `sample` (bundled +
   imported pack families: mechanical, games, wooshes/risers/hits).
2. Read the sound's `sfx.md` — its Moods line and its "When NOT to use" section.
3. Mood rule: the sound's moods must intersect the video's `style.mood` (or the scene's
   `mood` override). `neutral` fits everywhere. A clash is a WARNING, not an error — the
   warning exists because you cannot hear the mismatch.
4. Glitch is a visual-treatment mood, not a content mood — scenes never carry it. The
   glitch sounds (`zap`, `laser`, `glitch_burst`, `scan`) all include `neutral`, so they
   don't warn in neutral videos; use them freely with glitch-templated visuals (glitch-rip
   / VHS / scan templates). When the video mood is non-neutral and none of a glitch
   sound's moods match, the warning is real signal — pick `scan` or justify per rule 3.

## Timing discipline
- Prefer `beat:<name>` over seconds — `{"sound": "whoosh", "when": "beat:cards_in"}` follows the
  cards_in beat wherever it moves. One beats edit re-times every cue on it.
- Cues near a scene's end ring into the next scene — that is the intended behavior; use it
  for transition sounds. A cue at "end" of the FINAL scene is inaudible — don't write it.
- 1-3 cues per scene is plenty. A scene with 6+ cues is clutter, not design.
- Impact family (`boom`, `impact`, `stamp`, `zap`, `punch`, and the sample hits
  `cinematic_boom`, `suspense_thud`, `energy_burst`, `deep_bass`, `orchestra_hit`) is
  transient-hot: cap explicit cue volumes at 0.5, prefer 0.4-0.45. Never write 0.6+ —
  a hit that lands as loud as a spoken word stops being an accent. Softer accents
  (`swell`, `whoosh`, `tick`, `digital_click`) may use up to 0.5.
- Long sample risers (`reality_riser` 9 s, `ethereal_riser` 5.4 s, `impact_transition`
  4.2 s) are trimmed at import, but still trim per cue when they would cross a beat:
  `{"params": {"duration": 2.5, "fade": 0.4}}`.
- Continuous bed-textures (`rain`, `crowd`, `typing`, `phone_typing`, `clock_tick`,
  `glitch_loop`, `wind_woosh`) carry seconds of uninterrupted energy — keep them at
  0.2-0.3 and never stack two of them in one scene.

## BGM
- Default `quiet_signal` is the shipped bed: a 76 bpm techno track whose intro + drop play
  once, then part 3 loops forever — driving and theatrical, for epic/energetic content.
  `clear_skies` is the bright, playful piano bed (happy, a bit childlike) and `neon_drop`
  the high-energy electronic one; all three use the same head-then-loop shape.
  `pulse_light` is the safe, neutral alternative;
  `tension_riser`/`pulse_dark` only for tense/serious content. `ambient_calm` when the
  voiceover must dominate. `groove_light` for hopeful/playful stretches, `drone_dark`
  for a dark bed that stays out of the narration's way.
- Asset beds (`quiet_signal`, `clear_skies`, `neon_drop`) keep their loop place: a scene with
  another bed (or `null`) pauses its playhead, and a later scene that returns to it resumes
  inside part 3 — it never replays the intro. The same-track volume change stays
  phase-continuous.
- The bed ducks under the voiceover automatically (sidechain). `null` per scene = silence
  there; use it for hard-hitting beats. There is no voiceover to duck under in a
  silent scene, so the bed plays there at full `bed_db` — set its volume deliberately.
- The bed is also levelled against the voiceover: its loudest moment sits `bgm.vo_offset_db`
  (12 dB) below the narration's integrated loudness, whatever the TTS level turned out to be.
  That is what leaves room for accents between the music and the voice. If a mix reports
  `floor_capped`, the bed is the thing to move (that scene's `bgm.volume`, or `vo_offset_db`),
  not the cue.
- Repeated (track, volume) flows seamlessly across scene boundaries — the engine carries
  the loop, you never hear a cut between those scenes.
- Changing track/volume: the engine blends with a 0.5 s equal-power crossfade
  (`bgm.crossfade_seconds`); a `null` gap silences both sides without blending.
- `tension_riser` peaks at its loop end by design — cap its per-scene volume at
  0.35 (0.3 typical) or its climax will ride over the voiceover. Other beds may use
  up to 0.6-0.75. (The engine also applies a global `bgm.track_trim` to
  `tension_riser` (−5 dB) and `neon_drop` (−5 dB): both are dense and measure hotter than
  the pulse beds at equal volume. `clear_skies` needs −2 dB and `quiet_signal` +1.5 dB —
  both were measured against `neon_drop` at the same peak. Don't "compensate" by raising the
  cue volume.)
- The bed fades in at video start and out at video end automatically — never script fades.

## Anti-patterns (banned)
- Meme/exclamation sounds (vine-boom, wilhelm-scream, etc.) — this catalog intentionally
  has none; the remotion submodule's `rules/sfx.md` (a meme list) is superseded and not loaded.
- Game-meme one-shots (`mc_oof`, `creeper_explode`, `dog_bark`, `game_pop`) in serious or
  corporate narration — they are catalogued for gaming/playful content only. Their `sfx.md`
  says so; validation warns on the mood clash. Never use them as a "funny" punctuation.
- Comic sounds in serious videos (sparkle/error/siren misuse) — validation warns; heed it.
- Cues without a visual hook ("just to fill silence").
- Cue spam to "make it dynamic" — dynamics come from script/visual pacing.

## Verifying without ears
- `python3 pipeline.py sfx <title> --preview` → `sfx_preview.mp3` (have a human spot-listen
  if unsure) + `sfx_preview.png` — waveform with scene boundaries and red cue markers.
  Check: cues sit on their beats, nothing overlaps a boundary you didn't intend, tails exist.
- `python3 pipeline.py validate <title> --step 8` → errors block, warnings inform.

## Tuning with words (vocabulary bridge)

You cannot hear a cue, but a human can — and their feedback arrives in words. Map it to
`params` with this bridge (adapted from the MIT-licensed `ui-sound-design` skill in this repo):

| Human says | Param change |
|---|---|
| "brighter" | raise the sound's pitch / center frequency (e.g. `params.pitch` > 1) |
| "darker" / "warmer" | lower pitch, narrower band (e.g. `params.pitch` < 1) |
| "snappier" | use a shorter built-in envelope (recipe-level — pick the tick/click family) |
| "softer" | lower volume, prefer the calmer family of the same character |
| "louder" | raise volume — 0→1 maps to −20→−10 dB under the voiceover; never above 1.0 |
| "more metallic" | higher FM mod ratio / Q (bell family: ding, chime) |
| "more natural" | prefer an `organic` sample sound over a synth |
| "playful" | raise pitch, pop/sparkle family |
| "shorter / crisper" | shorter param duration where a sound exposes one |

Only override params the sound's `config.json` declares; an unknown param or out-of-bounds
value is a validation error, not a warning.

## Volume law (for the curious — you never compute this)
Samples: the engine measures the voiceover's integrated loudness and its local level under the
cue, then puts the sample's loudest 400 ms at `vo_I + accent_offset (−12 dB)`. A cue is lifted
until it clears the music under it — measured against the *ducked* bed (the engine runs the
stitch's own sidechain and measures the result), comparing the cue's own level with the bed's
sustained level at the same instants, so a click is judged by its transient and a riser by its
body — and hard-capped 6 dB under the voiceover peak. `volume` scales the target
(`0.5` neutral, 0.1 ≈ 1 dB). Tone sounds keep the legacy law:
`gain_db = full_scale_db + (volume − 1) × 10` relative to the measured voiceover peak; beds sit
at `bed_db` + the same law, then get levelled to `bgm.vo_offset_db` (12 dB) below the
voiceover's integrated loudness — the music's loudest moment, not a fixed level, so the accents
always have room. Post-mix asserts: true peak ≤ −1 dBFS, integrated ≤ voiceover +
1.5 LUFS. Every mix writes `sfx_levels.json` (per-cue gain, floor, ceiling, flags).

Every one of those numbers is **broadband**, and broadband loudness is blind to where the cue
lives. A cue whose energy is all under 150 Hz measures loud next to the music and the voice and
is still inaudible on a laptop or phone speaker. So the engine also measures each sample cue per
band and reports an `audibility` block (`subsonic_drop_db`, `presence_peak_dbfs`,
`voice_presence_dbfs`), flagging `subsonic_asset` and `masked_by_voice`. Pick assets with energy
above ~200 Hz for anything the listener must actually hear — the pack's `airy_woosh`,
`sword_sling`, `flash`, `metallic_hit` and `orchestra_hit` all qualify; `cinematic_boom`,
`deep_woosh` and `deep_bass` are sub-bass by design and are honest about it.

### When the mix reports a flag
`sfx_levels.json` (and the console summary) says what happened, cue by cue:

| flag | what to do |
|---|---|
| `floor_capped` | the cue needed a deeper lift than usual to clear the music — `bed_drop_needed_db` says how far the bed has to come down instead (lower that scene's `bgm.volume`, or `bgm.vo_offset_db` globally) |
| `corridor_conflict` | clearing the music would push the cue's peak over the voiceover ceiling — the ceiling wins; pick a less peaky asset or lower the bed |
| `peak_clamped` | the cue's own transient is too tall for the voiceover — it landed below its target; use a different asset or trim it |
| `below_floor_explicit_volume` | your explicit `volume` puts the cue under the music; that is honoured on purpose — raise the volume or lower the bed |
| `masks_voice` | the cue lands within 8 dB of the narration under it — pull the volume down a notch |
| `subsonic_asset` | the cue's energy lives below ~150 Hz: it measures loud next to the music and the voice but is **inaudible on laptop and phone speakers**. Use an asset with energy above ~200 Hz (`airy_woosh`, `sword_sling`, `metallic_hit`, `flash`, `orchestra_hit`), or place it in a pause and accept it for headphone listeners |
| `masked_by_voice` | the cue has no presence-band energy (1-8 kHz) to cut through the narration — move it into a pause between sentences, where the voice is silent |