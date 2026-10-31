# pop_up

Round plastic pop as something appears — notification bounces in, tooltip opens, card pops up.

Moods: playful, neutral, upbeat

Sample (`pack/mechanical/pop_up.mp3`, 0.37 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/pop up.mp3`.

## When to use
- notification banner appears
- tooltip or modal opens
- comment or chat bubble lands

## When NOT to use
- serious data reveals — reads cartoonish
- every single element entrance, becomes noisy

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
{ "sound": "pop_up", "when": "beat:reveal", "volume": 0.42 }
