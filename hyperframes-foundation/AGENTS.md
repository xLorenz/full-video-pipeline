# HyperFrames Composition Project — `{{VIDEO_TITLE}}`

This project is scaffolded by `full-video-pipeline` (Phase 3 — Visuals &
Render). It replaces the previous Remotion TSX scaffold with HTML
compositions rendered by HyperFrames.

## Pipeline context (READ THE PARENT SKILL.md FIRST)

The master orchestrator is at `/SKILL.md` in the repo root. Phase 3 (Steps 7-10)
describes your creative obligation here: write STYLES.md, then author every
`compositions/scene-NN.html` from the agent's brief, then render.

## Project layout

```
hyperframes/
├── index.html                       # MainVideo root composition
├── compositions/
│   ├── scene-01.html                # One sub-comp per scene (you author these)
│   ├── scene-02.html
│   ├── ...
│   └── thumbnail.html               # Phase 4 thumbnail composition
├── styles/
│   └── tokens.css                   # palette + font tokens (single source of truth)
├── assets/                          # images, b-roll, audio dropped here
├── hyperframes.json                 # registry config for `npx hyperframes add`
├── package.json                     # pinned hyperframes CLI scripts
└── meta.json                        # project id + scaffold timestamp
```

## Commands

```bash
npm run dev        # preview in browser (long-running — run in background)
npm run lint       # structural HTML lint
npm run check      # lint + runtime + layout + motion + contrast (one pass)
npm run render     # render the root index.html to MP4 (whole video — not used for
                   #   per-scene rendering, which goes through scripts/render_scene.py)
```

## Per-scene rendering (IMPORTANT — overrides the general HyperFrames flow)

The scaffolded project follows the pipeline's audio-path architecture: scenes
render **silent**, then `scripts/assemble.py` muxes `voiceover_aligned.mp3`
onto the concatenated scene MP4s in a single ffmpeg pass. This means:

- **Never** add `<audio src=".../voiceover/...mp3">` to a scene's HTML. The
  voiceover is muxed post-render. The HyperFrames `<audio>` tag is only for
  non-voiceover SFX/BGM that you really do want baked in.
- Each `compositions/scene-NN.html` is rendered independently to
  `scenes/scene-NN.mp4` via `npx hyperframes render -c compositions/scene-NN.html
  --output scenes/scene-NN.mp4` (called by `python3 scripts/render_scene.py`).
- The root `index.html` aggregates all scenes via `data-composition-src` —
  this is your "Preview the whole assembled silent video" tool, not your render
  entry point.

## Animation catalog (on-demand via the HyperFrames registry)

The repo no longer ships a curated `animations/` directory. Instead, install
animation blocks from the HyperFrames registry per-video as needed:

```bash
# Browse available blocks (machine-readable)
npx hyperframes catalog --json

# Install a block (e.g., a kinetic transition, a chart, a social overlay)
npx hyperframes add flash-through-white --no-clipboard
npx hyperframes add data-chart --no-clipboard

# Each installed block lands under compositions/ or compositions/components/.
# The CLI prints a paste-snippet you include in your scene-NN.html.
```

The Phase-3 skills bundle (skills/hyperframes/) documents how to discover and
wire registry blocks. Browse the live catalog at:
https://hyperframes.heygen.com/catalog/blocks/

## Key rules

1. Every timed element needs `data-start`, `data-duration`, and `data-track-index`.
2. Timed elements MUST have `class="clip"`.
3. GSAP timelines must be `paused: true` and registered on `window.__timelines`
   under the composition-id (`window.__timelines["scene-01"] = tl;`).
4. **No `<audio>` for voiceover** — the pipeline muxes audio post-render.
5. Only deterministic logic — no `Date.now()`, no `Math.random()`, no network.
6. Variables per scene: pass via `--variables-file` (declared via
   `data-composition-variables` on the composition root) and read at runtime
   via `window.__hyperframes.getVariables()`.

## Linting — ALWAYS RUN AFTER CHANGES

After creating or editing any `.html` composition, run the full check before
considering the task complete:

```bash
npm run check
```

Fix all errors before presenting the result. This gate is also run by
`pipeline.py` (lint_gate) before per-scene rendering, so mistakes the agent
misses will block Phase 3 completion.
