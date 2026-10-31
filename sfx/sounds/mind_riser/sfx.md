# mind_riser

Warping pitch-bend rise with an eerie sway — a realization forming, a mind racing, a twist approaching.

Moods: tense, serious, neutral

Sample (`pack/woosh/mind_riser.mp3`, 2.35 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/mind riser.mp3`.

## When to use
- realization or twist dawns
- thought or idea forming on screen
- psych-out bass drop beat

## When NOT to use
- straightforward factual segments — it implies weirdness
- comedic tone where the eeriness clashes

## Parameters
Sample playback — the engine matches this sound's loudness to the measured
voiceover automatically, so `volume` sets relative prominence only:

| param | default | meaning |
|---|---|---|
| `duration` | whole file | trim to N seconds (tail fades over `fade`) |
| `fade` | 0.12 | tail fade length in seconds when trimmed |
| `offset` | 0.0 | skip N seconds in (pick a later hit) |
| `gain_db` | 0.0 | manual level nudge after matching |
| `pitch` | 1.0 | playback speed/pitch factor (2.0 = octave up, half length) |

## Examples
{ "sound": "mind_riser", "when": "beat:reveal", "volume": 0.42 }
