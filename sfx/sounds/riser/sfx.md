# riser

Long upward tension build: a rising tone layered over band-passed noise, ~2.5-3s of growing
energy that peaks and releases. Built for pattern interrupts, punch-ins, and reveal moments.

Moods: serious, tense, neutral

## When to use
- the last seconds before a big reveal / verdict      →  when: "beat:reveal_minus_3s" (author a beat ~3s early)
- a pattern interrupt ("but here's what nobody tells you")
- countdown-style builds (with `tension_riser` BGM it stacks — use one, not both)

## When NOT to use
- without a payoff — a riser that never resolves feels broken
- in calm, gentle scenes (a riser is inherently tense)

## Parameters
None — the character is fixed (use `volume` to control presence).

## Examples
{ "sound": "riser", "when": 2.5, "volume": 0.4 }