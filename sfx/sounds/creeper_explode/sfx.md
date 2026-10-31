# creeper_explode

Minecraft creeper hiss into a chunky blocky explosion — an 'uh oh' beat, plan blowing up, sudden chaos.

Moods: humorous, playful, tense

Sample (`pack/games/creeper_explode.mp3`, 3.16 s, mono 44.1 kHz MP3). Imported from the pack: `video games/creeper expode.mp3`.

## When to use
- plan or project spectacularly fails
- sudden comic chaos beat
- gaming-reference punchline

## When NOT to use
- serious corporate narration — reads as game-UI content and breaks tone
- meme overuse — once per video maximum, ideally less

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
{ "sound": "creeper_explode", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "creeper_explode", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
