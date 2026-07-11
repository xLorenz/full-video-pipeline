# Plan: Simplify Pipeline for Autonomous End-to-End Execution

## Goal

Rewrite the full-video-pipeline so an AI agent can run it from `pipeline.py run <title>` end-to-end without getting lost. The agent should follow a single document, produce 4 creative outputs (not 8), and never need to navigate nested skill submodules.

## Diagnosis: Why Agents Get Lost

1. **948-line SKILL.md** — 13 steps, each with cross-references to deeply nested skill files (`skills/claude-youtube/skills/claude-youtube/sub-skills/...`). Agent context pressure causes missed contracts.
2. **8 creative round-trips** instead of 4 — each `continue` → `complete` → `continue` cycle is a failure point.
3. **`continue`/`complete` confusion** — agent regularly runs the wrong command.
4. **Scattered skill content** — 11 external files needed, only 4 actually used. Agent wastes context loading noise.
5. **Cross-step contracts are implicit** — Step 7 palette must satisfy Step 12 legibility; Step 8 `MainVideo.tsx` must import Step 9's auto-generated file; Step 12 reads Step 11's `TITLE.md`. Agent misses these under context pressure.

## Changes

### 1. Rewrite SKILL.md as 4-phase document with inline rules

**Before**: 948 lines, 13 steps, "load file X" instructions.

**After**: ~400 lines, 4 self-contained phases with inline "use these rules" sections.

| Phase | Steps | The agent produces |
|-------|-------|-------------------|
| Phase 1: Research & Script | 1-3 | `SCRIPT.md` + `scenes.json` |
| Phase 2: Voiceover | 4-6 | `VOICEOVER.md` (Steps 5-6 auto-run) |
| Phase 3: Visuals & Render | 7-10 | `STYLES.md` + `remotion/` code (Steps 9-10 auto-run) |
| Phase 4: Metadata & Thumbnail | 11-13 | `TITLE.md`, `DESCRIPTION.md`, `TAGS.md`, `Thumbnail.tsx` (Step 13 auto-runs) |

Each phase section includes:
- Goal and output files
- **"Use these rules:"** block with inline essential rules (script structure, retention hooks, CTR palette, Remotion coding constraints, SEO metadata rules, thumbnail design)
- Format templates for each output file
- Validation checklist
- "When done: `python3 pipeline.py complete <title>`"
- A phase number tag so `__PIPELINE_NEXT__` can point the agent directly to the right section

Rules inlined from external files (agent never needs to load them):
- Phase 1: Retention scripting rules, hook 3-part structure, pattern interrupt frequency, CTA placement, production cue tags, script/scenes format
- Phase 2: VOICEOVER.md format
- Phase 3: CTR palette rules (30-40% negative space, 2-3 colors, mobile legibility), Remotion rules (interpolate, no CSS transitions, individual transform props, video-layout minimums, sequencing/compositions rules), audio path override
- Phase 4: SEO metadata rules (title/desc/tags limits, chapter rules, hashtag limits), thumbnail rules (3-word text max, no AI images, palette reuse, ThumbnailProps interface)

### 2. Refactor pipeline.py — auto-run automated steps after `complete`

`cmd_complete()` currently marks the creative step complete and tells the agent to re-run `continue`. This causes a no-op round-trip when the next steps are automated (5-6, 9-10, 13).

**New behavior**: After `complete` marks a creative step done, auto-run all consecutive automated steps. Stop at the next creative step or "all complete."

New helper:
```python
def auto_run_automated_steps(title):
    """After completing a creative step, auto-run consecutive automated steps."""
    while True:
        state = load_state(title)
        step_num, step_key = find_next_step(state)
        if step_key is None or step_key in CREATIVE_STEPS:
            break
        # run the step, advance state, save
        success = run_automated_step(step_key, title, video_dir(title))
        if not success:
            break
    # print next action
```

Refactor `run_step_5/6/9/10/13` into a single `run_automated_step(step_key, title, vdir)` dispatch for shared use by both `cmd_continue` and the new auto-run loop.

