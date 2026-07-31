#!/usr/bin/env python3
"""
pipeline.py — CLI orchestrator for the full video pipeline.

Usage:
    ./pipeline.py new <title>            Scaffold a new video project
    ./pipeline.py continue <title>      Run the next incomplete pipeline step
    ./pipeline.py status [title]        Show pipeline state
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make scripts/ importable so we can use the shared lib + validate.py
sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))
import _pipeline_lib as pl  # noqa: E402

# Linux-only guard (WSL reports os.name == "posix" and is fine)
if os.name != "posix" and os.environ.get("PIPELINE_FORCE_NON_POSIX") != "1":
    print("ERROR: This pipeline is Linux-only. Use WSL on Windows, or set PIPELINE_FORCE_NON_POSIX=1 to override.", file=sys.stderr)
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent
PIPELINE_CONFIG = REPO_ROOT / "pipeline_config.json"
FOUNDATION_DIR = REPO_ROOT / "remotion-foundation"
SCHEMA_PATH = REPO_ROOT / "schemas" / "pipeline_state.schema.json"

# Re-export commonly used helpers from the shared lib so existing code reads cleanly
video_dir = pl.video_dir
state_path = pl.state_path
scenes_json_path = pl.scenes_json_path
load_state = pl.load_state
save_state = pl.save_state
load_scenes = pl.load_scenes
load_pipeline_config = pl.load_config
now_iso = pl.now_iso
sanitize_title = pl.sanitize_title
CmdError = pl.CmdError


def run_cmd(cmd, cwd=None, check=True, logpath=None):
    return pl.run_cmd(cmd, cwd=cwd, check=check, logpath=logpath)

# Import step metadata from the shared lib (single source of truth)
STEP_KEYS = pl.STEP_KEYS
STEP_NAMES = pl.STEP_NAMES
CREATIVE_STEPS = pl.CREATIVE_STEPS
EXPECTED_ARTIFACTS = pl.EXPECTED_ARTIFACTS
SKIP_STEPS = pl.CREATIVE_STEPS

# ---------------------------------------------------------------------------
# NEW subcommand
# ---------------------------------------------------------------------------

def cmd_new(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    rdir = vdir / "remotion"

    if vdir.exists():
        print(f"ERROR: Video directory already exists: {vdir}")
        sys.exit(1)

    config = load_pipeline_config()
    fps = config.get("video", {}).get("fps", 30)
    width = config.get("video", {}).get("width", 1920)
    height = config.get("video", {}).get("height", 1080)

    print(f"=== Scaffolding video project: {title} ===")
    print(f"  Directory: {vdir}")

    # Create directory structure
    for d in [
        rdir / "src" / "lib",
        rdir / "src" / "scenes",
        rdir / "src" / "components",
        rdir / "public",
        vdir / "voiceover",
        vdir / "scenes",
        vdir / "versions",
    ]:
        d.mkdir(parents=True, exist_ok=True)

    # Copy foundation config files
    for fname in ["tsconfig.json", "remotion.config.ts", "eslint.config.mjs",
                   ".prettierrc", ".gitignore"]:
        src = FOUNDATION_DIR / fname
        if src.exists():
            shutil.copy2(src, rdir / fname)

    # Create package.json — mirror foundation deps for version consistency
    foundation_pkg_path = FOUNDATION_DIR / "package.json"
    if foundation_pkg_path.exists():
        foundation_pkg = json.loads(foundation_pkg_path.read_text(encoding="utf-8"))
        deps = dict(foundation_pkg.get("dependencies", {}))
        dev_deps = dict(foundation_pkg.get("devDependencies", {}))
    else:
        deps = {"remotion-foundation": "*"}
        dev_deps = {}
    pkg = {
        "name": f"remotion-{title}",
        "version": "1.0.0",
        "private": True,
        "dependencies": deps,
        "devDependencies": dev_deps,
        "scripts": {
            "dev": "remotion studio",
            "build": "remotion bundle",
            "lint": "npx eslint src && npx tsc --noEmit",
        },
        "sideEffects": ["*.css"],
    }
    with open(rdir / "package.json", "w") as f:
        json.dump(pkg, f, indent=2)

    # Copy foundation src/ as the per-video Remotion project source.
    # This copies Root.tsx, MainVideo.tsx, Thumbnail.tsx, SceneMap.generated.ts,
    # lib/config.ts (with placeholder values), lib/styles.ts, shared components
    # (Background, TextReveal, StatReveal, Captions), and index.css.
    def _ignore_for_scaffold(src_dir, names):
        # Skip index.ts (remotion-foundation package entry — not needed per-video)
        return {"index.ts"} if Path(src_dir).name == "src" else set()
    shutil.copytree(FOUNDATION_DIR / "src", rdir / "src", dirs_exist_ok=True,
                    ignore=_ignore_for_scaffold)

    # Substitute dynamic values in config.ts (foundation uses {{}} markers)
    config_path = rdir / "src" / "lib" / "config.ts"
    config_text = config_path.read_text(encoding="utf-8")
    config_text = config_text.replace("{{FPS}}", str(fps))
    config_text = config_text.replace("{{WIDTH}}", str(width))
    config_text = config_text.replace("{{HEIGHT}}", str(height))
    config_path.write_text(config_text, encoding="utf-8")

    # Publish animation templates into the per-video project. Copies each
    # template's component.tsx + config/*.json + animation.md + preview/ +
    # the shared _shared/ helpers, and writes a barrel index.ts. Templates
    # with defaults.json that fail schema validation abort the scaffold.
    # No-op (with warning) if repo has no animations/ directory yet.
    publish_animations_script = REPO_ROOT / "scripts" / "publish_animations.py"
    if publish_animations_script.exists():
        anim_src_dir = REPO_ROOT / "animations"
        if anim_src_dir.is_dir() and any(anim_src_dir.iterdir()):
            print("\n--- Publishing animation templates ---")
            run_cmd(
                [sys.executable, str(publish_animations_script), str(vdir)],
                cwd=REPO_ROOT,
            )
        else:
            print("\n--- No animation templates to publish (animations/ is absent or empty) ---")
    else:
        print("\n--- publish_animations.py not found — skipping animation publishing ---")

    # Create pipeline_state.json
    state = {
        "video_title": title,
        "current_step": 1,
        "steps": {},
    }
    for key in STEP_KEYS:
        state["steps"][key] = {"status": "pending"}
    with open(vdir / "pipeline_state.json", "w") as f:
        json.dump(state, f, indent=2)

    # Create empty scenes.json stub
    scenes_stub = {
        "video_title": title,
        "fps": fps,
        "width": width,
        "height": height,
        "created_at": now_iso(),
        "scenes": [],
        "total_estimated_seconds": 0,
        "total_actual_seconds": 0,
    }
    with open(vdir / "scenes.json", "w") as f:
        json.dump(scenes_stub, f, indent=2)

    # Install npm dependencies
    print("\n--- Installing npm dependencies ---")
    run_cmd("npm install", cwd=REPO_ROOT)

    print(f"\n=== Video project scaffolded: {vdir} ===")
    print("\nNext steps:")
    print("  1. Select a topic: ./pipeline.py continue " + title)
    print("  2. The pipeline will guide you through each step.")


# ---------------------------------------------------------------------------
# COMPLETE subcommand — mark a creative step done after manual work
# ---------------------------------------------------------------------------

def cmd_complete(args):
    """Mark a creative step 'complete' (bypassed by the orchestrator, done by human/agent).

    Validates the step's expected artifacts exist, advances current_step,
    writes the new state atomically, then auto-runs consecutive automated steps
    (Steps 5-6 after Step 4; Steps 9-10 after Step 8; Step 13 after Step 12).

    Guards:
      - `--step N` must be in 1..13 (bounds check)
      - `--step N` refused if any earlier step is still pending, unless `--force`
      - Already-complete step → exit 0 with `action: "noop"` trailer pointing
        at the next pending step (not a failure)
      - Automated step → exit 2 with `action: "use_continue"` trailer
    """
    title = sanitize_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = load_state(title)

    # Determine which step to mark (default: the current pending/failed/in_progress)
    if args.step:
        step_num = int(args.step)
        # Bounds check — prevent IndexError on STEP_KEYS[N-1]
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

    # Already-complete → clean exit 0 with noop trailer pointing at NEXT pending step.
    # (Don't sys.exit(2) — the agent may have looped on `complete` and needs to know
    # what to work on next, not see a failure.)
    if step_state.get("status") == "complete":
        next_num, next_key = find_next_step(state)
        if next_key is None:
            print(f"Step {step_num} ({step_name}) already complete. All steps done.")
            pl.emit_trailer(0, "", "done", 0)
        else:
            next_name = STEP_NAMES.get(next_key, next_key)
            print(f"Step {step_num} ({step_name}) already complete. Next pending: Step {next_num} ({next_name}).")
            next_cmd = f"python3 pipeline.py complete {title}"
            pl.emit_trailer(next_num, next_key, "noop", 0,
                            next_cmd=next_cmd,
                            expected_artifacts=EXPECTED_ARTIFACTS.get(next_key, []))
        return

    # Automated → tell them to use continue (preserve existing exit-2 behavior,
    # now with a machine-readable trailer)
    if step_key not in CREATIVE_STEPS:
        print(f"ERROR: Step {step_num} ({step_name}) is automated — use `pipeline.py continue`, not `complete`.")
        next_cmd = f"python3 pipeline.py continue {title}"
        pl.emit_trailer(step_num, step_key, "use_continue", 2,
                        next_cmd=next_cmd)
        sys.exit(2)

    # Out-of-order refusal: if `--step N` was passed, refuse if any earlier step
    # is still pending (unless --force). Prevents state corruption via gaps.
    if args.step and not getattr(args, "force", False):
        prior_incomplete = []
        for i, k in enumerate(STEP_KEYS[:step_num - 1], start=1):
            if state["steps"].get(k, {}).get("status") != "complete":
                prior_incomplete.append(i)
        if prior_incomplete:
            print(f"ERROR: cannot complete Step {step_num}; earlier steps incomplete: {prior_incomplete}")
            print("Pass --force to override (may leave gaps in state — audit/doctor will flag).")
            pl.emit_trailer(step_num, step_key, "fix_and_continue", 4,
                            expected_artifacts=EXPECTED_ARTIFACTS.get(step_key, []))
            sys.exit(4)

    print(f"=== Completing step {step_num}: {step_name} ===")

    # Validate expected artifacts exist (skipped for UNVALIDATED_CREATIVE_STEPS — empty list)
    artifacts = EXPECTED_ARTIFACTS.get(step_key, [])
    missing = []
    for art in artifacts:
        artifact_path = vdir / art
        if not artifact_path.exists():
            missing.append(art)
        elif artifact_path.is_file() and artifact_path.stat().st_size == 0:
            missing.append(f"{art} (empty)")
    if missing:
        print("ERROR: Missing or empty required artifacts:")
        for m in missing:
            print(f"  - {m}")
        print(f"\nComplete the artifacts above, then re-run: python3 pipeline.py complete {title}")
        pl.emit_trailer(step_num, step_key, "fix_and_continue", 4,
                        expected_artifacts=artifacts)
        sys.exit(4)

    # Also validate the pipeline state against schemas as a precondition
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

    # Auto-chain: if the next step is automated, run all consecutive automated
    # steps now (Steps 5-6 after Step 4; Steps 9-10 after Step 8; Step 13 after
    # Step 12). auto_run_automated_steps emits its own trailer on success/fail.
    next_num, next_key = find_next_step(state)
    if next_key is not None and next_key not in CREATIVE_STEPS:
        print(f"\nAuto-running next automated steps...")
        auto_run_automated_steps(title)
        return  # auto_run_automated_steps emits the trailer

    # No auto-chain — print next creative step or all-done
    if next_key is None:
        print("\nAll steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.")
        pl.emit_trailer(0, "", "done", 0)
    else:
        _print_creative_brief(next_num, next_key, title)


# ---------------------------------------------------------------------------
# Automated step dispatch — shared by cmd_continue and auto_run_automated_steps
# ---------------------------------------------------------------------------

def run_automated_step(step_key, title, vdir):
    """Run a single automated step. Returns (success, error_msg).

    Post-step validation runs here. Cleanup hooks (_clean_after_assemble,
    _clean_after_step_13) live in the callers (cmd_continue success branch
    and auto_run_automated_steps) so they fire regardless of entry path.
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
            error_msg = f"unknown automated step key: {step_key}"
    except CmdError as e:
        error_msg = f"CmdError: {e}"
        print(f"\n  ERROR: Command failed with exit code {e.returncode}")
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        print(f"\n  ERROR: {error_msg}")

    # Post-step schema validation (catches malformed writes immediately)
    if success:
        post_ok, post_errs = validate_project(title)
        if not post_ok:
            success = False
            error_msg = f"post-step validation failed: {post_errs}"
            print(f"\n  ERROR: {error_msg}")

    return success, error_msg


