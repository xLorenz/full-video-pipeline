# rain

Steady procedural rain, ~5s: filtered-noise hiss (12 dB/oct rolloff above 4.5 kHz) with a
slow amplitude flutter, overlaid with ~600 tiny droplet pings. Synthesized — no sample
files involved. Rain on a window or roof, for tense/reflective ambience.

Moods: calm, tense, serious

## When to use
- tense/reflective scenes needing texture     when: "start" (bed-like, volume 0.2-0.3)
- "it's a dangerous night" establishing beats
- storm / weather-adjacent content
- scenes longer than 5 s: add cues every 5 s (`when`: 0, 5, 10, ...) for continuous rain

## When NOT to use
- in playful/upbeat scenes — rain does not "fit" those; validation will warn
- as a short accent — rain is a bed, not a hit

## Parameters
None — fixed character (use `volume` to set bed presence).

## Examples
{ "sound": "rain", "when": "start", "volume": 0.25 }