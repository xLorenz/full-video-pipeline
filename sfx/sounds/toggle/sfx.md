# toggle

Springy flip sweep, ~0.18s: 300 to 850 Hz in 50 ms, small overshoot bounce
(850 -> 620 -> 520) then a quick settle. Reads as "flipped", "switched", "before/after".

Moods: neutral, playful

## When to use
- before/after comparisons, mode switches        when: "beat:flip"
- on/off toggles, view changes, expand/collapse
- paired with a `whoosh` for bigger transitions

## When NOT to use
- for tense/serious content (too bouncy) — use `tick` or `thud`
- for the same beat as the `whoosh` (they occupy the same pitch band)

## Parameters
none

## Examples
{ "sound": "toggle", "when": "beat:flip", "volume": 0.4 }