def _print_creative_brief(step_num, step_key, title):
    """Print a phase-aware creative-step brief + emit await_complete trailer.

    Used by cmd_continue (creative branch), auto_run_automated_steps (post-loop
    next-creative), and cmd_complete (when next step is creative).
    """
    step_name = STEP_NAMES.get(step_key, step_key)
    phase, anchor = pl._phase_for_step(step_key)
    phase_info = pl.PHASES.get(phase, {})
    phase_name = phase_info.get("name", "")
    arts = EXPECTED_ARTIFACTS.get(step_key, [])
    vdir = video_dir(title)
    cfg = load_pipeline_config(video_dir=vdir)

    print(f"\n=== Phase {phase}: {phase_name} — Step {step_num}: {step_name} ===")

    if step_key in pl.UNVALIDATED_CREATIVE_STEPS:
        # Steps 1 & 2 produce in-context decisions/notes, not files
        print("  This step produces a decision/notes in your own context (no file required).")
    else:
        if arts:
            print("  Required artifacts:")
            for a in arts:
                print(f"    - {a}")

    # Print skill file paths for this phase
    skills_files = pl._skill_paths_for_phase(phase, cfg=cfg)
    if skills_files:
        print("\n  Follow these instructions:")
        for sf in skills_files:
            print(f"    {sf}")
    print(f"  See SKILL.md {anchor} for pipeline-specific formats and contracts.")

    next_cmd = f"python3 pipeline.py complete {title}"
    print(f"\n  When done, run: {next_cmd}")
    print("  Do NOT run `continue` again until `complete` succeeds.")
    pl.emit_trailer(step_num, step_key, "await_complete", 0,
                    next_cmd=next_cmd, expected_artifacts=arts)


