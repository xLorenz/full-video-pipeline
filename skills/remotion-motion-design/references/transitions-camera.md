# Transitions, camera & motion blur

Contents: 1 What a transition is for · 2 The menu · 3 TransitionSeries mechanics (and two traps) · 4 Custom transitions · 5 Camera · 6 Motion blur

---

## 1. What a transition is for

A transition is **punctuation**. Choose it by the relationship between the two scenes, then keep the vocabulary small (one main transition + at most one accent per piece).

| relationship | transition | feel |
|---|---|---|
| continuation (same idea, next beat) | crossfade, short slide | calm, flowing |
| progression (step 2 of 3) | slide along the reading axis, wipe | structured |
| contrast / new topic | hard cut, `wipe`, `pushCut` | decisive |
| change of place / energy spike | **whip** (blur), `zoomBlur`, `crossZoom` | kinetic |
| reveal / focus | `iris`, mask, scale-through | dramatic |
| nostalgia / warmth | `filmBurn`, light leak overlay, long dissolve | cinematic |

**Timing:** 0.4–0.6 s standard · 0.15–0.25 s hype (often just a hard cut on the beat) · 0.8–1.2 s cinematic. **Always eased** (`linearTiming` is linear by default). Cuts that land on a beat feel intentional; cuts between beats feel accidental.

**Don't stack a transition on top of entrance animations.** Either the transition brings the scene in or the elements do. Let the transition run ~30% before the first element starts (`IN = 0.15 s` in `Showcase.tsx`), and **never let the frame go empty** while the old scene leaves and the new one hasn't arrived.

---

## 2. The menu (`@remotion/transitions/<name>`; classification verified from the package source)

**DOM-based: work everywhere, no GPU setup**
| import | what it does | notes |
|---|---|---|
| `fade` | crossfade | see trap 1 below |
| `slide` | push (`from-left/right/top/bottom`) | along the reading axis; ease it |
| `wipe` | edge reveal | editorial, decisive |
| `iris({width, height})` | circular reveal; **props required** | playful / focus |
| `clockWipe({width, height})` | radial sweep; **props required** | infographic, timers |
| `flip` | card flip | playful; easy to overuse |
| `pushCut()` | punchy push-in (outgoing 1.04×, incoming 1.04→1.07×) with a 2-frame 20% flash; tunable via `outgoingScale`, `incomingStartScale`, `incomingEndScale`, `flashOpacity`, `flashFrames` | hype, trailers |
| `none()` | **no visual effect of its own**: you drive the motion with `useTransitionProgress()` (see *content-driven handoff* below) | pro choreography |

