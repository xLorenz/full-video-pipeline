# slo_motion

Pitch-dropping time-stretch swirl — speed ramps down into slow motion, or footage drops into a dramatic beat.

Moods: tense, serious, neutral

Sample (`pack/mechanical/slo_motion.mp3`, 2.28 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/slo-motion.mp4`.

## When to use
- speed ramp into slow motion
- moment stretches before impact
- detail reveal in dramatic slow-mo

## When NOT to use
- as a normal transition — it demands a speed change
- comedic timing where the drop feels wrong

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
{ "sound": "slo_motion", "when": "beat:reveal", "volume": 0.40 }
