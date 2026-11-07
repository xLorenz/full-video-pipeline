# Organic motion

Techniques from `examples/koi-pond.html`. Function names below are the ones in that file. Read the file for the full code.

## Contents
1. Swimming creatures (koi, fish, eels, tadpoles)
2. Watercolour and paper textures
3. A shape that grows like a drop (`blobPath`)
4. Looping hand-drawn lines (`WAVES`)
5. Ripples, pop-ins, blooms, confetti
6. Camera
7. Draw order and clipping

---

## 1. Swimming creatures

The motion that reads as alive comes from three layers. Get them in this order:

**a. The head follows a path.** A wandering path is a sum of sines with incommensurate frequencies, so it never visibly repeats:

```js
x = cx + 215*sin(.41u + a) + 65*sin(.97u + b)
y = cy + 430*sin(.27u + c) + 85*sin(.71u + d)      // u = t*speed + offset; give each fish its own phases
```

**b. The body follows the head's own past** (`koiSpine`). Don't bend the body with a formula. Walk *backwards* along the head's path in small steps of `u`, dropping a spine point every `L/(N-1)` px of travelled distance. The body then curves exactly where the head turned, like a train following its engine. 16 points, step `du = .0025`, with a guard of ~8000 steps.

**c. A swimming wave on top.** Offset each spine point sideways along its normal:

```js
lat_i = amp * s^1.6 * sin(2π·f·t − i·0.42)     // s = i/(N−1), amp ≈ 0.07·L, f ≈ 1.9 Hz
```

Amplitude grows toward the tail and the phase runs head to tail, so the S-wave travels backwards. Add a small counter-yaw at the head (`−0.12·amp·(1−s)·sin(ph)`).

**Body outline.** At each spine point step out ± a width from a profile table (round head, widest at 25–30%, thin peduncle). Add a nose point ahead of the head, then join everything with a smooth closed curve through midpoints (`smoothClosed`). Width profile used for koi (fraction of length): `[.075,.108,.128,.132,.126,.112,.094,.072,.052,.036,.028]` at s = 0, .1 … 1.

**Fins.** Draw these before the body so the body covers their roots:
- *Tail:* forked fin at the last spine point, swinging with the same wave phase. Two lobes at ±0.55 rad, a notch at 0.5·length, quadratic curves between them, and thin rays.
- *Pectoral and pelvic:* ellipses anchored at the body edge, pointing back and outward, flapping on their own slower timer.
- Translucent fill (alpha ~0.8).

**Markings.** Clip to the body path and place everything in spine coordinates (`at(s)` returns position, normal, tangent and width), so the markings bend with the fish:
- patches as ellipses rotated to the local tangent
- ring spots
- a thin white wavy line along one side
- a wide, low-alpha light stroke down the spine for volume
- a thick dark stroke of the outline *inside* the clip for watercolour edge darkening
- eyes at s ≈ .07, ±0.72 width

**Shadow.** Use canvas `shadowColor` / `shadowBlur` / `shadowOffset` on the body fill. Shadow offsets are in device pixels and ignore the transform, so multiply by `K * cam.s`.

**Entrances.** Fade alpha in over 0.6 s and slide the fish in along its starting heading: `offset = T0 · D · (easeOut((t−start)/2) − 1)`. The fish appears to swim in fast and settle to cruising speed.

**Changing behaviour mid-piece** (wander → circle the lotus). Blend the *path function* itself: `P(u) = mix(wander(u), orbit(u), smooth(8.4, 10.4, t))`. For the orbit, use the time that corresponds to `u` (`(u − off)/sf`), so the backwards spine walk still traces the orbit. Never blend the drawn shapes.

The same rig works for any swimmer: change the path, length, width table and fins. Eels: long, thin, bigger amp. Tadpoles: huge head, fast tail beat. Sharks: stiffer front (lower exponent).

## 2. Watercolour and paper textures

