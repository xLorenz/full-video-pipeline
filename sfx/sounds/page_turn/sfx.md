# page_turn

Paper flip gesture, ~0.3s: an airy noise flip rising 900 → 5200 Hz with a soft 150 Hz landing tap as the page settles.
Before/after reveals, card flips, dossier opens, verdict-card entrances.

Moods: neutral, calm

## When to use
- before/after comparison reveals          →  when: "beat:cards_in"
- page/dossier/card flip animations
- a lighter alternative to `whoosh` for paper-like motion

## When NOT to use
- heavy impacts — that is `stamp` / `impact`
- glitch visuals — that is `zap` / `scan` / `glitch_burst`

## Parameters
None — fixed character (use `volume` to set presence).

## Examples
{ "sound": "page_turn", "when": "beat:cards_in", "volume": 0.4 }
