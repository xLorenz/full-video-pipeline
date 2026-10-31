# metallic_riser

Scraping metallic rise that tightens into a peak — machinery accelerating, tech building to a reveal.

Moods: tense, serious, neutral

Sample (`pack/woosh/metallic_riser.mp3`, 1.97 s, mono 44.1 kHz MP3). Imported from the pack: `wooshes, risers, and hits/metallic riser.mp3`.

## When to use
- machinery or engine spooling up
- tech or robotics reveal build
- rising pressure before a switch

## When NOT to use
- gentle or human-warm content
- extending past the reveal with no cut

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
{ "sound": "metallic_riser", "when": "beat:reveal", "volume": 0.42 }
