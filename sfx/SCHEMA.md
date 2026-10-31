# SFX Schema Reference

Short field guide for authoring cues in `scenes.json`. Machine contract:
[`schemas/sfx.schema.json`](../schemas/sfx.schema.json) (sound definitions) and
`definitions.sfxCue` in [`schemas/scenes.schema.json`](../schemas/scenes.schema.json) (cues).

## Cue grammar

```json
{ "sound": "<id or alias>", "when": "<when>", "volume": 0..1, "fade_out": seconds|null, "params": { } }
```

Only `sound` and `when` are required. `volume` null → the sound's `default_volume` from its
`config.json`. `params` values are validated against the sound's param definitions at render.

Sound definitions: `config.json` `backend` is `"sample"` (bundled CC0 asset or imported pack
one-shot under `sfx/assets/`, SHA-256 checked) or `"tone"` (Tone.js/WebAudio recipe at
`sfx/sounds/<id>/recipe.mjs`, `node --check`-validated).
For `tone`, `recipe` is a design name; the implementation file is always
`sfx/sounds/<id>/recipe.mjs` (its sha256 folds into the per-scene `sfx_hash`, so recipe edits
trigger re-renders).

## The volume law

Two laws, selected by the sound's `backend`. Both are anchored to the **measured** voiceover
(`voiceover_aligned.mp3`), never to a static constant, and both write their decisions to
`sfx_levels.json` at mix time.

### Samples (`backend: "sample"`)

The engine measures the voiceover's peak, integrated loudness and local (100 ms) momentary
loudness, then places the sample by its **loudest 400 ms RMS** — the same metric for a 90 ms
click and a 5 s riser:

```
nominal = vo_I + accent_offset + (volume − 0.5) × 10 + level.trim_db + params.gain_db
floor   = max(mask_floor, vo_I − max_below_vo)                          # soft
ceiling = min(sample_peak_ceiling, vo_peak − vo_headroom)               # HARD
target  = max(nominal, floor)        # the mask promise outranks the accent corridor
```

| step | config key (default) | effect |
|---|---|---|
| nominal | `accent_offset_db` (−12) | a cue at `volume: 0.5` sits 12 dB under the narration |
| volume | — | 0.1 ≈ 1 dB; `volume` omitted → the sound's `default_volume` |
| floor | `over_bed_db` (3), `max_below_vo_db` (24) | lifts a cue until it clears the music under it |
| ceiling | `vo_headroom_db` (6), `sample_peak_ceiling_db` (−1) | hard cap; applied last, never overruled |
| clamp | `gain_clamp_db` ([−36, +9]) | sanity bound; flags `gain_ceiling_clamp` / `gain_floor_clamp` |

**The mask test** is what makes "never buried under the BGM" true. It compares the cue and
the music the way the ear does — the cue's own level at an instant against the bed's
sustained level there, over the moments the cue is an event:

```
mask_floor = loudest_400ms + max over event windows of
             ( bed_sustained(t) + over_bed_db − cue_10ms(t) )
```

- `cue_10ms(t)` — the cue's level in a 10 ms window (`mask_hop_seconds`, 0.01). A click's
  transient and a riser's body are both judged at their own scale.
- `bed_sustained(t)` — the music's 400 ms mean level **at that instant**, taken from the
  *ducked* bed: the stitch sidechains the music off the voiceover, so the music the cue
  competes with is the ducked music. The engine renders that exact sidechain
  (`sidechaincompress`, same parameters as `assemble.py`) and measures it, so the floor
  matches the mix instead of a model of it.
- "event windows" — the cue's own moments within `mask_window_db` (12) of its loudest
  10 ms window. A boom's decaying tail is not an event and is not held against the music;
  a riser's body is.

Comparing 400 ms averages on both sides instead would bury every transient — a click's peak
sits 15–28 dB above its own 400 ms average — while comparing the bed's momentary *peak*
instead would let a quiet sustained sound slip under a single hi-hat it never had to fight.

The floor only applies when the cue inherits its sound's `default_volume`. An explicit `volume`
is authorial intent and is honoured — with a `below_floor_explicit_volume` flag, and still under
the peak ceiling. Every plan also reports `masks_voice` when the cue's level comes within
`masking_db` (8) of the narration actually playing under it. "Actually playing" is read from the
voiceover's own fast energy envelope: the ebur128 momentary series is a 400 ms window that lags
the audio, so it reads *silence* while a word is still ringing and *speech* long after the voice
stopped. A cue that lands in a pause between sentences is masking nothing, whatever its level.

Each cue in `sfx_levels.json` records `target_dbfs` (what the law asked for) and
`achieved_dbfs` (where it actually landed after the clamps) — they differ when a hard limit wins:

| flag | meaning |
|---|---|
| `peak_clamped` | the cue's own peak hit the ceiling, so it sits below its loudness target |
| `corridor_conflict` | reaching the bed floor would push the peak over the ceiling (the two promises collide; the ceiling wins) |
| `floor_capped` | the cue needed more than `max_deviation_db` (10) of lift to clear the music; `bed_drop_needed_db` says how far the bed has to come down instead |
| `below_floor_explicit_volume` | an explicit `volume` put the cue under the bed floor (authorial intent) |
| `masks_voice` | the cue lands within `masking_db` of the narration playing under it |
| `gain_ceiling_clamp` / `gain_floor_clamp` | the `gain_clamp_db` sanity bound was hit |

### The audibility guard — where the cue lives, not just how loud it is

