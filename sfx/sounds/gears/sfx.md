# gears

Gritty interlocking gear grind, metallic and low — machinery starting, systems grinding into motion.

Moods: serious, tense, neutral

Sample (`pack/mechanical/gears.mp3`, 2.10 s, mono 44.1 kHz MP3). Imported from the pack: `mechanical sfx/gears.wav`.

## When to use
- engine or machine spools up
- process diagram starts moving
- 'the system kicks in' beat

## When NOT to use
- delicate or premium product shots
- under soft-spoken narration where grit clashes

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
{ "sound": "gears", "when": "beat:reveal", "volume": 0.45 }
