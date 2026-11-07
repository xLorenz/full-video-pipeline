# Cartoon characters

Techniques from `examples/aliens.html`. Function names below are the ones in that file. Read the file for the full code.

## Contents
1. The ink look
2. The rig: one pose function per character
3. Faces: eyes, look-at, blinks, expressions, mouths
4. Talking: bubbles, typewriter, mouth flap, babble
5. Props on arcs (the ball)
6. Gags and effects
7. Sound
8. Camera
9. The aliens beat sheet (a worked example)
10. Mistakes caught in review

---

## 1. The ink look

- **Line boil.** Ink drawings feel alive when their lines redraw slightly 12 times a second. Set `BF = floor(t·12)` per frame, and feed it into every hash that perturbs a shape:
  - circles as 56-point polylines with radius × (1 + .009·sin(3a+φ1) + .006·sin(5a+φ2)), with φ from `hash(BF…)` (`circlePath`)
  - body points jittered ±0.55 px (`smoothClosed`)

  Keep the boil subtle. It should read as hand-drawn, not shaky.
- **White fill + black stroke** (`inkShape`). Overlapping parts hide each other's lines naturally, just like a drawing.
- **Hatching** (`hatchCircle`). Short parallel strokes from the rim inward at a fixed slant, clipped to the shape, densest in the middle of the shaded arc and tapering at its ends. Layer a second, crossing set over part of it for crosshatch.
- **Ground shadow** (`groundHatch`). Short slanted dashes in a flat ellipse under the feet, denser in the centre. It shrinks while the character is in the air.
- **Paper:** off-white with faint grain and vignette, plus whatever the reference has (here the spiral-binding marks down the left edge).
- **Font:** a handwriting face from Google Fonts (`Patrick Hand`) with a cursive fallback.

## 2. The rig

Each character is data: position, head radius, kind (`ant` / `crown` / `elf`), voice pitch and phase. Each has its own timelines:

| timeline | form | drives |
|---|---|---|
| `HOPS` | `[start, height, duration]` | parabolic jump + squash/stretch (`hopState`) |
| `LEAN` | keyed | whole-body rotation about the feet (lean in to whisper) |
| `TILT` | keyed | head rotation about the neck (listening, laughing) |
| `ARMS` | keyed `[left, right]` | 0 = hanging, + = outward and up, − = wrapped across the front |
| `WAVE` | windows | overrides the right arm with a waving oscillation |
| `LOOK` | `[t, target]` | `'cam'`, another character, or `'ball'` |
| `EXPR` | `[t0, t1, expr]` | `normal`, `happy`, `surprised`, `dizzy` |
| `LAUGH` | window | body shake, open-D mouth, head wobble |
| `BLINKS` | times | 0.14 s blinks, staggered between characters |

`charBase(id, t)` returns the pose without looking anything up from other characters. `toWorld(st, lx, ly)` maps a body-local point to the world through squash, lean and hop. Every prop anchor is built from these two:
- `holdPt`: the chest
- `headTopBall`: on top of the head
- `antTipBall`: the antenna tip
- `bubbleAnchor`: above the head

Look-at targets and ball endpoints use `charBase` too, which keeps the functions free of loops.

**Squash and stretch** come from each hop:
- squash down in the 0.12 s before take-off
- stretch while in the air
- a damped squash wobble after landing

Add a breathing squash of ±1.2% on a loop-safe sine. Draw under `scale(1 − sq·0.5, 1 + sq)` about the feet.

**Body.** One closed smooth path: neck → shoulders → hips → two stubby legs with a notch between them. Arms are capsules hinged at the shoulders.
- Arms with angle ≥ 0 are drawn *before* the body, so the body hides their roots and they look like part of the outline.
- Arms with angle < 0 (wrapped round a held ball) are drawn *after* the body and the ball.

**Head group.** `translate(0, −neck) → rotate(tilt) → translate(0, −0.88r)`. Inside it, in this order:
1. antennae / ears (behind)
2. head circle
3. hatching
4. eyes
5. mouth
6. crown (in front)

## 3. Faces