Build these once at load into an offscreen canvas at 1.5× world resolution (`pondTex`), then `drawImage` it clipped to the shape each frame:
- base fill
- ~340 radial-gradient "blots" at random sizes (25–155 px), 55% darker and 45% lighter than the base, alpha .06–.18
- ~6000 tiny 1–2 px speckles at alpha < .08

Make gradients fade to the same colour at alpha 0 (`rgba(r,g,b,0)`), not to transparent black, or the blots get grey fringes.

**Paper:** a warm off-white base with a few hundred large faint blots.

**Grain:** a 256² random-grey tile used as a repeating pattern, composited `overlay` at alpha ~.07 in screen space after everything else.

Use a seeded PRNG (`rng(seed)`, mulberry32) for every random layout, so the piece looks identical on every load and every render.

## 3. A shape that grows like a drop

`blobGrow(t)`: a dot springs in (`0.032·spring`), then expands to full size with an under-damped spring that overshoots ~7%. That overshoot is the liquid "blop".

`blobPath`: an ellipse whose radius is modulated by a few fixed sines of the angle (3, 5, 9, 17, 31 lobes at decreasing amplitude) for a hand-cut edge. While growing, add an extra wobble term that dies off as it reaches full size. Make the height grow faster than the width (`ry = rx + 230·g²`), so the shape starts round and ends as a tall oval.

Clip everything inside the pond to this path. A thick low-alpha stroke inside the clip plus a thin stroke outside gives the watercolour edge.

## 4. Looping hand-drawn lines

These are prolate trochoids whose loop size is a Gaussian bump. They are straight-ish waves with an occasional loop where you place it:

```js
x = x0 + a·θ − b(θ)·sinθ,   y = y0 + gentle sines(x) − b(θ)·cosθ,   b(θ) = 34·exp(−((θ−θc)/1.4)²)
```

With `a = 14`, a loop forms wherever `b > a`, centred on `θc = 2πm`. Precompute the points. To draw the line on, show the first `smooth(t0, t1, t)·n` points. Stagger each line by 0.12 s and sway it sideways a few px.

## 5. Ripples, pop-ins, blooms, confetti

- **Ripples:** rings with `radius = (t−t0)·speed − i·gap` and `alpha = (1 − radius/max)·a`. Spawn a ripple at every pop-in. That one rule makes the pond feel wet.
- **Pop-in:** `scale = spring(t − t0, 6, 12)`, i.e. `1 − e^(−kx)·cos(wx)`. Add a slow bob (±2 px) and rotation (±.06 rad) on loop-safe sines.
- **Lily pad:** circle with a wedge notch (rim radius wobbled by `sin(6a)`), radial-gradient highlight, curved veins (quadratic, centre to rim), dark outline, drop shadow, a few doodle glyphs, optional handwritten word ("hush").
- **Lotus bloom:** 3 rings of petals (8, 8, 6). Each ring starts 0.22 s after the previous one, with `spring` scale plus an untwist (`(1−s)·0.9` rad). Petals are two bezier curves with a white-to-pink gradient from base to tip and a white outline. A yellow centre disc arrives last. Add a pulsing red radial glow behind it and repeated ripples.
- **Confetti:** glyph types (dot, ring, x, zigzag, triangle) in a 6-colour palette.
  - Ambient pieces pop in at staggered times and drift on sines.
  - Burst pieces fly out with `easeOut` distance, then keep slowly orbiting and twinkling.

## 6. Camera

Use keyframes `[t, scale, cx, cy]` with smoothstep between them (`camAt`):
- start wide while the scene builds
- push in (1.3×) and drift during the action
- pull back for the finale
- end on the same key as the start, so the loop is seamless

Clamp the centre so the view never leaves the painted world. Draw the paper in world space too, so it moves with the camera.

## 7. Draw order and clipping

From back to front:
1. paper
2. pond shadow
3. **inside the pond clip:** texture → lines → ripples → swimmers → glow → pads → flowers → confetti → inner edge stroke
4. outer edge stroke
5. grain (screen space)
6. end-of-loop fade to the paper colour (last 0.8 s)

Swimmers go *under* the pads. That one choice sells the depth.
