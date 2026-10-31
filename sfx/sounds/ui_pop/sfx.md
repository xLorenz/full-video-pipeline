# ui_pop

Soft rising bloop-pop with a friendly tail — small success toasts, chips appearing, gentle confirmations.

Moods: playful, neutral, upbeat

Sample (`pack/mechanical/ui_pop.mp3`, 1.32 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/ui pop.mp3`.

## When to use
- success toast slides in
- feature tag appears
- subtle positive UI feedback

## When NOT to use
- major milestones — it is a small nudge
- layering with pay_ding or pop_up on one beat

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
{ "sound": "ui_pop", "when": "beat:reveal", "volume": 0.45 }
