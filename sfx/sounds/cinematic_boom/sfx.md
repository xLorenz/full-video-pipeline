# cinematic_boom

Deep sub-heavy cinematic boom with long tail — title cards, hard cuts, trailer-style reveals.

Moods: serious, tense, neutral

Sample (`pack/mechanical/cinematic_boom.mp3`, 5.00 s, mono 44.1 kHz MP3, trimmed from 6.03 s with a fade-out). Imported from the pack: `mechanical sfx/cinematic boom.mp3`.

## When to use
- chapter title smashes in
- hard cut to a new section
- reveal of a big claim

## When NOT to use
- under intimate or quiet storytelling
- stacking two booms within a second

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
{ "sound": "cinematic_boom", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "cinematic_boom", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
