# Plan: Simplify Pipeline for Autonomous End-to-End Execution

## Goal

Rewrite the full-video-pipeline so an AI agent can run it from `pipeline.py run <title>` end-to-end without getting lost. The agent follows a single document, produces 4 creative outputs (not 8), and never needs to navigate nested skill submodules.

## Diagnosis: Why Agents Get Lost

1. **752-line SKILL.md** — 13 steps, each with cross-references to deeply nested skill files (`skills/claude-youtube/skills/claude-youtube/sub-skills/...`). Agent context pressure causes missed contracts.
2. **8 creative round-trips** instead of 4 — each `continue` → `complete` → `continue` cycle is a failure point.
3. **`continue`/`complete` confusion** — agent regularly runs the wrong command.
4. **Scattered skill content** — 11 external files needed, only 4 actually used. Agent wastes context loading noise.
5. **Cross-step contracts are implicit** — Step 7 palette must satisfy Step 12 legibility; Step 8 `MainVideo.tsx` must import Step 9's auto-generated file; Step 12 reads Step 11's `TITLE.md`. Agent misses these under context pressure.

## Changes

### 1. Rewrite SKILL.md as 4-phase document with inline rules

**Before**: 752 lines, 13 steps, "load file X" instructions.

**After**: ~500 lines, 4 self-contained phases with inline "use these rules" sections.

| Phase | Steps | The agent produces | Auto-chain after `complete` |
|-------|-------|-------------------|-----------------------------|
| Phase 1: Research & Script | 1-3 | `SCRIPT.md` + `scenes.json` | None (Step 4 is creative) |
| Phase 2: Voiceover | 4-6 | `VOICEOVER.md` | Steps 5, 6 |
| Phase 3: Visuals & Render | 7-10 | `STYLES.md` + `remotion/` code | Steps 9, 10 |
| Phase 4: Metadata & Thumbnail | 11-13 | `TITLE.md`, `DESCRIPTION.md`, `TAGS.md`, `Thumbnail.tsx` | Step 13 |

> **Note**: `scenes.json` is a Phase 1 output even though `EXPECTED_ARTIFACTS["3_script_writing"]` only lists `["SCRIPT.md"]` — scenes.json is scaffolded empty by `cmd_new` (pipeline.py:144-155) and populated by the agent. The Phase 1 brief lists both as outputs; `complete` only validates `SCRIPT.md` existence.

Each phase section includes:
- Goal and output files
- **"Use these rules:"** block with inline essential rules
- Format templates for each output file
- Validation checklist
- "When done: `python3 pipeline.py complete <title>`"
- A phase number tag so `__PIPELINE_NEXT__` can point the agent directly to the right section

#### Phase line budgets

- Frontmatter + Prerequisites + Execution Protocol + Configuration + Error Recovery + Directory Structure: ~90 lines
- Phase 1: ~125 lines (script structure, hook structure, retention patterns, format templates)
- Phase 2: ~45 lines (VOICEOVER.md format + rules)
- Phase 3: ~140 lines (CTR palette, Remotion rules, contracts, audio-path override, format templates)
- Phase 4: ~100 lines (SEO metadata, thumbnail rules, format templates)
- **Total: ~500 lines**

#### Rules inlined per phase (agent never needs to load external files)

- **Phase 1**: Retention scripting rules, hook 3-part structure (Grab/Promise/Stakes), pattern interrupt frequency (every 60-90s), CTA placement (~25% mid, ~60% re-hook), production cue tags, SCRIPT.md + scenes.json format templates
- **Phase 2**: VOICEOVER.md format (`---SCENE:N---` delimiters) + rules
- **Phase 3**: CTR palette rules (30-40% negative space, 2-3 colors, mobile legibility at 168x94px), Remotion rules (interpolate not CSS transitions, individual transform props, video-layout minimums 84px/44px/32px, sequencing premount, compositions `type` not `interface`, JSON-serializable defaultProps), audio path override (silent scenes, stitch-time mux), MainVideo+SceneMap.generated.ts contract, MainVideo+Thumbnail composition registration contract
- **Phase 4**: SEO metadata rules (title 100 chars, keyword in first 40 chars, description 5000 chars, keyword in first 25 words, chapters start at 0:00 with 3+ entries, 15+ hashtags ignored, tags under 500 chars), thumbnail rules (3-word text max, no AI images, palette reuse from STYLES.md, `ThumbnailProps` interface, 1920x1080 design, mobile legibility)

