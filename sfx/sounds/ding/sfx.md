# ding

Bell-like confirm, ~0.6s: an FM bell (carrier 880 Hz, modRatio 1.4) with a natural decay.
Success moments, milestones, level-ups, "yes" answers.

Moods: calm, neutral, serious

## When to use
- success / confirmation moments               →  when: "beat:success"
- milestones ("goal reached", "completed")
- a positive verdict that is *soft*, not stamped

## When NOT to use
- for wrong-answer moments — that is `error`
- more than once per ~15s (bells ring attention)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier on the carrier (1.5 = higher, brighter confirm) |
| decay | 0.1 - 2.0 s | 0.4 | ring time — longer = more ceremonial |

## Examples
{ "sound": "ding", "when": "beat:success", "volume": 0.4 }