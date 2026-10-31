# mc_level_up

Minecraft XP level-up chime burst — a rank gained, subscription tier unlocked, progress milestone hit.

Moods: upbeat, playful, neutral

Sample (`pack/games/mc_level_up.mp3`, 3.75 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecraft level up.mp3`.

## When to use
- level or rank increases
- milestone or tier reached
- progress bar completes with reward

## When NOT to use
- serious corporate narration — reads as game-UI/gaming content
- as a sad or neutral outcome

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
{ "sound": "mc_level_up", "when": "beat:reveal", "volume": 0.42 }
{ "sound": "mc_level_up", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
