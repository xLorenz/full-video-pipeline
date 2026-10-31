# game_click

Chunky console menu select click with a bright ping — picking an option in a game menu or app.

Moods: playful, neutral, upbeat

Sample (`pack/games/game_click.mp3`, 0.69 s, mono 44.1 kHz MP3). Imported from the pack: `video games/game click.mp3`.

## When to use
- menu option selected in a game
- character or level picked
- selection confirms on a stylized UI

## When NOT to use
- serious enterprise software demos
- dense repetition in a fast menu run

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
{ "sound": "game_click", "when": "beat:reveal", "volume": 0.45 }
