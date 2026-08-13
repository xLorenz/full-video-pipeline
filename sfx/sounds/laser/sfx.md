# laser

Sweeping laser blip, ~0.3s: a fast downward frequency sweep with a metallic edge. Targeting,
scanning, locks-on.

Moods: tense, playful, glitch, neutral

## When to use
- targeting reticles lock on                    →  when: "beat:lock"
- scanning / decoding pass (barcode-scan templates)
- sci-fi interface feedback

## When NOT to use
- for generic UI — a laser is thematic, `click` is neutral
- in organic/calm scenes (a laser breaks the illusion of calm)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (2.0 = short high blip, 0.5 = long low sweep) |

## Examples
{ "sound": "laser", "when": "beat:lock_on", "volume": 0.35 }