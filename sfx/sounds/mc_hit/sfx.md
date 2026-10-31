# mc_hit

Dull Minecraft-style damage thud, dry and blocky — a hit connecting, damage dealing in gameplay.

Moods: playful, tense, neutral

Sample (`pack/games/mc_hit.mp3`, 0.96 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecrfat hit.mp3`.

## When to use
- attack connects in game footage
- damage or penalty dealt
- rhythm of repeated combat hits

## When NOT to use
- generic non-game impact — sounds conspicuously like a game
- serious corporate narration where game tone clashes

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
{ "sound": "mc_hit", "when": "beat:reveal", "volume": 0.40 }
