# orchestra_hit

Brass-and-strings orchestral stab with reverb — a dramatic punchline, epic reveal, mock-cinematic moment.

Moods: serious, tense, playful

Sample (`pack/woosh/orchestra_hit.mp3`, 2.04 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/orchestra hit.mp3`.

## When to use
- epic reveal or dramatic declaration
- mock-cinematic joke punctuation
- title card punch

## When NOT to use
- quick technical explainers — it is deliberately grand
- stacking with other epic hits

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
{ "sound": "orchestra_hit", "when": "beat:reveal", "volume": 0.42 }