def auto_run_automated_steps(title):
    """After `complete` marks a creative step done, auto-run consecutive automated
    steps. Stops at the next creative step or "all done."

    Triggers:
      - complete of Step 4  -> runs Steps 5, 6
      - complete of Step 8  -> runs Steps 9, 10
      - complete of Step 12 -> runs Step 13
    No auto-run for complete of Steps 1, 2, 3, 7, 11 (next step is creative).

    On failure: writes status="failed", last_error, syncs legacy `error` field,
    emits fix_and_continue trailer, exits 1. No silent break.
    """
    vdir = video_dir(title)
    while True:
        state = load_state(title)
        step_num, step_key = find_next_step(state)
        if step_key is None or step_key in CREATIVE_STEPS:
            break
        step_name = STEP_NAMES.get(step_key, step_key)
        print(f"\n--- Auto-running Step {step_num} ({step_name}) ---")

        # Record attempt (mirrors cmd_continue's pre-run block)
        step_state = state["steps"][step_key]
        step_state["status"] = "in_progress"
        step_state["attempts"] = (step_state.get("attempts", 0) or 0) + 1
        step_state["last_attempt_at"] = now_iso()
        save_state(title, state)

        success, error_msg = run_automated_step(step_key, title, vdir)

        if success:
            # Re-load state (run_step_N may have updated scenes.json etc.)
            state = load_state(title)
            state["steps"][step_key]["status"] = "complete"
            state["steps"][step_key]["completed_at"] = now_iso()
            state["steps"][step_key]["last_error"] = None
            state["current_step"] = min(step_num + 1, len(STEP_KEYS))
            save_state(title, state)
            print(f"\n=== Step {step_num} ({step_name}) complete ===")

            # Cleanup hooks (moved here from cmd_continue so auto-chain gets them too)
            if step_key == "10_stitching":
                _clean_after_assemble(vdir)
            elif step_key == "13_thumbnail_rendering":
                _clean_after_step_13(vdir)
        else:
            # Mirror cmd_continue's failure path
            state = load_state(title)
            state["steps"][step_key]["status"] = "failed"
            state["steps"][step_key]["last_error"] = (error_msg or "Step failed, see logs")
            state["steps"][step_key]["error"] = state["steps"][step_key]["last_error"]
            save_state(title, state)
            print(f"\n=== Step {step_num} ({step_name}) FAILED ===")
            print(f"  Last error: {state['steps'][step_key]['last_error']}")
            print(f"  Logs in: videos/{title}/logs/")
            next_cmd = f"python3 pipeline.py continue {title}"
            print(f"  Fix the issue, then run: {next_cmd}")
            pl.emit_trailer(step_num, step_key, "fix_and_continue", 1,
                            next_cmd=next_cmd)
            sys.exit(1)

    # Post-loop: either all-done or next creative step
    state = load_state(title)
    step_num, step_key = find_next_step(state)
    if step_key is None:
        print("\nAll steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.")
        pl.emit_trailer(0, "", "done", 0)
    else:
        _print_creative_brief(step_num, step_key, title)


# ---------------------------------------------------------------------------
# CONTINUE subcommand
# ---------------------------------------------------------------------------

def find_next_step(state):
    """Find the first pending, failed, or in-progress step at or after current_step."""
    current = state.get("current_step", 1)
    for i, key in enumerate(STEP_KEYS, start=1):
        if i < current:
            continue
        step = state["steps"].get(key, {})
        if step.get("status") in ("pending", "failed", "in_progress"):
            return i, key
    return None, None


