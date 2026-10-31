# digital_click

Clean mid-pitch digital click, quick and unobtrusive — the default click for buttons and tab switches.

Moods: neutral, calm, playful

Sample (`pack/mechanical/digital_click.mp3`, 0.40 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/short digital click.mp3`.

## When to use
- tab switch in a UI mockup
- button press in an app demo
- generic click-to-next beat

## When NOT to use
- as an impact or reveal
- stacking with other clicks on the same frame

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
{ "sound": "digital_click", "when": "beat:reveal", "volume": 0.45 }