`cmd_continue()` creative-step branch: compute expected artifacts for the current step and print a message with the phase name and SKILL.md section to read, e.g.:
```
Phase 1: Research & Script (Step 3: Script Writing)
  Required artifacts:
    - SCRIPT.md
    - scenes.json
  See SKILL.md #phase-1-research--script for complete rules and templates.
  When done, run: python3 pipeline.py complete <title>
```

### 3. Add `python3 pipeline.py run <title>` one-shot command

New subcommand that runs the entire pipeline end-to-end:

```text
python3 pipeline.py run <title>
```

This is the "don't get lost" path. It:
1. Validates system (same as pre-flight)
2. Scaffolds the project (calls `cmd_new()` logic)
3. Runs `continue` → for creative phases, prints the phase brief with inline rules → agent does the work → `complete` (auto-runs automated sub-steps) → loop
4. Stops when "All steps complete!"

The `run` command essentially wraps the `continue`/`complete` loop but prints a per-phase brief extracted from the new SKILL.md so the agent has all rules inline without hunting.

### 4. Expand `__PIPELINE_NEXT__` trailer in emit_trailer()

Add machine-readable fields so a smart agent can bypass text parsing:

```json
__PIPELINE_NEXT__ {
  "step": 3,
  "name": "Script Writing",
  "kind": "creative",
  "action": "await_complete",
  "exit": 0,
  "phase": 1,
  "next_cmd": "python3 pipeline.py complete my-video",
  "skills_section": "#phase-1-research--script"
}
```

### 5. Add guardrails to prevent wrong-command errors

In `cmd_continue()`:
- If the next step is creative and its artifacts **already exist**, print: "Artifacts for Step N exist but are not validated. Run `python3 pipeline.py complete <title>` to validate and advance."
- If the next step is creative and artifacts are **missing**, print the clear phase message above. Include: "Do NOT run `continue` again until `complete` succeeds."

In `cmd_complete()`:
- If the step is already complete, print a single-line message and exit cleanly (not an error).
- If the step is automated, print: "Step N is automated. Run `python3 pipeline.py continue <title>` instead." (Don't try to validate automated artifacts — that's the orchestrator's job.)

## Files to modify

| File | Change |
|------|--------|
| `SKILL.md` | Full rewrite: 4-phase structure, inline skill rules, ~400 lines |
| `pipeline.py` | Add `auto_run_automated_steps()`, `run_automated_step()` dispatch, `cmd_run()`, auto-chain in `cmd_complete()`, stronger guardrails in `cmd_continue()`/`cmd_complete()`, add `run` subcommand to argparse |
| `scripts/_pipeline_lib.py` | Expand `emit_trailer()` with `next_cmd`, `phase`, `skills_section` |
| `README.md` | Update to reflect 4-phase flow and `run` command |
| `PLAN.md` | This file (branch plan) |

## Files NOT modified

| File | Reason |
|------|--------|
| `pipeline_config.json` | External config, no change needed |
| `schemas/*.json` | State schema preserved (13 internal steps) |
| `scripts/*.py` (except `_pipeline_lib.py`) | Individual step scripts unchanged |
| `remotion-foundation/` | Template code, unchanged |
| `skills/` submodules | Still present for reference, no longer required reading |

## Testing

1. `python3 pipeline.py run "test-video"` — verify end-to-end flow without manual step management
2. `python3 pipeline.py continue "test-video"` — verify classic flow still works
3. `python3 pipeline.py complete "test-video" --step 3` — verify auto-chaining runs Steps 5-6
4. Verify `__PIPELINE_NEXT__` output contains `next_cmd` and `skills_section`
5. Verify wrong-command guardrails (running `continue` when artifacts are present, running `complete` on automated step)

## Before vs. After

| Metric | Before | After |
|--------|--------|-------|
| SKILL.md lines | 948 | ~400 |
| Creative round-trips | 8 | 4 |
| External skill files to load | 11 | 0 (rules inlined) |
| Commands to run | `new`, `continue` x13, `complete` x8 | `run` (one-shot) or `continue` x4 + `complete` x4 |
| Artifact validation required from agent | 8 times | 4 times |
| Machine-readable trailers | step/name/kind/action | + `next_cmd`, `phase`, `skills_section` |
