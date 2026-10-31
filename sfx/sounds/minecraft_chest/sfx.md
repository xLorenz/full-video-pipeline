# minecraft_chest

Minecraft chest creak and open with loot sparkle — a container of goodies revealed, reward unlocked.

Moods: playful, upbeat, neutral

Sample (`pack/games/minecraft_chest.mp3`, 2.40 s, mono 44.1 kHz MP3, trimmed from 5.99 s with a fade-out). Imported from the pack: `video games/minecraft chest open.mp3`.

## When to use
- reward or bonus reveal
- 'here's what's inside' moment
- unlocked package or inventory opens

## When NOT to use
- serious corporate narration — unmistakably gaming content
- before a genuinely dramatic reveal

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
{ "sound": "minecraft_chest", "when": "beat:reveal", "volume": 0.42 }