#### Cross-phase back-references

Phase 4 thumbnail rules include: `> Back-ref: Phase 3 §CTR palette (your STYLES.md)` so an agent reading Phase 4 in isolation still knows to consult STYLES.md.

#### Canonical phase → SKILL.md anchor map

```
Phase 1 → #phase-1-research--script      [Steps 1-3]
Phase 2 → #phase-2-voiceover             [Steps 4-6]
Phase 3 → #phase-3-visuals--render       [Steps 7-10]
Phase 4 → #phase-4-metadata--thumbnail   [Steps 11-13]
```

This map lives in `_pipeline_lib.PHASES` and `_phase_for_step(step_key)` so SKILL.md heading text and trailer strings are derived from one source.

### 2. Update `scripts/_pipeline_lib.py` — new constants + expanded trailer

Add:

```python
# Canonical phase mapping (single source of truth — used by emit_trailer,
# cmd_continue briefs, cmd_run, SKILL.md anchors)
PHASES = {
    1: {"name": "Research & Script",     "anchor": "#phase-1-research--script",     "steps": (1, 2, 3)},
    2: {"name": "Voiceover",             "anchor": "#phase-2-voiceover",            "steps": (4, 5, 6)},
    3: {"name": "Visuals & Render",      "anchor": "#phase-3-visuals--render",      "steps": (7, 8, 9, 10)},
    4: {"name": "Metadata & Thumbnail",  "anchor": "#phase-4-metadata--thumbnail", "steps": (11, 12, 13)},
}

UNVALIDATED_CREATIVE_STEPS = {"1_topic_selection", "2_research"}
# Steps whose EXPECTED_ARTIFACTS is [] — complete only runs schema gate, no artifact check.

def _phase_for_step(step_key):
    """Return (phase_num, anchor) for a step_key. Phase 0 for terminal/empty."""
    if not step_key:
        return 0, ""
    try:
        idx = STEP_KEYS.index(step_key) + 1
    except ValueError:
        return 0, ""
    for pnum, info in PHASES.items():
        if idx in info["steps"]:
            return pnum, info["anchor"]
    return 0, ""
```

Expand `emit_trailer` signature to:

```python
def emit_trailer(step_num, step_key, action, exit_code,
                 next_cmd="", expected_artifacts=None):
    """Print machine-readable __PIPELINE_NEXT__ trailer.

    New fields vs. old trailer:
      phase         — 1-4 (0 for terminal)
      next_cmd      — exact command the agent should run next
      skills_section — SKILL.md anchor for the current phase
      expected_artifacts — list of files the agent must produce ([]) for Steps 1-2
    """
    name = STEP_NAMES.get(step_key, step_key)
    if step_key == "":
        kind = "done"
    else:
        kind = "creative" if step_key in CREATIVE_STEPS else "automated"
    phase, anchor = _phase_for_step(step_key)
    trailer = json.dumps({
        "step": step_num,
        "name": name,
        "kind": kind,
        "action": action,
        "exit": exit_code,
        "phase": phase,
        "next_cmd": next_cmd,
        "skills_section": anchor,
        "expected_artifacts": expected_artifacts or [],
    })
    print(f"__PIPELINE_NEXT__ {trailer}")
```

### 3. Refactor `pipeline.py` — auto-chain + guards + `run`

#### 3a. New `run_automated_step(step_key, title, vdir)` dispatch

Replaces the inline `if/elif` chain at pipeline.py:550-559. Used by both `cmd_continue` and the new `auto_run_automated_steps`. **Critically, post-step cleanup (`_clean_after_assemble`, `_clean_after_step_13`) moves INTO this dispatch** so cleanup fires regardless of caller:

