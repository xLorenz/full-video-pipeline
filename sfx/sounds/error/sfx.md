# error

Two descending dings, ~0.7s: a saw wave dropping 400→200 Hz, twice (gap ~0.1s), through a
lowpass. The fail state sound.

Moods: tense, glitch, serious

## When to use
- wrong-answer beats                        →  when: "beat:wrong"
- fail states, rejections, "not found"
- security warnings

## When NOT to use
- **at video open** — starting a video with an error sound frames the whole piece as a failure
- more than twice per video — each use re-stamps failure on the content
- in playful content (an error ding is serious by design)

## Parameters
None — fixed character (use `volume` to control sting).

## Examples
{ "sound": "error", "when": "beat:wrong", "volume": 0.4 }