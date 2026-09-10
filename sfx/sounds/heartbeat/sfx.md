# heartbeat

Low lub-dub, ~0.7s: a strong 68 Hz thump answered by a weaker 58 Hz thump 0.26 s later, with a soft strike click.
Countdowns, medical beats, tension pulses under narration, "time is running out" moments.

Moods: tense, serious

## When to use
- countdown / deadline beats                    →  when: "beat:countdown"
- medical / survival story moments
- a low pulse under a tense montage (1-2 uses max)

## When NOT to use
- calm / playful videos — the pulse reads as dread
- more than twice per video (it dominates fast)
- as a music bed — that is `pulse_dark` / `drone_dark`

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (resample; higher = smaller heart, more urgent) |

## Examples
{ "sound": "heartbeat", "when": "beat:countdown", "volume": 0.45 }
