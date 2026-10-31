# stutter

Rapid stuttered repeat with digital grit — audio or video caught buffering, a beat getting stuck.

Moods: glitch, humorous, tense

Sample (`pack/mechanical/stutter.mp3`, 1.07 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/stutter.mp3`.

## When to use
- clip freezes and stutters
- text repeats for comic emphasis
- system buffering or lagging

## When NOT to use
- polished corporate tone
- more than once per video — the joke wears out

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
{ "sound": "stutter", "when": "beat:reveal", "volume": 0.40 }
