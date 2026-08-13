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

## The volume law

`gain_db = full_scale_db + (volume − 1) × 10` where `full_scale_db` = −10 (config `sfx.full_scale_db`).

| volume | dB rel. measured voiceover peak |
|---|---|
| 1.0 | −10 |
| 0.75 | −12.5 |
| 0.5 | −15 |
| 0.25 | −17.5 |
| 0 | −20 |

The engine measures the voiceover's real true peak first, then applies this law, then asserts
post-mix loudness (true peak ≤ `sfx.true_peak_ceiling_db`, integrated ≤ voiceover + `sfx.integrated_max_offset_db`).

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
- `sfx/assets/manifest.json` — SHA-256s of the CC0 sample files; the engine refuses mismatches.
- `sfx/sounds/<id>/sfx.md` — human/LLM manual: character, when to use/not, params, examples.