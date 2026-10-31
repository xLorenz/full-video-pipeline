# minecraft_click

Wooden Minecraft UI button clunk — a menu option pressed in blocky game-style graphics.

Moods: playful, neutral, humorous

Sample (`pack/games/minecraft_click.mp3`, 0.32 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecraft button click.mp3`.

## When to use
- option selected in a Minecraft-style menu
- blocky UI button pressed
- retro game menu navigation

## When NOT to use
- serious corporate narration — reads as gaming content and clashes
- layering with other game clicks

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
{ "sound": "minecraft_click", "when": "beat:reveal", "volume": 0.55 }
