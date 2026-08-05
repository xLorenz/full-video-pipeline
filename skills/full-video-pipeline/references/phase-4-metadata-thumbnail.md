# Phase 4: Metadata & Thumbnail (Steps 11-13)

**Goal**: Generate YouTube metadata (title, description, tags) and write a
Remotion `Thumbnail.tsx` composition. Step 13 (thumbnail PNG render) auto-runs
after `complete`.

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

## Recommended Title
<!-- render_thumbnail.py reads this block first; falls back to the "3. **Hybrid** |" line above. -->
Title: [the title the thumbnail will render]

3. **Hybrid** | [balanced title]
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

### 4b. Write `Thumbnail.tsx` (Step 12)

Compose the thumbnail entirely of Remotion primitives — shapes, text,
gradients. No AI image generation (NanoBanana, Midjourney, DALL-E, etc.) —
this is a hard product requirement, not a style preference, and the lint gate
in the "Verify before `complete`" step below won't catch it, so check it
yourself.

#### Follow these instructions

Follow `skills/claude-youtube/skills/claude-youtube/sub-skills/thumbnail.md` instructions
Follow `skills/claude-youtube/skills/claude-youtube/references/thumbnail-ctr-guide.md` instructions

> **Back-reference: Phase 3's CTR palette (your STYLES.md).** The palette you
> chose in Phase 3 was already CTR-safe for mobile legibility at 168×94px —
> reuse it rather than introducing new colors. If that palette would fail the
> mobile-legibility check for the specific text overlay you're planning now,
> that's a Phase 3 palette bug: go fix `STYLES.md` first, then come back and
> re-run `complete`.

- Design for 1920×1080 even though 1280×720 is the YouTube minimum — this
  keeps the composition consistent with the main video's resolution.
- The thumbnail should add new information, not duplicate the title text —
  a thumbnail that just repeats the title wastes the click-through opportunity.
- No `fetch()` or external URLs — `<Img>` only, for local assets. A network
  call here makes the render non-deterministic and can fail inside the
  sandboxed render environment.
- Use only the `ThumbnailProps` interface from `remotion-foundation`:
  `{ title: string, subtitle: string, palette: { primary, secondary, accent, background, text } }`.
- The `Thumbnail` composition is already registered in `Root.tsx` — don't
  duplicate it. Just write the component body in `Thumbnail.tsx`.

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThumbnailProps } from "remotion-foundation";

export const Thumbnail: React.FC<ThumbnailProps> = ({ title, subtitle, palette }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      {/* ... your composition ... */}
    </AbsoluteFill>
  );
};
```

**Verify before `complete`:**

```bash
cd videos/{video-title}/remotion
npm run lint
npx tsc --noEmit
npx remotion compositions src/Root.tsx   # must list both MainVideo and Thumbnail
```

## Validation (Phase 4)

- All 3 title variants under 100 chars. Primary keyword in first 40 chars of each.
- Description under 5000 chars. Primary keyword in first 25 words. Chapters
  start at 0:00 with ≥3 entries.
- Tags under 500 chars total. Hashtags in description body (not in title).
- First 2 description lines work as standalone ad copy.
- No AI-generated image assets in `Thumbnail.tsx`. No `fetch()` / external URLs.
- `Thumbnail.tsx` uses only `ThumbnailProps`. Text overlay ≤3 words. Palette
  colors from STYLES.md.
- `npm run lint`, `tsc --noEmit` pass. `Thumbnail` composition appears in
  `remotion compositions` output.

## When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` exist,
marks Steps 11-12 done, then **auto-runs**:

- **Step 13 (Thumbnail Rendering)**: Runs `lint_gate` then `render_thumbnail.py`.
  Reads `TITLE.md` (or falls back to `scenes.json video_title`) for the title
  text, reads `STYLES.md` for the color palette, builds `ThumbnailProps` JSON,
  runs `npx remotion still src/Root.tsx Thumbnail <out.png> --frame=0`
  with `--quality=100`. Writes `versions/{title}-thumbnail-v{N}.png` (auto-incremented).
  Per the `retention.clean_remotion_node_modules_after_step_13` config flag
  (default `true`), `remotion/node_modules/` is cleaned after Step 13 success.

If Step 13 fails, check `videos/<title>/logs/step-13.log`. Ensure `Thumbnail`
composition is registered in `Root.tsx` and `Thumbnail.tsx` passes the lint gate.
Re-run `complete` to retry.

If all steps complete, `complete` prints:
`All steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.`
