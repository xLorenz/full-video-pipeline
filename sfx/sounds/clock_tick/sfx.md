# clock_tick

Steady mechanical clock tick loop — a countdown, deadline or waiting beat under narration.

Moods: tense, serious, neutral

Sample (`pack/mechanical/clock_tick.mp3`, 8.00 s, mono 44.1 kHz MP3, trimmed from 8.07 s with a fade-out). Imported from the pack: `mechanical sfx/clock ticking.mp3`.

## When to use
- deadline countdown on screen
- suspenseful waiting beat
- time-lapse or 'years pass' montage

## When NOT to use
- long stretches under dialogue — becomes hypnotic and distracting
- light comedic scenes where it feels ominous

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
{ "sound": "clock_tick", "when": "beat:reveal", "volume": 0.28 }
{ "sound": "clock_tick", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
