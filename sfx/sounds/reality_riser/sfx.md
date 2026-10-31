# reality_riser

Long escalating drone that climbs to a wall of noise — a long suspense build into a hard reveal.

Moods: tense, serious

Sample (`pack/woosh/reality_riser.mp3`, 9.00 s, mono 44.1 kHz MP3, trimmed from 12.83 s with a fade-out). Imported from the pack: `wooshes, risers, and hits/reality riser.mp3`.

## When to use
- long build across a montage into a payoff
- sustained suspense under a story beat
- escalation into a climax

## When NOT to use
- short 1-2s transitions — use a short riser
- under important dialogue for the full 14s

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
{ "sound": "reality_riser", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "reality_riser", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
