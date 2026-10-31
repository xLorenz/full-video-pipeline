# mc_oof

The Minecraft 'oof' hurt grunt — someone takes damage or a plan fails comically.

Moods: humorous, playful

Sample (`pack/games/mc_oof.mp3`, 0.37 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecraft oof.mp3`.

## When to use
- character takes a hit in gameplay
- comic failure or mistake beat
- self-deprecating joke punctuation

## When NOT to use
- serious corporate narration — pure game-UI/meme content, a tone error
- meme overuse — instantly dates the edit if repeated

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
{ "sound": "mc_oof", "when": "beat:reveal", "volume": 0.40 }
