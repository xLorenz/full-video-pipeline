# game_pop

Ultra-short bubbly pop blip — a counter increments, a coin or point collected on screen.

Moods: playful, humorous, neutral

Sample (`pack/games/game_pop.mp3`, 0.09 s, mono 44.1 kHz MP3). Imported from the pack: `video games/game pop.mp3`.

## When to use
- score or coin counter increments
- small item collected
- fast comic beat between cuts

## When NOT to use
- as a full sound moment — it is 90ms long
- sole punctuation for a big reveal

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
{ "sound": "game_pop", "when": "beat:reveal", "volume": 0.45 }
