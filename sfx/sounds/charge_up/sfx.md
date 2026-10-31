# charge_up

Rising electronic whine that builds and peaks — a meter filling, battery charging, power building before a reveal.

Moods: tense, upbeat, neutral

Sample (`pack/mechanical/charge_up.mp3`, 2.43 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/charge.mp4`.

## When to use
- progress bar charging to full
- ability or device powering on
- pre-reveal build before a cut

## When NOT to use
- under calm narration with no buildup payoff
- as a loop — it is a one-shot build

## Parameters
Sample playback — the engine matches this sound's loudness to the measured
voiceover automatically, so `volume` sets relative prominence only:

| param | default | meaning |
|---|---|---|
| `duration` | whole file | trim to N seconds (tail fades over `fade`) |
| `fade` | 0.12 | tail fade length in seconds when trimmed |
| `offset` | 0.0 | skip N seconds in (pick a later hit) |
| `gain_db` | 0.0 | manual level nudge after matching |
| `pitch` | 1.0 | playback speed/pitch factor (2.0 = octave up, half length) |

## Examples
{ "sound": "charge_up", "when": "beat:reveal", "volume": 0.42 }
