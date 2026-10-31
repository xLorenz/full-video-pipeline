# impact_transition

Hit-and-whoosh combo that slams then sweeps forward — a hard section change with forward momentum.

Moods: serious, tense, neutral

Sample (`pack/woosh/impact_transition.mp3`, 4.19 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/impact transition.mp3`.

## When to use
- chapter or section change
- hard cut into a new topic
- montage beat shift

## When NOT to use
- soft or reflective transitions
- using it on every cut — it shouts

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
{ "sound": "impact_transition", "when": "beat:reveal", "volume": 0.42 }
{ "sound": "impact_transition", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
