# digital_click_low

Muted low digital click, soft and round — committing an action, confirm button, deeper UI step.

Moods: neutral, serious, calm

Sample (`pack/mechanical/digital_click_low.mp3`, 0.25 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/low digital click.mp3`.

## When to use
- confirm or submit pressed
- deeper menu level opens
- toggle off / dismiss

## When NOT to use
- as the only rhythm in a fast montage — too soft to lead
- bright playful scenes where it feels dull

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
{ "sound": "digital_click_low", "when": "beat:reveal", "volume": 0.50 }