```python
def run_automated_step(step_key, title, vdir):
    """Run a single automated step. Returns True on success, False on failure.

    Post-step cleanup runs here (not in caller) so auto-chain and continue
    both get cleanup behavior.
    """
    success = False
    error_msg = None
    try:
        if step_key == "5_voiceover_generation":
            success = run_step_5(title, vdir)
        elif step_key == "6_duration_measurement":
            success = run_step_6(title, vdir)
        elif step_key == "9_scene_rendering":
            success = run_step_9(title, vdir)
        elif step_key == "10_stitching":
            success = run_step_10(title, vdir)
        elif step_key == "13_thumbnail_rendering":
            success = run_step_13(title, vdir)
        else:
            error_msg = f"unknown automated step: {step_key}"
    except CmdError as e:
        error_msg = f"CmdError: {e}"
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"

    # Post-step validation
    if success:
        post_ok, post_errs = validate_project(title)
        if not post_ok:
            success = False
            error_msg = f"post-step validation failed: {post_errs}"

    return success, error_msg
```

#### 3b. New `auto_run_automated_steps(title)` loop

Called by `cmd_complete` after marking a creative step done. Runs consecutive automated steps until the next creative step or "all done." Each iteration mirrors `cmd_continue`'s success/fail state-writing exactly (no silent break):

```python
def auto_run_automated_steps(title):
    """After complete marks a creative step done, auto-run consecutive automated steps.

    Auto-chain triggers: complete of Step 4 → runs 5,6
                         complete of Step 8 → runs 9,10
                         complete of Step 12 → runs 13
    complete of Steps 1,2,3,7,11 → no auto-run (next step is creative).

    On failure: writes status="failed", last_error, syncs legacy `error` field,
                emits fix_and_continue trailer, exits 1. No silent break.
    """
    vdir = video_dir(title)
    while True:
        state = load_state(title)
        step_num, step_key = find_next_step(state)
        if step_key is None or step_key in CREATIVE_STEPS:
            break
        step_name = STEP_NAMES[step_key]
        print(f"\n--- Auto-running Step {step_num} ({step_name}) ---")

        # Record attempt (mirrors cmd_continue lines 540-544)
        step_state = state["steps"][step_key]
        step_state["status"] = "in_progress"
        step_state["attempts"] = (step_state.get("attempts", 0) or 0) + 1
        step_state["last_attempt_at"] = now_iso()
        save_state(title, state)

        success, error_msg = run_automated_step(step_key, title, vdir)

        if success:
            state = load_state(title)  # re-load after run_step_N may have updated scenes
            state["steps"][step_key]["status"] = "complete"
            state["steps"][step_key]["completed_at"] = now_iso()
            state["steps"][step_key]["last_error"] = None
            state["current_step"] = min(step_num + 1, len(STEP_KEYS))
            save_state(title, state)
            print(f"=== Step {step_num} ({step_name}) complete ===")
            # Cleanup hooks (moved here from cmd_continue:582-586)
            if step_key == "10_stitching":
                _clean_after_assemble(vdir)
            elif step_key == "13_thumbnail_rendering":
                _clean_after_step_13(vdir)
        else:
            state = load_state(title)
            state["steps"][step_key]["status"] = "failed"
            state["steps"][step_key]["last_error"] = error_msg or "Step failed, see logs"
            state["steps"][step_key]["error"] = state["steps"][step_key]["last_error"]
            save_state(title, state)
            print(f"\n=== Step {step_num} ({step_name}) FAILED ===")
            print(f"  Last error: {state['steps'][step_key]['last_error']}")
            print(f"  Fix the issue, then run: python3 pipeline.py continue {title}")
            pl.emit_trailer(step_num, step_key, "fix_and_continue", 1,
                             next_cmd=f"python3 pipeline.py continue {title}")
            sys.exit(1)

    # Post-loop: print next action (creative step brief or all-done)
    state = load_state(title)
    step_num, step_key = find_next_step(state)
    if step_key is None:
        print("\nAll steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.")
        pl.emit_trailer(0, "", "done", 0)
    else:
        # next step is creative — emit await_complete brief
        _print_creative_brief(step_num, step_key, title)
```

