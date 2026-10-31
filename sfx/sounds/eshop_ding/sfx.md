# eshop_ding

Chirpy Nintendo eShop style purchase chime — buying something in a game or app, store confirmation.

Moods: playful, upbeat, neutral

Sample (`pack/games/eshop_ding.mp3`, 1.64 s, mono 44.1 kHz MP3). Imported from the pack: `video games/eshop ding.mp3`.

## When to use
- in-game or app purchase completes
- store items unlocked
- cute positive confirmation beat

## When NOT to use
- serious financial or B2B content
- as a big impact — it is a light jingle

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
{ "sound": "eshop_ding", "when": "beat:reveal", "volume": 0.42 }
