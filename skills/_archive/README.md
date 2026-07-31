# Archived content

This `skills/_archive/` directory holds snapshots of work that is no longer
the active codepath for the pipeline, preserved as a historical record only.

## `full-video-pipeline-hyperframes-snapshot/`

A frozen copy of the published `skills/full-video-pipeline/` skill bundle
that existed at commit `ddefde2` on the `feat/hyperframes-rework` branch.

That bundle was authored as a self-contained skill package describing the
HyperFrames-based render pipeline (HyperFrames compositions rendered via
`npx hyperframes render` from `compositions/scene-NN.html` sub-compositions,
no remotion Root.tsx, etc.).

After the user reverted the HyperFrames migration back to the original
Remotion architecture, `skills/full-video-pipeline/` was removed from the
tree. Its content is preserved here for reference so the HyperFrames-era
authoring decisions and published skill format remain discoverable.

**Do not consume this bundle from the pipeline.** Its `phase-3-visuals-render.md`
and `phase-4-metadata-thumbnail.md` describe HyperFrames concepts
(`compositions/scene-NN.html`, `data-composition-id`, `window.__timelines`,
GSAP `paused: true`, etc.) that do NOT match the current Remotion codepath.

Loaded by no orchestrator. Not part of `pipeline_config.json` ->
`skills.sources`. Kept only as a reference snapshot.
