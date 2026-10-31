# riser_reverb

Reverb-drenched swell that widens and lifts — a spacious build into a scene change or emotional peak.

Moods: tense, serious, neutral

Sample (`pack/woosh/riser_reverb.mp3`, 4.00 s, mono 44.1 kHz MP3, trimmed from 6.04 s with a fade-out). Imported from the pack: `wooshes, risers, and hits/riser reverb.mp3`.

## When to use
- build into an emotional or dramatic cut
- slow zoom into a landscape
- transition into a big set piece

## When NOT to use
- dialogue-dense passages — the tail washes over speech
- sections that need a clean hard cut

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
{ "sound": "riser_reverb", "when": "beat:reveal", "volume": 0.42 }
{ "sound": "riser_reverb", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
