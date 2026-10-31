# device_click

Soft plastic hardware click with slight body — pressing a physical button, switch or remote on screen.

Moods: neutral, calm

Sample (`pack/mechanical/device_click.mp3`, 0.78 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/click.mp3`.

## When to use
- toggle flips in a product demo
- physical button press
- remote or switch actuates

## When NOT to use
- punchy comedic emphasis — it is quiet and dry
- rhythmic repetition that turns into ticking

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
{ "sound": "device_click", "when": "beat:reveal", "volume": 0.50 }
