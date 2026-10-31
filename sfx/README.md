# SFX & BGM Catalog

The pipeline's **local sound catalog**: every sound is procedurally synthesized, a bundled
CC0 sample, or an imported pack one-shot — no network, no purchases. One engine, two backends:

- `backend: "tone"` — **Tone.js/WebAudio recipes** (`sfx/sounds/<id>/recipe.mjs`), rendered
  offline by the `sfx-render` npm workspace (`node sfx-render/render.js`), bridged from Python
  via `scripts/tone_render.py`. 30 cue sounds run on this engine: the first 22 are 1:1 ports of
  the v2 Python recipes, then `success`, `warning`, `toggle`, `bounce`, `stamp` (skill-informed
  originals) and `page_turn`, `sonar_ping`, `heartbeat`.
   Rendering is **deterministic**: same cue → byte-identical output
  (`sfx_hash` includes each tone recipe's sha256, so recipe edits re-render automatically).
- `backend: "sample"` — 55 imported one-shots under `sfx/assets/pack/` (mechanical, video
  games, wooshes/risers/hits) plus 6 bundled CC0 samples (`rain` itself is procedural). Any
  container works at import (`.mp3`/`.wav`/`.mp4`); everything ships as mono 44.1 kHz MP3.

Narration can never be drowned out because the engine measures the voiceover's real loudness
and level-matches every cue against it (law in [`SCHEMA.md`](./SCHEMA.md)); every mix writes
`sfx_levels.json` with the per-cue gain decisions.

`CATALOG.md` is generated from the configs — run `python3 scripts/sfx_catalog.py
--write-catalog-md` after editing any sound definition.

## How scenes reference sounds

Write cues into `scenes.json` at Step 8, timed against the `beats` you defined in the scene code:

```json
{ "sound": "whoosh", "when": "beat:cards_in", "volume": 0.5 }
{ "sound": "impact", "when": "end", "volume": 0.8, "params": { "pitch": 1.5 } }
```

- `sound` — catalog id or alias (full list in [`CATALOG.md`](./CATALOG.md)).
- `when` — `start` | `mid` | `end` | `beat:<name>` | seconds from scene start.

## Moods & the tone rule

Every sound carries a `moods` array — the scene moods it fits (`neutral` fits everything).
Validation warns when a cue's moods do not intersect the scene/video mood. **If you cannot
justify a sound's character against the mood, don't use it.**

This is **not a meme library**: comic/exclamation sounds are intentionally absent. The
`remotion-best-practices` submodule's `rules/sfx.md` (meme sounds) is superseded by this
catalog and is **not loaded** in Phase 3 briefs.

## The volume knob

Two laws, one promise: a cue is audible and never out-shouts the narration.

- **Samples** are loudness-matched at mix time: the engine measures the voiceover's integrated
  loudness and its local level under each cue, then places the sample's loudest 400 ms at
  `voiceover + accent_offset −12 dB`. A cue is then lifted until it clears the music under it
  (the *ducked* bed, measured with the stitch's own sidechain), and hard-capped 6 dB under the
  voiceover peak. `volume` sets relative prominence (`0.5` = nominal, each 0.1 ≈ 1 dB).
- **Tone sounds** keep their designed absolute level, scaled by `volume`
  (`gain = −10 + (volume − 1) × 10`, relative to the measured voiceover peak).
- The **bed is levelled against the voiceover** (`bgm.vo_offset_db`, 12 dB): the music's loudest
  moment stays that far below the narration, so accents have room to sit above the music *and*
  below the voice. Set it to `0` to keep the bed exactly as authored.
- The engine clamps and asserts post-mix loudness — you cannot accidentally drown the narration.

Per-cue sample shaping without re-importing: `params.duration` (trim to N s, tail fades over
`params.fade`), `params.offset` (skip into a long file), `params.gain_db`, `params.pitch`.

## Pack layout

Imported media lives under `sfx/assets/pack/<family>/<id>.mp3` — one folder per source pack
family, one file per catalog id, all mono 44.1 kHz. Re-import or audit with:

```bash
python3 scripts/import_sfx_pack.py <pack_dir> --plan sfx/import/sfx-pack-plan.json --check
python3 scripts/import_sfx_pack.py <pack_dir> --plan sfx/import/sfx-pack-plan.json --dry-run
```

`--check` reports `ok` / `missing` / `stale` per entry; `--force` re-encodes. The plan file is
the source of truth for ids, tags, moods, default volumes and trim lengths.

## BGM beds

| Track | Moods | Tempo | Energy | One-line |
|---|---|---|---|---|
| `pulse_light` | neutral, calm, upbeat | 112 bpm | low | Light kick + airy pad — default safe choice |
| `pulse_dark` | serious, tense | 95 bpm | mid | Deep kick + minor pad — serious/tech content |
| `ambient_calm` | calm, serious, neutral | — | none | Drifting chord pad, no percussion — narration-forward |
| `tension_riser` | tense, serious | accelerating | rising | Rising tone + accelerating ticks — countdowns, climaxes |
| `groove_light` | upbeat, playful, neutral | 116 bpm | mid | Upbeat kick + walking bass + bright pad — hopeful/playful content |
| `drone_dark` | serious, tense, calm | — | none | Low evolving drone, no percussion — dark narration-forward bed |
| `neon_drop` | serious, tense, upbeat | 140 bpm | high | Electronic three-part bed — intro/drop once, part 3 loops forever |
| `clear_skies` | playful, upbeat, neutral | 94.5 bpm | mid | Bright piano three-part bed — intro/lift once, part 3 loops forever |
| `quiet_signal` | upbeat, tense, serious | 76 bpm | high | Techno three-part bed — intro/drop once, part 3 loops forever |

Per-scene override: `"bgm": { "track": "ambient_calm", "volume": 0.4 }`. `"bgm": null` inserts
a silence span. Bed continuity is engine-owned: same (track, volume) flows seamlessly across
consecutive scenes; changes blend with an equal-power crossfade; the bed ducks under the
voiceover automatically. `--catalog` preview includes one-loop auditions of every bed at mix
level.

`quiet_signal` is the default **asset bed**: its pre-rendered head (intro + drop + one pass of
part 3) plays once, then the final part-3 pass loops forever. `clear_skies` (bright piano) and
`neon_drop` (140 bpm electronic) work the same way. An intervening bed or `null` pauses a bed's
playhead; a later re-entry resumes inside the loop instead of restarting the intro. The catalog
preview auditions the loop region; the full transition is heard in the video mix.

## Adding a BGM bed

1. Render a lossless, loop-ready mono 44.1 kHz WAV and place it at `assets/bgm/<id>.wav`.
   `sfx-render/bgm/neon-drop/` and `sfx-render/bgm/clear-skies/` are the reference builds
   (`<id>.js` + `render.mjs`): head rendered once, loop pass taken from the steady-state
   tail, mono, peak −1 dBFS. They need `npm i --no-save playwright-core` plus a
   Chromium/Chrome/Edge install (`CHROME_PATH` overrides detection). `clear-skies/` also
   vendors its piano samples (`node fetch-samples.mjs`, once) so re-renders are offline.
2. Register the bed in `scripts/sfx_catalog.py:BGM_TRACKS` with `asset`,
   `loop_start_seconds`, `loop_end_seconds`, `bpm`, `moods`, and `energy`; add the WAV's
   SHA-256 to `assets/manifest.json`; bump `CATALOG_VERSION`.
3. Optional: add a description to `export_sfx_preview.py`'s `bgm_meta`.

The head before `loop_start_seconds` plays once; `[loop_start, loop_end)` tiles forever.

## Aliases

`CATALOG.md` lists every alias. Typos get "did you mean" errors from the engine.

## Adding a sound

**Imported media (the fast path).** Add an entry to `sfx/import/sfx-pack-plan.json`
(`source`, `id`, `family`, `aliases`, `tags`, `moods`, `default_volume`, `description`,
`use`, `avoid`, optional `max_seconds`/`fade_out`) and run the importer:

```bash
python3 scripts/import_sfx_pack.py <pack_dir> --plan sfx/import/sfx-pack-plan.json --only <id>
```

It transcodes (mono 44.1 kHz MP3), strips leading silence, trims with a fade, peak-limits to
−1 dBFS, measures the result, writes `config.json` + `sfx.md`, updates `manifest.json` and
regenerates `CATALOG.md`. Never hand-edit `assets/manifest.json` hashes.

**Synthesized from scratch.**

1. Create `sounds/<id>/config.json` + `sounds/<id>/sfx.md` (mirror an existing pair).
2. Engine: `"backend": "tone"` needs `sounds/<id>/recipe.mjs` exporting `duration` and
   `export default async (Tone, { rng, params, duration, destination, sr }) => {}`. Determinism
   rules: randomness comes from the injected `rng` only; bake dense/stochastic material into
   seeded `Float32Array`s via the helpers in `sfx-render/lib/rng.js` (`noiseArray`,
   `bufferSource`, `onepoleLP/HP`, `onepoleLPSweep`, `sineSweep`, `envAttack/Decay`, `fadeOut`)
   — never `Tone.Noise` (process-level cache breaks per-job RNG) and never long
   `setValueCurveAtTime` curves (tone schedules one ramp event per curve point).
3. When porting from a human-supplied reference, use the analysis-assisted flow first
   (§2.10 of the implementation plan; `node skills/ui-sound-design/tools/analyze-sound.mjs`).

**Both paths:** validate the catalog (`python3 scripts/validate.py <any-video-dir>
--validate-sfx`; tone recipes get `node --check`), bump `CATALOG_VERSION` in
`scripts/sfx_catalog.py` if the mix of *existing* sounds changed, then regenerate the dial-in
preview: `python3 scripts/export_sfx_preview.py --catalog`.

> Attribution: procedural parameters for the click/pop/sweep/bell/error sound families are
> seeded from the MIT-licensed `ui-sound-design` skill in this repo (`skills/ui-sound-design`).
> Sample assets are CC0 — provenance in [`assets/LICENSE.md`](./assets/LICENSE.md).