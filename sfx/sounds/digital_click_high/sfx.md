# digital_click_high

Tiny bright digital tick with glassy top end — cursor moving, selection snapping, fast UI actions.

Moods: neutral, playful, calm

Sample (`pack/mechanical/digital_click_high.mp3`, 0.27 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/high digital click.mp3`.

## When to use
- element selects in a mockup
- list item highlights
- rapid menu navigation

## When NOT to use
- for heavy or final confirmations
- dense repetition on every on-screen element

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
{ "sound": "digital_click_high", "when": "beat:reveal", "volume": 0.45 }
