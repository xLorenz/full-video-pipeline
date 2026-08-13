# chime

Softer bell, ~0.8s: an FM bell (carrier 660 Hz, modRatio 1.2) that rings gentler and longer
than `ding`. Completions, gentle success, "and that's it" moments.

Moods: calm, neutral

## When to use
- quiet completions ("you're done", checklist finished)
- gentle positive moments that should not pop
- end-of-section resolves

## When NOT to use
- for hard confirmations — `ding` is the crisper confirm
- in tense scenes (a chime releases tension; only use it to *relieve*)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier on the carrier |
| decay | 0.1 - 2.5 s | 0.6 | ring time — longer = dreamier |

## Examples
{ "sound": "chime", "when": "end", "volume": 0.35 }