# radio_beep

Short clipped radio beep, dry and square — comms opening, alert acknowledged, walkie-talkie cue.

Moods: tense, serious, neutral

Sample (`pack/mechanical/radio_beep.mp3`, 0.43 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/radio beep.mp4`.

## When to use
- radio or comms handoff in a story
- alert acknowledged on a dashboard
- record/transmission start marker

## When NOT to use
- warm friendly confirmations — it is clinical
- layering with other beeps into a siren feel

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
{ "sound": "radio_beep", "when": "beat:reveal", "volume": 0.40 }