#### 3c. New `_print_creative_brief(step_num, step_key, title)` helper

Replaces pipeline.py:527-537 with a phase-aware brief. Used by `cmd_continue`, `auto_run_automated_steps`, and `cmd_run`:

```python
def _print_creative_brief(step_num, step_key, title):
    """Print the phase-aware creative brief for a creative step."""
    step_name = STEP_NAMES[step_key]
    phase, anchor = pl._phase_for_step(step_key)
    phase_name = pl.PHASES.get(phase, {}).get("name", "")
    arts = EXPECTED_ARTIFACTS.get(step_key, [])

    print(f"\n=== Phase {phase}: {phase_name} — Step {step_num}: {step_name} ===")

    if step_key in pl.UNVALIDATED_CREATIVE_STEPS:
        print("  This step produces a decision/notes in your own context (no file needed).")
        print(f"  See SKILL.md {anchor} for what to do.")
    else:
        print("  Required artifacts:")
        for a in arts:
            print(f"    - {a}")
        print(f"  See SKILL.md {anchor} for complete rules and templates.")

    next_cmd = f"python3 pipeline.py complete {title}"
    print(f"\n  When done, run: {next_cmd}")
    print("  Do NOT run `continue` again until `complete` succeeds.")
    pl.emit_trailer(step_num, step_key, "await_complete", 0,
                    next_cmd=next_cmd, expected_artifacts=arts)
```

#### 3d. Refactor `cmd_continue` — strengthen guardrails

In `cmd_continue`'s `SKIP_STEPS` branch (pipeline.py:527-537), replace with `_print_creative_brief` AND add a stale-artifact check:

```python
if step_key in SKIP_STEPS:
    # Stale-artifact detection
    arts = EXPECTED_ARTIFACTS.get(step_key, [])
    state_artifacts = state["steps"].get(step_key, {}).get("artifacts", [])
    files_exist = all((vdir / a).exists() for a in arts) if arts else False

    if step_key in pl.UNVALIDATED_CREATIVE_STEPS:
        # Steps 1, 2: no artifacts — just print brief
        _print_creative_brief(step_num, step_key, title)
    elif files_exist and state_artifacts == arts:
        # Already validated — step should be complete, find_next_step shouldn't pick it
        print(f"Step {step_num} ({step_name}) artifacts already validated.")
        print("State may be inconsistent. Run: python3 pipeline.py status")
        pl.emit_trailer(step_num, step_key, "noop", 0,
                        next_cmd=f"python3 pipeline.py status")
    elif files_exist:
        # Files exist on disk but state's `artifacts` is empty/different → not validated
        print(f"Artifacts for Step {step_num} exist on disk but are NOT validated against state.")
        print("Either run `python3 pipeline.py complete <title>` to validate and advance,")
        print("or delete the files and re-do the step per the rules.")
        next_cmd = f"python3 pipeline.py complete {title}"
        pl.emit_trailer(step_num, step_key, "await_complete", 0,
                        next_cmd=next_cmd, expected_artifacts=arts)
    else:
        # Normal path: artifacts missing, agent must do the work
        _print_creative_brief(step_num, step_key, title)
    return
```

#### 3e. Refactor `cmd_complete` — auto-chain + `--force` + bounds check + clean exit on already-complete

