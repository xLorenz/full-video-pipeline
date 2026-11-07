# Music (BGM)

SFX make things feel physical. Music tells you how to feel about them. Every piece gets both, unless the user says otherwise. The engine is in `assets/template.html` (section ⑧b), and `examples/lily-boat.html` is the worked example: a 16 s koto-and-pad loop in C pentatonic, where the oar splashes, food pellets and seal stamp all land on the beat.

## Contents
1. Two ways to get music
2. Tempo, bars and the loop
3. Harmony: pick a mood, keep it small
4. The instruments
5. Arranging around the story
6. Mix and loudness
7. Seamless loops
8. Checklist

---

## 1. Two ways to get music

| | synthesised score (default) | user's own track |
|---|---|---|
| how | `SCORE` events in the page, built from `CHORDS` + `MELODY` data | `render.py piece.html --out x.mp4 --bgm song.mp3` |
| plays live in the page | yes | no, MP4 only |
| synced to beats | exactly, because you write both | only if you retime the beats to its tempo |
| licensing | none, you wrote it | the user's responsibility. Say so once if the track looks commercial |

`--bgm` replaces the page's score (it calls `__comp.audio(sr, {music: false})`) but keeps the SFX. It also loops a short track, fades it in over 0.4 s and out over 1.2 s, and ducks it under `--vo` with a sidechain compressor. `--bgm-gain` (default .5) sets its level before loudness normalisation.

Never fetch music from the web for the user. Either write a score or use a file they hand you.

## 2. Tempo, bars and the loop

- **Pick a BPM so `DUR` is a whole number of bars.** At 60 BPM in 4/4, a bar is 4 s: DUR 12 = 3 bars, 16 = 4 bars. At 75 BPM, a bar is 3.2 s, so DUR 16 = 5 bars. At 90 BPM, a bar is 2.67 s, so DUR 16 = 6 bars.
- **60 BPM is the easy default for calm pieces.** One beat equals one second, so every story time is also a beat position.
- **Put story beats on the grid.** In the lily boat, the oar stroke period went from 1.4 s to 1.5 s and the strokes start at 3.0, so every splash lands on a half-beat. Pellet landing times moved to eighth notes, and the seal stamp moved to beat 14. Retiming visuals by ±0.1 s to hit the grid is nearly invisible, and it makes the piece feel choreographed.
- Busy cartoon pieces want 100–120 BPM with a light percussion tick. Ambient and organic pieces want 55–75 BPM with no drums.

## 3. Harmony: pick a mood, keep it small

Use one chord per bar, with the last chord leading back to the first across the seam:

| mood | progression (one per bar) | scale for the melody |
|---|---|---|
| calm, pastoral, Japanese-print | C add9 → Am7 → Fmaj7 → G6sus2 | C major pentatonic (C D E G A) |
| wistful, dreamy | Am9 → Fmaj7 → C add9 → G6 | A minor pentatonic |
| playful, cartoon | C → F → G → C (staccato) | C major, plus hops on the 5th |
| mysterious, night | Dm9 → Bbmaj7 → Gm9 → A7sus4 | D dorian |

- **Melody in the same pentatonic as the SFX blips.** Pellet plips, leaf pops and pickups all choose pitches from the same scale, so effects and music never clash.
- **The melody uses the notes of the moment's chord** on strong beats (0, 1, 2, 3 in the bar) and passing pentatonic notes on the off-beats.
- Write voicings as MIDI numbers. Keep the pad around 50–67, arpeggios around 55–76, the melody around 72–84 and bass around 29–40.

## 4. The instruments

All of them go through `musicBus(ac)`: `MIX.music`, then a 5.2 kHz lowpass to the master, plus a send into the generated-hall room that the SFX share (see `sound-design.md` for the signal flow).

| instrument | recipe | role |
|---|---|---|
| `pad` | 2 detuned saws per note (±6 cents), lowpass swelling 450 → 1050 → 600 Hz, 1.4 s attack, 1.2 s release overlapping the next chord | harmony and air, very quiet (.011 per voice) |
| `bass` | sine on the chord root, 0.06 s attack, decays over the bar | weight; keep it under 400 Hz |
| `pluck` | triangle at f (1.6 s decay) + sine at 2f (0.5 s) + sine at 3.01f (0.18 s) | koto/kalimba: melody and arpeggio |
| `bell` | sines at f, 2.76f, 5.4f with fast decays | one-off accents on story beats (a boat stopping) |
| arpeggio | `pluck` on eighth notes through the chord, pattern `[0,1,2,3,2,1,2,3]`, panned alternately L/R, quieter on off-beats | gentle motion under everything |

To change the colour, swap oscillator types (a `square` pluck through a 1.2 kHz lowpass for a chiptune feel, `sine` everything for a music box). Add one percussion voice only if the piece is busy: a noise tick (`noise()` bandpass 6 kHz, 30 ms) on off-beats.

## 5. Arranging around the story

- **Enter after the first image.** The dot drops in silence at 0.25 s. The pad swells in from 0.3 s, and the first melody note and a soft bell arrive with the bloom at 1.0 s.
- **Build with the scene.** Arpeggios start partway through bar 1, and the melody thickens as more of the world appears.
- **Leave holes for story sounds.** The melody rests through 10–12 s while the pellets play their own notes. Never put a melody note on the same beat as an important SFX.
- **Mark the turning point** with a bell or a chord change (the boat stops on beat 10).
- **Thin out at the end** to fall into the loop: fewer melody notes in the last bar, the last chord being the dominant (G) that resolves to the first (C).

## 6. Mix and loudness

- The page sets `MIX.music` (≈.55–.6). SFX go straight to the destination at their own levels. Aim for music RMS about equal to the SFX bed, with SFX accents poking 3–6 dB above it.
- Check levels without listening: render `__comp.audio()` with and without `{music:false}` and compare per-second RMS. No peak should exceed ~0.9 before normalisation.
- **`render.py` normalises the final mix to −16 LUFS** in two passes (`--lufs`, use −14 for loud platforms, 0 to turn it off). It prints the change, for example `loudness -34.5 -> -16.0 LUFS`. Raw synthesised mixes usually come out around −30 to −35 LUFS, which is far too quiet for a reel.
- Under a voiceover, use `--sfx-gain .6`. If you're using `--bgm`, its ducking handles the music.

## 7. Seamless loops

Notes near the end ring past `DUR` (reverb, pad release). `__comp.audio()` renders `DUR + 4 s` and then **adds the tail back onto the start**, so the MP4's audio wraps cleanly when the platform loops it. Check the seam with the sample jump between the last and first sample: it should be no larger than a typical step between neighbouring samples. Live playback in the page fires `SCORE` events through the same `fireSounds` as SFX, so music plays (and wraps) while you scrub.

## 8. Checklist

1. Is `DUR` a whole number of bars at the chosen BPM?
2. Do the key story moments (impacts, arrivals, the stamp) land on beats or half-beats?
3. Is the melody in the same scale as the SFX pitches, with rests under important SFX?
4. Does the last chord lead back to the first?
5. Do music and SFX levels balance (compare RMS), with no clipping?
6. Does the final MP4 measure about −16 LUFS (`ffmpeg -i x.mp4 -af ebur128 -f null -`)?
