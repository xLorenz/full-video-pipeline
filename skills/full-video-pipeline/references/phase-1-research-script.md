# Phase 1: Research & Script (Steps 1-3)

**Goal**: Pick a topic, research it, write a retention-optimized script with
discrete ~10-second scenes structured as `SCRIPT.md` + `scenes.json`.

## Action

1. (Step 1) If a topic isn't given, perform 3-5 web searches in the requested
   niche. Select a topic specific enough to fill 3-10 minutes (not "technology",
   not "the 3rd screw on the iPhone 15 camera"). State the chosen topic clearly.
2. (Step 2) Perform 5-10 targeted web searches on the topic. Visit and extract
   key information from top results. Verify critical claims with at least 2
   sources, then condense everything into `videos/<title>/RESEARCH.md` (format
   below). This is a required artifact — `complete` refuses Step 2 without it.
3. (Step 3) Write `SCRIPT.md` from `RESEARCH.md` alone, then project it into
   `scenes.json` with `python3 pipeline.py scenes-from-script <title>`. See
   "Scripting input contract" below — the script writer has no web access.

## RESEARCH.md — the scripting input

Research is condensed **before** scripting, not during it. `RESEARCH.md` is the
only factual source the script writer is allowed to use, so gaps must show up
here, not as invented statistics in the narration.

```markdown
# Research: {Video Title}

## Angle
[the specific promise of this video — one short paragraph]

## Key Claims
- [claim worth making on screen] — [source #]
- [claim] — [source #]

## Numbers
- [statistic, unit, year] — [source #]
- none                      # valid only when the topic genuinely has no hard numbers

## Examples & Analogies
- [concrete example or analogy that makes an abstract point land]

## Counterpoints
- [the strongest objection, and what answers it]

## Sources
1. https://...
2. https://...
3. https://...              # at least 3 distinct URLs
```

Step 2 `complete` enforces: the three headings `## Key Claims`, `## Numbers`,
`## Sources`, at least 3 distinct URLs under Sources, and ≥500 characters of
condensed content. A stub cannot pass.

## Scripting input contract

- The script writer (the `script-writer` subagent, or the orchestrator) reads
  `RESEARCH.md` and writes `SCRIPT.md`. It does not search the web.
- A fact that is not in `RESEARCH.md` does not go in the script. Write around
  it, or send it back to Step 2 — never invent numbers, dates, names, or quotes.
- The spoken words live in the `**Voiceover:**` lines and are used verbatim
  downstream (Step 4 extracts them into `VOICEOVER.md`, Step 5 speaks them).
  There is no later hand-crafting pass — what you write is what the voice says.


## Follow these instructions

Follow `skills/video-composer/SKILL.md` instructions
Follow `skills/video-composer/references/stage-1-ideation.md` instructions
Follow `skills/video-composer/references/stage-2-packaging-first.md` instructions
Follow `skills/video-composer/references/stage-3-scripting.md` instructions
Follow `skills/video-composer/references/stage-4-storytelling-loop.md` instructions
Follow `skills/video-composer/references/stage-5-voiceover-delivery.md` instructions

## SCRIPT.md format

```markdown
# Script: {Video Title}

## Scene 1: [Title] (~10s)
**Script:** [What appears on screen / narration context]
**Voiceover:** [Exact words to be spoken — short sentences, contractions]
**Transition:** [cut|fade|wipe|slide]

## Scene 2: [Title] (~10s)
...

<!-- Retention artifacts at end of SCRIPT.md -->
## Pattern Interrupt Log
- Scene 3: [CAMERA CHANGE] — 0:30
- Scene 7: [UNEXPECTED STAT] — 1:15
Average interval: 45s (target ≤90s)

## Retention Risk Map
- Risk 1: Scene 5 dense stats → mitigation: visual reveal
- Risk 2: ...
```

## scenes.json format

