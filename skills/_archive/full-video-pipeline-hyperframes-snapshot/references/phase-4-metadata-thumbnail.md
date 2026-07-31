# Phase 4: Metadata & Thumbnail (Steps 11-13)

**Goal**: Generate YouTube metadata (title, description, tags) and fill in the
`compositions/thumbnail.html` HyperFrames composition. Step 13 (thumbnail PNG
render) auto-runs after `complete`.

## Action

### 4a. Write `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` (Step 11)

Read `scenes.json` for accurate chapter timestamps based on cumulative
`actual_duration_seconds`. Read the stitched MP4 output path from `versions/`.

#### Follow these instructions

Follow `skills/claude-youtube/skills/claude-youtube/sub-skills/metadata.md` instructions
Follow `skills/claude-youtube/skills/claude-youtube/references/seo-playbook.md` instructions

```markdown
# Title Variants

1. **Search-optimized:** [keyword-forward title]
2. **Browse-optimized:** [curiosity/emotional title]
3. **Hybrid:** [balanced title]
```

```markdown
# Description

[Hook — first 2 lines work as ad copy]

## Timestamps
0:00 Intro
0:32 [Chapter 1]
...

## [Body — 200-350 words, keyword 2-4x]

## Resources
- [Link 1]
- [Link 2]

## Channel
[Boilerplate]

#hashtags #here #at #bottom
```

```markdown
# Tags
exact keyword, variation 1, variation 2, long-tail 1, broad term 1, channel name
```

### 4b. Fill in `compositions/thumbnail.html` (Step 12)

Compose the thumbnail entirely of HyperFrames primitives — HTML elements, CSS
gradients, GSAP timelines. **NO AI image generation** (no NanoBanana,
Midjourney, DALL-E, etc.).

#### Follow these instructions

Follow `skills/claude-youtube/skills/claude-youtube/sub-skills/thumbnail.md` instructions
Follow `skills/claude-youtube/skills/claude-youtube/references/thumbnail-ctr-guide.md` instructions

> **Back-ref: Phase 3 §CTR palette (your STYLES.md).** The palette you chose in
> Phase 3 was CTR-safe for mobile legibility at 168×94px. **Reuse it** — do NOT
> introduce new colors. If the palette would fail the mobile-legibility check
> for the specific text overlay you planned, that is a Phase 3 palette bug — go
> back and fix STYLES.md before continuing, then re-run `complete`.

- **MUST**: design for 1920×1080 even though 1280×720 is the YouTube minimum.
- **MUST**: thumbnail adds NEW info — never duplicates the title text.
- **MUST NOT**: use `fetch()` or external URLs. `<img>` / `<picture>` only for
  local assets in `hyperframes/assets/`. This mirrors the determinism
  requirement from Phase 3 — a network call at render time is both a
  reproducibility risk and unnecessary for a still frame you're composing
  from local tokens and assets.
- Compose `compositions/thumbnail.html` as a single standalone composition. Its
  root needs `data-composition-id="thumbnail"`, `data-width="1920"`,
  `data-height="1080"`, `data-start="0"`, `data-duration="1"` (arbitrary short
  duration — the orchestrator renders exactly one frame).
- Read the title/subtitle/palette via the same variable mechanism the scene
  templates use (`data-composition-variables` + `--variables-file`), or simply
  hardcode the per-video copy directly in the HTML (Phase 4 authoring is
  content-bound by design).
- Follow the same `class="clip"` / `data-start` / `data-duration` /
  `data-track-index` rules and the GSAP-on-`window.__timelines["thumbnail"]`
  contract as scene compositions.

```html
<template id="thumbnail-template">
  <div data-composition-id="thumbnail"
       data-width="1920" data-height="1080"
       data-start="0" data-duration="1">
    <div id="thumb-background" class="clip" data-start="0" data-duration="1"
         data-track-index="0"
         style="position: absolute; inset: 0;
                background: var(--color-background, #0b0f1a);"></div>
    <!-- ...your overlay composition... -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      (function () {
        const tl = gsap.timeline({ paused: true });
        /* optional one-shot reveal — the renderer captures frame 0 only */
        window.__timelines = window.__timelines || {};
        window.__timelines["thumbnail"] = tl;
      })();
    </script>
  </div>
</template>
```

**Verify before `complete`:**

```bash
cd videos/{video-title}/hyperframes
npm run lint
npx hyperframes compositions --json   # must list every scene-NN AND thumbnail
```

## Validation (Phase 4)

- All 3 title variants under 100 chars. Primary keyword in first 40 chars of each.
- Description under 5000 chars. Primary keyword in first 25 words. Chapters
  start at 0:00 with ≥3 entries.
- Tags under 500 chars total. Hashtags in description body (not in title).
- First 2 description lines work as standalone ad copy.
- No AI-generated image assets in `compositions/thumbnail.html`. No `fetch()` /
  external URLs.
- `compositions/thumbnail.html` root declares `data-composition-id="thumbnail"`,
  `data-width="1920"`, `data-height="1080"`. Text overlay ≤3 words. Palette
  colors reused from STYLES.md / `tokens.css`.
- `npm run lint` passes. The `thumbnail` composition appears in
  `npx hyperframes compositions --json` output.

## When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` exist,
marks Steps 11-12 done, then **auto-runs**:

- **Step 13 (Thumbnail Rendering)**: Runs `lint_gate` then
  `render_thumbnail.py`. Reads `TITLE.md` (or falls back to `scenes.json
  video_title`) for the title text, reads `STYLES.md` for the color palette,
  builds a variables JSON, renders a 1-frame 1920×1080 MP4 via
  `npx hyperframes render -c index.html --fps 1 --quality 100`, then extracts
  the PNG via `ffmpeg -i thumb.mp4 -frames:v 1 thumb.png`. Writes
  `versions/{title}-thumbnail-v{N}.png` (auto-incremented). Per the
  `retention.clean_remotion_node_modules_after_step_13` config flag (default
  `true`), `hyperframes/node_modules/` (if present) is cleaned after Step 13
  success.

If Step 13 fails, check `videos/<title>/logs/step-13.log`. Ensure
`compositions/thumbnail.html` exists, declares `data-composition-id="thumbnail"`,
and passes the lint gate. Re-run `complete` to retry.

If all steps complete, `complete` prints:
`All steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.`
