# short_woosh

Quick tight whoosh with a clean taper — a fast object swipe, smaller transition, text flipping in.

Moods: neutral, calm, playful

Sample (`pack/woosh/short_woosh.mp3`, 2.26 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/short woosh.wav`.

## When to use
- text or card flips in
- fast element swipe
- quick cut between related shots

## When NOT to use
- big heavy transitions — too small
- on every single cut, becomes mechanical

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
{ "sound": "short_woosh", "when": "beat:reveal", "volume": 0.42 }
