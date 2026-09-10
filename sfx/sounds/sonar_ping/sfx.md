# sonar_ping

Clean location ping, ~1.2s: an 880 Hz sine with octave shimmer and a long natural tail.
Map pins, radar sweeps, "you are here" moments, detections.

Moods: calm, neutral, serious

## When to use
- map pins dropping / locations revealed     →  when: "beat:pin_drop"
- radar / scanning visuals (gentler than `scan`)
- a calm "found it" marker

## When NOT to use
- tense countdowns — that is `warning` / `tension_riser`
- celebratory moments — that is `ding` / `chime` / `success`

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (resample; higher = smaller / closer feel) |
| decay | 0.2 - 2.0 s | 0.8 | ping tail — longer = larger space |

## Examples
{ "sound": "sonar_ping", "when": "beat:pin_drop", "volume": 0.4 }
