# pop

Bright small pop, ~0.06s: a sine sweeping 1200→300 Hz with an exponential decay. Chips appear,
badges land, counters increment — playful but never goofy.

Moods: playful, upbeat, neutral

## When to use
- chips / badges / pills appear                →  when: "beat:<chip_in>"
- counters increment one by one
- small celebratory accents (with `sparkle` for bigger moments)

## When NOT to use
- in serious/tense scenes — a pop undercuts gravity
- for verdicts or heavy reveals (`impact` is the heavy tool)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (1.3 = tiny higher pop, 0.7 = deeper thump-pop) |

## Examples
{ "sound": "pop", "when": "beat:chip_2", "volume": 0.4 }