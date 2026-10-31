# mouse_click

Dry mouse-button click, thin and short — someone clicking through an app, browser or spreadsheet.

Moods: neutral, calm

Sample (`pack/mechanical/mouse_click.mp3`, 0.22 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/mouse click.mp3`.

## When to use
- cursor clicks a link in a screen recording
- app navigation on desktop
- task-by-task software demo

## When NOT to use
- as an impact or emphasis hit
- uncountable repetition without rhythm

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
{ "sound": "mouse_click", "when": "beat:reveal", "volume": 0.48 }
