# typing

Mechanical keyboard clatter bed, steady keystrokes — coding, writing, search terms entered on a desktop.

Moods: neutral, calm, serious

Sample (`pack/mechanical/typing.mp3`, 8.00 s, mono 44.1 kHz MP3, trimmed from 11.45 s with a fade-out). Imported from the pack: `mechanical sfx/typing keyboard.mp3`.

## When to use
- code or prompt typed on screen
- document being written
- search bar fills with text

## When NOT to use
- under heavy narration — continuous clatter masks words
- short accents where you want one crisp key

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
{ "sound": "typing", "when": "beat:reveal", "volume": 0.35 }
{ "sound": "typing", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
