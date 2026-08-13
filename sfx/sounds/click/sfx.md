# click

Button/press click, ~0.05s: a 2 ms white-noise attack spike over a damped resonant knock at
`cutoff` (ring time follows `q`). The most neutral sound in the catalog — pure UI.

Moods: neutral

## When to use
- any on-screen button / press / toggle         when: "beat:press"
- cursor taps, selections, menu lands
- "click to continue" affordances

## When NOT to use
- for emphasis — a click is functional, not expressive
- in scenes without a visible UI affordance to click

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| cutoff | 400 - 6000 Hz | 2000 | knock pitch — lower = duller press, higher = crisper |
| q | 0.5 - 12.0 | 2.0 | ring time (q × 1.5 ms) — low = dead thud, high = long tick |

## Examples
{ "sound": "click", "when": "beat:press", "volume": 0.3 }