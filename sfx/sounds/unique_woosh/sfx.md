# unique_woosh

Flanged, slightly warped whoosh with a curious texture — a playful transition with a bit of character.

Moods: neutral, playful, humorous

Sample (`pack/woosh/unique_woosh.mp3`, 1.44 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/unique woosh.wav`.

## When to use
- stylized scene change
- graphic element warps across
- quirky brand-voice transition

## When NOT to use
- serious documentary tone
- repeating it — the odd texture draws attention

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
{ "sound": "unique_woosh", "when": "beat:reveal", "volume": 0.40 }
