# pay_ding

Bright two-note Apple Pay confirm chime — checkout success, payment accepted, 'transaction complete' beats.

Moods: calm, neutral, playful

Sample (`pack/mechanical/pay_ding.mp3`, 1.45 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/apple pay ding.mp3`.

## When to use
- payment success animation on screen
- small positive confirmation
- wallet or card tap in a UI mockup

## When NOT to use
- as a big milestone — it is a polite chime, not a fanfare
- layering with other success dings

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
{ "sound": "pay_ding", "when": "beat:reveal", "volume": 0.50 }