```python
def cmd_complete(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = load_state(title)

    # Determine which step to mark
    if args.step:
        step_num = int(args.step)
        # NEW: bounds check
        if not (1 <= step_num <= len(STEP_KEYS)):
            print(f"ERROR: --step must be 1..{len(STEP_KEYS)}, got {step_num}")
            pl.emit_trailer(0, "", "fix_and_continue", 2)
            sys.exit(2)
        step_key = STEP_KEYS[step_num - 1]
    else:
        step_num, step_key = find_next_step(state)
        if step_num is None:
            print("All steps complete! Nothing to mark.")
            pl.emit_trailer(0, "", "done", 0)
            return

    step_name = STEP_NAMES.get(step_key, step_key)
    step_state = state["steps"].get(step_key, {})

    # NEW: already-complete → clean exit 0 with noop trailer pointing at NEXT pending step
    if step_state.get("status") == "complete":
        next_num, next_key = find_next_step(state)
        if next_key is None:
            print(f"Step {step_num} ({step_name}) already complete. All steps done.")
            pl.emit_trailer(0, "", "done", 0)
        else:
            next_name = STEP_NAMES[next_key]
            print(f"Step {step_num} ({step_name}) already complete. Next pending: Step {next_num} ({next_name}).")
            next_cmd = f"python3 pipeline.py complete {title}"
            pl.emit_trailer(next_num, next_key, "noop", 0,
                            next_cmd=next_cmd,
                            expected_artifacts=EXPECTED_ARTIFACTS.get(next_key, []))
        return

    # Automated → tell them to use continue (existing refusal, now with trailer)
    if step_key not in CREATIVE_STEPS:
        print(f"ERROR: Step {step_num} ({step_name}) is automated — use `pipeline.py continue`, not `complete`.")
        next_cmd = f"python3 pipeline.py continue {title}"
        pl.emit_trailer(step_num, step_key, "use_continue", 2,
                        next_cmd=next_cmd)
        sys.exit(2)

    # NEW: out-of-order refusal unless --force
    if args.step and not args.force:
        prior_incomplete = []
        for i, k in enumerate(STEP_KEYS[:step_num - 1], start=1):
            if state["steps"].get(k, {}).get("status") != "complete":
                prior_incomplete.append(i)
        if prior_incomplete:
            print(f"ERROR: cannot complete Step {step_num}; earlier steps incomplete: {prior_incomplete}")
            print("Pass --force to override (may corrupt state).")
            pl.emit_trailer(step_num, step_key, "fix_and_continue", 4)
            sys.exit(4)

    print(f"=== Completing step {step_num}: {step_name} ===")

    # Artifact check (skipped for UNVALIDATED_CREATIVE_STEPS — empty list)
    artifacts = EXPECTED_ARTIFACTS.get(step_key, [])
    missing = []
    for art in artifacts:
        ap = vdir / art
        if not ap.exists() or (ap.is_file() and ap.stat().st_size == 0):
            missing.append(art)
    if missing:
        print("ERROR: Missing or empty required artifacts:")
        for m in missing:
            print(f"  - {m}")
        print(f"\nComplete the artifacts above, then re-run: python3 pipeline.py complete {title}")
        pl.emit_trailer(step_num, step_key, "fix_and_continue", 4,
                        expected_artifacts=artifacts)
        sys.exit(4)

    # Schema validation
    ok, errs = validate_project(title)
    if not ok:
        print("VALIDATION FAILED — refusing to mark complete:")
        print(errs)
        pl.emit_trailer(step_num, step_key, "fix_and_continue", 1)
        sys.exit(1)

    # Mark complete
    state["steps"][step_key] = {
        "status": "complete",
        "completed_at": now_iso(),
        "last_error": None,
        "error": None,
        "attempts": step_state.get("attempts", 0),
        "step_kind": "creative",
        "artifacts": artifacts,
    }
    state["current_step"] = min(step_num + 1, len(STEP_KEYS))
    save_state(title, state)
    print(f"\n=== Step {step_num} ({step_name}) marked complete ===")

    # NEW: auto-chain consecutive automated steps
    next_num, next_key = find_next_step(state)
    if next_key is not None and next_key not in CREATIVE_STEPS:
        print(f"\nAuto-running next automated steps...")
        auto_run_automated_steps(title)
        return  # auto_run_automated_steps emits its own trailer

    # No auto-chain — print next creative step or all-done
    if next_key is None:
        print("\nAll steps complete!")
        pl.emit_trailer(0, "", "done", 0)
    else:
        _print_creative_brief(next_num, next_key, title)
```

#### 3f. New `cmd_run(args)` — one-shot new+continue

