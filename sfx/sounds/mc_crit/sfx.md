# mc_crit

Minecraft critical-hit thwack with a bright ping — a hit landing extra hard, a crit bonus landing.

Moods: playful, upbeat, tense

Sample (`pack/games/mc_crit.mp3`, 0.66 s, mono 44.1 kHz MP3). Imported from the pack: `video games/minecraft critical hit.mp3`.

## When to use
- attack lands critically in gameplay footage
- bonus damage or big multiplier hit
- punchy emphasis on a take-down

## When NOT to use
- serious corporate narration — reads as game-UI/gaming content
- as a generic impact in non-game footage

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
{ "sound": "mc_crit", "when": "beat:reveal", "volume": 0.40 }
