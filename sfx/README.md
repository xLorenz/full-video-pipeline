# SFX & BGM Catalog

The pipeline's **local sound catalog**: every sound is procedurally synthesized (stdlib-only
Python at render time) or a bundled CC0 sample. No network, no purchases, no attribution
needed — narration can never be drowned out because the engine measures the voiceover's real
loudness and applies a fixed dB gain law (see [`SCHEMA.md`](./SCHEMA.md)).

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
2. Validate the catalog: `python3 scripts/validate.py <any-video-dir> --validate-sfx`.
3. Bump `CATALOG_VERSION` in `scripts/sfx_catalog.py`.
4. When porting from a human-supplied reference, use the analysis-assisted flow first
   (§2.10 of the implementation plan; `node skills/ui-sound-design/tools/analyze-sound.mjs`).

> Attribution: procedural parameters for the click/pop/sweep/bell/error sound families are
> seeded from the MIT-licensed `ui-sound-design` skill in this repo (`skills/ui-sound-design`).
> Sample assets are CC0 — provenance in [`assets/LICENSE.md`](./assets/LICENSE.md).