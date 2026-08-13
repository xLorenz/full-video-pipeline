# pop

Bright cork-pop, ~0.12s: a sine pitch-drop 420→80 Hz in 45 ms with a 1.5 ms click at the
onset. Reads as "something small just appeared".

Moods: playful, upbeat, neutral

## When to use
- chips appear, badges land, bubbles form        when: "beat:chip"
- count-up completions and reveal pops

## When NOT to use
- for heavy impacts (use `impact` / `boom`)
- under narration louder than the pop (it is small by design)

## Parameters
| param | range | default | meaning |
|---|---|---|---|
| pitch | 0.5 - 2.0 | 1.0 | pitch multiplier (2.0 = tiny squeak, 0.5 = deep balloon) |

## Examples
{ "sound": "pop", "when": "beat:chip", "volume": 0.45 }