```python
def cmd_run(args):
    """One-shot entry point: scaffold (if absent) + run continue.

    - If videos/<title>/ doesn't exist: scaffold via cmd_new logic, then continue.
    - If videos/<title>/pipeline_state.json exists: resume via continue.
    - --force: re-scaffold (destructive — deletes existing dir first).
    """
    title = sanitize_title(args.title)
    vdir = video_dir(title)

    if vdir.exists():
        if args.force:
            print(f"--force: removing existing {vdir}")
            shutil.rmtree(vdir, ignore_errors=True)
        elif (vdir / "pipeline_state.json").exists():
            print(f"Resuming existing project: {title}")
            cmd_continue(args)
            return
        else:
            print(f"ERROR: {vdir} exists but has no pipeline_state.json. Use --force to re-scaffold.")
            sys.exit(2)

    # Scaffold
    cmd_new(args)
    # First continue (prints Phase 1 brief, exits)
    cmd_continue(args)
```

#### 3g. argparse wiring

Add to `main()`:

```python
run_p = sub.add_parser("run", help="One-shot: scaffold (if absent) + advance pipeline")
run_p.add_argument("title", help="Video title")
run_p.add_argument("--force", action="store_true", help="Re-scaffold (destructive) if dir exists")
# ...
elif args.command == "run":
    cmd_run(args)
```

Add `--force` to `complete`:

```python
comp_p.add_argument("--force", action="store_true",
                    help="Allow out-of-order completion (may corrupt state)")
```

### 4. SKILL.md rewrite — 4-phase structure

Full rewrite. See implementation. Structure:

```
---
(frontmatter: unchanged triggers/tools)
---

# Full Video Pipeline — Autonomous YouTube Video Production
(intro paragraph)

## Prerequisites
(unchanged: bash check, pip install, requirements)

## Execution Protocol
(simplified — 4 phases, single `continue` + `complete` loop with auto-chain)

## Phase 1: Research & Script
  ### Goal
  ### Use these rules: (inline retention + script rules)
  ### Outputs: SCRIPT.md, scenes.json
  ### Format templates
  ### Validation
  ### When done

## Phase 2: Voiceover
  ### Goal
  ### Use these rules: (inline VOICEOVER.md format rules)
  ### Outputs: VOICEOVER.md
  ### Format template
  ### Validation
  ### When done (Steps 5-6 auto-run)

## Phase 3: Visuals & Render
  ### Goal
  ### Use these rules:
    - CTR palette (mobile legibility, 30-40% negative space)
    - Remotion coding (interpolate not CSS, transform props, video-layout min sizes)
    - MainVideo.tsx MUST import SCENE_MAP from SceneMap.generated.ts
    - Both MainVideo + Thumbnail compositions in Root.tsx
    - Audio path override (silent scenes, stitch-time mux)
  ### Outputs: STYLES.md, remotion/ project (PLAN.md, Root.tsx, MainVideo.tsx, Thumbnail.tsx, lib/*, scenes/SceneXX.tsx)
  ### Format templates (STYLES.md, PLAN.md, scene component)
  ### Pre-render self-check
  ### Validation
  ### When done (Steps 9-10 auto-run)

## Phase 4: Metadata & Thumbnail
  ### Goal
  ### Use these rules:
    - SEO metadata (titles, description, tags, chapters rules)
    - Thumbnail design (3-word text max, no AI images, palette from STYLES.md)
    > Back-ref: Phase 3 §CTR palette (your STYLES.md)
  ### Outputs: TITLE.md, DESCRIPTION.md, TAGS.md, Thumbnail.tsx
  ### Format templates
  ### Validation
  ### When done (Step 13 auto-runs)

## Configuration
(condensed from existing)

## Error Recovery
(condensed table)

## Directory Structure
(unchanged)
```

## Files to modify

