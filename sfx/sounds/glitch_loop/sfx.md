# glitch_loop

Stuttering digital corruption bed with bitcrushed snaps — screen tearing, broken data, system failure visuals.

Moods: glitch, tense, neutral

Sample (`pack/mechanical/glitch_loop.mp3`, 3.98 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/glitch.mp3`.

## When to use
- text or image corrupts on screen
- error state or crash visual
- reality-glitch transition beat

## When NOT to use
- clean corporate explainers — reads as malfunction
- under voiceover without ducking the mids

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
{ "sound": "glitch_loop", "when": "beat:reveal", "volume": 0.30 }
{ "sound": "glitch_loop", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
