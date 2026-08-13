# whoosh_down

Falling counterpart of `whoosh`, ~0.7s (7.5→0.35 kHz exponential sweep): quick attack,
then a clean 250 ms release. "Something leaves / resets".

Moods: neutral, tense

## When to use
- element exits / collapses                     when: "beat:<element_out>"
- resets, minimizations, "undo" gestures
- counterweight to a whoosh-up in the same scene

## When NOT to use
- as an intro whoosh (rises are the arrival gesture)
- more than 2 per scene (clutter)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (resample) |

## Examples
{ "sound": "whoosh_down", "when": "beat:card_out", "volume": 0.5 }