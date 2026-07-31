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

## By tag

- `comparison` — `right-wrong-card`, `before-after-split`, `comparison-grid`
- `data-viz` — `data-bars`, `count-up-stat`
- `judgment` — `right-wrong-card`
- `sequence` — `timeline-marker`
- `count` — `data-bars`, `count-up-stat`

## Status

All templates ship with `component.tsx` + `config/{defaults,schema}.json` + `animation.md` + `preview/preview.tsx`. The global schema is in [`../schemas/animations.schema.json`](../schemas/animations.schema.json).

> Adding a template? Also add a row above and an entry under one or more tag headers. Animation `extras`/`custom` schema-versioned per template, not globally — extensions are non-breaking.
