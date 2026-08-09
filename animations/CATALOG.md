# Animation Catalog

Every template in `animations/` that ships into per-video projects. Use tags to find candidates against your scene's `visual_notes`.

| Template | Path | Tags | One-line |
|---|---|---|---|
| Right-wrong card | [`right-wrong-card/`](./right-wrong-card/animation.md) | `judgment` `verdict` `comparison` `contest` | Two-card verdict reveal: judge-style stamp, shake-out, optional glow winner |
| Data bars | [`data-bars/`](./data-bars/animation.md) | `data-viz` `ranking` `count` `bars` | Racing bar chart for ranked quantities |
| Count-up stat | [`count-up-stat/`](./count-up-stat/animation.md) | `stat` `number` `count-up` `headline` | Large numerical reveal with interpolating digits |
| Before-after split | [`before-after-split/`](./before-after-split/animation.md) | `comparison` `wipe` `contrast` `split` | Two-panel divider wipe to reveal a contrast |
| Timeline marker | [`timeline-marker/`](./timeline-marker/animation.md) | `sequence` `events` `steps` `reveal` | Horizontal timeline with milestones dropping in order |
| Comparison grid | [`comparison-grid/`](./comparison-grid/animation.md) | `matrix` `grid` `comparison` | N×M grid of cells tumbling in to show a matrix |
| Kinetic title mosaic | [`kinetic-title-mosaic/`](./kinetic-title-mosaic/animation.md) | `typography` `opener` `title` `kinetic` | Multi-word kinetic typography with per-word motion variants |
| Radial pulse rings | [`radial-pulse-rings/`](./radial-pulse-rings/animation.md) | `emphasis` `radar` `transmission` `focal` | Concentric pulse rings emit from a focal node |
| Rolling digit counter | [`rolling-digit-counter/`](./rolling-digit-counter/animation.md) | `stat` `number` `scoreboard` `count-up` | Slot-machine tumbling numeral columns snap to target |
| Radial gauge | [`radial-gauge/`](./radial-gauge/animation.md) | `stat` `number` `gauge` `progress` `percent` | Arc gauge sweeps to a fraction with a count-up in the center and a cap-dot signature |
| Orbit chip cloud | [`orbit-chip-cloud/`](./orbit-chip-cloud/animation.md) | `relationship` `orbit` `pill` `cloud` | Labelled pill chips orbit a focal node on an ellipse |
| Bar code scan | [`bar-code-scan/`](./bar-code-scan/animation.md) | `sequence` `decode` `barcode` `scan` | Scanline sweeps decoding barcode segments one by one |
| Glitch rip | [`glitch-rip/`](./glitch-rip/animation.md) | `glitch` `broadcast` `crt` `opener` | Broadcast-style glitch bursts over hero text (RGB split, slice tears, scanlines) |
| Glyph rain | [`glyph-rain/`](./glyph-rain/animation.md) | `matrix` `code-rain` `cyberpunk` `terminal` `opener` | Matrix-style glyph rain over arbitrary content (parallax layers, mutation, head glow) |
| Flame wrap | [`flame-wrap/`](./flame-wrap/animation.md) | `fire` `flame` `burn` `title-card` `opener` | Border of WebGL fire around arbitrary content (tongues, rim glow, sparks, smoke) |
| VHS | [`vhs/`](./vhs/animation.md) | `vhs` `crt` `retro` `tape` `treatment` | Worn-tape CRT treatment over the whole frame (wave, jitter, chroma bleed, grain, scanlines) |
| Droplets | [`droplets/`](./droplets/animation.md) | `rain` `glass` `refraction` `overlay` `treatment` | Rain runs down the glass and refracts the content behind it (drops, trails, fog, tint) |
| Bend | [`bend/`](./bend/animation.md) | `folding` `pages` `paper` `cube` `scroll` `treatment` | Full-frame page-fold: the scene scrolls on the face of a cube, top/bottom edges folding over virtual creases |
| Shatter | [`shatter/`](./shatter/animation.md) | `glass` `shards` `refraction` `treatment` | Full-frame glass-shard lens: tiles lift, tip and float over the void, refracting the content beneath |
| Blaze | [`blaze/`](./blaze/animation.md) | `fire` `heat` `flames` `sparks` `smoke` `treatment` | Full-frame procedural fire: sparks, smoke and glow rise from the bottom, heat-distorting and darkening the content beneath |
| Decrypt reveal | [`decrypt-reveal/`](./decrypt-reveal/animation.md) | `decrypt` `cipher` `encrypt` `secret` `terminal` `mono` `treatment` | Full-frame shape-matched cipher covers the page; a traveling decrypt circle reveals the real content with a flickering, aberrated edge |
| Magnify | [`magnify/`](./magnify/animation.md) | `magnify` `lens` `zoom` `cursor` `inspect` `treatment` | Full-frame magnifying lens on a scripted cursor path: clicks ripple the page and punch the zoom |

