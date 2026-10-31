# dog_bark

Single chunky Minecraft-style dog bark, blocky and clipped — a dog in gameplay, attention-grabbing pet beat.

Moods: humorous, playful

Sample (`pack/games/dog_bark.mp3`, 0.53 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecrfat dog bark.mp3`.

## When to use
- dog appears or reacts in gameplay
- pet content beat
- sudden comic interruption

## When NOT to use
- meme overuse — a known Minecraft-meme bark, repeated it gets loud and tired
- serious or emotional narration where it undercuts weight

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
{ "sound": "dog_bark", "when": "beat:reveal", "volume": 0.40 }
