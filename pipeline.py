#!/usr/bin/env python3
"""
pipeline.py — CLI orchestrator for the full video pipeline.

Usage:
    ./pipeline.py new <title>            Scaffold a new video project
    ./pipeline.py run <title>            Scaffold (if needed) + advance (resume-safe)
    ./pipeline.py continue <title>      Run the next incomplete pipeline step
    ./pipeline.py complete <title> [--step N] [--force]  Validate creative artifacts + auto-run automated steps
    ./pipeline.py status [title] [--scenes]  Show pipeline state
    ./pipeline.py validate <title> [--step N]  Standalone schema validation
    ./pipeline.py voice-test <title> [--scene N]  Synth 1 line, measure chars/sec, project script total
    ./pipeline.py lint-script <title>    Lint scenes.json voiceover_text for AI-isms
    ./pipeline.py preview <title>        Smoke-render scene 1 (low-res)
    ./pipeline.py preview-frame <title> <scene> <frame>  Single still for visual QA
    ./pipeline.py captions <title>       Generate SRT + populate caption cues
    ./pipeline.py sfx <title> [--preview] [--force]  Generate SFX/BGM tracks
    ./pipeline.py audit <title>          Audit for violations (always after --force)
    ./pipeline.py doctor <title>         System + project diagnostics
    ./pipeline.py clean <title>          Free disk space (safe-to-delete items)
    ./pipeline.py redo <title> <step>    Reset a completed automated step to pending (then continue)
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

# Console may be cp1252/latin-1 (e.g. Windows); never crash printing tool output
pl.init_console()

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


def run_cmd(cmd, cwd=None, check=True, logpath=None, quiet_progress=True):
    return pl.run_cmd(cmd, cwd=cwd, check=check, logpath=logpath,
                      quiet_progress=quiet_progress)

# Import step metadata from the shared lib (single source of truth)
STEP_KEYS = pl.STEP_KEYS
STEP_NAMES = pl.STEP_NAMES
CREATIVE_STEPS = pl.CREATIVE_STEPS
EXPECTED_ARTIFACTS = pl.EXPECTED_ARTIFACTS


def _safe_title(raw):
    """sanitize_title with clean exit-2 + trailer instead of traceback."""
    try:
        return sanitize_title(raw)
    except ValueError as e:
        print(f"ERROR: invalid title: {e}")
        pl.emit_trailer(0, "", "fix_and_continue", 2)
        sys.exit(2)


def _require_state(title):
    """load_state with clean exit-1 when pipeline_state.json is missing."""
    state = load_state(title)
    if state is None:
        print(f"ERROR: pipeline_state.json not found for '{title}' "
              f"(expected {state_path(title)}). Re-run `new` or restore state.")
        pl.emit_trailer(0, "", "fix_and_continue", 1)
        sys.exit(1)
    return state


def _atomic_write_text(path: Path, text: str):
    """Atomic text write via unique tmp + os.replace (crash-safe scaffold)."""
    import tempfile as _tf
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = _tf.mkstemp(dir=str(path.parent),
                               prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        pl.atomic_replace(Path(tmp_name), path)
    except BaseException:
        try:
            Path(tmp_name).unlink(missing_ok=True)
        except OSError:
            pass
        raise

# ---------------------------------------------------------------------------
# NEW subcommand
# ---------------------------------------------------------------------------

def cmd_new(args):
    title = _safe_title(args.title)
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
    _atomic_write_text(rdir / "package.json", json.dumps(pkg, indent=2))

    # Copy foundation src/ as the per-video Remotion project source.
    # This copies Root.tsx, MainVideo.tsx, Thumbnail.tsx, SceneMap.generated.ts,
    # lib/config.ts (with placeholder values), lib/styles.ts, shared components
    # (Background, TextReveal, StatReveal, Captions), and index.css.
    def _ignore_for_scaffold(src_dir, names):
        # Skip index.ts (remotion-foundation package entry — not needed per-video)
        return {"index.ts"} if Path(src_dir).name == "src" else set()
    shutil.copytree(FOUNDATION_DIR / "src", rdir / "src", dirs_exist_ok=True,
                    ignore=_ignore_for_scaffold)

    # Substitute dynamic values in config.ts. Foundation ships valid-TS
    # defaults (30/1920/1080) with {{}} markers in comments; replace markers
    # first (legacy template) then the numeric defaults (current template).
    config_path = rdir / "src" / "lib" / "config.ts"
    config_text = config_path.read_text(encoding="utf-8")
    config_text = config_text.replace("{{FPS}}", str(fps))
    config_text = config_text.replace("{{WIDTH}}", str(width))
    config_text = config_text.replace("{{HEIGHT}}", str(height))
    config_text = re.sub(r"export const FPS = \d+;", f"export const FPS = {int(fps)};",
                         config_text)
    config_text = re.sub(r"export const WIDTH = \d+;", f"export const WIDTH = {int(width)};",
                         config_text)
    config_text = re.sub(r"export const HEIGHT = \d+;", f"export const HEIGHT = {int(height)};",
                         config_text)
    _atomic_write_text(config_path, config_text)

    # Write a placeholder Scene01.tsx + 1-entry SceneMap.generated.ts so a freshly
    # scaffolded project renders scene 1 (title card) instead of the blank
    # Fallback. Step 9 regenerates SceneMap.generated.ts from the real scene list
    # and agents replace Scene01.tsx in Step 8 (Remotion coding).
    scenes_dir = rdir / "src" / "scenes"
    _atomic_write_text(
        scenes_dir / "Scene01.tsx",
        "import React from \"react\";\n"
        "import { AbsoluteFill } from \"remotion\";\n"
        "import type { SceneTiming } from \"remotion-foundation\";\n"
        "\n"
        "// Placeholder scene — replace with your animation in Step 8 (Remotion coding).\n"
        "// Renders the scene title centered so a freshly scaffolded project is not blank.\n"
        "export const Scene01: React.FC<{ scene: SceneTiming }> = ({ scene }) => {\n"
        "  return (\n"
        "    <AbsoluteFill style={{\n"
        "      display: \"flex\",\n"
        "      alignItems: \"center\",\n"
        "      justifyContent: \"center\",\n"
        "      background: \"#0F1B2D\",\n"
        "      color: \"#FFFFFF\",\n"
        "      fontFamily: \"Inter, sans-serif\",\n"
        "    }}>\n"
        "      <h1 style={{ fontSize: 72, fontWeight: 700, textAlign: \"center\", margin: 40 }}>\n"
        "        {scene.title ?? \"Scene 1\"}\n"
        "      </h1>\n"
        "    </AbsoluteFill>\n"
        "  );\n"
        "};\n",
    )
    _atomic_write_text(
        scenes_dir / "SceneMap.generated.ts",
        "// AUTO-GENERATED by pipeline.py scaffold — do not edit. Overwritten in Step 9.\n"
        "import React from 'react';\n"
        "import type { SceneTiming } from 'remotion-foundation';\n"
        "import { Scene01 } from \"./Scene01\";\n"
        "\n"
        "export const SCENE_MAP: Record<number, React.FC<{ scene: SceneTiming }>> = {\n"
        "  1: Scene01,\n"
        "};\n",
    )
    print(f"  Wrote placeholder src/scenes/Scene01.tsx + SceneMap.generated.ts (1 entry)")

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
    _atomic_write_text(vdir / "pipeline_state.json", json.dumps(state, indent=2))

    # Create empty scenes.json stub
    scenes_stub = {
        "video_title": title,
        "fps": fps,
        "width": width,
        "height": height,
        "created_at": now_iso(),
        "style": None,
        "scenes": [],
        "total_estimated_seconds": 0,
        "total_actual_seconds": 0,
    }
    _atomic_write_text(vdir / "scenes.json", json.dumps(scenes_stub, indent=2))

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
    title = _safe_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = _require_state(title)

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

    # Automated → tell them to use continue (checked before already-complete
    # so `complete --step 5` is consistently use_continue, not noop).
    if step_key not in CREATIVE_STEPS:
        if step_state.get("status") != "complete":
            print(f"ERROR: Step {step_num} ({step_name}) is automated — use `pipeline.py continue`, not `complete`.")
            next_cmd = f"python3 pipeline.py continue {title}"
            pl.emit_trailer(step_num, step_key, "use_continue", 2,
                            next_cmd=next_cmd)
            sys.exit(2)
        # Completed automated step via complete: consistent use_continue.
        print(f"Step {step_num} ({step_name}) is automated and already complete — use `continue`.")
        pl.emit_trailer(step_num, step_key, "use_continue", 2,
                        next_cmd=f"python3 pipeline.py continue {title}")
        return

    # Already-complete → clean exit 0 with noop trailer pointing at NEXT pending step.
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

    # Also validate the pipeline state against schemas as a precondition.
    # Step 3 (script writing) passes --strict so Phase-1 content findings —
    # including AI-ism warnings from check_phase1_aiisms — hard-block Phase-2
    # voiceover generation. Prevents TTS from baking AI-sounding narration
    # into audio that can't be unwound without re-rendering.
    strict = (step_num == 3)
    ok, errs = validate_project(title, step=step_num, strict=strict)
    if not ok:
        print("VALIDATION FAILED — refusing to mark complete:")
        print(errs)
        pl.emit_trailer(step_num, step_key, "fix_and_continue", 1)
        sys.exit(1)

    # Mark complete — never move current_step backwards when filling a gap.
    state["steps"][step_key] = {
        "status": "complete",
        "completed_at": now_iso(),
        "last_error": None,
        "error": None,
        "attempts": step_state.get("attempts", 0),
        "step_kind": "creative",
        "artifacts": artifacts,
    }
    state["current_step"] = max(state.get("current_step", 1),
                                min(step_num + 1, len(STEP_KEYS)))
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
# REDO subcommand — reset a completed automated step to pending
# ---------------------------------------------------------------------------

# Redoing an automated step invalidates the steps that derive from its
# artifacts, so they reset together (e.g. redoing voiceover generation
# also re-measures durations). Creative steps are never reset here —
# creative work is redone by editing artifacts + `complete`.
REDO_DEPENDENTS = {
    "5_voiceover_generation": ["6_duration_measurement"],
    "6_duration_measurement": [],
    "9_scene_rendering": ["10_stitching"],
    "10_stitching": [],
    "13_thumbnail_rendering": [],
}


def cmd_redo(args):
    """Reset a completed automated step (and its dependents) to pending.

    The supported loop for "I edited VOICEOVER.md after Step 5" is now:
        python3 pipeline.py redo <title> 5
        python3 pipeline.py continue <title>   # re-runs Step 5 (idempotent skip
                                               # for unchanged scenes), then 6
    Guards:
      - `--step N` must be in 1..13 (bounds check)
      - creative steps refused (redo them via edit + `complete`)
      - resetting an already-pending step is a noop (exit 0)
    """
    title = _safe_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = _require_state(title)

    step_num = int(args.step)
    if not (1 <= step_num <= len(STEP_KEYS)):
        print(f"ERROR: step must be 1..{len(STEP_KEYS)}, got {step_num}")
        pl.emit_trailer(0, "", "fix_and_continue", 2)
        sys.exit(2)
    step_key = STEP_KEYS[step_num - 1]
    step_name = STEP_NAMES.get(step_key, step_key)

    if step_key in CREATIVE_STEPS:
        print(f"ERROR: Step {step_num} ({step_name}) is creative — redo it by "
              f"editing its artifacts, then run: python3 pipeline.py complete {title}")
        pl.emit_trailer(step_num, step_key, "fix_and_continue", 2,
                        next_cmd=f"python3 pipeline.py complete {title}",
                        expected_artifacts=EXPECTED_ARTIFACTS.get(step_key, []))
        sys.exit(2)

    reset_keys = [step_key] + REDO_DEPENDENTS.get(step_key, [])
    already = [k for k in reset_keys
               if state["steps"].get(k, {}).get("status") != "complete"]
    if len(already) == len(reset_keys):
        print(f"Step {step_num} ({step_name}) is not complete — nothing to reset.")
        pl.emit_trailer(step_num, step_key, "noop", 0,
                        next_cmd=f"python3 pipeline.py continue {title}")
        return

    stamp = now_iso()
    for key in reset_keys:
        prior = state["steps"].get(key, {})
        if prior.get("status") != "complete":
            continue
        state["steps"][key] = {
            "status": "pending",
            "attempts": prior.get("attempts", 0),
            "last_error": f"reset by `redo` at {stamp} (was complete)",
        }
        n = STEP_KEYS.index(key) + 1
        print(f"  Reset Step {n} ({STEP_NAMES.get(key, key)}) to pending.")
    # find_next_step scans from step 1, so current_step needs no change;
    # keep it monotonic anyway.
    save_state(title, state)

    print(f"\nStep {step_num} ({step_name}) reset. Re-run with:")
    next_cmd = f"python3 pipeline.py continue {title}"
    print(f"  {next_cmd}")
    pl.emit_trailer(step_num, step_key, "run_continue", 0, next_cmd=next_cmd)


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
        post_ok, post_errs = validate_project(title, step=STEP_KEYS.index(step_key) + 1)
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
            state["current_step"] = max(state.get("current_step", 1),
                                        min(step_num + 1, len(STEP_KEYS)))
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
    """Find the first pending/failed/in-progress/unknown step.

    Scans from step 1 (not current_step) so gaps left by --force or hand
    edits are revisited instead of silently skipped. Unknown/corrupt status
    strings are treated as pending so they surface instead of false-done.
    """
    steps = (state.get("steps") or {}) if isinstance(state, dict) else {}
    for i, key in enumerate(STEP_KEYS, start=1):
        status = steps.get(key, {}).get("status", "pending")
        if status in ("pending", "failed", "in_progress") or \
                status not in ("complete", "pending", "failed", "in_progress"):
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

    # Verify output — require real non-empty MP3s, not just existing paths.
    scenes = load_scenes(title)
    if not scenes:
        print("  WARNING: no scenes in scenes.json — nothing to verify")
        return False
    missing = []
    for s in scenes:
        rel = (s.get("voiceover_file") or "").strip()
        if not rel:
            missing.append(s.get("id", "?"))
            continue
        vf = vdir / rel
        if not vf.is_file() or vf.stat().st_size == 0:
            missing.append(s.get("id", "?"))
    if missing:
        print(f"  WARNING: Voiceover file missing for scenes: {missing}")
        return False
    return True


def run_step_6(title, vdir):
    """Duration measurement + transcript build."""
    print("--- Running Step 6: Duration Measurement + Transcript ---")
    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("6_duration_measurement", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    log_file = pl.log_path(title, 6)
    run_cmd(cmd, cwd=REPO_ROOT, logpath=log_file)

    scenes = load_scenes(title)
    for s in scenes:
        if not isinstance(s, dict) or s.get("actual_duration_frames") is None:
            print(f"  ERROR: Scene {s.get('id', '?') if isinstance(s, dict) else '?'} "
                  f"missing actual_duration_frames")
            return False

    # Transcript tail: merge word timings into voiceover_timings.json + TRANSCRIPT.md.
    # Always auto-runs (no opt-out) — the agent needs it for A/V sync at Step 8.
    print("--- Running Step 6 (tail): Transcript Build ---")
    tcmd = [sys.executable, str(REPO_ROOT / "scripts" / "generate_transcript.py"), str(vdir)]
    run_cmd(tcmd, cwd=REPO_ROOT, logpath=log_file)

    for fname in ("voiceover_timings.json", "TRANSCRIPT.md"):
        fpath = vdir / fname
        if not fpath.is_file() or fpath.stat().st_size == 0:
            print(f"  ERROR: Step 6 transcript artifact missing or empty: {fname}")
            return False
    return True


def lint_gate(title, vdir):
    """Run Remotion lint + typecheck before rendering. Returns (ok, error)."""
    rdir = vdir / "remotion"
    if not (rdir / "package.json").exists():
        return False, "remotion/package.json not found"
    print("--- Pre-render lint/typecheck gate ---")
    # NOTE: no standalone `npx tsc --noEmit` here — `npm run lint` already runs
    # `eslint src && tsc --noEmit` (scaffold package.json), so a second tsc
    # would only re-spend a full typecheck for identical output.
    r1 = run_cmd("npm run lint", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    if r1.returncode != 0:
        return False, "npm run lint failed"
    # Confirm compositions are registered. Pass real scene --props when
    # available: `remotion compositions` evaluates calculateMetadata, and
    # older per-video Root.tsx copies throw on defaultProps.scenes=[].
    # With real props the check reflects the actual video, not the defaults.
    comp_argv = ["npx", "remotion", "compositions", "src/Root.tsx"]
    _props_tmp = None
    try:
        import tempfile as _tf
        import render_scene as _rs
        _scenes = load_scenes(title)
        _valid = [s for s in _scenes
                  if isinstance(s, dict) and isinstance(s.get("id"), int)
                  and isinstance(s.get("actual_duration_frames"), int)]
        if _valid:
            _fd, _props_tmp = _tf.mkstemp(suffix=".json", prefix="remotion-comp-props-")
            os.close(_fd)
            try:
                _rs.build_props_json(scenes_json_path(title), _valid[0]["id"],
                                     Path(_props_tmp), burn_captions=False)
                comp_argv.append(f"--props={_props_tmp}")
            except (SystemExit, AttributeError, TypeError, OSError):
                _props_tmp = None
    except (ImportError, AttributeError, TypeError, OSError):
        _props_tmp = None
    try:
        r3 = run_cmd(comp_argv, cwd=rdir, check=False,
                     logpath=pl.log_path(title, 9, scene_id=0))
    finally:
        if _props_tmp:
            Path(_props_tmp).unlink(missing_ok=True)
    raw = getattr(r3, "stdout", "")
    if isinstance(raw, bytes):
        compositions_out = raw.decode("utf-8", errors="replace")
    else:
        compositions_out = raw or ""
    if r3.returncode != 0 or "MainVideo" not in compositions_out:
        return False, "MainVideo composition not found via `remotion compositions`"
    if "Thumbnail" not in compositions_out:
        return False, "Thumbnail composition not found via `remotion compositions`"
    return True, "lint/typecheck/compositions OK"


def regen_scene_map(vdir, title, only_existing=False):
    """(Re)generate SceneMap.generated.ts from scenes.json.

    MainVideo.tsx imports SCENE_MAP from this file; callers never edit the
    agent-owned MainVideo.tsx, only this generated map. Returns (ok, message).
    With only_existing=True, scene ids without a SceneXX.tsx on disk are
    skipped (with a warning) so partial Step-8 trees still render the scenes
    that exist — used by preview/preview-frame for pre-Step-9 QA.
    """
    rdir = vdir / "remotion"
    scenes = [s for s in load_scenes(title)
              if isinstance(s, dict) and isinstance(s.get("id"), int)]
    if not scenes:
        return False, ("no scenes in scenes.json — run Step 3 (script) "
                        "+ Step 8 (Remotion code) first.")
    scene_ids = sorted(set(s["id"] for s in scenes))
    if only_existing:
        missing = [sid for sid in scene_ids
                   if not (rdir / "src" / "scenes" / f"Scene{sid:02d}.tsx").exists()]
        if missing:
            print(f"  NOTE: no SceneXX.tsx yet for scenes {missing} — "
                  f"they will show the fallback until written.")
            scene_ids = [sid for sid in scene_ids
                         if (rdir / "src" / "scenes" / f"Scene{sid:02d}.tsx").exists()]
        if not scene_ids:
            return False, "no SceneXX.tsx files yet — write at least one scene first."
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
    _atomic_write_text(sm_path, scenemap_content)
    return True, (f"Regenerated SceneMap.generated.ts with {len(scene_ids)} "
                  f"static scene import(s)")


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
    ok, msg = regen_scene_map(vdir, title)
    if not ok:
        print(f"  ERROR: {msg}")
        return False
    print(f"  {msg}")
    scenes = [s for s in load_scenes(title)
              if isinstance(s, dict) and isinstance(s.get("id"), int)]

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

    # Source-hash invalidation: a scene with render_status=="rendered" is only
    # skipped when its Remotion inputs are unchanged. Legacy scenes rendered
    # before hashes existed are backfilled (NOT force-re-rendered) so future
    # edits start invalidating from now on.
    render_shared, render_hashes = pl.split_render_hashes(vdir)
    backfills = []
    for s in scenes:
        if not isinstance(s, dict) or not isinstance(s.get("id"), int):
            continue
        sid = s["id"]
        if s.get("render_status") != "rendered":
            continue
        current = render_hashes.get(sid)
        stored = s.get("render_hash")
        if stored and current and stored == current:
            print(f"  Scene {sid}: already rendered (source unchanged), skipping")
        elif not stored:
            print(f"  Scene {sid}: already rendered (no stored hash — recording), skipping")
            if current:
                backfills.append((sid, current))
        else:
            reason = pl.describe_render_staleness(
                vdir, sid, stored, s.get("render_shared"))
            print(f"  Scene {sid}: source changed since last render ({reason}) — re-rendering")
            s["render_status"] = "pending"
    if backfills:
        full_path = vdir / "scenes.json"
        with open(full_path, "r", encoding="utf-8") as f:
            full = json.load(f)
        for sid, h in backfills:
            for s in full.get("scenes", []):
                if s["id"] == sid:
                    s["render_hash"] = h
                    s["render_shared"] = render_shared
        pl.save_scenes_full(vdir, full)

    failed_scenes = []
    for s in scenes:
        if not isinstance(s, dict) or not isinstance(s.get("id"), int):
            continue
        sid = s["id"]
        if s.get("render_status") == "rendered":
            # Fresh per the source-hash pre-filter above (its message printed there).
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
    still_failed = [s.get("id", "?") for s in scenes
                    if not isinstance(s, dict) or s.get("render_status") != "rendered"]
    if still_failed:
        print(f"\n  Scenes not rendered: {still_failed}")
        print(f"  Re-run `./pipeline.py continue {title}` to retry failed scenes.")
        return False
    return True


def run_step_10(title, vdir):
    """Stitching — single ffmpeg pass via assemble.py."""
    print("--- Running Step 10: Stitching (assemble.py) ---")

    # Optional on-demand SFX audition. Triggered by the agent setting
    # `sfx_preview_requested: true` in pipeline_state.json before `complete` at Step 8
    # (or directly before a re-stitch). Non-fatal — failures must not block the stitch.
    state = load_state(title) or {}
    if state.get("sfx_preview_requested"):
        print("\n  --- Running optional SFX preview export ---")
        preview_script = REPO_ROOT / "scripts" / "export_sfx_preview.py"
        if preview_script.exists():
            run_cmd([sys.executable, str(preview_script), str(vdir)],
                    cwd=REPO_ROOT, check=False)
        else:
            print("  export_sfx_preview.py not found — skipping preview.")
        state.pop("sfx_preview_requested", None)
        save_state(title, state)

    import time as _time
    started = _time.time()
    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("10_stitching", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    run_cmd(cmd, cwd=REPO_ROOT, logpath=pl.log_path(title, 10))

    final_dir = vdir / "versions"
    # Require a freshly-written MP4 (mtime >= run start) — stale artifacts
    # from a prior run must not pass a failed re-stitch.
    fresh = []
    if final_dir.exists():
        fresh = [p for p in final_dir.glob("*.mp4")
                 if p.is_file() and p.stat().st_size > 0
                 and p.stat().st_mtime >= started - 1]
    if not fresh:
        print("  ERROR: No fresh final MP4 in versions/ (stale artifacts do not count)")
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

    import time as _time
    started = _time.time()
    cfg = load_pipeline_config(video_dir=vdir)
    template = pl.get_step_command_template("13_thumbnail_rendering", cfg)
    cmd = pl.render_step_command(template, vdir, cfg=cfg)
    log_file = pl.log_path(title, 13)
    r = run_cmd(cmd, cwd=REPO_ROOT, check=False, logpath=log_file)
    if r.returncode != 0:
        print(f"  ERROR: render_thumbnail.py exited {r.returncode}")
        return False

    final_dir = vdir / "versions"
    fresh = []
    if final_dir.exists():
        fresh = [p for p in final_dir.glob("*thumbnail*.png")
                 if p.is_file() and p.stat().st_size > 0
                 and p.stat().st_mtime >= started - 1]
    if not fresh:
        print("  ERROR: No fresh thumbnail PNG in versions/ (stale artifacts do not count)")
        return False
    return True


def load_scenes(title):
    return pl.load_scenes(title)


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def validate_project(title, step=0, strict=False):
    """Run scripts/validate.py on this video's scenes/state. Returns (ok, errors).

    When ``step`` > 0, validate.py also runs ``check_step_requirements`` for that
    step number (scene/voiceover/duration/render-level gates). Pass the step that
    was just completed (post-check) or current_step - 1 (pre-gate).

    When ``strict`` is True, ``--strict`` is forwarded so Phase-1 content
    warnings (SCRIPT.md structure, pattern interrupts, CTA, duration drift, and
    AI-ism findings) are promoted to errors (exit 7). Used by ``complete``
    Step 3 to hard-block Phase-2 voiceover generation when AI-isms are present
    — prevents TTS from baking AI-sounding narration into audio.
    """
    argv = [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
            str(video_dir(title))]
    if step and step > 0:
        argv += ["--step", str(step)]
    if strict:
        argv += ["--strict"]
    p = subprocess.run(
        argv,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=REPO_ROOT,
    )
    return p.returncode == 0, (p.stdout + p.stderr).strip()


def _clean_after_step_13(vdir):
    """Remove remotion/node_modules after final step completes."""
    cfg = pl.load_config(video_dir=vdir)
    ren = cfg.get("retention", {})
    if ren.get("clean_remotion_node_modules_after_step_13", True):
        nm_dir = vdir / "remotion" / "node_modules"
        if nm_dir.exists():
            shutil.rmtree(nm_dir, ignore_errors=True)
            print(f"  Cleaned: remotion/node_modules/")


def _clean_after_assemble(vdir):
    """Optional: remove scene MP4s after a successful stitch."""
    cfg = pl.load_config(video_dir=vdir)
    ren = cfg.get("retention", {})
    if ren.get("clean_scene_mp4s_after_stitch", False):
        scenes_dir = vdir / "scenes"
        if scenes_dir.exists():
            for f in scenes_dir.glob("*.mp4"):
                f.unlink(missing_ok=True)
            print(f"  Cleaned: scenes/*.mp4 (clean_scene_mp4s_after_stitch=True)")


def _continue_gate_step(state):
    """Step number whose requirements `continue` validates before running.

    Gates against the requirements of the steps already completed — i.e. the
    step before the next pending one — not the step about to run (whose
    artifacts don't exist yet). Deliberately derived from ``find_next_step``
    rather than ``current_step``: ``redo`` resets step statuses without
    rewinding ``current_step``, so gating at ``current_step - 1`` would
    validate a still-pending step's not-yet-produced artifacts and deadlock
    the documented ``redo N`` + ``continue`` loop (e.g. Step 5 regenerates
    audio with new durations, then the gate demands Step 6's transcript match
    before Step 6 — the step that rebuilds it — is allowed to run).
    """
    next_num, _ = find_next_step(state)
    if next_num is None:
        return max(0, state.get("current_step", 0) - 1)
    return max(0, next_num - 1)


def cmd_continue(args):
    title = _safe_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = _require_state(title)

    # Schema validation gate: refuse to run automated steps on invalid state.
    # Gate against the prior step's requirements (the steps already completed),
    # not the step we're about to run (whose artifacts don't exist yet).
    gate_step = _continue_gate_step(state)
    ok, errs = validate_project(title, step=gate_step)
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

    if step_key in CREATIVE_STEPS:
        # Creative step — guard against wrong-command / stale-artifact confusion.
        arts = EXPECTED_ARTIFACTS.get(step_key, [])
        step_state = state["steps"].get(step_key, {}) or {}
        state_artifacts = step_state.get("artifacts", []) or []
        files_exist = all((vdir / a).exists() for a in arts) if arts else False

        if step_key in pl.UNVALIDATED_CREATIVE_STEPS:
            # Steps 1, 2: in-context decisions, no files
            _print_creative_brief(step_num, step_key, title)
        elif step_state.get("status") == "complete":
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
        if state is None:
            print("ERROR: pipeline_state.json missing after step run")
            sys.exit(1)
        state["steps"][step_key]["status"] = "complete"
        state["steps"][step_key]["completed_at"] = now_iso()
        state["steps"][step_key]["last_error"] = None
        state["current_step"] = max(state.get("current_step", 1),
                                    min(step_num + 1, len(STEP_KEYS)))
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
        elif next_key in CREATIVE_STEPS:
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
        title = _safe_title(args.title)
        show_status_for_title(title, show_scenes=getattr(args, "scenes", False))
    else:
        show_all_statuses()


def show_status_for_title(title, show_scenes=False):
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

    if show_scenes:
        scenes_path = vdir / "scenes.json"
        if not scenes_path.exists():
            print("\n  (no scenes.json — run Step 3 first)")
            return
        try:
            with open(scenes_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"\n  (scenes.json invalid: {e})")
            return
        scenes = data.get("scenes", [])
        if not scenes:
            print("\n  (scenes.json has no scenes)")
            return
        print()
        print(f"  {'ID':<4} {'Title':<32} {'Tgt(s)':<8} {'Frames':<8} {'Status':<10} {'OnDisk':<7} {'Sfx'}")
        print(f"  {'----':<4} {'--------------------------------':<32} {'------':<8} {'------':<8} {'----------':<10} {'------':<7} {'-----'}")
        for s in scenes:
            sid = s.get("id", "?")
            title = str(s.get("title", ""))[:32]
            tgt = s.get("target_duration_seconds")
            tgt_s = f"{tgt}" if tgt is not None else "-"
            frames = s.get("actual_duration_frames")
            frames_s = f"{frames}" if frames is not None else "-"
            rstatus = s.get("render_status", "pending")
            sf = s.get("scene_file")
            on_disk = "-"
            if sf:
                on_disk = "yes" if (vdir / sf).exists() else "NO"
            n_cues = len(s.get("sfx") or [])
            cues_s = f"{n_cues} cues" if n_cues else "-"
            print(f"  {sid:<4} {title:<32} {tgt_s:<8} {frames_s:<8} {rstatus:<10} {on_disk:<7} {cues_s}")


def show_all_statuses():
    videos_dir = REPO_ROOT / "videos"
    if not videos_dir.exists():
        print("No videos directory found.")
        return

    entries = []
    for d in sorted(videos_dir.iterdir()):
        if d.is_dir() and d.name != ".trash":
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
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    violations = []
    state = _require_state(title)

    # 1. Pipeline state summary
    print(f"=== Audit: {title} ===")
    print(f"  Current step: {state.get('current_step', '?')}")
    print()
    for i, key in enumerate(STEP_KEYS, start=1):
        step = state["steps"].get(key, {})
        status = step.get("status", "pending")
        icon = {"complete": "[OK]", "in_progress": "[>>]", "failed": "[!!]", "pending": "[--]"}.get(status, "[??]")
        print(f"  {i:<5} {STEP_NAMES[key]:<28} {icon} {status}")

    # 2. Log tail (last 50 lines per step log) — streamed, bounded, no OOM.
    from collections import deque as _deque
    log_dir = vdir / "logs"
    print(f"\n--- Log tails ---")
    if log_dir.exists():
        for lf in sorted(log_dir.glob("step-*.log")):
            try:
                tail = _deque(maxlen=50)
                count = 0
                with open(lf, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        tail.append(line.rstrip("\n"))
                        count += 1
                        if count > 200000:
                            break
                print(f"\n  {lf.name} ({count} lines, last {len(tail)}):")
                for line in tail:
                    print(f"    {line}")
            except OSError as e:
                print(f"\n  {lf.name} (unreadable: {e})")
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
                    encoding="utf-8", errors="replace",
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

    # 4. Cross-reference log errors against step status. Only the LAST run
    # block of each log is scanned (text after the final "=== <script> run
    # <iso> ===" header): earlier blocks are history from killed/superseded
    # attempts, and flagging them against a now-complete step produced
    # false-positive LOG_ERROR violations that hid real problems.
    print(f"\n--- Consistency checks ---")
    if log_dir.exists():
        _err_re = re.compile(r"^\s*(ERROR|Error|error)[\s:]", re.MULTILINE)
        _exit_re = re.compile(r"exit code [1-9]", re.IGNORECASE)
        _ffmpeg_re = re.compile(r"\[(error|failed)\]", re.IGNORECASE)
        _run_header_re = re.compile(r"^=== \S+ run \S+", re.MULTILINE)
        for lf in sorted(log_dir.glob("step-*.log")):
            try:
                with open(lf, "r", encoding="utf-8", errors="replace") as f:
                    text = f.read(2 * 1024 * 1024)  # cap 2MB per log
            except OSError:
                continue
            # Extract step number from filename step-N.log
            m_step = re.match(r"step-(\d+)", lf.stem)
            step_num = int(m_step.group(1)) if m_step else None
            if step_num is not None and step_num <= len(STEP_KEYS):
                key = STEP_KEYS[step_num - 1]
                status = state["steps"].get(key, {}).get("status", "")
                # Last-run-block scope: ignore superseded history.
                headers = list(_run_header_re.finditer(text))
                last_block = text[headers[-1].start():] if headers else text
                has_error = bool(_err_re.search(last_block) or _exit_re.search(last_block)
                                 or _ffmpeg_re.search(last_block))
                if status == "complete" and has_error:
                    violations.append(f"LOG_ERROR: {lf.name} marked complete but its last run contains errors")
                elif status == "complete":
                    pass  # all good
        if not any("LOG_ERROR" in v for v in violations):
            print("  No log/state mismatches detected.")
    else:
        print("  (no logs directory)")

    # 5. Missing scene MP4s
    scenes = load_scenes(title)
    scenes_dir = vdir / "scenes"
    ren = pl.load_config(video_dir=vdir).get("retention", {})
    cleaned_by_retention = ren.get("clean_scene_mp4s_after_stitch", False)
    if scenes:
        missing = [s["id"] for s in scenes if not (scenes_dir / f"scene-{s['id']:02d}.mp4").exists()]
        if missing and cleaned_by_retention:
            print(f"  Scene MP4s for {missing} absent — expected "
                  f"(clean_scene_mp4s_after_stitch=true); re-stitch requires re-render.")
        elif missing:
            violations.append(f"MISSING_SCENES: scenes {missing} missing MP4 in {scenes_dir}/")
        else:
            print("  All scene MP4s present.")
    else:
        print("  (no scenes data)")

    # 6. SFX/BGM track presence (warning-level — doesn't fail the audit)
    has_cues = any(s.get("sfx") for s in scenes) if scenes else False
    has_bgm = any(s.get("bgm") is not None for s in scenes) if scenes else False
    if has_cues or has_bgm:
        missing_tracks = []
        if has_cues and not (vdir / "sfx_aligned.mp3").exists():
            missing_tracks.append("sfx_aligned.mp3")
        if has_bgm and not (vdir / "bgm_aligned.mp3").exists():
            missing_tracks.append("bgm_aligned.mp3")
        if missing_tracks:
            print(f"  WARNING: sfx tracks missing ({', '.join(missing_tracks)} in scenes.json "
                  f"but no track files — re-run Step 10 or 'pipeline.py sfx {title}')")
        else:
            print("  SFX/BGM tracks present.")

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
    title = _safe_title(args.title)
    vdir = video_dir(title)
    rdir = vdir / "remotion"
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    all_ok = True

    # 1. System check (cross-platform Python checker; .sh remains as a shim)
    print("=== 1. System check ===")
    sys_check = REPO_ROOT / "scripts" / "check_system.py"
    if not sys_check.exists():
        sys_check = REPO_ROOT / "scripts" / "check_system.sh"
    try:
        if sys_check.suffix == ".sh":
            import shutil as _sh
            shell = _sh.which("bash") or _sh.which("sh") or "bash"
            argv = [shell, str(sys_check)]
        else:
            argv = [sys.executable, str(sys_check)]
        r = subprocess.run(
            argv, capture_output=True, text=True,
            timeout=30, encoding="utf-8", errors="replace",
        )
        print(r.stdout)
        if r.stderr:
            print(r.stderr)
        if r.returncode != 0:
            all_ok = False
            print("  FAIL: system check failed — see above.")
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"  SKIP: system check could not run ({e})")

    # 2. Remotion version drift
    print("\n=== 2. Remotion version check ===")
    if (rdir / "package.json").exists():
        try:
            r = subprocess.run(
                "npx remotion versions",
                capture_output=True, text=True, timeout=60, cwd=rdir, shell=True,
                encoding="utf-8", errors="replace",
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            print(f"  SKIP: remotion versions could not run ({e})")
            r = None
        if r is not None and r.returncode == 0 and r.stdout:
            print(r.stdout)
            # Only hard ERRORs fail diagnostics — benign peer-dep warnings
            # ("warning" substring) must not flip all_ok.
            if "ERROR" in r.stdout or "error" in (r.stderr or "").lower():
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
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=REPO_ROOT,
    )
    print(p.stdout.strip() if p.stdout else "")
    if p.returncode != 0:
        all_ok = False
        print("  RECOMMENDED: fix schema violations shown above.")

    # 4. Functional output checks — probe the real artifacts instead of
    # string-matching implementation source (which breaks on every refactor).
    print("\n=== 4. Output artifact checks ===")
    versions_dir = vdir / "versions"
    mp4s = sorted(versions_dir.glob("*.mp4")) if versions_dir.exists() else []
    if mp4s:
        latest = max(mp4s, key=lambda p: p.stat().st_mtime)
        streams = pl.ffprobe_streams(latest) or []
        has_v = any(s.get("codec_type") == "video" for s in streams)
        has_a = any(s.get("codec_type") == "audio" for s in streams)
        if has_v and has_a:
            print(f"  [OK] {latest.name}: video+audio streams present")
        else:
            all_ok = False
            print(f"  [FAIL] {latest.name}: missing streams (video={has_v}, audio={has_a})")
            print("  RECOMMENDED: re-run Step 10; verify assemble.py mux inputs.")
    else:
        print("  SKIP: no version MP4s yet (Step 10 not run)")

    thumbs = sorted(versions_dir.glob("*thumbnail*.png")) if versions_dir.exists() else []
    if thumbs:
        t = max(thumbs, key=lambda p: p.stat().st_mtime)
        streams = pl.ffprobe_streams(t) or []
        w = next((s.get("width") for s in streams
                  if s.get("codec_type") == "video" and s.get("width")), None)
        if w:
            print(f"  [OK] {t.name}: decodes as image ({w}px wide)")
        else:
            all_ok = False
            print(f"  [FAIL] {t.name}: not a decodable image")
    else:
        print("  SKIP: no thumbnail PNG yet (Step 13 not run)")

    tmps = list(versions_dir.glob("*.tmp")) if versions_dir.exists() else []
    if tmps:
        all_ok = False
        print(f"  [FAIL] leftover temp files: {[p.name for p in tmps]} — an atomic write was interrupted")
        print("  RECOMMENDED: delete the *.tmp files and re-run Step 10/13.")
    else:
        print("  No leftover .tmp files.")

    # Summary
    print(f"\n=== Doctor summary ===")
    if all_ok:
        print("  All checks passed.")
        sys.exit(0)
    else:
        print("  One or more checks failed. See recommendations above.")
        sys.exit(1)


def cmd_validate(args):
    title = _safe_title(args.title)
    if not video_dir(title).exists():
        print(f"ERROR: Video directory not found: {video_dir(title)}")
        sys.exit(2)
    argv = [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
            str(video_dir(title))]
    step = getattr(args, "step", 0) or 0
    if step:
        argv += ["--step", str(step)]
    if getattr(args, "strict", False):
        argv += ["--strict"]
    p = subprocess.run(argv, cwd=REPO_ROOT)
    sys.exit(p.returncode)


def cmd_lint_script(args):
    """Lint scenes.json voiceover_text for AI-isms / banned phrases.

    Runs scripts/validate.py with --step 3 --strict so every AI-ism finding
    is an error (exit 7). Designed for the iterative write -> lint -> fix
    loop during Phase 1, before `complete <title>` advances the pipeline.
    """
    title = _safe_title(args.title)
    if not video_dir(title).exists():
        print(f"ERROR: Video directory not found: {video_dir(title)}")
        sys.exit(2)
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
         str(video_dir(title)), "--step", "3", "--strict"],
        cwd=REPO_ROOT,
    )
    sys.exit(p.returncode)


def cmd_voice_test(args):
    """Synthesize one sample line with the configured voice, measure the
    real chars/sec rate, and project the full script's audio total from
    the MEASURED rate (validates cross-lingual voices before committing
    to a full Step 5 run). Temp audio is deleted afterwards."""
    import tempfile as _tf
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    scenes = [s for s in (load_scenes(title) or [])
              if isinstance(s, dict) and isinstance(s.get("id"), int)]
    if not scenes:
        print(f"ERROR: no scenes in {scenes_json_path(title)} — write the script first")
        sys.exit(2)

    sample = (args.text or "").strip()
    if sample:
        label = "custom --text"
    else:
        sid = args.scene or 1
        match = next((s for s in scenes if s.get("id") == sid), None)
        if match is None or not (match.get("voiceover_text") or "").strip():
            print(f"ERROR: scene {sid} has no voiceover_text to sample")
            sys.exit(2)
        sample = match["voiceover_text"].strip()
        label = f"scene {sid}"

    cfg = load_pipeline_config(video_dir=vdir)
    if not isinstance(cfg, dict):
        cfg = {}
    vo = cfg.get("voiceover") or {}
    if not isinstance(vo, dict):
        vo = {}
    engine = (args.engine or vo.get("engine", "edge") or "edge").strip().lower()
    language = vo.get("language", "english")
    rate_override = vo.get("chars_per_sec")
    rate = vo.get("rate", "+0%")
    volume = vo.get("volume", "+0%")
    pitch = vo.get("pitch", "+0Hz")

    fd, tmp = _tf.mkstemp(suffix=".mp3", prefix="voice-test-")
    os.close(fd)
    tmp_wav = tmp + ".wav"
    try:
        if engine == "edge":
            voice = args.voice or vo.get("voice", "en-GB-RyanNeural")
            import generate_voiceover as _gv
            import asyncio as _aio
            words = _aio.run(_gv.generate_audio_with_words(
                sample, tmp, voice, rate, volume, pitch))
        elif engine == "pocket":
            voice = args.voice or vo.get("voice", "alba")
            try:
                from pocket_tts import TTSModel
            except ImportError:
                print("ERROR: pocket-tts not installed. "
                      "Run: pip install -r scripts/requirements-pocket.txt",
                      file=sys.stderr)
                sys.exit(2)
            import generate_voiceover_pocket as _pv
            quantize = not vo.get("no_quantize", False)
            print(f"Loading pocket-tts model (language={language}) for one sample...")
            model = TTSModel.load_model(language=language, quantize=quantize)
            voice_state = model.get_state_for_audio_prompt(voice)
            _pv.stream_to_wav(model, voice_state, sample, tmp_wav)
            _pv.encode_mp3(tmp_wav, tmp)
            words = []
        else:
            print(f"ERROR: unknown voiceover engine {engine!r} (want edge|pocket)")
            sys.exit(2)

        duration = pl.get_audio_duration(tmp)
        if duration <= 0:
            print("ERROR: ffprobe could not measure the sample audio", file=sys.stderr)
            sys.exit(1)
        chars = len(sample)
        measured = chars / duration
        expected = pl.estimate_audio_seconds_for_chars(chars, language, rate_override)
        table_rate = pl._resolve_speech_rate(language, rate_override)
        total_chars = sum(len((s.get("voiceover_text") or "").strip()) for s in scenes)
        # Silent scenes contribute no chars but DO contribute seconds (their
        # authored targets) — without this the projection undershoots and the
        # drift flag below fires spuriously on videos that use silence.
        silent_extra = sum((s.get("target_duration_seconds") or 0) for s in scenes
                           if s.get("silent"))
        projected = (total_chars / measured if measured > 0 else 0.0) + silent_extra
        sum_targets = sum(s.get("target_duration_seconds") or 0 for s in scenes)

        def _mmss(sec):
            sec = max(0, int(round(sec)))
            return f"{sec // 60}:{sec % 60:02d}"

        print(f"=== voice-test: {title} ({label}, engine={engine}, voice={voice}) ===")
        print(f"  Sample: {chars} chars -> {duration:.2f}s audio "
              f"({measured:.1f} chars/s, {len(words)} word timings)")
        print(f"  Table estimate for sample: ~{expected:.1f}s "
              f"({language} @~{table_rate:.1f} chars/s) — "
              f"measured/table ratio {duration / expected:.2f}" if expected > 0 else
              "  Table estimate for sample: n/a")
        print(f"  Full script: {total_chars} chars across {len(scenes)} scenes"
              + (f" (+{silent_extra:.0f}s planned silence)" if silent_extra else ""))
        print(f"  Projected audio total @measured rate: ~{projected:.0f}s ({_mmss(projected)})")
        if sum_targets > 0:
            drift = abs(projected - sum_targets) / sum_targets
            flag = "  <-- OVER 10%: retarget before Step 5" if drift > 0.10 else ""
            print(f"  Sum of target_duration_seconds: {sum_targets:.0f}s "
                  f"(drift {drift * 100:.0f}%){flag}")
    finally:
        for p in (tmp, tmp_wav):
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# CLEAN subcommand — manual disk recovery for a single video
# ---------------------------------------------------------------------------

def cmd_clean(args):
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    cfg = load_pipeline_config(video_dir=vdir)
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

    # 3. Prune old thumbnail PNG versions
    to_prune = pl.find_versions_to_prune(
        vdir / "versions", safe_title, r'{title}-thumbnail-v(\d+)\.png', keep_v)
    for old in to_prune:
        sz = old.stat().st_size
        old.unlink(missing_ok=True)
        freed += sz
        print(f"  Pruned: {old.name} ({sz/1024/1024:.1f} MB)")

    # 4. remotion/node_modules/
    nm_dir = vdir / "remotion" / "node_modules"
    if nm_dir.exists():
        sz = sum(f.stat().st_size for f in nm_dir.rglob("*") if f.is_file())
        shutil.rmtree(nm_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: remotion/node_modules/ ({sz/1024/1024:.1f} MB)")

    # 5. .preview/
    preview_dir = vdir / ".preview"
    if preview_dir.exists():
        sz = sum(f.stat().st_size for f in preview_dir.rglob("*") if f.is_file())
        shutil.rmtree(preview_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: .preview/ ({sz/1024/1024:.1f} MB)")

    # 6. Scene MP4s (only if configured, default off)
    if ren.get("clean_scene_mp4s_after_stitch", False):
        scenes_dir = vdir / "scenes"
        if scenes_dir.exists():
            for f in scenes_dir.glob("*.mp4"):
                sz = f.stat().st_size
                f.unlink(missing_ok=True)
                freed += sz
                print(f"  Removed: scenes/{f.name} ({sz/1024/1024:.1f} MB)")

    # 7. Reap Remotion TMPDIR (per-video — title substitution). Guarded:
    # only paths inside the OS temp dir or videos/<title> are reaped, so a
    # malicious per-video system.temp_dir cannot point clean at $HOME etc.
    import tempfile as _tf
    tmpdir = cfg.get("system", {}).get("temp_dir", "/tmp/remotion/{title}")
    tdir = Path(str(tmpdir).replace("{title}", title))
    try:
        allowed = (Path(_tf.gettempdir()).resolve(), vdir.resolve(),
                   (REPO_ROOT / "videos").resolve())
        resolved = tdir.resolve()
        ok = any(resolved == a or a in resolved.parents for a in allowed)
    except OSError:
        ok = False
    if not ok:
        print(f"  SKIP: refusing to reap TMPDIR outside safe roots: {tdir}")
    elif tdir.exists():
        sz = sum(f.stat().st_size for f in tdir.rglob("*") if f.is_file())
        shutil.rmtree(tdir, ignore_errors=True)
        freed += sz
        print(f"  Reaped: Remotion TMPDIR ({sz/1024/1024:.1f} MB)")

    # 8. Rotate logs
    log_dir = vdir / "logs"
    if log_dir.exists():
        for lf in sorted(log_dir.glob("*.log")):
            pl.rotate_log_if_needed(
                lf,
                max_size_mb=ren.get("max_log_size_mb", 0),
                keep_last_n=ren.get("keep_last_n_log_runs", 10),
            )
        print(f"  Rotated logs in: {log_dir}")

    # 9. Prune this title's --force backups (videos/.trash/<title>-*).
    trash = REPO_ROOT / "videos" / ".trash"
    if trash.is_dir():
        for old in sorted(trash.glob(f"{title}-*")):
            try:
                sz = sum(f.stat().st_size for f in old.rglob("*") if f.is_file()) \
                    if old.is_dir() else old.stat().st_size
            except OSError:
                sz = 0
            shutil.rmtree(old, ignore_errors=True)
            freed += sz
            print(f"  Pruned backup: .trash/{old.name} ({sz/1024/1024:.1f} MB)")

    print(f"\nTotal freed: {freed/1024/1024:.1f} MB")


# ---------------------------------------------------------------------------
# PREVIEW subcommand — quick low-res render of scene 1 as a smoke test
# ---------------------------------------------------------------------------

def cmd_preview(args):
    title = _safe_title(args.title)
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
    try:
        node_max_old = int(r.get("node_max_old_space_size_mb", 384))
        timeout_ms = int(r.get("timeout_ms", 60000))
    except (TypeError, ValueError):
        print("ERROR: render.node_max_old_space_size_mb/timeout_ms must be integers")
        sys.exit(2)
    gl_backend = pl.resolve_gl_backend(cfg)
    if gl_backend not in ("angle", "swangle", "egl", "swiftshader"):
        print(f"ERROR: invalid render.gl_backend: {gl_backend!r}")
        sys.exit(2)

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
    if not isinstance(first, dict) or not first.get("actual_duration_frames"):
        print("ERROR: scene 1 missing actual_duration_frames (run step 6 first)")
        sys.exit(2)
    frame_end = min(20, first["actual_duration_frames"])

    # Refresh the scene map so the preview renders real scenes (the scaffold
    # map only has scene 1; pre-Step-9 QA needs whatever SceneXX exist).
    ok, msg = regen_scene_map(vdir, title, only_existing=True)
    if not ok:
        print(f"PREVIEW FAILED ({msg})")
        sys.exit(2)
    print(f"  {msg}")

    # Build scene props so the preview renders real content, not the fallback.
    import tempfile as _tempfile
    try:
        import render_scene as _render_scene
    except (ImportError, AttributeError, TypeError) as e:
        print(f"PREVIEW FAILED (props import: {e})")
        sys.exit(1)
    props_fd, props_path = _tempfile.mkstemp(suffix=".json", prefix="remotion-props-")
    os.close(props_fd)
    try:
        _render_scene.build_props_json(scenes_json_path(title), 1,
                                       Path(props_path), burn_captions=False)
    except SystemExit:
        Path(props_path).unlink(missing_ok=True)
        print("PREVIEW FAILED (props build)")
        sys.exit(1)
    except (AttributeError, TypeError) as e:
        Path(props_path).unlink(missing_ok=True)
        print(f"PREVIEW FAILED (props build: {e})")
        sys.exit(1)

    print(f"Previewing scene 1, frames 0-{frame_end - 1} -> {out_file}")
    cmd = ["npx", "remotion", "render", "src/Root.tsx", "MainVideo", str(out_file),
           f"--props={props_path}", f"--frames=0-{frame_end - 1}",
           "--concurrency", "1", f"--gl={gl_backend}",
           "--image-format", "jpeg", "--jpeg-quality", "60",
           "--codec", "h264", "--x264-preset", "ultrafast", "--crf", "35",
           "--muted",
           "--disallow-parallel-encoding",
           "--timeout", str(timeout_ms),
           "--overwrite", "--log=warn"]
    try:
        r1 = run_cmd(cmd, cwd=rdir, check=False,
                     logpath=pl.log_path(title, 9, scene_id="preview"))
        if r1.returncode != 0 or not out_file.exists():
            print("PREVIEW FAILED")
            sys.exit(1)
    finally:
        Path(props_path).unlink(missing_ok=True)
    print(f"\nPreview rendered: {out_file}")
    print("  Copy/SCP out and play locally to verify visual correctness.")

    # Clean preview dir after successful render
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_preview_after_success", True):
        shutil.rmtree(out_dir, ignore_errors=True)
        print(f"  Cleaned: .preview/")


# ---------------------------------------------------------------------------
# PREVIEW-FRAME subcommand — render a single still at a specific scene+frame
# for visual QA without re-rendering a whole scene.
# ---------------------------------------------------------------------------

def cmd_preview_frame(args):
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    rdir = vdir / "remotion"
    if not (rdir / "package.json").exists():
        print(f"ERROR: {rdir}/package.json not found (run step 8 first)")
        sys.exit(2)

    scene_id = int(args.scene_id)
    frame = int(args.frame)

    scenes = load_scenes(title)
    if not scenes:
        print("ERROR: no scenes in scenes.json")
        sys.exit(2)
    matches = [s for s in scenes if s["id"] == scene_id]
    if not matches:
        print(f"ERROR: scene {scene_id} not found in scenes.json")
        sys.exit(2)
    if not matches[0].get("actual_duration_frames"):
        print(f"ERROR: scene {scene_id} missing actual_duration_frames (run step 6 first)")
        sys.exit(2)
    if not (rdir / "src" / "scenes" / f"Scene{scene_id:02d}.tsx").exists():
        print(f"ERROR: Scene{scene_id:02d}.tsx not found — write the scene first (Step 8)")
        sys.exit(2)

    # Refresh the scene map so any written scene is QA-able pre-Step-9
    # (the scaffold/Step-9 map would otherwise resolve it to the fallback).
    ok, msg = regen_scene_map(vdir, title, only_existing=True)
    if not ok:
        print(f"PREVIEW-FRAME FAILED ({msg})")
        sys.exit(2)
    print(f"  {msg}")

    # Build props (reuses render_scene.build_props_json). Returns (start, end).
    import tempfile as _tempfile
    try:
        import render_scene as _render_scene
    except (ImportError, AttributeError, TypeError) as e:
        print(f"PREVIEW-FRAME FAILED (props import: {e})")
        sys.exit(1)
    props_fd, props_path = _tempfile.mkstemp(suffix=".json", prefix="remotion-props-")
    os.close(props_fd)
    try:
        frame_start, frame_end = _render_scene.build_props_json(
            scenes_json_path(title), scene_id, Path(props_path), burn_captions=False)
    except SystemExit:
        Path(props_path).unlink(missing_ok=True)
        print("PREVIEW-FRAME FAILED (props build)")
        sys.exit(1)
    except (AttributeError, TypeError) as e:
        Path(props_path).unlink(missing_ok=True)
        print(f"PREVIEW-FRAME FAILED (props build: {e})")
        sys.exit(1)

    # Validate the requested frame is within the scene's range in MainVideo time.
    if frame < frame_start or frame > frame_end:
        Path(props_path).unlink(missing_ok=True)
        print(f"ERROR: frame {frame} out of range for scene {scene_id} "
              f"(MainVideo frames {frame_start}-{frame_end})")
        sys.exit(2)

    cfg = load_pipeline_config()
    r = cfg.get("render", {})
    try:
        timeout_ms = int(r.get("timeout_ms", 60000))
        node_max_old = int(r.get("node_max_old_space_size_mb", 384))
    except (TypeError, ValueError):
        Path(props_path).unlink(missing_ok=True)
        print("ERROR: render timeout_ms/node_max_old_space_size_mb must be integers")
        sys.exit(2)
    gl_backend = pl.resolve_gl_backend(cfg)
    if gl_backend not in ("angle", "swangle", "egl", "swiftshader"):
        Path(props_path).unlink(missing_ok=True)
        print(f"ERROR: invalid render.gl_backend: {gl_backend!r}")
        sys.exit(2)

    import os as _os
    _os.environ["NODE_OPTIONS"] = f"--max-old-space-size={node_max_old}"

    out_dir = vdir / ".preview"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f"scene-{scene_id:02d}-frame-{frame}.png"

    print(f"Rendering still: scene {scene_id}, MainVideo frame {frame} -> {out_file}")
    cmd = ["npx", "remotion", "still", "src/Root.tsx", "MainVideo", str(out_file),
           f"--props={props_path}", f"--frame={frame}",
           f"--gl={gl_backend}",
           "--image-format", "png",
           "--timeout", str(timeout_ms),
           "--overwrite", "--log=warn"]
    try:
        r1 = run_cmd(cmd, cwd=rdir, check=False,
                     logpath=pl.log_path(title, 9, scene_id=f"preview-frame-{scene_id}-{frame}"))
        if r1.returncode != 0 or not out_file.exists():
            print("PREVIEW-FRAME FAILED")
            sys.exit(1)
    finally:
        Path(props_path).unlink(missing_ok=True)
    print(f"\nStill rendered: {out_file}")
    print("  Copy/SCP out to inspect.")


# ---------------------------------------------------------------------------
# TRANSCRIPT subcommand — print one scene's word-level voiceover timings
# ---------------------------------------------------------------------------

def cmd_transcript(args):
    """Print one scene's word timings from voiceover_timings.json (Step 6 artifact).

    Cheap alternative to Reading the whole timings file (100+ KB) or
    TRANSCRIPT.md when Step 8 only needs one scene's beats: prints the scene
    header (duration, source, global_start) plus one
    `word | start | end | start_frame-end_frame` line per word.
    """
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    tpath = vdir / "voiceover_timings.json"
    if not tpath.exists():
        print("ERROR: voiceover_timings.json not found (run Step 6 first)")
        sys.exit(2)
    try:
        data = json.loads(tpath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"ERROR: cannot read voiceover_timings.json: {e}")
        sys.exit(2)
    scenes = data.get("scenes") or []
    match = next((s for s in scenes
                  if isinstance(s, dict) and s.get("id") == args.scene), None)
    if match is None:
        print(f"ERROR: scene {args.scene} not in voiceover_timings.json")
        sys.exit(2)
    fps = data.get("fps", 30)
    print(f"Scene {match['id']} — {match.get('duration', '?')}s "
          f"(padded {match.get('padded_duration', '?')}s) — "
          f"global {match.get('global_start', '?')}s — "
          f"{match.get('source', '?')} @ {fps}fps")
    words = match.get("words") or []
    if not words:
        print("(no word timings — source is 'estimated'; sync to scene totals only)")
        return
    for w in words:
        print(f"{w.get('w', '')} | {w.get('start', '')} | {w.get('end', '')} | "
              f"{w.get('start_frame', '')}-{w.get('end_frame', '')}")


# ---------------------------------------------------------------------------
# LOGS subcommand — print the tail of a step log (bounded log reads)
# ---------------------------------------------------------------------------

def cmd_logs(args):
    """Print the last N lines of a step log.

    Per-scene render logs hold hundreds of uncollapsed progress lines — never
    Read them raw with the file tools. This prints only the tail (default 30
    lines) plus an omission note.
    """
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    if args.scene is not None:
        name = f"step-{args.step}-scene-{args.scene}.log"
    else:
        name = f"step-{args.step}.log"
    lpath = vdir / "logs" / name
    if not lpath.exists():
        print(f"ERROR: log not found: {lpath}")
        sys.exit(2)
    n = max(1, args.tail)
    lines = lpath.read_text(encoding="utf-8", errors="replace").rstrip().split("\n")
    if len(lines) > n:
        print(f"... [{len(lines) - n} earlier lines omitted — {lpath}]")
    for line in lines[-n:]:
        print(line)


# ---------------------------------------------------------------------------
# CAPTIONS subcommand — generate SRT sidecar + populate scene caption cues
# ---------------------------------------------------------------------------

def cmd_captions(args):
    title = _safe_title(args.title)
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


def cmd_sfx(args):
    """Generate SFX/BGM tracks; --preview also exports the audition mp3 + waveform PNG."""
    title = _safe_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    if not (vdir / "scenes.json").exists():
        print(f"ERROR: scenes.json not found at {vdir / 'scenes.json'}")
        sys.exit(2)
    gen = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "generate_sfx.py"), str(vdir)]
        + (["--force"] if args.force else []),
        cwd=REPO_ROOT)
    if gen.returncode != 0:
        sys.exit(gen.returncode)
    if args.preview:
        prev = subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "export_sfx_preview.py"), str(vdir)],
            cwd=REPO_ROOT)
        sys.exit(prev.returncode)
    sys.exit(0)


# ---------------------------------------------------------------------------
# RUN subcommand — one-shot new + continue (resume-safe)
# ---------------------------------------------------------------------------

def cmd_run(args):
    """One-shot entry point: scaffold (if absent) + run continue.

    - If videos/<title>/ doesn't exist: scaffold via cmd_new, then continue.
    - If videos/<title>/pipeline_state.json exists: resume via continue.
    - If videos/<title>/ exists but has no state file: refuse (use --force).
    - --force: re-scaffold, moving the existing dir to a timestamped backup
      under videos/.trash/ first (never deletes — restore by renaming back,
      purge with `clean`, which also prunes this title's old backups).

    This is the recommended "don't get lost" path. The agent runs `run` once,
    sees the Phase 1 creative brief, does the work, then calls `complete` which
    auto-runs automated sub-steps. The agent never needs to track which step
    is next — the orchestrator handles it.
    """
    title = _safe_title(args.title)
    vdir = video_dir(title)

    if vdir.exists():
        if getattr(args, "force", False):
            trash = REPO_ROOT / "videos" / ".trash"
            trash.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = trash / f"{title}-{stamp}"
            print(f"--force: backing up existing {vdir} -> {backup}")
            shutil.move(str(vdir), str(backup))
        elif (vdir / "pipeline_state.json").exists():
            # Resume — just call cmd_continue (preserves args.title)
            print(f"Resuming existing project: {title}")
            cmd_continue(args)
            return
        else:
            print(f"ERROR: {vdir} exists but has no pipeline_state.json.")
            print("  Use --force to re-scaffold (existing dir is backed up to "
                  "videos/.trash/) or pick a different title.")
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
                       help="Re-scaffold if dir exists (backs up to videos/.trash/ first)")

    status_p = sub.add_parser("status", help="Show pipeline state")
    status_p.add_argument("title", nargs="?", help="Video title (omit to show all)")
    status_p.add_argument("--scenes", action="store_true",
                          help="With a title, also print a per-scene render table from scenes.json")

    validate_p = sub.add_parser("validate", help="Validate scenes.json + pipeline_state.json against schemas")
    validate_p.add_argument("title", help="Video title")
    validate_p.add_argument("--step", type=int, default=0,
                            help="Also run step-N requirements (e.g. --step 8 for SFX/BGM gates)")
    validate_p.add_argument("--strict", action="store_true",
                            help="Promote Phase-1 content warnings to errors")

    lint_p = sub.add_parser("lint-script", help="Lint scenes.json voiceover_text for AI-isms / banned phrases")
    lint_p.add_argument("title", help="Video title")

    vt_p = sub.add_parser("voice-test", help="Synth 1 line, measure chars/sec, project script total")
    vt_p.add_argument("title", help="Video title")
    vt_p.add_argument("--scene", type=int, default=1,
                      help="Scene id to sample (default 1; ignored with --text)")
    vt_p.add_argument("--text", default="",
                      help="Custom sample text instead of a scene's voiceover_text")
    vt_p.add_argument("--voice", default="",
                      help="Override the configured voice for this sample only")
    vt_p.add_argument("--engine", choices=["edge", "pocket"], default="",
                      help="Override the configured engine for this sample only")

    preview_p = sub.add_parser("preview", help="Quick low-res smoke render of scene 1")
    preview_p.add_argument("title", help="Video title")

    pf_p = sub.add_parser("preview-frame", help="Render a single still at a specific scene+frame for visual QA")
    pf_p.add_argument("title", help="Video title")
    pf_p.add_argument("scene_id", type=int, help="Scene id (e.g. 1, 2, ...)")
    pf_p.add_argument("frame", type=int, help="Frame number in MainVideo timeline time (scene start offset is added automatically)")

    captions_p = sub.add_parser("captions", help="Generate SRT sidecar + populate scene captions")
    captions_p.add_argument("title", help="Video title")

    tr_p = sub.add_parser("transcript", help="Print one scene's word-level voiceover timings")
    tr_p.add_argument("title", help="Video title")
    tr_p.add_argument("--scene", type=int, required=True, help="Scene id")

    logs_p = sub.add_parser("logs", help="Print the tail of a step log (bounded log reads)")
    logs_p.add_argument("title", help="Video title")
    logs_p.add_argument("--step", type=int, required=True, help="Step number (e.g. 9)")
    logs_p.add_argument("--scene", type=int, default=None,
                        help="Scene id for per-scene logs (e.g. step-9-scene-4)")
    logs_p.add_argument("--tail", type=int, default=30, help="Last N lines (default 30)")

    sfx_p = sub.add_parser("sfx", help="Generate SFX/BGM tracks (and preview with --preview)")
    sfx_p.add_argument("title", help="Video title")
    sfx_p.add_argument("--preview", action="store_true",
                       help="Also export sfx_preview.mp3 + waveform PNG for audition")
    sfx_p.add_argument("--force", action="store_true",
                       help="Regenerate even when cues are unchanged")

    audit_p = sub.add_parser("audit", help="Audit a video project for violations")
    audit_p.add_argument("title", help="Video title")

    doctor_p = sub.add_parser("doctor", help="Run system and project diagnostics")
    doctor_p.add_argument("title", help="Video title")

    clean_p = sub.add_parser("clean", help="Free disk space for a completed video")
    clean_p.add_argument("title", help="Video title")

    redo_p = sub.add_parser("redo", help="Reset a completed automated step to pending")
    redo_p.add_argument("title", help="Video title")
    redo_p.add_argument("step", type=int, help="Automated step number to reset (5, 6, 9, 10, 13)")

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
    elif args.command == "lint-script":
        cmd_lint_script(args)
    elif args.command == "voice-test":
        cmd_voice_test(args)
    elif args.command == "preview":
        cmd_preview(args)
    elif args.command == "preview-frame":
        cmd_preview_frame(args)
    elif args.command == "captions":
        cmd_captions(args)
    elif args.command == "transcript":
        cmd_transcript(args)
    elif args.command == "logs":
        cmd_logs(args)
    elif args.command == "sfx":
        cmd_sfx(args)
    elif args.command == "clean":
        cmd_clean(args)
    elif args.command == "redo":
        cmd_redo(args)
    elif args.command == "audit":
        cmd_audit(args)
    elif args.command == "doctor":
        cmd_doctor(args)
    else:
        parser.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
