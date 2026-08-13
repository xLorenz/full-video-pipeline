# SFX & BGM Catalog

The pipeline's **local sound catalog**: every sound is procedurally synthesized or a bundled
CC0 sample — no network, no purchases, no attribution needed. Two synth engines exist:

- `backend: "synth"` — stdlib-only Python DSP, implemented in `scripts/generate_sfx.py`
  (`RECIPE_FUNCS`). The original engine.
- `backend: "tone"` — **Tone.js/WebAudio recipes** (`sfx/sounds/<id>/recipe.mjs`), rendered
  offline by the `sfx-render` npm workspace (`node sfx-render/render.js`), bridged from Python
  via `scripts/tone_render.py`. Batch-1 sounds (click, pop, zap, whoosh, whoosh_down, riser,
  error, glitch_burst, sparkle, shimmer) run on this engine; designs are 1:1 ports of their
  v2 Python recipes. Rendering is **deterministic**: same cue → byte-identical output
  (`sfx_hash` includes each tone recipe's sha256, so recipe edits re-render automatically).

Narration can never be drowned out because the engine measures the voiceover's real loudness
and applies a fixed dB gain law (see [`SCHEMA.md`](./SCHEMA.md)).

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

## The 0..1 volume knob

- `volume: 1.0` sits at ~10 dB below the loudest measured voiceover peak.
- `volume: 0.5` → −15 dB, `volume: 0.0` → −20 dB (exact law in [`SCHEMA.md`](./SCHEMA.md)).
- The engine clamps and asserts post-mix loudness — you cannot accidentally drown the narration.

## BGM beds

| Track | Moods | Tempo | Energy | One-line |
|---|---|---|---|---|
| `pulse_light` | neutral, calm, upbeat | 112 bpm | low | Light kick + airy pad — default safe choice |
| `pulse_dark` | serious, tense | 95 bpm | mid | Deep kick + minor pad — serious/tech content |
| `ambient_calm` | calm, serious, neutral | — | none | Drifting chord pad, no percussion — narration-forward |
| `tension_riser` | tense, serious | accelerating | rising | Rising tone + accelerating ticks — countdowns, climaxes |

Per-scene override: `"bgm": { "track": "ambient_calm", "volume": 0.4 }`. `"bgm": null` inserts
a silence span. Bed continuity is engine-owned: same (track, volume) flows seamlessly across
consecutive scenes; changes blend with an equal-power crossfade; the bed ducks under the
voiceover automatically.

## Aliases

`CATALOG.md` lists every alias. Typos get "did you mean" errors from the engine.

## Adding a sound

1. Create `sounds/<id>/config.json` + `sounds/<id>/sfx.md` (mirror an existing pair).
2. Engine: `"backend": "tone"` needs `sounds/<id>/recipe.mjs` exporting `duration` and
   `export default async (Tone, { rng, params, duration, destination, sr }) => {}`. Determinism
   rules: randomness comes from the injected `rng` only; bake dense/stochastic material into
   seeded `Float32Array`s via the helpers in `sfx-render/lib/rng.js` (`noiseArray`,
   `bufferSource`, `onepoleLP/HP`, `onepoleLPSweep`, `sineSweep`, `envAttack/Decay`, `fadeOut`)
   — never `Tone.Noise` (process-level cache breaks per-job RNG) and never long
   `setValueCurveAtTime` curves (tone schedules one ramp event per curve point).
   `"backend": "synth"` needs a recipe function registered in `scripts/generate_sfx.py`.
3. Validate the catalog: `python3 scripts/validate.py <any-video-dir> --validate-sfx`
   (tone recipes get `node --check`).
4. Bump `CATALOG_VERSION` in `scripts/sfx_catalog.py`; regenerate the dial-in preview:
   `python3 scripts/export_sfx_preview.py --catalog`.
4. When porting from a human-supplied reference, use the analysis-assisted flow first
   (§2.10 of the implementation plan; `node skills/ui-sound-design/tools/analyze-sound.mjs`).

> Attribution: procedural parameters for the click/pop/sweep/bell/error sound families are
> seeded from the MIT-licensed `ui-sound-design` skill in this repo (`skills/ui-sound-design`).
> Sample assets are CC0 — provenance in [`assets/LICENSE.md`](./assets/LICENSE.md).