Every number above is **broadband**. Broadband loudness cannot tell the difference between a cue
that puts its energy at 40 Hz and one that puts it at 4 kHz, and the listener cannot either:
laptop and phone speakers roll off below ~150 Hz, so a cue whose energy is all under the floor
is *inaudible* however loudly the mix reports it. This is not a theoretical gap — a 5 s
`cinematic_boom` measures 25 dB louder than its music and still cannot be heard on a laptop,
because 99 % of its energy sits below 80 Hz.

So every sample cue is also measured per band, and the plan carries an `audibility` block:

| field | meaning |
|---|---|
| `subsonic_drop_db` | how much of the cue's loudest 400 ms moment disappears when everything below `speaker_hz` (150 Hz) is removed — i.e. how much quieter the cue gets on a small speaker |
| `presence_peak_dbfs` | the cue's loudest 50 ms window inside the presence band (`presence_low_hz` 1000 – `presence_high_hz` 8000) — the band where a cue cuts through a voice |
| `voice_presence_dbfs` | the narration's level in that same band at the cue's instant (its broadband momentary level plus the voice's measured presence offset) |

| flag | meaning |
|---|---|
| `subsonic_asset` | `subsonic_drop_db` > `subsonic_drop_db` (10) — the cue's energy lives below the speaker band, so it is inaudible on laptop and phone speakers. Use an asset with energy above ~200 Hz, or place the cue in a pause and accept it for headphone listeners |
| `masked_by_voice` | the cue's presence peak is more than `mask_margin_db` (8) under the narration's presence level at that instant — it will be swallowed. Move it into a pause between sentences |

Neither flag changes a level: they are the machine saying what it cannot hear. The engine still
levels the cue by the same law — but it refuses to claim a sub-bass cue is "audible" just
because it is 20 dB above the music.

### The bed is levelled against the voiceover

A bed authored at a fixed level lands wherever the TTS happened to land — and when the music
sits only a few dB under the narration, no SFX accent can sit above the music and 12 dB under
the voice at the same time. So the engine levels the bed: `bgm.vo_offset_db` (12) is the
distance between the **voiceover's integrated loudness** and the **bed's loudest 400 ms
moment**. The correction is printed on every mix (`Bed leveled -8.3 dB -> -33.2 dBFS`) and
folded into `sfx_hash`, so changing it re-mixes. Set it to `0` to keep the bed exactly as
authored.

The stitch's sidechain ( `bgm.duck_*` ) then lowers the music further under the speech.

### Tone sounds (`backend: "tone"`)

`gain_db = full_scale_db + (volume − 1) × 10` where `full_scale_db` = −10 (config
`sfx.full_scale_db`), relative to the measured voiceover peak.

| volume | dB rel. measured voiceover peak |
|---|---|
| 1.0 | −10 |
| 0.75 | −12.5 |
| 0.5 | −15 |
| 0.25 | −17.5 |
| 0 | −20 |

### Post-mix assertions

The stitched mix is still checked: true peak ≤ `sfx.true_peak_ceiling_db`, integrated ≤
voiceover + `sfx.integrated_max_offset_db`.

## Sample params

Every `backend: "sample"` sound exposes these without any config boilerplate:

| param | default | meaning |
|---|---|---|
| `duration` | whole file | trim the cue to N seconds; the tail fades over `fade` |
| `fade` | 0.12 | tail fade length (s) when the cue is cut into the material |
| `offset` | 0.0 | skip N seconds into the asset (pick a later hit) |
| `gain_db` | 0.0 | manual nudge after the automatic match |
| `pitch` | 1.0 | speed/pitch factor (2.0 = octave up, half length) |

`sfx/sounds/<id>/config.json` may also carry a `level` block: `mode` (`auto` default, `peak` for
the legacy 0.9 peak normalization), `trim_db` (per-sound offset, e.g. deliberately hotter), and
`measured` (what the importer measured — informational only).

## `when` resolution order

1. `beat:<name>` → look up `<name>` in the scene's `beats[]` (name rule below); error if missing.
2. `start` / `mid` / `end` → 0 / 50% / 100% of the scene's `actual_duration_seconds`.
3. number → absolute seconds from scene start.

## Tail rules

- A cue's sound rings into the next scene by default (generated length ≈ `max_tail_seconds`).
- At **video end**, a cue tail that would outlast the video fades to silence over
  `sfx.tail_fade_seconds` (config) — or the per-cue `fade_out` override.
- `bgm` bed: fades in `bgm.fade_in_seconds` at video start, out `bgm.fade_out_seconds` at end.

## `beats` name rules

`^[a-z][a-z0-9_]*$` — lowercase start, then lowercase/digits/underscore. Mirror the names you
use for timing points in the scene's animation code so `beat:<name>` references never drift.

## Catalog files

- `sfx/sounds/<id>/config.json` — one per sound; validated by [`schemas/sfx.schema.json`](../schemas/sfx.schema.json).
- `sfx/assets/manifest.json` — SHA-256s of every sample file (bundled and `pack/`); the engine refuses mismatches.
- `sfx/assets/pack/<family>/<id>.mp3` — imported one-shots (mono 44.1 kHz).
- `sfx/import/sfx-pack-plan.json` — the import plan (ids, tags, moods, volumes, trims).
- `sfx/CATALOG.md` — generated index (`python3 scripts/sfx_catalog.py --write-catalog-md`).
- `sfx/sounds/<id>/sfx.md` — human/LLM manual: character, when to use/not, params, examples.
- `videos/<title>/sfx_levels.json` — per-cue gain decisions and flags for the last mix.