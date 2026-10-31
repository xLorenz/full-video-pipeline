# suspense_thud

Heavy muffled thud with a long dark tail — a bad-news beat, a pause for dread, a heavy landing.

Moods: tense, serious

Sample (`pack/woosh/suspense_thud.mp3`, 3.32 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/suspense thud.wav`.

## When to use
- bad news or threat lands
- dramatic pause under a slow reveal
- heavy landing or failure

## When NOT to use
- uplifting or playful content — it is pure dread
- short upbeat cuts where the tail lingers wrong

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
{ "sound": "suspense_thud", "when": "beat:reveal", "volume": 0.40 }
{ "sound": "suspense_thud", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
