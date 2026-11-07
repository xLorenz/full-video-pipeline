# Sound design: SFX that sound made, not beeped

Synthesised SFX go harsh in predictable ways. The first lily-boat mix had every one of these problems: 8 ms linear attacks that clicked, white-noise splashes that hissed, pitch sweeps up to 1.25 kHz, about 70 identical leaf pops in two seconds, and dry SFX next to a reverberant score, so they sounded pasted on. The fixes below took the energy above 2.5 kHz from −12.5 dB to −26 dB relative to the SFX track, and above 5 kHz from −17 dB to −38 dB. The engine is in `assets/template.html` section ⑧. `examples/lily-boat.html` is the worked example.

## Contents
1. The signal flow
2. Ten rules
3. Recipes: organic and cartoon
4. Density and variation
5. Measuring harshness without ears
6. Checklist

---

## 1. The signal flow

```
tone() / noise()  → sfxBus: lowpass 3.4 kHz → dry ───────────────┐
                                           └→ send .45 → room ──┤
INST voices       → musicBus: MIX.music → lowpass 5.2 kHz ──────┼→ master: compressor (−20 dB, 2.5:1, soft knee) → lowpass 9 kHz → out
                                           └→ room ─────────────┘
room = one generated hall (3.2 s decaying brown-ish noise impulse, lowpassed 4.5 kHz, 30 % wet)
```

The SFX and music share **one room**. That's what makes them sound like one piece. The master compressor glues them together and stops any single hit from poking out. Each bus and the room are built once per audio context (cached in a `WeakMap`), so live playback and the offline render use the same chain.

## 2. Ten rules

1. **No clicks.** Attack ≥ 6 ms for soft hits and 10–20 ms for anything tonal, rising linearly. Decay with `setTargetAtTime(0, …, dur/4)` (a natural exponential), never by snapping to 0.001.
2. **Brown noise, not white.** Integrate white noise (`last = (last + .02·rand)/1.02`). Its energy falls with frequency, so it reads as water, wind, cloth or paper. White noise reads as hiss.
3. **Lowpass everything.** Each sound has its own `cut` (thuds 500 Hz, plops 900 Hz, pops 1.3–2.4 kHz), and the SFX bus caps everything at 3.4 kHz for organic pieces and about 5 kHz for cartoons. Nothing synthesised needs much above 5 kHz.
4. **Sweep down, or barely up.** Real impacts and drops settle downward in pitch. Upward sweeps (500 → 1100 Hz) sound like UI chirps. Keep any rise under about 1.5× and make it short (a bubble).
5. **In key.** Every pitched SFX picks from the score's scale (`PENTA`), an octave under the melody so it sits beneath it. Pellets play C D E G A, and leaf pops play G3–G4.
6. **Same room as the music.** Send SFX into the room at .3–.5. Dry SFX next to wet music is the "pasted on" sound.
7. **Place it where it happens.** `pan(x)` maps world x to ±.55. Soft panning makes the frame feel wide without pulling one ear.
8. **Thin out repeats.** One sound per 4 to 5 identical events, with per-instance loudness from `hash(i)` (0.7–1.0) and the pitch rotated through the scale. Twenty pops a second is a machine gun. Six is rain.
9. **Low end gives weight, high end gives harshness.** Give impacts a body under 200 Hz (a sine 150 → 100 Hz gloop under a splash, 120 → 60 Hz under a stamp) instead of making them louder or brighter.
10. **A bed under everything.** Brown noise lowpassed to about 340 Hz at very low level (water, room tone, wind) fades in with the world and out before the loop point. Silence between hits makes every hit sound sharper.

## 3. Recipes

### Organic (water, paper, plants)

| sound | recipe |
|---|---|
| drop on paper | sine 330 → 210 Hz, 350 ms, attack 6 ms, cut 1.4 kHz, plus a bubble: sine 660 → 880, 120 ms, very quiet |
| bloom / spread | brown noise lowpass sweeping 180 → 900 Hz over 1.8 s, swelling to .09 at 0.7 s |
| leaf / pad pop | triangle 1.04f → f, 320 ms, attack 20 ms, cut 1.3 kHz, f in the scale, panned, loudness varied |
| oar / splash | brown noise bandpass 700 → 260 Hz (Q .6), attack 40 ms, 700 ms, plus a gloop: sine 150 → 100 Hz |
| food into water | sine 1.03f → f, 900 ms (in key), plus a plop: sine 240 → 170, 140 ms |
| seal / stamp | sine 120 → 75 Hz, 300 ms, cut 500, plus a paper whisper: brown noise lowpass 1.2 kHz → 500, 120 ms |
| water bed | brown noise lowpass 340 → 300 Hz, level .05, faded in and out |

### Cartoon (characters, props, gags)

Brighter and snappier, but the rules still hold:

| sound | recipe |
|---|---|
| talk blip | triangle f → 0.9f, 120 ms, attack 8 ms, cut 2.2 kHz, f from the score's scale |
| pop | sine 420 → 620 Hz, 140 ms, attack 10 ms |
| thump / land | sine 120 → 60 Hz, 250 ms, cut 500 |
| boing | sine 170 → 520 Hz over 0.5 s with a 22 Hz vibrato, cut 1.8 kHz |
| bonk | sine 260 → 70 Hz plus a brown-noise tap (lowpass 1.5 kHz, 40 ms) |
| whoosh | brown noise bandpass 300 → 900 Hz, swelling over 180 ms |

For cartoons, set the SFX bus lowpass to about 5 kHz and the room send to about .25 (drier and closer).

## 4. Density and variation

- Build `EVENTS` from data, and filter repeats there: `LEAVES.forEach((l, i) => { if (i % 5 === 0) EVENTS.push(...) })`.
- Vary every repeat: loudness `.7 + .3 * hash(i)`, pitch `PENTA[(i * 3) % n]`, pan from its x.
- Put story hits on the music grid (see `music.md`), and keep melody notes off the same beat.
- Biggest moments get the most low end, not the most volume.

## 5. Measuring harshness without ears

Render the page audio with and without the score (`__comp.audio(48000, {music:false})`), save the WAVs, and compare bands with ffmpeg:

```bash
ffmpeg -i sfx.wav -af volumedetect -f null -                    # mean / max of the whole track
ffmpeg -i sfx.wav -af highpass=f=2500,volumedetect -f null -    # energy above 2.5 kHz
ffmpeg -i sfx.wav -af highpass=f=5000,volumedetect -f null -    # energy above 5 kHz
```

Targets for organic pieces, relative to the whole track's mean: above 2.5 kHz ≤ −20 dB, above 5 kHz ≤ −30 dB. Cartoons can sit about 6 dB brighter. Also check the crest factor (max − mean). Above about 24 dB means there are spiky transients the compressor will slam after loudness normalisation.

## 6. Checklist

1. Are all SFX made with `tone()` / `noise()` (rounded attacks, lowpassed, panned, sent into the room)?
2. Is every pitched SFX in the score's scale?
3. Is there no white noise and no upward chirp over 1.5×?
4. Are repeats thinned to about one per 4 or 5 events, with varied loudness?
5. Is there a low bed under the piece?
6. Do the band measurements hit the targets?
7. Does the final MP4 measure about −16 LUFS?
