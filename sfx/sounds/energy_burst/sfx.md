# energy_burst

Explosive energy burst with a bright crack and fast decay — a power-up, a sudden blast of motion or light.

Moods: upbeat, tense, playful

Sample (`pack/woosh/energy_burst.mp3`, 2.85 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/energy burst.mp3`.

## When to use
- energy or ability fires
- explosive reveal of a value
- hard-hitting action stinger

## When NOT to use
- calm explainers — it is aggressive
- repeated bursts back to back, becomes fatiguing

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
{ "sound": "energy_burst", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "energy_burst", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
