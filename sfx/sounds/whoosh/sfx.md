# whoosh

Rising band-passed noise sweep, ~0.7s (350→7.5 kHz, exponential): swells in over 250 ms,
holds, releases over 180 ms. The "something arrived" transition whoosh. Tone-neutral:
fits serious explainers and playful videos alike.

Moods: neutral, calm

## When to use
- scene opens / a card or element animates onto screen  when: "beat:<element_in>"
- scene transitions (wipe / slide)                      when: "start"
- punch-in of a new visual section

## When NOT to use
- as the only audio in a scene (no narration) — scenes are narration-first
- more than 2 whooshes in one scene (clutter — validation will not stop you, taste must)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (2.0 = fast/light whoosh, 0.5 = slow drone) |

## Examples
{ "sound": "whoosh", "when": "beat:cards_in", "volume": 0.5 }