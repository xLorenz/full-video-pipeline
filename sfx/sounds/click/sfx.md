# click

Button/press click, ~0.05s: a white-noise burst through a bandpass with a fast exponential
decay. The most neutral sound in the catalog — pure UI.

Moods: neutral

## When to use
- any on-screen button / press / toggle         →  when: "beat:press"
- cursor taps, selections, menu lands
- "click to continue" affordances

## When NOT to use
- for emphasis — a click is functional, not expressive
- in scenes without a visible UI affordance to click

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| cutoff | 400 - 6000 Hz | 2000 | bandpass center — lower = duller press, higher = crisper |
| q | 0.5 - 12.0 | 2.0 | sharpness of the burst |

## Examples
{ "sound": "click", "when": "beat:press", "volume": 0.3 }