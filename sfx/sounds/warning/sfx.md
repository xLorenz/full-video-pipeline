# warning

Double mid-range pulse, ~0.3s: two short pulses at 0 / 0.15 s, each falling
750 to 520 Hz with a 2x partial. Reads as "careful", "attention", "check this".

Moods: tense, serious, neutral

## When to use
- caution beats, "but wait" turns, red flags      when: "beat:caution"
- before a reveal that contradicts the claim
- pair with `error` for escalate-then-fail sequences

## When NOT to use
- for playful/humorous moments (use `toggle` or `bounce`)
- as a fail sound — `error` is the dedicated fail tone
- under dense narration: two pulses need silence to read

## Parameters
none

## Examples
{ "sound": "warning", "when": "beat:caution", "volume": 0.5 }