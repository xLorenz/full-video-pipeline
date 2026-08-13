# glitch_burst

Digital stutter burst, ~0.4s: a rapid sequence of sliced noise / tone fragments with
randomized cut points. The signature sound of glitch-rip and VHS treatments.

Moods: glitch, tense, playful, neutral

## When to use
- visual glitch moments (glitch-rip / VHS templates)  →  when: "beat:glitch"
- corrupted-data moments ("deleted", "hacked")
- signal-loss accents

## When NOT to use
- in clean, non-glitchy visuals — a glitch burst with no glitch on screen is a tone error; validation will warn
- more than 2 per scene (it is deliberately harsh)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (0.7 = chunkier, lower stutter) |

## Examples
{ "sound": "glitch_burst", "when": "beat:glitch", "volume": 0.45 }