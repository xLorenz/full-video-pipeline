# punch

Sharp mid transient, ~0.15s: a fast pitch-dropping sine with a noise click on top. Words that
hit, beats that land, kinetic typography impacts.

Moods: tense, upbeat, neutral

## When to use
- a keyword slams onto the screen               →  when: "beat:<word_in>"
- beat-synced accents in kinetic sequences
- list items that "hit" one by one

## When NOT to use
- as the only audio in a scene
- for soft/calm moments — `tick` or `thud` fit better

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (1.5 = snappier pop-hit) |

## Examples
{ "sound": "punch", "when": "beat:word_hit", "volume": 0.4 }