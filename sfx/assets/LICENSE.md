# Asset provenance & license

Every file in `sfx/assets/` is released under **CC0 1.0** (or an equivalent public-domain
dedication), verified at ingest time on the source pages below. No attribution is required and
commercial / YouTube use is unrestricted for all six files.

## Sources

| File | Source | License |
|---|---|---|
| `paper_01.mp3` | [RPG Audio — Kenney](https://kenney.nl/assets/rpg-audio) (`bookFlip1.ogg`) | CC0 1.0 |
| `footsteps_01.mp3` | [RPG Audio — Kenney](https://kenney.nl/assets/rpg-audio) (`footstep00/01/02.ogg`, concatenated) | CC0 1.0 |
| `crowd_01.mp3` | [Crowd Shouting/Speaking Ambience — StarNinjas, OpenGameArt](https://opengameart.org/content/crowd-shoutingspeaking-ambience) | CC0 1.0 |
| `door_01.mp3` | [RPG Audio — Kenney](https://kenney.nl/assets/rpg-audio) (`doorClose_1.ogg`) | CC0 1.0 |
| `siren_01.mp3` | [Sirens and Alarm Noise — aquinn, OpenGameArt](https://opengameart.org/content/sirens-and-alarm-noise) | CC0 1.0 |
| `bubble_01.mp3` | [40 CC0 water / splash / slime SFX — rubberduck, OpenGameArt](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) (`bubble_01.ogg`) | CC0 1.0 |

## Ingest normalization

Every file was normalized once at ingest with ffmpeg (exact command):

```bash
ffmpeg -y -i in.mp3 -ar 44100 -ac 1 -af "loudnorm=I=-18:TP=-1.5:LRA=11,volume=0.9" \
  -codec:a libmp3lame -b:a 160k sfx/assets/<file>
```

Excerpts (`crowd`, `siren`) were cut to stay under 6 seconds; `footsteps_01.mp3` is
three Kenney steps concatenated with 300 ms spacing. Each file's SHA-256 is recorded in
`manifest.json`, and `sfx_catalog.py` refuses to load any asset whose hash does not match.

## Policy

If a file's provenance is ever lost, delete it and re-fetch — **never ship unprovenanced audio.**