# airy_woosh

Breathy airy whoosh with soft highs — a light swipe between scenes, a title drifting in.

Moods: calm, neutral, serious

Sample (`pack/woosh/airy_woosh.mp3`, 1.80 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/airy woosh.wav`.

## When to use
- scene or slide swipe
- text floats onto screen
- soft object pass across frame

## When NOT to use
- heavy action transitions — it has no weight
- on every cut, becomes a nervous tic

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
{ "sound": "airy_woosh", "when": "beat:reveal", "volume": 0.40 }