| File | Change |
|------|--------|
| `SKILL.md` | Full rewrite: 4-phase structure, inline skill rules, ~500 lines (from 752) |
| `pipeline.py` | Add `run_automated_step()`, `auto_run_automated_steps()`, `_print_creative_brief()`, `cmd_run()`; refactor `cmd_complete()` (auto-chain + `--force` + bounds check + clean exit on already-complete); strengthen `cmd_continue()` (stale-artifact guardrail, use `_print_creative_brief`); move cleanup hooks into `run_automated_step`; add `run` subparser + dispatch |
| `scripts/_pipeline_lib.py` | Add `PHASES`, `_phase_for_step()`, `UNVALIDATED_CREATIVE_STEPS`; expand `emit_trailer()` (new fields: `phase`, `next_cmd`, `skills_section`, `expected_artifacts`; `kind="done"` for terminal) |
| `README.md` | Update: 4-phase flow, `run` command, note that 4-round-trip measure holds on auto-chain path (`continue`-only agents still take 13 iterations) |
| `PLAN.md` | This file |

## Files NOT modified

| File | Reason |
|------|--------|
| `pipeline_config.json` | External config, no change needed |
| `schemas/*.json` | State schema preserved (13 internal steps) |
| `scripts/*.py` except `_pipeline_lib.py` | Individual step scripts unchanged. `validate.py`'s `check_step_requirements` `step >= N` cumulative semantics remain valid; under auto-chain, in-loop validation relies on per-step `run_step_N` self-checks (pipeline.py:295-298, 308-313, 415-420, 430-433, 452-454), not `validate.py --step N` calls. |
| `remotion-foundation/` | Template code, unchanged |
| `skills/` submodules | Still present for reference, no longer required reading |

## Testing

### Syntax / unit
1. `python -c "import pipeline"` — verify no syntax errors
2. `python -c "import scripts._pipeline_lib as pl; print(pl.PHASES)"` — verify new constants
3. `python -c "import scripts._pipeline_lib as pl; print(pl._phase_for_step('3_script_writing'))"` — returns `(1, '#phase-1-research--script')`

### Auto-chain behavior
4. `complete <title>` after Step 4 creative work → verify Steps 5 AND 6 auto-run in one invocation
5. `complete <title>` after Step 8 → verify Steps 9 AND 10 auto-run, AND `_clean_after_assemble` fires
6. `complete <title>` after Step 12 → verify Step 13 auto-runs AND `_clean_after_step_13` fires (node_modules cleaned)

### Guardrails
7. `complete <title> --step 7` with Step 3 still pending → verify exit 4 + `fix_and_continue` trailer. Same with `--force` → verify it succeeds.
8. `complete <title> --step 14` → verify exit 2 (bounds check)
9. `complete <title>` when Step 3 already complete → verify exit 0, `action: "noop"` trailer pointing at Step 4
10. `continue <title>` when Step 3 artifacts exist but `state.steps[3].artifacts == []` → verify stale-artifact message
11. `complete <title> --step 5` (automated) → verify exit 2 + `use_continue` trailer

### `run` flow
12. `run <title>` on fresh dir → verify scaffold + Phase 1 brief printed
13. `run <title>` on existing dir (with state) → verify no re-scaffold, jumps to `continue`
14. `run <title> --force` on existing dir → verify destructive re-scaffold

### Trailer
15. Terminal trailer on "all done" → verify `kind: "done"`, `phase: 0`, `next_cmd: ""`
16. Creative-step trailer → verify `expected_artifacts` array present
17. Steps 1, 2 trailer → verify `expected_artifacts: []`

## Before vs. After

| Metric | Before | After |
|--------|--------|-------|
| SKILL.md lines | 752 | ~500 |
| Creative round-trips (auto-chain path) | 8 | 4 |
| Creative round-trips (`continue`-only path) | 13 | 13 (unchanged — auto-chain is the speed gain) |
| External skill files to load | 11 | 0 (rules inlined) |
| Commands | `new`, `continue` x13, `complete` x8 | `run` (one-shot new+continue) OR `continue` x4 + `complete` x4 (with auto-chain) |
| Machine-readable trailer fields | `step`, `name`, `kind`, `action`, `exit` | + `phase`, `next_cmd`, `skills_section`, `expected_artifacts`; `kind="done"` for terminal |
| Cleanup hooks (`_clean_after_*`) | Only fire from `cmd_continue` | Fire from `run_automated_step` (auto-chain + continue both get cleanup) |
