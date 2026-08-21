# SFX & BGM Design — the agent playbook

How to give the video sound that a) links to the visuals, b) never buries the voiceover,
c) never fights the tone. You cannot listen — so these rules + the machine checks replace
your ears.

## Engine note (catalog v5)
All 27 cue sounds render on the Tone.js/WebAudio engine (`backend: "tone"`); the Python
synth engine is removed. The first 22 recipes are 1:1 ports of the v2 designs (success,
warning, toggle, bounce, stamp are skill-informed originals).
Design intent, cue grammar, params and the volume law are UNCHANGED.
Rendering is deterministic: same cue, same seed, byte-identical output.

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
  - `volume`: 0..1; 1.0 ≈ 10 dB below the loudest measured voiceover peak, 0.5 ≈ 15 dB.
    Omit it to use the sound's default.
  - `params`: per-sound (e.g. `pitch`) — see the sound's `sfx.md`.
- `bgm` per scene: {track, volume} | null (silence). Missing key → global default bed.

## Choosing sounds
1. Open `sfx/CATALOG.md`, filter by tag (transition / impact / ui / organic / ...).
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

## BGM
- Default `pulse_light` is safe in any tone. `tension_riser`/`pulse_dark` only for
  tense/serious content. `ambient_calm` when the voiceover must dominate.
- The bed ducks under the voiceover automatically (sidechain). `null` per scene = silence
  there; use it for hard-hitting beats.
- Repeated (track, volume) flows seamlessly across scene boundaries — the engine carries
  the loop, you never hear a cut between those scenes.
- Changing track/volume: the engine blends with a 0.5 s equal-power crossfade
  (`bgm.crossfade_seconds`); a `null` gap silences both sides without blending.
- The bed fades in at video start and out at video end automatically — never script fades.

## Anti-patterns (banned)
- Meme/exclamation sounds (vine-boom, wilhelm-scream, etc.) — this catalog intentionally
  has none; the remotion submodule's `rules/sfx.md` (a meme list) is superseded and not loaded.
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
gain_db = full_scale_db + (volume − 1) × 10, all relative to the measured voiceover peak;
beds sit at bed_db (−12 dB) + the same law. Post-mix asserts: true peak ≤ −1 dBFS, integrated
≤ voiceover + 1.5 LUFS.