**Shader-based: WebGL2 via HTML-in-canvas** (premium, but need setup: render with `--gl=angle`; Studio preview needs Chrome 149+ with `chrome://flags/#canvas-draw-element`; not exercised in this skill's tests: verify against the current docs before promising them)
`crossZoom` · `zoomBlur` · `zoomInOut` · `blurSlide` · `linearBlur` · `dissolve` · `dreamyZoom` · `crosswarp` · `ripple` · `swap` · `bookFlip` · `filmBurn`

Import from the kebab-case path (`@remotion/transitions/cross-zoom`). **Signatures (type-checked):** `fade()`, `pushCut()`, `none()` take no argument; `iris({width, height})` and `clockWipe({width, height})` require them; the shader presentations **require an argument**: `crossZoom({})`, `zoomBlur({rotation: 0})`: bare `crossZoom()` is a type error. They also accept an `effects` prop.

Defaults by personality: Precise → `fade` / `slide` / `wipe` · Cinematic → long `fade`, `filmBurn`, `dreamyZoom` · Playful → `iris`, `slide`, `flip` · Hype → `pushCut`, `zoomBlur`, **`whip`** (custom, below), hard cuts · Editorial → `wipe`, hard cut.

---

## 3. TransitionSeries mechanics

```tsx
const T = sec(0.5, fps);
const timing = linearTiming({durationInFrames: T, easing: ease.move});   // ALWAYS pass an easing
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={sec(3, fps)} premountFor={fps}><A /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade({shouldFadeOutExitingScene: true})} timing={timing} />
  <TransitionSeries.Sequence durationInFrames={sec(3.8, fps)} premountFor={fps}><B /></TransitionSeries.Sequence>
</TransitionSeries>
```
- **Transitions shorten the timeline** (both scenes play during the overlap): `total = Σ scenes − Σ transitions`. Compute it once (`showcaseDuration(fps)` in the starter) and feed `<Composition durationInFrames>`.
- **Overlays** (`<TransitionSeries.Overlay>`, e.g. a light leak) render on top of a cut and **don't** shorten the timeline; an overlay can't be adjacent to a transition or another overlay.
- `premountFor={fps}` on every `Sequence`/`Overlay` (not on `Transition`) so the next scene is mounted and its fonts/images loaded before it appears.
- Children are absolutely positioned and full-frame; scenes author in **scene-local time** (`useCurrentFrame()` restarts at 0).
- Keep each transition shorter than both neighbouring scenes.
- A **persistent `<Backdrop>` outside** the `TransitionSeries` gives one continuous world; only content transitions.

### Trap 1: `fade()` only fades the *incoming* scene
By default the outgoing scene stays **fully opaque** underneath, then vanishes in a single frame. With opaque scenes you never notice. With **transparent scenes over a persistent backdrop** it produces text ghosting on text, then a pop. Fix: `fade({shouldFadeOutExitingScene: true})`. (Found by rendering frames *inside* the transition; the linter flags bare `fade()`.)

### Trap 2: the empty beat
If the new scene's first element starts late (or is faint, like a thin drawing ring) and the old scene has faded, the viewer sees an almost empty frame for ~0.5 s. Make the **hero of the new scene land first**, give it an early `at`, and let supporting details trail.

---

## 4. Custom transitions

A presentation is a component receiving `presentationProgress` (0→1, already eased by the timing) and `presentationDirection` (`'entering' | 'exiting'`). Verified examples:

- **Content-driven handoff** (`useTransitionStagger` in `choreography.ts`): use `presentation={none()}` and let each scene's *elements* hand off: the outgoing items stagger out while the incoming items stagger in, driven by `useTransitionProgress()`. Nothing fades: things move. Verified semantics: on the incoming scene `entering` ramps 0→1 across the transition; on the outgoing scene `exiting` ramps 0→1; both scenes are mounted together. **`handoff` matters:** if both scenes put text in the *same* spot, entries and exits at the same time land text on text; `handoff: 0.4–0.5` makes exits run first and entries follow (a relay), and per-item stagger keeps the frame from ever emptying.
  ```tsx
  const {enter, exit} = useTransitionStagger(i, n, {handoff: 0.4});   // i = reading-order index
  <div style={{opacity: enter * (1 - exit), translate: `0 ${(1 - enter) * 70 - exit * 40}px`}}>…</div>
  // <TransitionSeries.Transition presentation={none()} timing={linearTiming({durationInFrames: 20})} />
  ```
- **`whip({direction: 'left', blur: 36})`** (`src/motion/presentations.tsx`): old scene flung off one side, new scene whips in from the other, directional blur peaking mid-move and zero at rest. Use `linearTiming({durationInFrames: 6–12, easing: ease.move})`.
- **Iris / circle reveal** inside a scene: `<IrisReveal at={…}>` (`Extras.tsx`; `clip-path: circle(r at 50% 50%)`, `r` eased to cover the diagonal).
- **Match cut:** end scene A and start scene B with the *same shape in the same place* (a ring becomes a lens, a card becomes a screen). Continuity of position/scale carries the eye; no effect needed.
- **Scale-through:** scale the outgoing hero up 6–10× with `perceptual-scale` while fading it, and have the next scene's content already in place behind it.
- **Hard cut on the beat** is a real transition: use `snapToBeat()` for the frame and add a 3–5-frame scale punch or flash on the new shot.

---

## 5. Camera

`<CameraRig push pan rotate shake easing>` (`primitives/Camera.tsx`) is a virtual camera for a scene.

| move | settings | when |
|---|---|---|
| **creep / push-in** | `push={0.03–0.06}`, linear | default for every static layout: "a still that feels filmed" |
| **re-frame** | `pan={[x,y]}`, `easing={ease.move}` | move attention to a new focus mid-scene |
| **tilt / roll** | `rotate={1–3}` | dramatic emphasis; return to 0 |
| **handheld** | `shake={2–4}` (u) | documentary/energy; > 8 reads as an earthquake |
| **parallax** | `<Parallax depth travel>` per layer | depth; 2–3 layers, 60–160u |
| **3D tilt** | `<TiltCard>` | flat cards get presence, ≤ 15° |

Principles:
- **Camera creep is linear on purpose:** it should still be moving when a transition begins (an eased camera stops dead right at the cut).
- **Move toward what matters** (push in on the hero, pull out to reveal context); keep one dominant direction per piece.
- **Backdrop outside the rig**, content inside → content moves against the background.
- **Rack focus** (depth cue): blur a background layer 4–10u while the foreground stays sharp, then swap.
- Camera moves must be **slower than hero moves** or they compete with them.

---

## 6. Motion blur

Blur is what makes fast movement look *real* instead of strobing. Needed when something moves more than ~40–60 px/frame (at 30 fps that's > 1,200–1,800 px/s: whips, slams, fast slides). Not needed for slow eases.

| option | cost | accuracy | notes |
|---|---|---|---|
| **`DirectionalBlur`** (starter) | cheap | good for linear moves | SVG `feGaussianBlur` on one axis; `x = pixelsMovedThisFrame × 0.22`; zero at rest so text is crisp. Verified |
| `<CameraMotionBlur shutterAngle samples>` | × `samples` | true sub-frame average | `@remotion/motion-blur`; DOM-based; use on whole-scene moves |
| `<Trail layers lagInFrames trailOpacity>` | × `layers` | stylised echo | a deliberate "ghost trail" look, not realism |
| `<HtmlInCanvasMotionBlur samples={8} shutterAngle={180}>` | × `samples` | best | per the official docs: Chrome 149+ for preview, no config for render, **don't nest**. Not exercised here |

Velocity trick for `DirectionalBlur`: compute the position function `pos(frame)`, then `vx = Math.abs(pos(frame) - pos(frame - 1))`. For eased moves the blur then peaks automatically where the move is fastest.
