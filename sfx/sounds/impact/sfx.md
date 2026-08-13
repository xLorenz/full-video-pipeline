# impact

Hard low hit, ~0.8s: a pitch-dropping sub thump with a sharp attack. The "verdict" sound —
stamps, confirmations, answers landing.

Moods: serious, tense, neutral

## When to use
- a verdict / answer is stamped on screen            →  when: "beat:verdict"
- a big number lands ("$2.4 trillion")
- chapter break / section close

## When NOT to use
- more than once per ~10s of video (it is heavy; repeated impacts numb the viewer)
- in playful/humorous scenes — `pop` or `punch` fit better

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (0.7 = deeper, heavier stamp) |

## Examples
{ "sound": "impact", "when": "beat:stamp", "volume": 0.6, "params": { "pitch": 0.8 } }