---
name: motion-design-by-okaashish
description: Turn a reference (a Pinterest pin, illustration, sketch, screenshot or someone's video) into an original animation written in code. A canvas page where every frame is a function of time, rendered to MP4 with synthesised sound. Covers two families. Organic motion (swimming koi and fish, ponds, watercolour, ripples, blooming flowers, floating leaves, confetti). Cartoon characters (hand-drawn ink creatures that talk in speech bubbles with gibberish voices, blink, look at things, hop with squash and stretch, and play gags with props). Use this whenever the user shares an image or video and asks to animate it, bring it to life, make it move, make the characters talk or play, "animate this like the video", "can you animate these fishes", turn a drawing into a cartoon or reel, or wants a looping motion-design clip for Instagram or TikTok, even if they never say "code" or "canvas". Prefer this over AI video generators for illustrated or flat looks. For stick figures use stickman-director.
---

# motion-design-by-okaashish

Reference in, original animation out. Two pieces made this way are the worked examples:

- **Koi pond** (`examples/koi-pond.html`, 14 s loop). A watercolour pond grows from a dot and ripples. Looping white lines draw on, lily pads pop in, and four koi swim with bending bodies, beating tails and soft shadows. A lotus blooms in a red glow while the koi circle it. Made from a 9:16 reel.
- **Little aliens** (`examples/aliens.html`, 22 s loop, with sound). Three ink-drawn aliens from a sketchbook page whisper, shout and play catch. A crown pops off, the ball boings off an antenna and bonks a head (spiral eyes, orbiting stars), then they laugh and wave bye. Made from one still drawing.
- **Lily boat** (`examples/lily-boat.html`, 16 s loop, with sound). A green watercolour dot drops on paper and blooms into a pond. Submerged leaves bleed in, lotus leaves pop outward, and koi swim in. A rowing boat glides up the channel, stops, and the passenger feeds the koi, which swarm. Then the boat rows off and a red seal stamps the corner. It has a synthesised koto-and-pad score at 60 BPM (`references/music.md`), with every splash, pellet and the stamp on the beat. Built from a top-down illustration, then given the aesthetics pass (`references/aesthetics.md`): one light direction, hue-shifted leaves, caustics, glints, petals, a colour grade and a vignette.

None of these pieces copies the source artwork. They rebuild its *style* (palette, line, texture, proportions) with new drawing in code. Do the same every time: a reference is someone's art, so match the look and draw your own.

## Files

| path | what |
|---|---|
| `assets/template.html` | starter page: canvas sizing, helpers, camera, playback controls, sound engine, the `__comp` render contract. Copy it for every new piece |
| `references/organic-motion.md` | swimming creatures (spine follows the head's own path), watercolour textures, blob growth, ripples, looping lines, pop-ins, blooms, confetti, path blending |
| `references/character-cartoon.md` | ink look (line boil, hatching), the character rig, faces and look-at, talking (bubbles, mouth flap, babble), props on arcs, gags, sound |
| `references/sound-design.md` | SFX that sound made, not beeped: the shared signal flow (SFX bus, one room with the music, master glue), ten rules (no clicks, brown noise, lowpass everything, sweep down, in key, pan to position, thin out repeats), organic and cartoon recipes, and how to measure harshness without listening |
| `references/music.md` | background music: the synthesised score as data (chords, melody, arpeggio, pad, bass, bell), BPM so the loop is whole bars, story beats on the grid, mood → progression table, mix balance, loudness, seamless loop tails, and `--bgm` for the user's own track |
| `references/aesthetics.md` | the pass that makes a working piece look made: one light direction, palette roles, value and depth layers, scale variety, atmosphere (caustics, glints, particles), restraint, calm motion, grade, vignette and signature, plus a pre-render checklist |
| `examples/koi-pond.html`, `examples/aliens.html`, `examples/lily-boat.html` | the finished pieces. Read the one closest to the request before writing code. `lily-boat` shows the full aesthetics pass |
| `scripts/render.py` | page → MP4 (1080×1920 for 9:16, 30 fps; SFX + score mixed and normalised to −16 LUFS; `--vo` adds a voiceover, `--bgm` swaps in the user's own music) |
| `scripts/stills.py` | page → PNG stills at given times (fast contact sheets for checking beats and the aesthetics pass) |

For a **narrated story** (voiceover, several scenes, captions timed to speech), use the sibling skill **motion-story-by-okaashish**. It builds on this one.

## Workflow

### 1 · Study the reference

**Video:** pull contact sheets with ffmpeg rather than guessing from one frame.

```bash
ffmpeg -v error -y -i ref.mp4 -vf "fps=1/3,scale=360:-1,tile=6x4" -frames:v 1 sheet.jpg              # whole video, a frame every 3 s
ffmpeg -v error -y -i ref.mp4 -t 13 -vf "fps=1,scale=360:-1,tile=5x3" -frames:v 1 part.jpg           # the part you're animating, 1 fps
ffmpeg -v error -y -ss 5 -t 1 -i ref.mp4 -vf "fps=8,crop=500:400:150:150,scale=250:-1,tile=4x2" -frames:v 1 motion.jpg   # 8 frames of one move, cropped
```

Run ffmpeg from a short working directory. On Windows it refuses to start when the current directory path is too long ("path longer than allowed for a Win32 working directory").

**Image:** read it directly.

From either, write down four things before any code:
- **Style tokens:** background, palette (hex) split into dominant / secondary / accent roles, light direction, line weight and colour, texture (watercolour blots, paper grain, hatching), shadow style.
- **Cast:** every object or character and its parts. For characters, what makes each one distinct (antennae, crown, ears).
- **Motion vocabulary:** how things move in the reference (bodies bend, things pop in with overshoot, lines draw on, camera pushes in).
- **Beats:** what happens when. For a video, read it off the contact sheet. For a still, invent the story (step 2).

### 2 · Plan the beats

Write a beat sheet: `time · who/what · action · line or text · sound · music · camera`. Keep it 10 to 25 s, 9:16 unless asked otherwise, and make it loop (the last frame matches the first).

Every piece gets **SFX and background music** unless the user says otherwise. Choose the BPM first so the loop is a whole number of bars (60 BPM: 4 s bars), then put the story beats on that grid. See `references/music.md`. If the user supplies a track, use `render.py --bgm`.

A still image with characters needs a story. The aliens worked with one want ("wanna play?"), one escalating gag chain (crown pops off → boing → bonk), a release (everyone laughs) and a button (wave bye, which is also the opening pose, so it loops). Ask the user only what changes the piece (story, length, mood) and invent the rest. If they gave a one-line ask like "talking and playing", don't ask: pick a story and show it.

### 3 · Build from the template

Copy `assets/template.html` next to the user's work and fill its sections. Read the reference file for the family you're in:
- fish, water, plants, particles, abstract organic motion → `references/organic-motion.md`
- characters, faces, dialogue, props, gags → `references/character-cartoon.md`
- the score (always) → `references/music.md`. Fill `CHORDS` and `MELODY` in the template's section ⑧b
- SFX (always) → `references/sound-design.md`. Build every sound from the template's `tone()` / `noise()`, never raw oscillators straight to `ac.destination`

Rules that made both pieces work:
- **Every value is a pure function of `t`.** No state carried between frames, no `+=` in the loop. That is what makes scrubbing, `?t=` stills and frame-exact rendering possible. Even "physics" (antenna wobble, a body following its head) is written as a function of time: damped sines from event times, and the head's own path sampled backwards.
- **Build expensive textures once** (watercolour, paper, grain) on offscreen canvases at load, and only composite them per frame.
- **Timelines are data.** Keyed arrays like `[[t, value...], ...]` blended with smoothstep (`keyed()` in the template), plus event lists for hops, blinks, speech and sounds. Retiming a beat means editing a number.
- **Loop-safe oscillators.** Idle motions use `loopW(n)` (n whole cycles per loop) so nothing jumps at the wrap.
- **Overshoot on every arrival.** Things pop in with `spring()`, hops squash before and after, cameras ease between keys.
- **Stagger.** Never start two similar things on the same frame (pads pop 0.3 s apart, waves draw on 0.12 s apart).
- **One light.** Set a `LIGHT` direction at the top, and make every highlight, rim light and shadow obey it from the first draft.

### 4 · Aesthetics pass

Once the beats work, read `references/aesthetics.md` and run its checklist on a 6-frame contact sheet plus one full-size crop. Fix what fails before the final render: the light direction, palette roles, value bands, size variety, an atmosphere layer, effect restraint, calm springs, then grade, vignette and grain. Sound gets the same pass: run the `sound-design.md` checklist and band measurements, because harsh SFX ruin a beautiful frame. Do this pass even when the user didn't ask. When they say "make it more aesthetic / prettier / premium", this pass is the answer, so don't redraw the piece from scratch.

For fast iteration, capture stills without the browser pane: `python scripts/stills.py piece.html out_dir 0.6,3,7,11 450` saves `window.__comp.capture(t, width)` for each time and prints console errors. Tile them with PIL. That takes seconds per sheet.

### 5 · Verify with stills

Serve the folder over HTTP, not `file://`: Google Fonts need it, and long Windows paths break `file://`. In the desktop app, add a `.claude/launch.json` entry running `python -m http.server <port> --bind 127.0.0.1` and open it with `preview_start`.

Check key beats by **navigating** to `page.html?t=<seconds>` (the template pauses there) and screenshotting the canvas region. In the built-in browser pane, screenshots taken after a `javascript_exec` call can come back cropped and zoomed. Navigating to a fresh `?t=` URL each time gives true captures. Check the console for errors. Look for:
- things hidden behind other things (a speech bubble covering the crown gag; arms hidden behind the body while holding the ball)
- subjects too small in the frame (the aliens needed camera zoom 1.3, not 1.1)
- the loop seam: compare `?t=0` with `?t=<DUR-0.05>`

Leave the live page playing in the preview pane for the user. Clicking or pressing space pauses, ← → scrub, R restarts, and the button turns sound on.

### 6 · Render the MP4

```bash
python ~/.claude/skills/motion-design-by-okaashish/scripts/render.py piece.html --out piece.mp4            # 1080×1920, 30 fps, with sound
python ~/.claude/skills/motion-design-by-okaashish/scripts/render.py piece.html --out draft.mp4 --width 540   # fast half-size draft
```

```bash
python ~/.claude/skills/motion-design-by-okaashish/scripts/render.py piece.html --out piece.mp4 --bgm their-song.mp3   # user's music instead of the score
```

The script serves the page itself, captures each frame through `window.__comp.capture(t, width)`, and renders the sound offline through `__comp.audio()` (SFX + score, with the loop tail folded onto the start). It mixes in any `--vo` / `--bgm`, normalises loudness to −16 LUFS in two passes, and muxes everything with ffmpeg. Needs python with playwright (chromium) and ffmpeg. On Windows, run it from a short working directory, for the same ffmpeg reason as in step 1. After rendering, pull a contact sheet of the MP4 (step 1's first command) and look at it before sending it to the user.

## What this does well, and what it doesn't

Strong: flat, graphic, illustrated and ink styles. Simple creatures and objects. Watercolour and paper textures. Kinetic type and UI. Characters with simple bodies (big heads, stubby limbs).

Takes more rounds: detailed characters with walk cycles, hands and many expressions; painterly looks; pieces over about 60 s.

Not for this: photoreal people, places or lighting (use an AI video model), or reproducing someone's exact artwork.

Say this plainly when a request falls outside the strong zone, and offer the closest version that's inside it.
