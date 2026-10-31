# dark_riser

Low ominous build that swells in pitch and volume — approaching threat, reveal of a problem, pre-drop tension.

Moods: tense, serious

Sample (`pack/woosh/dark_riser.mp3`, 3.42 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/dark riser.wav`.

## When to use
- problem or threat introduced
- build to a reveal or drop
- tension rises before a stat lands

## When NOT to use
- light or upbeat segments — it darkens everything
- running past the cut with no payoff

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
{ "sound": "dark_riser", "when": "beat:reveal", "volume": 0.42 }
{ "sound": "dark_riser", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
