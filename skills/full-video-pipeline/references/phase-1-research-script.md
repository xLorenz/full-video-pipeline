# Phase 1: Research & Script (Steps 1-3)

**Goal**: Pick a topic, research it, write a retention-optimized script with
discrete ~10-second scenes structured as `SCRIPT.md` + `scenes.json`.

## Action

1. (Step 1) If a topic isn't given, perform 3-5 web searches in the requested
   niche. Select a topic specific enough to fill 3-10 minutes (not "technology",
   not "the 3rd screw on the iPhone 15 camera"). State the chosen topic clearly.
2. (Step 2) Perform 5-10 targeted web searches on the topic. Visit and extract
   key information from top results. Compile: key facts, statistics, expert
   quotes, examples, counterarguments, timeline, current state, future outlook.
   Verify critical claims with at least 2 sources. Keep notes in your context.
3. (Step 3) Adapt the research into scene-based format (~10s per scene) and write
   `SCRIPT.md` + `scenes.json` per the rules and templates below.

## Follow these instructions

Follow `skills/claude-youtube/skills/claude-youtube/sub-skills/script.md` instructions
Follow `skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md` instructions

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

Must satisfy `schemas/scenes.schema.json`. Initialize every scene with:
`actual_duration_seconds: null`, `actual_duration_frames: null`,
`render_status: "pending"`, `voiceover_file: null`, `voiceover_hash: null`.

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
      "target_duration_seconds": 5,
      "actual_duration_seconds": null,
      "actual_duration_frames": null,
      "render_status": "pending",
      "voiceover_file": null,
      "voiceover_hash": null,
      "visual_notes": "",
      "transition_in": "cut",
      "transition_out": "fade"
    }
  ],
  "total_estimated_seconds": 0
}
```

> `scenes.json` is scaffolded empty by `pipeline.py run`/`new` — you populate
> the `scenes` array. `complete` validates `SCRIPT.md` exists; `scenes.json`
> is verified by schema + downstream steps.

## Validation (Phase 1)

- Every scene has: `id`, `title`, `script_text`, `voiceover_text`,
  `target_duration_seconds`.
- Total estimated duration matches target length (within 10%).
- Hook has all 3 elements (grab, promise, stakes) — derivable from titles.
- Pattern interrupts every 3-5 scenes (the Pattern Interrupt Log proves it).
- Mid-CTA present around 25% mark. Retention re-hook around 60% mark.
- Script reads as natural spoken language, not written prose.

## When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `SCRIPT.md` exists, validates `scenes.json` + state against
the JSON schemas, marks Steps 1-3 done, and prints the Phase 2 brief (no
auto-run — Phase 2 starts with a creative Step 4).