## By tag

- `comparison` — `right-wrong-card`, `before-after-split`, `comparison-grid`
- `data-viz` — `data-bars`, `count-up-stat`
- `judgment` — `right-wrong-card`
- `sequence` — `timeline-marker`, `bar-code-scan`
- `count` — `data-bars`, `count-up-stat`, `rolling-digit-counter`
- `typography` — `kinetic-title-mosaic`
- `opener` — `kinetic-title-mosaic`
- `emphasis` — `radial-pulse-rings`
- `radar` — `radial-pulse-rings`
- `transmission` — `radial-pulse-rings`
- `focal` — `radial-pulse-rings`, `orbit-chip-cloud`
- `stat` — `count-up-stat`, `rolling-digit-counter`, `radial-gauge`
- `scoreboard` — `rolling-digit-counter`
- `relationship` — `orbit-chip-cloud`
- `orbit` — `orbit-chip-cloud`
- `pill` — `orbit-chip-cloud`
- `cloud` — `orbit-chip-cloud`
- `decode` — `bar-code-scan`
- `barcode` — `bar-code-scan`
- `scan` — `bar-code-scan`
- `glitch` — `glitch-rip`
- `broadcast` — `glitch-rip`
- `crt` — `glitch-rip`, `vhs`
- `opener` — `kinetic-title-mosaic`, `glitch-rip`, `glyph-rain`, `flame-wrap`
- `matrix` — `glyph-rain`
- `code-rain` — `glyph-rain`
- `cyberpunk` — `glyph-rain`
- `terminal` — `glyph-rain`
- `fire` — `flame-wrap`, `blaze`
- `flame` — `flame-wrap`
- `burn` — `flame-wrap`
- `title-card` — `flame-wrap`
- `vhs` — `vhs`
- `retro` — `vhs`
- `tape` — `vhs`
- `treatment` — `vhs`, `droplets`, `bend`, `shatter`, `blaze`, `decrypt-reveal`, `magnify`
- `folding` — `bend`
- `pages` — `bend`
- `paper` — `bend`
- `cube` — `bend`
- `scroll` — `bend`
- `rain` — `droplets`
- `glass` — `droplets`, `shatter`
- `refraction` — `droplets`, `shatter`
- `shards` — `shatter`
- `heat` — `blaze`
- `flames` — `blaze`
- `sparks` — `blaze`
- `smoke` — `blaze`
- `decrypt` — `decrypt-reveal`
- `cipher` — `decrypt-reveal`
- `encrypt` — `decrypt-reveal`
- `secret` — `decrypt-reveal`
- `terminal` — `decrypt-reveal`
- `mono` — `decrypt-reveal`
- `overlay` — `droplets`
- `magnify` — `magnify`
- `lens` — `magnify`
- `zoom` — `magnify`
- `cursor` — `magnify`
- `inspect` — `magnify`
- `gauge` — `radial-gauge`
- `progress` — `radial-gauge`

## Status

All templates ship with `component.tsx` + `config/{defaults,schema}.json` + `animation.md` + `preview/preview.tsx`. The global schema is in [`../schemas/animations.schema.json`](../schemas/animations.schema.json).

> Adding a template? Also add a row above and an entry under one or more tag headers. Animation `extras`/`custom` schema-versioned per template, not globally — extensions are non-breaking.
