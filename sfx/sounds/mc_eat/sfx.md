# mc_eat

Minecraft eating crunch, chompy and cartoonish — someone eats or drinks on screen, food gags.

Moods: humorous, playful, neutral

Sample (`pack/games/mc_eat.mp3`, 1.60 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecraft eat.mp3`.

## When to use
- character eats or drinks
- food or snack content beat
- comic 'consuming' gag

## When NOT to use
- serious corporate narration — reads as game-UI/gaming content
- food advertising where it sounds crude

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
{ "sound": "mc_eat", "when": "beat:reveal", "volume": 0.38 }
