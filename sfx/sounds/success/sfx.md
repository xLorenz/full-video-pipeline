# success

Ascending major-third chime, ~0.5s: C5 (523 Hz) rings, then E5 (659 Hz) joins
0.16 s later, each with a 2.76x bell sparkle partial and soft exponential decay.
Reads as "correct", "done", "achievement unlocked".

Moods: playful, upbeat, neutral

## When to use
- correct answers, quiz reveals, checkmarks       when: "beat:check"
- milestone completions, level-ups, positive confirms
- pair with `ding` for double-affirmation moments

## When NOT to use
- for neutral/calm videos prefer the softer `chime`
- for fail states use `error` / `warning`
- over busy sections: the third-step lands late (0.16 s) — keep it away from dense ticks

## Parameters
none

## Examples
{ "sound": "success", "when": "beat:check", "volume": 0.45 }