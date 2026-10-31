# sheep_bleat

Warbly Minecraft-style sheep baa — a farm animal in gameplay, a silly animal-noise beat.

Moods: humorous, playful

Sample (`pack/games/sheep_bleat.mp3`, 0.91 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecrfat sheep.mp3`.

## When to use
- sheep or farm animal on screen
- silly animal gag
- lighthearted gameplay moment

## When NOT to use
- serious narrator tone — the warble reads comic
- alongside other animal/character noises at once

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
{ "sound": "sheep_bleat", "when": "beat:reveal", "volume": 0.42 }
