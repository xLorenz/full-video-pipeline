# Asset provenance & license

Small bundled cue samples (`sfx/assets/*.mp3`) are **CC0 1.0** (or an equivalent
public-domain dedication), verified at ingest time on the source pages below — no attribution
is required and commercial / YouTube use is unrestricted for all six files.

The BGM beds (`sfx/assets/bgm/*.wav`) are **rendered in this repository** by
`sfx-render/bgm/<id>/render.mjs` from the in-repo score the renderer consumes, so the audio is
ours to ship. `clear_skies` is the one exception: its piano voice plays the Salamander Grand
Piano sample set, which carries a CC BY attribution (see below).

## Sources

| File | Source | License |
|---|---|---|
| `paper_01.mp3` | [RPG Audio — Kenney](https://kenney.nl/assets/rpg-audio) (`bookFlip1.ogg`) | CC0 1.0 |
| `footsteps_01.mp3` | [RPG Audio — Kenney](https://kenney.nl/assets/rpg-audio) (`footstep00/01/02.ogg`, concatenated) | CC0 1.0 |
| `crowd_01.mp3` | [Crowd Shouting/Speaking Ambience — StarNinjas, OpenGameArt](https://opengameart.org/content/crowd-shoutingspeaking-ambience) | CC0 1.0 |
| `door_01.mp3` | [RPG Audio — Kenney](https://kenney.nl/assets/rpg-audio) (`doorClose_1.ogg`) | CC0 1.0 |
| `siren_01.mp3` | [Sirens and Alarm Noise — aquinn, OpenGameArt](https://opengameart.org/content/sirens-and-alarm-noise) | CC0 1.0 |
| `bubble_01.mp3` | [40 CC0 water / splash / slime SFX — rubberduck, OpenGameArt](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) (`bubble_01.ogg`) | CC0 1.0 |
| `bgm/neon_drop.wav` | rendered in-repo — `sfx-render/bgm/neon-drop/` (Tone.js, synthesised) | ⓒ this repository |
| `bgm/clear_skies.wav` | rendered in-repo — `sfx-render/bgm/clear-skies/` (Tone.js + Salamander piano, see below) | ⓒ this repository + CC BY 3.0 samples |

## BGM bed attribution

`bgm/clear_skies.wav` is a render of `clear-skies.js` with the piano voice sampled from the
**Salamander Grand Piano by Alexander Holm** (CC BY 3.0, hosted at
<https://tonejs.github.io/audio/salamander/>). The 26 samples it uses are vendored under
`sfx-render/bgm/clear-skies/samples/` with a `SHA256SUMS` file, and the attribution lives in
`samples/README.md`. Nothing else in the bed is sampled — the marimba, pad, bass, drums and
effects are synthesised by Tone.js.

Keeping the credit next to the source (`samples/README.md`) is what CC BY asks for; if you
re-publish the bed on its own, carry the same line with it.

## Ingest normalization

Every cue file was normalized once at ingest with ffmpeg (exact command):

```bash
ffmpeg -y -i in.mp3 -ar 44100 -ac 1 -af "loudnorm=I=-18:TP=-1.5:LRA=11,volume=0.9" \
  -codec:a libmp3lame -b:a 160k sfx/assets/<file>
```

Excerpts (`crowd`, `siren`) were cut to stay under 6 seconds; `footsteps_01.mp3` is
three Kenney steps concatenated with 300 ms spacing. Each file's SHA-256 is recorded in
`manifest.json`, and `sfx_catalog.py` refuses to load any asset whose hash does not match.

BGM beds are rendered to mono 44.1 kHz 16-bit WAV, peak-normalized to −1 dBFS, and hashed the
same way. The head before `loop_start_seconds` plays once; `[loop_start, loop_end)` tiles
forever (see `sfx/README.md`).

## Policy

If a file's provenance is ever lost, delete it and re-fetch — **never ship unprovenanced audio.**
