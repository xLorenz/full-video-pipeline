# ratchet

Tight metallic ratchet notch, one firm click — settings locking in, dial stepping, tool tightening.

Moods: neutral, tense, serious

Sample (`pack/mechanical/ratchet.mp3`, 0.33 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/ratchet.mp3`.

## When to use
- setting steps up a notch
- dial or slider snaps to value
- hardware being tightened or armed

## When NOT to use
- soft organic scenes
- fast repeats — it is a single decisive notch

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
{ "sound": "ratchet", "when": "beat:reveal", "volume": 0.50 }
