# thud

Soft low knock, ~0.5s — quieter, rounder cousin of `impact`. A card lands, a panel drops in,
a tile settles. Reads "placed", not "struck".

Moods: serious, calm, neutral

## When to use
- cards / panels / tiles animate in and settle      →  when: "beat:<element_in>"
- list items slot into place
- quiet reveals (docs, letters, folders)

## When NOT to use
- for verdicts or emphasis — that is `impact`/`boom` territory
- in scenes where nothing visually "lands" (a thud with no object is confusing)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (0.8 = heavier knock) |

## Examples
{ "sound": "thud", "when": "beat:card_land", "volume": 0.4 }