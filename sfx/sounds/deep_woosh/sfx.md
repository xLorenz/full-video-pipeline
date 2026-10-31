# deep_woosh

Long low cinematic whoosh with a dark tail — a heavy camera move, big scene change.

Moods: serious, tense, neutral

Sample (`pack/woosh/deep_woosh.mp3`, 3.20 s, mono 44.1 kHz MP3, trimmed from 7.59 s with a fade-out). Imported from the pack: `wooshes, risers, and hits/deep woosh.mp3`.

## When to use
- weighty scene transition
- camera whips past a large subject
- dramatic zoom or push-in

## When NOT to use
- fast snappy cuts — it takes seconds to resolve
- under quiet dialogue without ducking

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
{ "sound": "deep_woosh", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "deep_woosh", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
