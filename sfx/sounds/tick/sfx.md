# tick

Clean short tick, ~0.03s: a sharp band-passed noise blip. The smallest clickable unit — list
items, progress steps, checkboxes, bullet reveals.

Moods: neutral, calm

## When to use
- each list item / step / bullet appears          →  when: "beat:<step_N>"
- progress bar advances
- checkbox / checklist items

## When NOT to use
- for buttons — `click` is the press sound
- more than ~8 ticks in a scene (rhythm fatigue)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| cutoff | 1000 - 8000 Hz | 3500 | bandpass center — higher = brighter, tinnier |
| q | 2.0 - 12.0 | 7.0 | sharpness — high Q = pure "tick", low Q = duller "tock" |

## Examples
{ "sound": "tick", "when": "beat:step_3", "volume": 0.3 }