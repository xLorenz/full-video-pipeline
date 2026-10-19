# Sound & rhythm

Picture is half the experience. Motion that lands *on* a sound feels expensive; the same motion in silence, or against music it ignores, feels amateur. Plan sound at the storyboard stage, not after.

Contents: 1 The beat grid · 2 Audio in Remotion · 3 SFX placement · 4 Mixing & loudness · 5 Audio-reactive visuals · 6 Silence · 7 Licensing & asking

---

## 1. The beat grid

If there is music, **its tempo is your timeline.** Decide BPM first, then build on it:

| BPM | beat @30 fps | beat @60 fps | 8th @30 fps | bar (4 beats) | whole frames @30? |
|---|---|---|---|---|---|
| 60 | 30f | 60f | 15f | 4.00 s | yes |
| 75 | 24f | 48f | 12f | 3.20 s | yes |
| 90 | 20f | 40f | 10f | 2.67 s | yes |
| 100 | 18f | 36f | 9f | 2.40 s | yes |
| 110 | 16.36f | 32.73f | 8.18f | 2.18 s | no |
| **120** | **15f** | 30f | 7.5f | 2.00 s | **yes** |
| 124 | 14.52f | 29.03f | 7.26f | 1.94 s | no |
| 128 | 14.06f | 28.13f | 7.03f | 1.88 s | no |
| 140 | 12.86f | 25.71f | 6.43f | 1.71 s | no |
| 150 | 12f | 24f | 6f | 1.60 s | yes |

- **Scene boundaries on bar lines** (multiples of 4 beats); **hero landings on beats**; stagger gaps on 8ths/16ths; cuts and punches on the **downbeat**.
- Fractional beat lengths are fine for *continuous* motion (`useBeat` uses them). **Cuts must be whole frames:** use `snapToBeat(frame, bpm, fps, subdivision)` (`choreography.ts`).
- Shot length follows tempo and personality: hype 2–4 beats · promo 4–8 beats (1 bar-ish) · cinematic 8–16 beats.
- **BPM unknown?** Ask the user (or read it from the track's metadata or the library page). Don't guess by ear.
- **Beat pulse:** `scale: 1 + 0.03–0.08 × useBeat(bpm).pulse` on one element (logo, headline). Subtle on every beat beats huge on a few. Don't pulse everything.
- Drops/phrases: reserve your biggest move (the reveal, the logo, the stat) for the **first beat of a phrase** (bar 1, 5, 9…); build for the 1–2 bars before it.

---

## 2. Audio in Remotion

Use `<Audio>` / `<Video>` from **`@remotion/media`** (current official recommendation), with the file in `public/` via `staticFile()`.

```tsx
import {Audio} from '@remotion/media';
import {interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const frame = useCurrentFrame();
const {durationInFrames, fps} = useVideoConfig();
// Composition-timed fade: in over 1 s, out over the last 2 s (clamped!)
<Audio
  src={staticFile('music.mp3')}
  volume={interpolate(frame, [0, fps, durationInFrames - 2 * fps, durationInFrames], [0, 0.5, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
/>
```
Verified props (`@remotion/media` 4.0.532): `src`, `volume` (a number, **or** a callback `(mediaFrame) => number` whose frame is relative to the **media's own start**: use that form for per-clip fades such as SFX; with `loop`, add `loopVolumeCurveBehavior="extend"` to run one curve across the loops), `loop`, `playbackRate`, `muted`, `trimBefore`, `trimAfter`, plus the sequence props `from`, `durationInFrames`, `name`, `premountFor`. Because `from` is a prop, a sound effect is one line: `<Audio src={staticFile('whoosh.wav')} from={frameOfImpact - 2} />`, no `<Sequence>` wrapper needed.

- **Fade music in (≥ 0.5 s) and out (≥ 1.5 s)**, always; never cut music dead at the last frame.
- Trim silence/lead-in with `trimBefore` so the first beat lands where you expect; then `from` places the clip.
- Long track, short video: `trimAfter` + fade, or `loop` only for ambient beds.

---

## 3. SFX placement

One sound per **hero event**; 2–3 SFX per second at most. Vary `playbackRate` (0.92–1.08) between repeats so it doesn't sound like a sample being retriggered.

| motion | sound | placement |
|---|---|---|
| whip, big slide, fast reveal | **whoosh** / **whip** | start 3–6 frames **before** the move peaks, so the swish rises into it |
| hero lands / logo locks / number hits | low **impact / thud** (supply one) | on the landing frame, **0–2 frames early** |
| UI tap, cursor click | **mouse-click** | on the click frame |
| toggle, state flip | **switch** | on the flip frame |
| page / slide change | **page-turn** | at the start of the transition |
| success / completion | **ding** | on the completion beat |
| camera / reveal flash | **shutter-modern** | on the flash frame |
| counter ticking | soft tick, **or none** | optional; end on a "ding" at the final value |
| riser into a drop | **riser** (supply) | ends exactly on the downbeat |

Official ready-made SFX (per the official skill): `https://remotion.media/whoosh.wav`, `whip.wav`, `page-turn.wav`, `switch.wav`, `mouse-click.wav`, `shutter-modern.wav`, `shutter-old.wav`, `ding.wav` (reachable on normal machines; blocked in some sandboxes).

**Sync tolerance:** sound **slightly early** (≤ 1–2 frames) reads as in sync; sound **late** reads as wrong. When unsure, nudge the sound earlier, never later.

---

## 4. Mixing & loudness

Remotion's `volume` is **linear gain**, not dB: `gain = 10^(dB/20)`.

| dB | gain | typical use |
|---|---|---|
| 0 | 1.00 | hero SFX peaks, voice-over |
| −6 | 0.50 | SFX bed, music with no voice |
| −12 | 0.25 | music under voice-over |
| −18 | 0.125 | quiet ambient bed |
| −24 | 0.063 | barely-there texture |

- **Music under VO:** ~0.25 while the voice speaks; ramp over ~0.3 s into and out of speech (duck with a `volume` callback that reads the VO windows).
- **Target loudness** for web/social ≈ **−14 LUFS integrated**, true peak ≤ −1 dBTP. Measure the rendered file (the last lines of the output print `I:` integrated loudness and the peak):
  ```bash
  ffmpeg -i out/video.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12
  ```
- Clipping = distortion. If peaks exceed 0 dBFS, lower the music/master gain rather than the SFX.

---

## 5. Audio-reactive visuals

For visuals that move with the audio (bars, pulses, glow) follow the official **`audio-visualization`** guidance (`useAudioData` + `visualizeAudio` family). Rules of thumb:
- Drive **one or two** properties (scale, glow, bar height); never everything.
- Use **low-frequency bins** for body/scale pulses (kick, bass), highs for sparkle.
- **Smooth** the signal (average a few samples / ease it) or it twitches. Raw spectrum data looks like noise.
- A scripted `useBeat()` pulse is cleaner than live analysis when the BPM is steady; use analysis for rubato/live material.

---

## 6. Silence

Silence is an instrument. A **3–6 frame gap** of near-silence just before the biggest hit (drop the music, hold, then slam) makes the hit feel enormous. Likewise end on a short, deliberate tail, not an abrupt cut.

---

## 7. Licensing & asking

- **Never ship music you don't have the rights to**, and don't assume a track is free because it's online. If the user didn't supply audio, ask whether they have a licensed track; otherwise deliver silent with the **beat grid / cue sheet** ready (a list of frames where hits land) so audio can be dropped in.
- Captions and voice-over timing: see `typography.md` §4 and the official `remotion-captions` skill.
