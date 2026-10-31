# deep_bass

Short sub-bass punch with weight, little high end — a claim landing hard, a logo or stat thumping in.

Moods: serious, tense, neutral

Sample (`pack/woosh/deep_bass.mp3`, 1.15 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/deep bass.mp4`.

## When to use
- big stat or number lands
- logo or brand mark appears
- ground-shaking emphasis under a line

## When NOT to use
- on laptop speakers it may vanish — pair with a click
- consecutive uses with no gap

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
{ "sound": "deep_bass", "when": "beat:reveal", "volume": 0.42 }