**Generated, not hand-written.** `python3 pipeline.py scenes-from-script <title>`
projects `SCRIPT.md` into `scenes.json` deterministically: scene ids, titles,
`script_text` (`**Script:**`), `voiceover_text` (`**Voiceover:**`),
`silent` (`**Voiceover:** (silent)`), `target_duration_seconds` (the `(~Ns)`
heading suffix), and the advisory transitions. Run it after writing or editing
`SCRIPT.md`; never patch the two files separately.

It is a projection, not a rebuild: orchestrator-owned fields
(`render_status`, `render_hash`, measured durations, `beats`, `sfx`, `bgm`,
`visual_notes`) survive by scene id, and only scenes whose `voiceover_text`
changed have their audio fields invalidated. `--force` drops that state for a
true rebuild; `--dry-run` prints the parse + projected audio total and writes
nothing.

The result satisfies `schemas/scenes.schema.json`. Shape for reference:

```json
{
  "video_title": "my-video",
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "scenes": [
    {
      "id": 1,
      "title": "Hook — Grab",
      "script_text": "[full narration + visual context]",
      "voiceover_text": "[exact words TTS will speak]",
      // Voiceless scene by design (title card, section card, tension hold):
      // "silent": true + "voiceover_text": "" + NO VOICEOVER.md block.
      // target_duration_seconds is then BINDING (no TTS audio to measure —
      // Step 6 derives actual durations from it, ≤60s). script_text still
      // required: it carries the visual direction.
      "silent": false,
      "target_duration_seconds": 5,
      "actual_duration_seconds": null,
      "actual_duration_frames": null,
      "render_status": "pending",
      "voiceover_file": null,
      "voiceover_hash": null,
      "visual_notes": "",
      "beats": [],      // Step 8 (Remotion coding) fills named timing points — leave empty now
      "sfx": [],        // Step 8 (Remotion coding) fills sound cues — leave empty now
      // Step 8 fills {track, volume} — OMIT the key for the global default
      // bed; explicit null OPTS OUT (silence for this scene)
      "transition_in": "cut",
      "transition_out": "fade"   // ADVISORY ONLY: MainVideo hard-cuts —
      // implement any fade/wipe/slide by hand inside SceneXX.tsx at Step 8
    }
  ],
  "total_estimated_seconds": 0
}
```

> `scenes.json` is scaffolded empty by `pipeline.py run`/`new` and then filled
> by `scenes-from-script`. `complete` validates `SCRIPT.md` exists; the
> projection is verified by schema + the strict Phase-1 checks.

> Audio (beats/sfx/bgm) is authored at Step 8, never here — timings must
> mirror the actual animation code.

## Validation (Phase 1)

- Every scene has: `id`, `title`, `script_text`, `voiceover_text`,
  `target_duration_seconds` — except silent scenes (`"silent": true`), which
  carry empty `voiceover_text` and a binding `target_duration_seconds` instead.
- Total estimated duration matches target length (within 10%).
- Hook has all 3 elements (grab, promise, stakes) — derivable from titles.
- Pattern interrupts every 3-5 scenes (the Pattern Interrupt Log proves it).
  The machine bar is tighter than that rule of thumb: average log interval
  must be ≤15s for videos under 120s total, ≤90s above — and Step 3
  `complete` runs validation with `--strict`, which promotes these
  warnings (plus CTA presence) to hard errors. Note the cliff: trimming a
  130s cut to 115s moves it into the stricter 15s bucket, so budget
  interrupts for the length you plan to ship.
- Mid-CTA present around 25% mark. Retention re-hook around 60% mark.
- Script reads as natural spoken language, not written prose.

## When done

```bash
python3 pipeline.py scenes-from-script <title>
python3 pipeline.py lint-script <title>
python3 pipeline.py complete <title>
```

`complete` validates `SCRIPT.md` exists, validates `scenes.json` + state against
the JSON schemas, marks Steps 1-3 done, and prints the Phase 2 brief (no
auto-run — Phase 2 starts with a creative Step 4).
