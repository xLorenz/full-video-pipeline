# Aesthetics pass

A piece can move correctly and still look like a tech demo. This file is the pass that makes it look made. Run it after the first stills, before the final render. The worked example is `examples/lily-boat.html` (built from a top-down lotus-pond illustration). Its first version had every element working and still looked flat. Each section below is a change that fixed that.

## Contents
1. One light, everywhere
2. Palette discipline
3. Value and depth layers
4. Scale and density variety
5. Atmosphere: light that lives on the surface
6. Restraint
7. Calm motion
8. Finishing: grade, vignette, grain, a signature
9. Checklist

---

## 1. One light, everywhere

Pick one light direction and write it down as a constant: `const LIGHT = { x: -.62, y: -.78 }` (top-left). Then every lit and shaded thing reads from it:
- **Highlights** sit toward the light. Offset radial-gradient centres by `LIGHT * r * .35`.
- **Form shadow**: a linear gradient across each shape, clear on the lit half and darker (alpha ~.25) on the far side.
- **Rim light** only on the lit edge. Stroke the outline with a linear gradient from a pale tint at `LIGHT * r` to transparent at the centre.
- **Cast shadows** fall away from the light (`-LIGHT * r * .14`). Make them long and soft (blur ~0.1 r, alpha ~.5), never short hard drop shadows.
- Canvas `shadowOffset` is in device pixels, so multiply by `K * cam.s`. Keep its direction the same as the baked shadows.

Mismatched light directions are the most common thing that makes a piece look cheap, even when nobody can say why.

## 2. Palette discipline

- **Three roles.** Dominant (~60%, the ground: pond water), secondary (~30%, the main mass: leaves), accent (≤10%, what the eye should find: red koi, pink lotus). Write the hex values for each role into the beat sheet.
- **One accent family.** Red koi plus pink lotus plus a red seal is one warm family against the greens. A blue or yellow prop would split attention.
- **Pull the neon out.** Fully saturated mid-tones look digital. Keep the most saturated colour for the accent and let the large areas sit slightly greyed (`#1a432b` water, not `#2a7a3b`).
- **Hue-shift the shading**, don't just darken. Shade toward cool or deeper hues and light toward warm or yellower ones (leaves go `#cfe772` → `#9acd4b` → `#5aa035`).
- **Two or three variants per repeated object** (three leaf palettes), chosen with the seeded `rng`, so a field of 70 leaves doesn't look stamped.

## 3. Value and depth layers

Squint at a still, or view it at 200 px wide. You should see three or four clear value bands, not mush. Build the depth from back to front:

| layer | treatment | example |
|---|---|---|
| deep | darkest, lowest contrast, no rim light | submerged dark leaves |
| mid | full colour, soft shadows | koi under the surface |
| surface | brightest, rim light, cast shadows | lotus leaves, the boat |
| air | tiny, high-key, sparse | glints, petals, the seal |

Swimmers go *under* the surface layer. Things partly hidden under leaves sell depth better than anything drawn on top.

## 4. Scale and density variety

- **Skew sizes.** Use `r = min + range * R() ** 1.5`: many small, a few big. Uniform radii look like a grid even when the positions are random.
- **Let shapes overlap** (centre distance ≈ 0.76 × the sum of radii) and run off the frame edges. Things that sit politely inside the frame look like clip-art.
- **Keep one clear path of negative space** for the subject to move through (the channel). Calm space next to dense texture is what makes density look lush rather than busy.
- **Small irregularities** baked per object: rim wobble at low amplitude (≤1.5% of r, or round things turn into polygons), a lifted, lighter rim on about a third of them, and the centre slightly off-centre.

## 5. Atmosphere: light that lives on the surface

Cheap, high-impact passes, all built once and composited:
- **Caustics.** A 512² tile of arc fragments, **blurred at bake time** (`g.filter = 'blur(2.5px)'`) so they read as light, not lines. Draw it as a `repeat` pattern twice, at different scales drifting in different directions (`pattern.setTransform(new DOMMatrix().translate(t*sx, t*sy).scale(s))`), using `screen` at alpha ~.04–.05. Draw it under the surface layer so it shows only in open water.
- **Glints.** A couple of dozen points that twinkle with `max(0, sin)^8`, so they flash briefly and rarely. Use a soft radial blot plus a thin cross. Sharp four-point stars look like emoji.
- **Drifting particles** that belong to the world: petals on the current, pollen, dust in a light beam. Use 5 to 8 of them, staggered over the loop.
- **One accent bloom.** A lotus opening, or a lantern lighting, gives the eye a reward partway through.

## 6. Restraint

Every effect has a budget. A piece looks amateur when every element is shouting at once.
- Ripples: 2 rings and alpha ≤ .3 for ambient ones. Save stronger rings for story moments (an oar catch, food landing).
- Grain at overlay alpha .06–.08. More than that reads as dirt.
- No more than about 4 accent objects visible in one frame.
- If an effect is only noticeable when you look for it, it's at the right level. If you notice it first, halve it.

## 7. Calm motion

- Ambient springs are softer than gag springs: `spring(x, 5, 9)` for leaves, versus `(6, 12)` for cartoon pop-ins.
- Idle bob ±1.5 px and rotation ±.035 rad on `loopW` sines. Big idle motion reads as nervous.
- Hold the opening. A held beat (the dot sitting on paper for 0.7 s) before the big move makes the move land.
- The camera eases between keys and starts close on the first image (zoom 1.6 on the dot), then pulls out as the world builds.
- Never leave more than ~0.4 s where nothing new is happening during the build. Overlap the stages (water fills → submerged layer bleeds in → surface pops outward → creatures arrive).

## 8. Finishing: grade, vignette, grain, a signature

Draw these in screen space after the world and before the grain:

```js
const pond = smooth(1.2, 2.4, t);                       // fade the grade in once the world exists
ctx.save(); ctx.globalCompositeOperation = 'soft-light';
const lg = ctx.createLinearGradient(0, 0, cw, ch);      // warm from the light, cool in the far corner
lg.addColorStop(0, `rgba(255,232,160,${.35 * pond})`); lg.addColorStop(.5, 'rgba(255,232,160,0)'); lg.addColorStop(1, `rgba(10,40,70,${.35 * pond})`);
ctx.fillStyle = lg; ctx.fillRect(0, 0, cw, ch); ctx.restore();
const vg = ctx.createRadialGradient(cw*.45, ch*.42, D*.28, cw*.5, ch*.5, D*.62);   // D = hypot(cw, ch)
vg.addColorStop(0, 'rgba(4,18,10,0)'); vg.addColorStop(1, `rgba(4,18,10,${.08 + .34 * pond})`);
ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
```

Tint the vignette with the dominant hue (dark green here), not black. A small **signature** near the end (a red seal stamp that presses in with a scale of 1.35 → 1 and a soft thunk) closes the loop like a print. Keep it small, in a corner, and in the accent colour. Leave it out if the user wants a clean clip.

## 9. Checklist

Before the final render, look at a 6-frame contact sheet and one full-size crop, and answer:
1. Does every highlight and shadow agree on one light direction?
2. Squint: are there 3 or 4 clear value bands, with the accent the most saturated thing on screen?
3. Are sizes skewed (many small, few big) with overlaps and shapes bleeding off the edges?
4. Is there one calm path of negative space for the subject?
5. Does any effect stand out before the subject does? If yes, halve it.
6. Is there a gap in the build longer than ~0.4 s with nothing new on screen?
7. Grade, vignette and grain are on, and the loop seam still matches?
