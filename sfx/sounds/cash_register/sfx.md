# cash_register

Classic ka-ching till with drawer clack — revenue, sale closed, money-on-screen reveals.

Moods: upbeat, playful, neutral

Sample (`pack/mechanical/cash_register.mp3`, 2.71 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/cash register.wav`.

## When to use
- sales or revenue number lands
- price tag or cart total appears
- retro commerce punchline

## When NOT to use
- serious finance analysis — reads as novelty
- repeating per item in a long list

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
{ "sound": "cash_register", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "cash_register", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
