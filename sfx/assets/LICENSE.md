# Asset provenance & license

Small bundled cue samples (`sfx/assets/*.mp3`) are **CC0 1.0** (or an equivalent
public-domain dedication), verified at ingest time on the source pages below — no attribution
is required and commercial / YouTube use is unrestricted for all six files.

The 55 samples under `sfx/assets/pack/` are the **user-supplied SFX pack** described in
[Pack samples](#pack-samples) — imported with `scripts/import_sfx_pack.py`, whose curation
plan is committed at `sfx/import/sfx-pack-plan.json`.

The BGM beds (`sfx/assets/bgm/*.wav`) are **rendered in this repository** by
`sfx-render/bgm/<id>/render.mjs` from the in-repo score the renderer consumes, so the audio is
ours to ship. `clear_skies` is the one exception: its piano voice plays the Salamander Grand
Piano sample set, which carries a CC BY attribution (see below).

## Pack samples

`sfx/assets/pack/` holds 55 one-shots imported from a user-supplied pack (three source folders:
`mechanical sfx`, `video games`, `wooshes, risers, and hits`). Every file was re-encoded to mono
44.1 kHz MP3 192 kbps, had its leading silence stripped, was trimmed to a usable length with a
fade-out, and was peak-limited to −1 dBFS (see [Ingest](#ingest)). The originals in the user's
Downloads folder were left untouched; `sfx/import/sfx-pack-plan.json` maps each catalog id to its
source file and records the curation metadata.

| Folder | Count | Contents |
|---|---|---|
| `pack/mechanical/` | 21 | clicks, typing, cash register, clock, gears, glitch, camera flash |
| `pack/games/` | 15 | Minecraft / eShop / Pokémon-style game UI and hit sounds |
| `pack/woosh/` | 19 | whooshes, risers, impact transitions, orchestral hits, sub bass |

> **License status: unverified.** This pack arrived as user-supplied media without a license
> file. The six CC0 files above remain the only assets with documented provenance. Before
> publishing these sounds as a redistributable library (or claiming they are CC0), confirm the
> pack's license — the repo's policy is "never ship unprovenanced audio". Using them inside your
> own rendered videos is at the pack owner's discretion.

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

## Ingest

Cue files are **not** loudness-normalized at ingest any more: `_normalize()` equalized peaks,
which left a 15.7 dB spread between the quietest and loudest bundled sample. Every sample is
now level-matched against the measured voiceover **at mix time** (see `sfx/SCHEMA.md`), so the
asset keeps its dynamics and `default_volume` only sets relative prominence.

`scripts/import_sfx_pack.py` is the ingest path for new media. Per file it runs one ffmpeg pass:

```bash
ffmpeg -y -ss <lead> -t <dur> -i in.mp4 -map 0:a:0 -vn -sn -dn -ac 1 -ar 44100 \
  -af "afade=t=in:st=0:d=0.005,afade=t=out:st=<dur-fade>:d=<fade>,volume=<dB>" \
  -c:a libmp3lame -b:a 192k sfx/assets/pack/<family>/<id>.mp3
```

- `-map 0:a:0 -vn` extracts the audio from `.mp4` sources.
- Leading silence is measured with `silencedetect` and stripped, keeping a 20 ms pre-roll so the
  attack transient survives.
- Long clips are trimmed to `--max-seconds` (8 s default, per-entry overrides) with a fade-out,
  so a 14 s pack riser cannot run over the next beat.
- `volume` only ever attenuates: anything peaking above −1 dBFS is brought under the ceiling
  before lossy encoding (several pack files peaked above 0 dBFS).
- The written file is then measured (loudest 400 ms, true peak, integrated LUFS) and those
  numbers land in the sound's `config.json` under `level.measured` — informational, never used
  for gain math.

Each file's SHA-256 is recorded in `manifest.json`, and `sfx_catalog.py` refuses to load any
asset whose hash does not match.

BGM beds are rendered to mono 44.1 kHz 16-bit WAV, peak-normalized to −1 dBFS, and hashed the
same way. The head before `loop_start_seconds` plays once; `[loop_start, loop_end)` tiles
forever (see `sfx/README.md`).

## Policy

If a file's provenance is ever lost, delete it and re-fetch — **never ship unprovenanced audio.**
