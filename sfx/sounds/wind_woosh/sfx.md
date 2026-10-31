# wind_woosh

Long gusting wind swell that rises and fades — airy scene transitions, outdoor drift, passage of time.

Moods: calm, neutral, serious

Sample (`pack/woosh/wind_woosh.mp3`, 3.72 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/wind gust woosh.wav`.

## When to use
- airy transition between locations
- outdoor or aerial establishing drift
- time passing in the open air

## When NOT to use
- indoor tech or office scenes
- under whispered narration where it masks breath

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
{ "sound": "wind_woosh", "when": "beat:reveal", "volume": 0.32 }
{ "sound": "wind_woosh", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