- **Eyes:** black ellipses at ±0.4r, slightly drooped outward (cute). A big highlight plus a tiny one.
- **Look-at:** shift the eyes by `look·0.07r` and the highlights a bit further, where `look` is the unit vector to the target (shortened when it's close). Blend between targets over 0.25 s. Characters watching the ball track it through the whole arc; that is the cheapest way to make a scene feel connected.
- **Blink:** squash the eye height by `sin(π·u)`, and draw a closed-lid curve at the bottom of the blink.
- **Expressions:**
  - happy: thick ∩ arcs
  - surprised: eyes ×1.18 and a small o mouth
  - dizzy: black eyes with a rotating white spiral, plus stars orbiting the head
- **Mouths:** small smile arc by default (none for the antenna alien, true to the drawing). A flapping black oval while talking. An open D while laughing.

## 4. Talking

`TALK = [{who, t0, t1, text, small?, dx?}]`:
- **Bubble.** Rounded superellipse with a boiling outline and a tail pointing to `bubbleAnchor`. Clamp it inside the frame and scale it in with `spring` from the anchor. Draw the tail first so the bubble covers its base line.
- **Typewriter.** Reveal `n = floor(progress·len)` characters at ~0.065 s each. Draw left-aligned from the *full* text's left edge, so the text never shifts as it types.
- **Mouth flap.** While typing, `open = .15 + .85·hash(floor(t·14))`. Add a small arm gesture on top.
- **Babble.** One triangle-wave blip per letter at the moment it appears, at the character's base pitch ±25%. Low voice = big character, high = small. This gibberish ("animalese") is what sells "talking".

Keep lines short: 2–5 words. Two characters may overlap only for reactions or laughs, and then use small bubbles with `dx` offsets.

## 5. Props on arcs

The ball is a list of segments, each a pure function of time:
- `drop`: lerp in x, `u²` in y (gravity)
- `arc`: lerp plus `−4h·u(1−u)`
- `hold`: glued to `holdPt(who, t)`

Each arc's endpoints are functions of time evaluated at the segment's own start and end times, using the rig anchors. A throw then lands exactly on a head that is mid-hop. Time the receiver's hop so the peak meets the ball (header: hop at 8.38 s, contact at 8.55 s).

While held, the holder draws the ball inside `drawChar` between body and front arms. In flight, draw it after all characters, with three short speed lines behind its velocity and a ground-hatch shadow that grows as it nears the floor.

## 6. Gags and effects

- **Item pops off** (crown). Parabola up, spin `u·(2π + 0.3)`, so it lands tilted by exactly 0.3 with no jump. Hold the tilt, then straighten it when the character reaches up for it.
- **Springy appendage** (antenna). Wobble = Σ over events `amp·e^(−4.5d)·sin(17d)`. Events are the hits plus every hop landing. Offset the two antennae by 0.04 s.
- **SFX words** ("BOING!", "BONK!", "pop!"). Bold hand font with a thick white outline under black fill, spring scale-in, slight rotation, and 8 radiating impact lines at the hit point for 0.3 s.
- **Dust:** small ink circles puffing out sideways from the feet on every landing.
- **Laugh sparkles:** 4-point ink stars popping around the group.
- **Exits for loops:** anything that appears must leave before the end. The ball is tossed off the top-right, so the last frame matches the first.

## 7. Sound

Everything is synthesised with WebAudio. Each sound is a function `(ac, when)`, so the same code plays live and renders offline into a WAV for the MP4. Use the template's `tone()` / `noise()`: they round every attack, lowpass every sound, pan it to the event's x, and send it into the same room as the score. Read `references/sound-design.md` before inventing new sounds. Cartoon sounds can be brighter and punchier than organic ones, but never clicky or hissy.

| sound | recipe (soft version) |
|---|---|
| blip | triangle, f → 0.9f over 120 ms, attack 8 ms, lowpass 2.2 kHz, f from the score's scale |
| pop | sine 420 → 620 Hz, 140 ms, attack 10 ms (the old 500 → 1100 chirp was shrill) |
| thump | sine 120 → 60 Hz, 250 ms, lowpass 500 (landings, catches, bounces) |
| boing | sine 170 → 520 Hz over 0.5 s, with a 22 Hz vibrato LFO, 0.65 s decay, lowpass 1.8 kHz |
| bonk | sine 260 → 70 Hz plus a short brown-noise tap (lowpass 1.5 kHz), no square-wave click |
| whoosh | brown noise bandpass 300 → 900 Hz, swelling over 180 ms (throws) |

`EVENTS` is built from data: talk blips, bubble pops, hop landings, ball holds and throws, plus the gag hits. Live playback fires the events whose time is crossed between two frames (handling the loop wrap), but only after the user clicks the sound button, because browsers block audio until a click.

## 8. Camera

Same keyed camera as the organic pieces, used like an editor:
- base 1.3× on the group
- push to 1.5× on the whisper
- pull out and tilt up when the ball flies off the top (it leaves frame; the payoff is it coming back)
- punch in to 1.5× on the bonk
- ease back

Clamp to the paper so the view never shows past its edge.

## 9. The aliens beat sheet

| t (s) | beat | sound |
|---|---|---|
| 0–1.8 | the drawing's pose: C waves, everyone breathes and blinks | — |
| 1.9–4.0 | A leans in, "psst… wanna play?"; B and C look at A; camera pushes in | low babble |
| 4.05–5.3 | B hops twice, arms up, "YES!!" | high babble, thumps |
| 5.4–6.8 | ball drops from the sky, bounces three times; C startles, then picks it up | thumps |
| 6.85–7.75 | C: "catch!" and throws to B | whoosh |
| 8.4–8.6 | B headers it; the crown pops off and spins | pop |
| 9.35 | the ball hits A's antenna mid-jump: "BOING!"; the ball leaves frame upward; all look up | boing |
| 9.6 | crown lands tilted; B: "my crown!" | tink |
| 11.0 | the ball comes down on A's head: "BONK!", spiral eyes, stars; camera punch | bonk |
| 11.7 | ball bounces into C's arms; A: "ow…" | thump |
| 12.2–14.3 | everyone laughs (hops, D mouths, sparkles); B straightens the crown | babble |
| 14.5–17 | quick passing circle C → B → A → C | whooshes |
| 17.2 | C: "best game ever!" | babble |
| 19.45 | C tosses the ball off the top-right; B cheers | whoosh |
| 20.3–22 | C waves, "bye!", back to the opening pose → loop | babble |

## 10. Mistakes caught in review

- A speech bubble covered the crown-pop gag. Speak *after* the visual gag lands, or move the bubble aside.
- Arms holding the ball were hidden behind the body. Use negative angles, drawn in front.
- The characters were too small at camera 1.1. Frame the group to fill ~75% of the width.
- An elf ear with a wide base reads as a cat ear. Keep ear bases narrow (≤ 0.5 rad of the head circle).
