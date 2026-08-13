# whoosh_down

Falling band-passed noise sweep, ~0.7s — the mirror of `whoosh`. "Something leaves, resets, or
falls away." Slightly edgier than `whoosh`, so it tolerates tense scenes.

Moods: neutral, tense

## When to use
- an element animates off screen / collapses          →  when: "beat:<element_out>"
- a panel closes, a list resets, a stat drops
- scene exit (reverse of the entrance whoosh)

## When NOT to use
- as the only audio in a scene (no narration)
- to signal arrival — that is `whoosh`'s job (upsweep reads "in", downsweep reads "out")

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (2.0 = quick flick-away, 0.5 = heavy fall) |

## Examples
{ "sound": "whoosh_down", "when": "beat:cards_out", "volume": 0.4 }