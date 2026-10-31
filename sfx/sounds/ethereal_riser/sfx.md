# ethereal_riser

Shimmering airy swell with a soft choir-like top — an uplifting build into a hopeful or wondrous reveal.

Moods: calm, neutral, serious

Sample (`pack/woosh/ethereal_riser.mp3`, 5.42 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/ethereal riser.mp3`.

## When to use
- hopeful build before a reveal
- wonder or discovery moment
- slow transition into a brighter section

## When NOT to use
- tension or threat beats — it lifts rather than darkens
- short cuts where the swell has no room

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
{ "sound": "ethereal_riser", "when": "beat:reveal", "volume": 0.42 }
{ "sound": "ethereal_riser", "when": "beat:reveal", "params": { "duration": 1.5, "fade": 0.3 } }
