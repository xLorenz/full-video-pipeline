# Phase 4: Metadata & Thumbnail (Steps 11-13)

**Goal**: Generate YouTube metadata (title, description, tags) and write a
Remotion `Thumbnail.tsx` composition. Step 13 (thumbnail PNG render) auto-runs
after `complete`.

## Action

### 4a. Write `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` (Step 11)

Read `scenes.json` for accurate chapter timestamps based on cumulative
`actual_duration_seconds`. Read the stitched MP4 output path from `versions/`.

**First, do a quick YouTube browse (metadata only — the thumbnail is a separate,
hand-coded deliverable).** Search YouTube for currently popular/viral videos on
this topic and skim how the top results shape their title, description, and
tags. Use what you find as a live format reference for this topic — match the
conventions that already perform, then make the wording yours. Never copy text
verbatim.

#### Follow these instructions

Follow `skills/video-composer/SKILL.md` instructions
Follow `skills/video-composer/references/stage-2-packaging-first.md` instructions
Follow `skills/video-composer/references/stage-8-title-thumbnail.md` instructions
Follow `skills/video-composer/references/stage-9-qa-publish.md` instructions

#### Title (`TITLE.md`)

Write **five genuinely different title variants** — five distinct angles on the
same video, all equally valid as the upload title. Do not bucket them by
optimization type ("search-optimized" / "browse-optimized" / "hybrid") and do
not mark one as recommended. Optimize for creativity and human phrasing, not a
checklist. YouTube's hard title limit is 100 characters.

```markdown
# Title Variants

1. [title]
2. [title]
3. [title]
4. [title]
5. [title]
```

#### Description (`DESCRIPTION.md`)

Keep it short and human:

- A short **hook** at the top.
- A concise **description** of what the video is about.
- **Chapters**, starting at 0:00, with timestamps from `scenes.json`.
- **Sources** / resources links.

No channel boilerplate, no hashtag block. YouTube's hard description limit is
5000 characters.

```markdown
# Description

[Hook — short, human]

[One or two sentences on what the video is about.]

## Chapters
0:00 Intro
0:32 [Chapter 1]
...

## Sources
- [Link 1]
- [Link 2]
```

#### Tags (`TAGS.md`) — the main focus

Tags are where the metadata does its work. Build a thorough, keyword-led list
shaped by the YouTube browse above: the exact topic keyword first, then
variations, long-tail phrases, and broad terms that top videos on this topic
actually use. YouTube's hard limit is 500 characters total.

```markdown
# Tags
exact keyword, variation 1, variation 2, long-tail 1, broad term 1, variation 3, ...
```

#### Human text, no AI-isms (all three files)

Title, description, and tags must read like a person wrote them. Avoid the
banned phrases and openers in `scripts/_ai_isms.py` — e.g. "delve into",
"unlock the power of", "in the ever-evolving", "it's worth noting",
"a testament to", "a game-changer", "hey guys", "welcome back". No hype filler,
no em-dash overload. Prefer concrete nouns, specific numbers, and plain verbs.
If a line could appear in any video on any topic, rewrite it.

### 4b. Write `Thumbnail.tsx` (Step 12)

Compose the thumbnail entirely of Remotion primitives — shapes, text,
gradients. No AI image generation (NanoBanana, Midjourney, DALL-E, etc.) —
this is a hard product requirement, not a style preference, and the lint gate
in the "Verify before `complete`" step below won't catch it, so check it
yourself.

#### Follow these instructions

Follow `skills/video-composer/SKILL.md` instructions
Follow `skills/video-composer/references/stage-8-title-thumbnail.md` instructions
Follow `skills/video-composer/references/stage-9-qa-publish.md` instructions

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

#### The overlay pattern (spotlight + supporting text)

You **hand-code the thumbnail's text directly in `Thumbnail.tsx`** — it is a
separate creative decision from the YouTube title and does not read `TITLE.md`.
`render_thumbnail.py` still passes `title`/`subtitle` props for the
`ThumbnailProps` interface, but the text you *render* is authored here. The
≤3-word overlay rule applies to that authored text:

1. **Spotlight (exactly one, 1–3 words, huge):** the object, symbol, number,
   or short phrase that carries the click. This is the only large text on the
   canvas (>40% visual weight).
2. **Supporting line (optional, short):** a few-word amplifier that adds
   stakes, quantity, or timeframe — never a sentence. Leave it off in favor of
   a visual spotlight (object/symbol) when words add nothing.
3. **Standalone test:** does the thumbnail alone still create a question or
   emotion strong enough to earn attention? If it only makes sense next to a
   title, the spotlight is wrong.

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThumbnailProps } from "remotion-foundation";

// title/subtitle props are available but the text below is hand-authored here.
export const Thumbnail: React.FC<ThumbnailProps> = ({ palette }) => {
  const spotlight = "5:11 MISTAKE"; // 1-3 word hook authored for this thumbnail
  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      {/* ... spotlight huge, supporting line small, subject >40% of frame ... */}
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

- `TITLE.md`: 5 genuinely different variants, none labelled by optimization
  type. Each within YouTube's 100-character title limit.
- `DESCRIPTION.md`: a short hook, then a concise description of what the video
  is about, then chapters starting at 0:00, then sources. No channel
  boilerplate, no hashtag block. Within YouTube's 5000-character limit.
- `TAGS.md`: keyword-led and thorough — the main focus of the metadata.
  Within YouTube's 500-character total limit.
- All metadata reads human: no AI-isms (see `scripts/_ai_isms.py`), no vlog
  openers, no hype filler, no em-dash overload.
- Metadata format reflects what actually performs on YouTube for this topic
  (from the browse in 4a), not a fixed template.
- No AI-generated image assets in `Thumbnail.tsx`. No `fetch()` / external URLs.
- `Thumbnail.tsx` uses only `ThumbnailProps`; its text is hand-authored and
  ≤3 words. Palette colors from STYLES.md.
- `npm run lint`, `tsc --noEmit` pass. `Thumbnail` composition appears in
  `remotion compositions` output.

## When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` exist,
marks Steps 11-12 done, then **auto-runs**:

- **Step 13 (Thumbnail Rendering)**: Runs `lint_gate` then `render_thumbnail.py`.
  Reads `STYLES.md` for the color palette, builds `ThumbnailProps` JSON (the
  text is hand-coded in `Thumbnail.tsx`, so `TITLE.md` is not read), runs
  `npx remotion still src/Root.tsx Thumbnail <out.png> --frame=0`
  with `--quality=100`. Writes `versions/{title}-thumbnail-v{N}.png` (auto-incremented).
  Per the `retention.clean_remotion_node_modules_after_step_13` config flag
  (default `true`), `remotion/node_modules/` is cleaned after Step 13 success.

If Step 13 fails, check `videos/<title>/logs/step-13.log`. Ensure `Thumbnail`
composition is registered in `Root.tsx` and `Thumbnail.tsx` passes the lint gate.
Re-run `complete` to retry.

If all steps complete, `complete` prints:
`All steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.`
