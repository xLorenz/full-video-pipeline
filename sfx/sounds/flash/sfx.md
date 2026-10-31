# flash

Camera flash pop with sharp shutter snap — photo captured, screenshot taken, freeze-frame moment.

Moods: upbeat, playful, neutral

Sample (`pack/mechanical/flash.mp3`, 1.82 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/flash.mp4`.

## When to use
- freeze-frame or photo-snap transition
- screenshot captured on screen
- before/after reveal stinger

## When NOT to use
- as a heavy impact — it is bright and small
- pairing with a flashy white transition on every beat

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
{ "sound": "flash", "when": "beat:reveal", "volume": 0.40 }
