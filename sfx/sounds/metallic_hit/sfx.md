# metallic_hit

Ringing metallic clang with a long shimmer — metal striking metal, an industrial or mechanical impact.

Moods: serious, tense, neutral

Sample (`pack/woosh/metallic_hit.mp3`, 2.24 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/metallic hit.mp4`.

## When to use
- metal object struck or dropped
- industrial or factory imagery
- harsh 'that hurt' accent

## When NOT to use
- warm human-centered storytelling
- pairing with soft UI sounds in one beat

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
{ "sound": "metallic_hit", "when": "beat:reveal", "volume": 0.42 }
