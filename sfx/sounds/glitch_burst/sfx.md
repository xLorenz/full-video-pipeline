# glitch_burst

Digital stutter burst, ~0.2s: rapid square-wave micro-blips on quantized pitches with
random dropouts and mid-blip pitch jumps, ending in a bit-crushed noise tail. Corrupted-
file energy, not melodic beeps.

Moods: glitch, tense, playful, neutral

## When to use
- glitch-rip / VHS / corrupted-data templates     when: "beat:glitch"
- a system that "breaks" for a frame
- stutter reveals between takes

## When NOT to use
- in calm/emotional beats (it is harsh by design)
- under narration without a visual glitch to justify it

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (resample) |

## Examples
{ "sound": "glitch_burst", "when": "beat:glitch", "volume": 0.5 }