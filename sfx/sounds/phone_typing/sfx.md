# phone_typing

Soft touchscreen tap-typing bed — someone texting on a phone, search bar filling, message composing.

Moods: neutral, calm, playful

Sample (`pack/mechanical/phone_typing.mp3`, 8.00 s, mono 44.1 kHz MP3, trimmed from 11.23 s with a fade-out). Imported from the pack: `mechanical sfx/phone typing.mp3`.

## When to use
- text message being typed on screen
- search query entered on mobile
- chat conversation unfolds

## When NOT to use
- under dense narration — continuous taps compete
- as a one-shot accent

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
{ "sound": "phone_typing", "when": "beat:reveal", "volume": 0.33 }
{ "sound": "phone_typing", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
