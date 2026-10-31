# pokemon_ding

Retro chiptune two-note ding — stat restored, correct answer, item obtained in a pokemon-style beat.

Moods: playful, upbeat, neutral

Sample (`pack/games/pokemon_ding.mp3`, 0.89 s, mono 44.1 kHz MP3). Imported from the pack: `video games/pokemon ding.mp3`.

## When to use
- HP or stat fully restored
- correct answer revealed
- collectible obtained

## When NOT to use
- modern premium product demos — reads chiptune-nostalgic
- serious tone overall

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
{ "sound": "pokemon_ding", "when": "beat:reveal", "volume": 0.45 }
