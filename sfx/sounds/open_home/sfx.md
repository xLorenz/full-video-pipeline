# open_home

Soft rising app-open swell — a phone screen opens, home menu slides in, app launches.

Moods: playful, neutral, calm

Sample (`pack/games/open_home.mp3`, 1.03 s, mono 44.1 kHz MP3). Imported from the pack: `video games/open home.mp3`.

## When to use
- phone home screen appears
- app launches in a demo
- menu screen slides in

## When NOT to use
- big trailer transitions — it is gentle
- as an impact hit

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
{ "sound": "open_home", "when": "beat:reveal", "volume": 0.40 }