def run_step_5(title, vdir):
    """Voiceover generation. Idempotent — unchanged scenes are skipped."""
    print("--- Running Step 5: Voiceover Generation ---")
    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("5_voiceover_generation", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    log_file = pl.log_path(title, 5)
    run_cmd(cmd, cwd=REPO_ROOT, logpath=log_file)

    # Verify output
    scenes = load_scenes(title)
    missing = []
    for s in scenes:
        vf = vdir / (s.get("voiceover_file") or "")
        if not vf.exists():
            missing.append(s["id"])
    if missing:
        print(f"  WARNING: Voiceover file missing for scenes: {missing}")
        return False
    return True


def run_step_6(title, vdir):
    """Duration measurement."""
    print("--- Running Step 6: Duration Measurement ---")
    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("6_duration_measurement", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    log_file = pl.log_path(title, 6)
    run_cmd(cmd, cwd=REPO_ROOT, logpath=log_file)

    scenes = load_scenes(title)
    for s in scenes:
        if s.get("actual_duration_frames") is None:
            print(f"  ERROR: Scene {s['id']} missing actual_duration_frames")
            return False
    return True


def lint_gate(title, vdir):
    """Run Remotion lint + typecheck before rendering. Returns (ok, error)."""
    rdir = vdir / "remotion"
    if not (rdir / "package.json").exists():
        return False, "remotion/package.json not found"
    print("--- Pre-render lint/typecheck gate ---")
    r1 = run_cmd("npm run lint", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    if r1.returncode != 0:
        return False, "npm run lint failed"
    r2 = run_cmd("npx tsc --noEmit", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    if r2.returncode != 0:
        return False, "tsc --noEmit failed"
    # Confirm compositions are registered
    r3 = run_cmd("npx remotion compositions src/Root.tsx", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    raw = r3.stdout
    compositions_out = (raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw) or ""
    if r3.returncode != 0 or "MainVideo" not in compositions_out:
        return False, "MainVideo composition not found via `remotion compositions`"
    if "Thumbnail" not in compositions_out:
        return False, "Thumbnail composition not found via `remotion compositions`"
    return True, "lint/typecheck/compositions OK"


def run_step_9(title, vdir):
    """Scene rendering — one scene at a time. Resumable, non-fatal per-scene.

    Lint/typecheck gate runs once before the loop. If a scene render fails,
    record render_attempts += 1 and last_render_error, then CONTINUE to the
    next scene. Returns True only if every scene's render_status == "rendered"
    by the end of the loop.
    """
    print("--- Running Step 9: Scene Rendering ---")

    # Ensure MainVideo.tsx imports SceneMap.generated.ts (B2 contract check).
    # If not, the agent is running the old scaffold — tell them to re-Step 8.
    rdir = vdir / "remotion"
    mv_path = rdir / "src" / "components" / "MainVideo.tsx"
    if mv_path.exists() and "SceneMap" not in mv_path.read_text(encoding="utf-8"):
        print("  ERROR: MainVideo.tsx must import SceneMap.generated.ts (the B2 contract).")
        print("  Re-run Step 8 with the updated foundation template to get the new MainVideo.tsx")
        print("  that imports from src/scenes/SceneMap.generated.ts.")
        return False

    # Regenerate SceneMap.generated.ts with static scene imports.
    # MainVideo.tsx imports SCENE_MAP from this file; we only overwrite the map,
    # never the agent-owned MainVideo.tsx.
    scenes = load_scenes(title)
    scene_ids = sorted(set(s["id"] for s in scenes))
    import_lines = []
    map_entries = []
    for sid in scene_ids:
        padded = f"{sid:02d}"
        import_lines.append(f'import {{ Scene{padded} }} from "./Scene{padded}";')
        map_entries.append(f"  {sid}: Scene{padded},")
    scenemap_content = (
        '// AUTO-GENERATED by pipeline.py — do not edit.\n'
        + "import React from 'react';\n"
        + "import type { SceneTiming } from 'remotion-foundation';\n"
        + "\n".join(import_lines)
        + "\n\n"
        + "export const SCENE_MAP: Record<number, React.FC<{ scene: SceneTiming }>> = {\n"
        + "\n".join(map_entries)
        + "\n};\n"
    )
    sm_path = rdir / "src" / "scenes" / "SceneMap.generated.ts"
    sm_path.write_text(scenemap_content)
    print(f"  Regenerated SceneMap.generated.ts with {len(scene_ids)} static scene import(s)")

    # Lint gate (fail fast before any render work)
    ok, msg = lint_gate(title, vdir)
    if not ok:
        print(f"  LINT GATE FAILED: {msg}")
        return False
    print(f"  Lint gate: {msg}")

    # Optional on-demand animation preview step. Triggered when the agent sets
    # `animations_preview_requested: true` in pipeline_state.json before running
    # `complete` at Step 8. Renders a 3s stub of every published animation
    # template into .animation-previews/. Failures are non-fatal (diagnostic
    # only) — the regular scene render continues regardless.
    state = load_state(title) or {}
    if state.get("animations_preview_requested"):
        print("\n  --- Running optional animation preview step ---")
        preview_script = REPO_ROOT / "scripts" / "preview_animations.py"
        if preview_script.exists():
            anim_dir = rdir / "src" / "components" / "animations"
            if anim_dir.is_dir() and any(anim_dir.iterdir()):
                run_cmd(
                    [sys.executable, str(preview_script), str(vdir)],
                    cwd=REPO_ROOT,
                    check=False,  # non-fatal — preview failures must not block scenes
                )
            else:
                print("  No published animation templates — skipping previews.")
        else:
            print("  preview_animations.py not found — skipping previews.")
        # Reset the flag so previews don't auto-rerun on every subsequent Step 9.
        state.pop("animations_preview_requested", None)
        save_state(title, state)

    cfg_step9 = load_pipeline_config(video_dir=vdir)
    tmpl_step9 = pl.get_step_command_template("9_scene_rendering", cfg_step9)
    scenes = load_scenes(title)
    failed_scenes = []
    for s in scenes:
        sid = s["id"]
        if s.get("render_status") == "rendered":
            print(f"  Scene {sid}: already rendered, skipping")
            continue
        print(f"\n  Rendering scene {sid}/{len(scenes)}: {s.get('title', '')}")
        # render_scene.py never raises for render failures; it returns exit 1.
        # Wrap anyway in case of unexpected exception.
        try:
            cmd = pl.render_step_command(tmpl_step9, vdir, scene_id=sid, cfg=cfg_step9)
            r = run_cmd(cmd, cwd=REPO_ROOT, check=False,
                        logpath=pl.log_path(title, 9, scene_id=sid))
            if r.returncode != 0:
                failed_scenes.append(sid)
        except Exception as e:
            print(f"  ERROR rendering scene {sid}: {type(e).__name__}: {e}")
            failed_scenes.append(sid)

    # Re-load to inspect statuses
    scenes = load_scenes(title)
    still_failed = [s["id"] for s in scenes if s.get("render_status") != "rendered"]
    if still_failed:
        print(f"\n  Scenes not rendered: {still_failed}")
        print(f"  Re-run `./pipeline.py continue {title}` to retry failed scenes.")
        return False
    return True


def run_step_10(title, vdir):
    """Stitching — single ffmpeg pass via assemble.py."""
    print("--- Running Step 10: Stitching (assemble.py) ---")
    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("10_stitching", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    run_cmd(cmd, cwd=REPO_ROOT, logpath=pl.log_path(title, 10))

    final_dir = vdir / "versions"
    if not final_dir.exists() or not list(final_dir.glob("*.mp4")):
        print("  ERROR: No final MP4 in versions/")
        return False
    return True


def run_step_13(title, vdir):
    """Thumbnail rendering via render_thumbnail.py. Idempotent — skips if already rendered."""
    print("--- Running Step 13: Thumbnail Rendering ---")

    # Run lint gate to ensure Thumbnail.tsx compiles + composition is registered
    ok, msg = lint_gate(title, vdir)
    if not ok:
        print(f"  LINT GATE FAILED: {msg}")
        return False
    print(f"  Lint gate: {msg}")

    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("13_thumbnail_rendering", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    log_file = pl.log_path(title, 13)
    run_cmd(cmd, cwd=REPO_ROOT, check=False, logpath=log_file)

    final_dir = vdir / "versions"
    if not final_dir.exists() or not list(final_dir.glob("*thumbnail*.png")):
        print("  ERROR: No thumbnail PNG in versions/")
        return False
    return True


def load_scenes(title):
    return pl.load_scenes(title)


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def validate_project(title):
    """Run scripts/validate.py on this video's scenes/state. Returns (ok, errors)."""
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
         str(video_dir(title))],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    return p.returncode == 0, (p.stdout + p.stderr).strip()


def _clean_after_step_13(vdir):
    """Remove remotion/node_modules after final step completes."""
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_remotion_node_modules_after_step_13", True):
        nm_dir = vdir / "remotion" / "node_modules"
        if nm_dir.exists():
            shutil.rmtree(nm_dir, ignore_errors=True)
            print(f"  Cleaned: remotion/node_modules/")


def _clean_after_assemble(vdir):
    """Optional: remove scene MP4s after a successful stitch."""
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_scene_mp4s_after_stitch", False):
        scenes_dir = vdir / "scenes"
        if scenes_dir.exists():
            for f in scenes_dir.glob("*.mp4"):
                f.unlink(missing_ok=True)
            print(f"  Cleaned: scenes/*.mp4 (clean_scene_mp4s_after_stitch=True)")


def cmd_continue(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = load_state(title)

    # Schema validation gate: refuse to run automated steps on invalid state.
    ok, errs = validate_project(title)
    if not ok:
        print("VALIDATION FAILED — refusing to continue:")
        print(errs)
        sys.exit(1)
    print("Validation OK.")

    step_num, step_key = find_next_step(state)
    if step_num is None:
        print(f"All steps complete for '{title}'!")
        pl.emit_trailer(0, "", "done", 0)
        return

    step_name = STEP_NAMES.get(step_key, step_key)
    print(f"=== Continuing pipeline: {title} ===")
    print(f"  Next step: {step_num}. {step_name}")

    if step_key in SKIP_STEPS:
        # Creative step — guard against wrong-command / stale-artifact confusion.
        arts = EXPECTED_ARTIFACTS.get(step_key, [])
        step_state = state["steps"].get(step_key, {}) or {}
        state_artifacts = step_state.get("artifacts", []) or []
        files_exist = all((vdir / a).exists() for a in arts) if arts else False

        if step_key in pl.UNVALIDATED_CREATIVE_STEPS:
            # Steps 1, 2: in-context decisions, no files
            _print_creative_brief(step_num, step_key, title)
        elif state.get("status") == "complete":
            # Step already complete — find_next_step shouldn't have picked it; safety net.
            print(f"Step {step_num} ({step_name}) is already complete.")
            print("State may be inconsistent. Run: python3 pipeline.py status")
            pl.emit_trailer(step_num, step_key, "noop", 0,
                            next_cmd=f"python3 pipeline.py status", expected_artifacts=arts)
        elif files_exist and state_artifacts == arts:
            # Files exist AND state recorded them — step should already be complete
            print(f"Step {step_num} ({step_name}) artifacts already validated.")
            print("State may be inconsistent. Run: python3 pipeline.py status")
            pl.emit_trailer(step_num, step_key, "noop", 0,
                            next_cmd=f"python3 pipeline.py status", expected_artifacts=arts)
        elif files_exist:
            # Files on disk but state's `artifacts` is empty/divergent — not validated
            print(f"Artifacts for Step {step_num} ({step_name}) exist on disk but are NOT validated against state.")
            print(f"  Either run `python3 pipeline.py complete {title}` to validate and advance,")
            print("  or delete the files and re-do the step per the rules in SKILL.md.")
            next_cmd = f"python3 pipeline.py complete {title}"
            pl.emit_trailer(step_num, step_key, "await_complete", 0,
                            next_cmd=next_cmd, expected_artifacts=arts)
        else:
            # Normal path: artifacts missing, agent must do the work
            _print_creative_brief(step_num, step_key, title)
        return

    # Record attempt BEFORE the run
    step_state = state["steps"][step_key]
    step_state["status"] = "in_progress"
    step_state["attempts"] = (step_state.get("attempts", 0) or 0) + 1
    step_state["last_attempt_at"] = now_iso()
    save_state(title, state)

    # Run the step via the shared dispatch
    success, error_msg = run_automated_step(step_key, title, vdir)

    if success:
        state = load_state(title)
        state["steps"][step_key]["status"] = "complete"
        state["steps"][step_key]["completed_at"] = now_iso()
        state["steps"][step_key]["last_error"] = None
        state["current_step"] = min(step_num + 1, len(STEP_KEYS))
        save_state(title, state)
        print(f"\n=== Step {step_num} ({step_name}) complete ===")

        # Post-step cleanup (kept here for the continue path; auto-chain has its own
        # copy inside auto_run_automated_steps)
        if step_key == "13_thumbnail_rendering":
            _clean_after_step_13(vdir)
        elif step_key == "10_stitching":
            _clean_after_assemble(vdir)

        next_num, next_key = find_next_step(state)
        if next_num is None:
            print("\nAll steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.")
            pl.emit_trailer(0, "", "done", 0)
        elif next_key in SKIP_STEPS:
            print(f"\nNext: Step {next_num} ({STEP_NAMES.get(next_key, next_key)}) — requires creative input.")
            _print_creative_brief(next_num, next_key, title)
        else:
            next_cmd = f"python3 pipeline.py continue {title}"
            print(f"\nNext: Step {next_num} ({STEP_NAMES.get(next_key, next_key)}) — automated.")
            print(f"Run: {next_cmd}")
            pl.emit_trailer(next_num, next_key, "run_continue", 0,
                            next_cmd=next_cmd)
    else:
        state = load_state(title)
        state["steps"][step_key]["status"] = "failed"
        state["steps"][step_key]["last_error"] = (error_msg or "Step failed, see logs")
        # Keep legacy `error` field in sync for older readers
        state["steps"][step_key]["error"] = state["steps"][step_key]["last_error"]
        save_state(title, state)
        print(f"\n=== Step {step_num} ({step_name}) FAILED ===")
        print(f"  Last error: {state['steps'][step_key]['last_error']}")
        print(f"  Logs in: videos/{title}/logs/")
        next_cmd = f"python3 pipeline.py continue {title}"
        print(f"  Fix the issue, then run: {next_cmd}")
        pl.emit_trailer(step_num, step_key, "fix_and_continue", 1,
                        next_cmd=next_cmd)
        sys.exit(1)


# ---------------------------------------------------------------------------
# STATUS subcommand
# ---------------------------------------------------------------------------

def cmd_status(args):
    if args.title:
        title = sanitize_title(args.title)
        show_status_for_title(title)
    else:
        show_all_statuses()


def show_status_for_title(title):
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = load_state(title)
    print(f"=== Pipeline Status: {title} ===")
    print(f"  Current step: {state.get('current_step', '?')}")
    print()
    print(f"  {'Step':<5} {'Name':<28} {'Status':<12} {'Attempts':<10} {'Completed/LastErr'}")
    print(f"  {'-----':<5} {'----------------------------':<28} {'------------':<12} {'----------':<10} {'--------------------'}")
    for i, key in enumerate(STEP_KEYS, start=1):
        step = state["steps"].get(key, {})
        status = step.get("status", "pending")
        attempts = step.get("attempts", 0)
        col = step.get("completed_at") or (step.get("last_error") or "")[:50]
        icon = {"complete": "[OK]", "in_progress": "[>>]", "failed": "[!!]", "pending": "[--]"}.get(status, "[??]")
        print(f"  {i:<5} {STEP_NAMES[key]:<28} {icon} {status:<10} {attempts:<10} {col}")


def show_all_statuses():
    videos_dir = REPO_ROOT / "videos"
    if not videos_dir.exists():
        print("No videos directory found.")
        return

    entries = []
    for d in sorted(videos_dir.iterdir()):
        if d.is_dir():
            sp = d / "pipeline_state.json"
            if sp.exists():
                with open(sp, "r", encoding="utf-8") as f:
                    state = json.load(f)
                step = state.get("current_step", "?")
                entries.append((d.name, step))

    if not entries:
        print("No video projects found.")
        return

    print("=== All Video Projects ===")
    print(f"  {'Title':<50} {'Step'}")
    print(f"  {'-'*50} {'-'*5}")
    for name, step in entries:
        print(f"  {name:<50} {step}")


# ---------------------------------------------------------------------------
# VALIDATE subcommand
# ---------------------------------------------------------------------------

def cmd_audit(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    violations = []
    state = load_state(title)

    # 1. Pipeline state summary
    print(f"=== Audit: {title} ===")
    print(f"  Current step: {state.get('current_step', '?')}")
    print()
    for i, key in enumerate(STEP_KEYS, start=1):
        step = state["steps"].get(key, {})
        status = step.get("status", "pending")
        icon = {"complete": "[OK]", "in_progress": "[>>]", "failed": "[!!]", "pending": "[--]"}.get(status, "[??]")
        print(f"  {i:<5} {STEP_NAMES[key]:<28} {icon} {status}")

    # 2. Log tail (last 50 lines per step log)
    log_dir = vdir / "logs"
    print(f"\n--- Log tails ---")
    if log_dir.exists():
        for lf in sorted(log_dir.glob("step-*.log")):
            lines = lf.read_text(encoding="utf-8").rstrip().split("\n")
            tail = lines[-50:] if len(lines) > 50 else lines
            print(f"\n  {lf.name} ({len(lines)} lines, last {len(tail)}):")
            for line in tail:
                print(f"    {line}")
    else:
        print("  (no logs directory)")

    # 3. Versioned MP4 ffprobe
    versions_dir = vdir / "versions"
    print(f"\n--- Version files ---")
    mp4_files = sorted(versions_dir.glob("*.mp4")) if versions_dir.exists() else []
    if mp4_files:
        for fp in mp4_files:
            duration = pl.get_audio_duration(fp)
            streams = pl.ffprobe_streams(fp) or []
            vcodec = ""
            acodec = ""
            for s in streams:
                if s.get("codec_type") == "video":
                    vcodec = s.get("codec_name", "")
                elif s.get("codec_type") == "audio":
                    acodec = s.get("codec_name", "")
            dur_str = f"{duration:.2f}s" if duration else "?"
            # mean_volume via volumedetect
            mean_volume = "?"
            try:
                r = subprocess.run(
                    ["ffmpeg", "-i", str(fp), "-filter:a", "volumedetect", "-f", "null", "-"],
                    capture_output=True, text=True, timeout=30,
                )
                m = re.search(r"mean_volume\s*=\s*(-?\d+(?:\.\d+)?)\s*dB", r.stderr)
                if m:
                    mean_volume = m.group(1)
            except Exception:
                pass
            print(f"  {fp.name}: dur={dur_str} vcodec={vcodec or '?'} acodec={acodec or '?'} mean_volume={mean_volume}dB")

            # Violation: audio too low
            try:
                if mean_volume != "?" and float(mean_volume) < -40.0:
                    violations.append(f"AUDIO_TOO_LOW: {fp.name} mean_volume={mean_volume}dB < -40dB")
            except ValueError:
                pass
    else:
        print("  (no version MP4s)")

    # 4. Cross-reference log errors against step status
    print(f"\n--- Consistency checks ---")
    if log_dir.exists():
        for lf in sorted(log_dir.glob("step-*.log")):
            text = lf.read_text(encoding="utf-8")
            # Extract step number from filename step-N.log
            m_step = re.match(r"step-(\d+)", lf.stem)
            step_num = int(m_step.group(1)) if m_step else None
            if step_num is not None and step_num <= len(STEP_KEYS):
                key = STEP_KEYS[step_num - 1]
                status = state["steps"].get(key, {}).get("status", "")
                has_error = "ERROR" in text or re.search(r"exit code [1-9]", text)
                if status == "complete" and has_error:
                    violations.append(f"LOG_ERROR: {lf.name} marked complete but log contains errors")
                elif status == "complete":
                    pass  # all good
        if not any("LOG_ERROR" in v for v in violations):
            print("  No log/state mismatches detected.")
    else:
        print("  (no logs directory)")

    # 5. Missing scene MP4s
    scenes = load_scenes(title)
    scenes_dir = vdir / "scenes"
    if scenes:
        missing = [s["id"] for s in scenes if not (scenes_dir / f"scene-{s['id']:02d}.mp4").exists()]
        if missing:
            violations.append(f"MISSING_SCENES: scenes {missing} missing MP4 in {scenes_dir}/")
        else:
            print("  All scene MP4s present.")
    else:
        print("  (no scenes data)")

    # Summary
    print(f"\n=== Audit summary ===")
    if violations:
        print(f"  VIOLATIONS ({len(violations)}):")
        for v in violations:
            print(f"    - {v}")
        sys.exit(1)
    else:
        print("  All checks passed.")
        sys.exit(0)


def cmd_doctor(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    rdir = vdir / "remotion"
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    all_ok = True

    # 1. System check
    print("=== 1. System check ===")
    sys_check = REPO_ROOT / "scripts" / "check_system.sh"
    if sys_check.exists():
        try:
            r = subprocess.run(
                ["bash", str(sys_check)], capture_output=True, text=True, timeout=30,
            )
            print(r.stdout)
            if r.stderr:
                print(r.stderr)
            if r.returncode != 0:
                all_ok = False
                print("  FAIL: system check failed — see above.")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            print("  SKIP: bash not available or timed out on this system")
    else:
        print("  SKIP: scripts/check_system.sh not found")
        print("  RECOMMENDED: run on Linux or WSL for full system diagnostics.")

    # 2. Remotion version drift
    print("\n=== 2. Remotion version check ===")
    if (rdir / "package.json").exists():
        r = subprocess.run(
            "npx remotion versions",
            capture_output=True, text=True, timeout=60, cwd=rdir, shell=True,
        )
        if r.returncode == 0 and r.stdout:
            print(r.stdout)
            if "ERROR" in r.stdout or "warning" in r.stdout.lower():
                all_ok = False
                print("  RECOMMENDED: run npx remotion versions to identify drift,"
                      " then align versions in remotion-foundation/package.json")
        else:
            all_ok = False
            print(f"  FAIL: npx remotion versions failed (exit {r.returncode})")
            print("  RECOMMENDED: ensure npm install has been run in the repo root")
    else:
        print("  SKIP: no remotion project yet (step 8 not complete)")

    # 3. Schema validation via validate.py
    print("\n=== 3. Schema validation ===")
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"), str(vdir)],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    print(p.stdout.strip() if p.stdout else "")
    if p.returncode != 0:
        all_ok = False
        print("  RECOMMENDED: fix schema violations shown above.")

    # 4. Bug-pattern checks against the source scripts
    print("\n=== 4. Source bug-pattern checks ===")

    assemble_path = REPO_ROOT / "scripts" / "assemble.py"
    thumbnail_path = REPO_ROOT / "scripts" / "render_thumbnail.py"

    if assemble_path.exists():
        assemble_text = assemble_path.read_text(encoding="utf-8")
        # 4a. -map flags present in final mux
        if "-map 0:v:0 -map 1:a:0" in assemble_text:
            print("  [OK] assemble.py: -map flags present in final mux")
        else:
            all_ok = False
            print("  [FAIL] assemble.py: missing -map 0:v:0 -map 1:a:0 in final mux")
            print("  RECOMMENDED: add '-map 0:v:0 -map 1:a:0' to the final ffmpeg command"
                  " after the two -i flags and before -c:v copy")
        # 4b. atomic_replace_temp -f injection
        if "-f {fmt}" in assemble_text or "'-f {fmt}'" in assemble_text:
            print("  [OK] assemble.py: atomic_replace_temp injects -f <ext>")
        elif "-f mp4" in assemble_text and "-f mp3" in assemble_text:
            print("  [OK] assemble.py: atomic_replace_temp injects -f <ext>")
        else:
            all_ok = False
            print("  [FAIL] assemble.py: atomic_replace_temp missing -f <ext> injection")
            print("  RECOMMENDED: rewrite atomic_replace_temp to inject"
                  " -f {fmt} before the temp output path regardless of codec flags")
    else:
        print("  SKIP: scripts/assemble.py not found")

    if thumbnail_path.exists():
        thumb_text = thumbnail_path.read_text(encoding="utf-8")
        # 4c. Non-zero frame
        if "--frame=0" not in thumb_text:
            print("  [OK] render_thumbnail.py: does not use --frame=0")
        else:
            all_ok = False
            print("  [FAIL] render_thumbnail.py: uses --frame=0")
            print("  RECOMMENDED: query composition metadata with"
                  " npx remotion compositions --json and render at durationInFrames-1 instead")
    else:
        print("  SKIP: scripts/render_thumbnail.py not found")

    # Summary
    print(f"\n=== Doctor summary ===")
    if all_ok:
        print("  All checks passed.")
        sys.exit(0)
    else:
        print("  One or more checks failed. See recommendations above.")
        sys.exit(1)


def cmd_validate(args):
    title = sanitize_title(args.title)
    if not video_dir(title).exists():
        print(f"ERROR: Video directory not found: {video_dir(title)}")
        sys.exit(2)
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
         str(video_dir(title))],
        cwd=REPO_ROOT,
    )
    sys.exit(p.returncode)


# ---------------------------------------------------------------------------
# CLEAN subcommand — manual disk recovery for a single video
# ---------------------------------------------------------------------------

def cmd_clean(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    keep_v = ren.get("keep_versions", 2)
    safe_title = pl.sanitize_title(title)
    freed = 0

    print(f"=== Cleaning up: {title} ===")

    # 1. voiceover_aligned.mp3
    aligned = vdir / "voiceover_aligned.mp3"
    if aligned.exists():
        sz = aligned.stat().st_size
        aligned.unlink(missing_ok=True)
        freed += sz
        print(f"  Removed: voiceover_aligned.mp3 ({sz/1024/1024:.1f} MB)")

    # 2. Prune old MP4 versions (keep last N)
    to_prune = pl.find_versions_to_prune(
        vdir / "versions", safe_title, r'{title}-v(\d+)\.mp4', keep_v)
    for old in to_prune:
        sz = old.stat().st_size
        old.unlink(missing_ok=True)
        freed += sz
        print(f"  Pruned: {old.name} ({sz/1024/1024:.1f} MB)")

    # 4. Prune old thumbnail PNG versions
    to_prune = pl.find_versions_to_prune(
        vdir / "versions", safe_title, r'{title}-thumbnail-v(\d+)\.png', keep_v)
    for old in to_prune:
        sz = old.stat().st_size
        old.unlink(missing_ok=True)
        freed += sz
        print(f"  Pruned: {old.name} ({sz/1024/1024:.1f} MB)")

    # 5. remotion/node_modules/
    nm_dir = vdir / "remotion" / "node_modules"
    if nm_dir.exists():
        sz = sum(f.stat().st_size for f in nm_dir.rglob("*") if f.is_file())
        shutil.rmtree(nm_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: remotion/node_modules/ ({sz/1024/1024:.1f} MB)")

    # 6. .preview/
    preview_dir = vdir / ".preview"
    if preview_dir.exists():
        sz = sum(f.stat().st_size for f in preview_dir.rglob("*") if f.is_file())
        shutil.rmtree(preview_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: .preview/ ({sz/1024/1024:.1f} MB)")

    # 7. Scene MP4s (only if configured, default off)
    if ren.get("clean_scene_mp4s_after_stitch", False):
        scenes_dir = vdir / "scenes"
        if scenes_dir.exists():
            for f in scenes_dir.glob("*.mp4"):
                sz = f.stat().st_size
                f.unlink(missing_ok=True)
                freed += sz
                print(f"  Removed: scenes/{f.name} ({sz/1024/1024:.1f} MB)")

    # 8. Reap Remotion TMPDIR (per-video — title substitution)
    tmpdir = cfg.get("system", {}).get("temp_dir", "/tmp/remotion/{title}")
    tdir = Path(tmpdir.replace("{title}", title))
    if tdir.exists():
        sz = sum(f.stat().st_size for f in tdir.rglob("*") if f.is_file())
        shutil.rmtree(tdir, ignore_errors=True)
        freed += sz
        print(f"  Reaped: Remotion TMPDIR ({sz/1024/1024:.1f} MB)")

    # 9. Rotate logs
    log_dir = vdir / "logs"
    if log_dir.exists():
        for lf in sorted(log_dir.glob("*.log")):
            pl.rotate_log_if_needed(
                lf,
                max_size_mb=ren.get("max_log_size_mb", 0),
                keep_last_n=ren.get("keep_last_n_log_runs", 10),
            )
        print(f"  Rotated logs in: {log_dir}")

    print(f"\nTotal freed: {freed/1024/1024:.1f} MB")


# ---------------------------------------------------------------------------
# PREVIEW subcommand — quick low-res render of scene 1 as a smoke test
# ---------------------------------------------------------------------------

def cmd_preview(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    rdir = vdir / "remotion"
    if not (rdir / "package.json").exists():
        print(f"ERROR: {rdir}/package.json not found (run step 8 first)")
        sys.exit(2)

    # Lint gate before previewing
    ok, msg = lint_gate(title, vdir)
    if not ok:
        print(f"LINT GATE FAILED: {msg}")
        sys.exit(1)

    cfg = load_pipeline_config()
    r = cfg.get("render", {})
    node_max_old = r.get("node_max_old_space_size_mb", 384)
    gl_backend = r.get("gl_backend", "swangle")
    timeout_ms = r.get("timeout_ms", 60000)

    import os as _os
    _os.environ["NODE_OPTIONS"] = f"--max-old-space-size={node_max_old}"

    out_dir = vdir / ".preview"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / "preview-scene-01.mp4"

    # Render only the first 20 frames (≤ ~0.7s) at low quality as a smoke render.
    scenes = load_scenes(title)
    if not scenes:
        print("ERROR: no scenes in scenes.json")
        sys.exit(2)
    first = scenes[0]
    if not first.get("actual_duration_frames"):
        print("ERROR: scene 1 missing actual_duration_frames (run step 6 first)")
        sys.exit(2)
    frame_end = min(20, first["actual_duration_frames"])

    print(f"Previewing scene 1, frames 0-{frame_end} -> {out_file}")
    cmd = (
        f"npx remotion render src/Root.tsx MainVideo \"{out_file}\" "
        f"--frames=0-{frame_end} "
        f"--concurrency 1 "
        f"--gl={gl_backend} "
        f"--image-format jpeg --jpeg-quality 60 "
        f"--codec h264 --x264-preset ultrafast --crf 35 "
        f"--disallow-parallel-encoding "
        f"--timeout {timeout_ms} "
        f"--overwrite --log=warn"
    )
    r1 = run_cmd(cmd, cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id="preview"))
    if r1.returncode != 0 or not out_file.exists():
        print("PREVIEW FAILED")
        sys.exit(1)
    print(f"\nPreview rendered: {out_file}")
    print("  Copy/SCP out and play locally to verify visual correctness.")

    # Clean preview dir after successful render
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_preview_after_success", True):
        shutil.rmtree(out_dir, ignore_errors=True)
        print(f"  Cleaned: .preview/")


# ---------------------------------------------------------------------------
# CAPTIONS subcommand — generate SRT sidecar + populate scene caption cues
# ---------------------------------------------------------------------------

def cmd_captions(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    if not (vdir / "scenes.json").exists():
        print(f"ERROR: scenes.json not found at {vdir / 'scenes.json'}")
        sys.exit(2)
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "generate_captions.py"),
         str(vdir)],
        cwd=REPO_ROOT,
    )
    sys.exit(p.returncode)


# ---------------------------------------------------------------------------
# RUN subcommand — one-shot new + continue (resume-safe)
# ---------------------------------------------------------------------------

def cmd_run(args):
    """One-shot entry point: scaffold (if absent) + run continue.

    - If videos/<title>/ doesn't exist: scaffold via cmd_new, then continue.
    - If videos/<title>/pipeline_state.json exists: resume via continue.
    - If videos/<title>/ exists but has no state file: refuse (use --force).
    - --force: destructive re-scaffold (deletes existing dir first).

    This is the recommended "don't get lost" path. The agent runs `run` once,
    sees the Phase 1 creative brief, does the work, then calls `complete` which
    auto-runs automated sub-steps. The agent never needs to track which step
    is next — the orchestrator handles it.
    """
    title = sanitize_title(args.title)
    vdir = video_dir(title)

    if vdir.exists():
        if getattr(args, "force", False):
            print(f"--force: removing existing {vdir}")
            shutil.rmtree(vdir, ignore_errors=True)
        elif (vdir / "pipeline_state.json").exists():
            # Resume — just call cmd_continue (preserves args.title)
            print(f"Resuming existing project: {title}")
            cmd_continue(args)
            return
        else:
            print(f"ERROR: {vdir} exists but has no pipeline_state.json.")
            print("  Use --force to re-scaffold (destructive) or pick a different title.")
            sys.exit(2)

    # Scaffold (cmd_new expects args.title — present here)
    cmd_new(args)

    # First continue prints the Phase 1 creative brief and exits.
    cmd_continue(args)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Full video pipeline orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--config", type=str,
                        help="Path to pipeline config override JSON")
    sub = parser.add_subparsers(dest="command")

    new_p = sub.add_parser("new", help="Scaffold a new video project")
    new_p.add_argument("title", help="Video title (will be sanitized for directory name)")

    cont_p = sub.add_parser("continue", help="Run the next incomplete pipeline step")
    cont_p.add_argument("title", help="Video title")

    comp_p = sub.add_parser("complete", help="Mark a creative step complete (after manual work)")
    comp_p.add_argument("title", help="Video title")
    comp_p.add_argument("--step", type=int, help="Step number to complete (default: next pending step)")
    comp_p.add_argument("--force", action="store_true",
                        help="Allow out-of-order completion (may leave gaps in state — audit/doctor will flag)")

    run_p = sub.add_parser("run", help="One-shot: scaffold (if absent) + advance pipeline")
    run_p.add_argument("title", help="Video title")
    run_p.add_argument("--force", action="store_true",
                       help="Re-scaffold (destructive) if dir exists")

    status_p = sub.add_parser("status", help="Show pipeline state")
    status_p.add_argument("title", nargs="?", help="Video title (omit to show all)")

    validate_p = sub.add_parser("validate", help="Validate scenes.json + pipeline_state.json against schemas")
    validate_p.add_argument("title", help="Video title")

    preview_p = sub.add_parser("preview", help="Quick low-res smoke render of scene 1")
    preview_p.add_argument("title", help="Video title")

    captions_p = sub.add_parser("captions", help="Generate SRT sidecar + populate scene captions")
    captions_p.add_argument("title", help="Video title")

    audit_p = sub.add_parser("audit", help="Audit a video project for violations")
    audit_p.add_argument("title", help="Video title")

    doctor_p = sub.add_parser("doctor", help="Run system and project diagnostics")
    doctor_p.add_argument("title", help="Video title")

    clean_p = sub.add_parser("clean", help="Free disk space for a completed video")
    clean_p.add_argument("title", help="Video title")

    args = parser.parse_args()

    if args.config:
        pl.set_config_override(args.config)

    if args.command == "new":
        cmd_new(args)
    elif args.command == "continue":
        cmd_continue(args)
    elif args.command == "complete":
        cmd_complete(args)
    elif args.command == "run":
        cmd_run(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "validate":
        cmd_validate(args)
    elif args.command == "preview":
        cmd_preview(args)
    elif args.command == "captions":
        cmd_captions(args)
    elif args.command == "clean":
        cmd_clean(args)
    elif args.command == "audit":
        cmd_audit(args)
    elif args.command == "doctor":
        cmd_doctor(args)
    else:
        parser.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
