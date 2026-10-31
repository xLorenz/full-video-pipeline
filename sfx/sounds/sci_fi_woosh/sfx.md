# sci_fi_woosh

Smooth synth whoosh with a futuristic shimmer — a tech interface swiping, futuristic UI panels moving.

Moods: neutral, serious, calm

Sample (`pack/woosh/sci_fi_woosh.mp3`, 1.43 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/soft sci-fi woosh.wav`.

## When to use
- futuristic UI panel slides
- sci-fi or tech product transition
- digital element zips across

## When NOT to use
- warm organic storytelling
- stacking with glitch_loop on the same beat

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
{ "sound": "sci_fi_woosh", "when": "beat:reveal", "volume": 0.40 }
