# sword_sling

Metallic blade swish through air — a sword drawn or swung, a slashing action beat.

Moods: tense, playful, neutral

Sample (`pack/woosh/sword_sling.mp3`, 2.04 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/sword sling.mp3`.

## When to use
- blade drawn or swung on screen
- slash or cutting action
- fantasy or historical action beat

## When NOT to use
- corporate or software content — sword reads fantasy
- as a normal transition with no blade

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
{ "sound": "sword_sling", "when": "beat:reveal", "volume": 0.42 }
