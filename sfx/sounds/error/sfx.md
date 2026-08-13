# error

Descending buzzy fail tone, ~0.7s: two detuned saws gliding 520→160 Hz with a closing
lowpass, tremolo wobble and a soft-clipped grit. The fail state sound — unmistakably a
denial, not a notification.

Moods: tense, glitch, serious

## When to use
- wrong-answer beats                        when: "beat:wrong"
- fail states, rejections, "not found"
- security warnings

## When NOT to use
- **at video open** — starting a video with an error sound frames the whole piece as a failure
- more than twice per video — each use re-stamps failure on the content
- in playful content (an error buzz is serious by design)

## Parameters
None — fixed character (use `volume` to control sting).

## Examples
{ "sound": "error", "when": "beat:wrong", "volume": 0.4 }