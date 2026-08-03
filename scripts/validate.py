#!/usr/bin/env python3
"""
validate.py — Validate scenes.json and pipeline_state.json against the schemas.

Usage:
    python3 scripts/validate.py <video_dir>              # Schema validation only
    python3 scripts/validate.py <video_dir> --step 3     # Schema + step requirements
    python3 scripts/validate.py <video_dir> --step 3 --strict   # Promote Phase-1 warnings to errors

Exit codes:
    0  All checks pass
    1  JSON Schema validation failure
    2  Usage error / missing file / jsonschema import error
    3  Step-requirement failure (e.g. empty scenes at step 3)
    4  Artifact-not-found (expected file missing or empty on disk)
    5  Caption integrity violation (start > end, end > scene_duration)
    6  Phase-1 hard failure (SCRIPT.md or pattern-interrupt log missing)
    7  Phase-1 warning promoted to error by --strict
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install -r scripts/requirements.txt",
          file=sys.stderr)
    sys.exit(2)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "schemas"


def validate_file(data_path: Path, schema_path: Path) -> list:
    if not data_path.exists():
        return [f"{data_path}: file not found"]
    if not schema_path.exists():
        return [f"{schema_path}: schema not found"]
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"{data_path}: invalid JSON: {e}"]
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    return [f"{data_path}: {err.message} at /{'/'.join(str(p) for p in err.absolute_path) or '(root)'}"
            for err in errors]


def check_step_requirements(video_dir: Path, data: dict, step: int) -> list:
    """Step-specific checks beyond JSON schema. Returns list of error strings."""
    errors = []
    scenes = data.get("scenes", [])

    if step >= 3:
        if not scenes:
            errors.append(f"At step {step}: scenes.json must have at least 1 scene")
        for s in scenes:
            for field in ("id", "title", "script_text", "voiceover_text"):
                if not s.get(field):
                    errors.append(f"Scene {s.get('id', '?')}: missing required field '{field}' for step {step}")

    if step >= 5:
        for s in scenes:
            if not s.get("voiceover_file"):
                errors.append(f"Scene {s['id']}: missing voiceover_file for step {step}")
            if not s.get("voiceover_hash"):
                errors.append(f"Scene {s['id']}: missing voiceover_hash for step {step}")

    if step >= 6:
        for s in scenes:
            dur = s.get("actual_duration_frames")
            if dur is None or dur <= 0:
                errors.append(f"Scene {s['id']}: missing or invalid actual_duration_frames for step {step}")
            dur_s = s.get("actual_duration_seconds")
            if dur_s is None or dur_s <= 0:
                errors.append(f"Scene {s['id']}: missing or invalid actual_duration_seconds for step {step}")

    if step >= 9:
        for s in scenes:
            if s.get("render_status") != "rendered":
                errors.append(f"Scene {s['id']}: render_status must be 'rendered' for step {step}")
            scene_file = s.get("scene_file")
            if scene_file:
                fpath = video_dir / scene_file
                if not fpath.exists():
                    errors.append(f"Scene {s['id']}: scene_file {scene_file} not found on disk for step {step}")

    if step >= 10:
        versions_dir = video_dir / "versions"
        if not versions_dir.exists() or not list(versions_dir.glob("*.mp4")):
            errors.append(f"At step {step}: no MP4 found in versions/")

    if step >= 13:
        versions_dir = video_dir / "versions"
        if not versions_dir.exists() or not list(versions_dir.glob("*thumbnail*.png")):
            errors.append(f"At step {step}: no thumbnail PNG found in versions/")

    return errors


def check_captions(data: dict) -> list:
    errors = []
    for s in data.get("scenes", []):
        scene_dur = s.get("actual_duration_seconds") or 0
        for i, cue in enumerate(s.get("captions") or []):
            if cue.get("start", 0) < 0:
                errors.append(f"Scene {s['id']} cue {i}: start < 0")
            if cue.get("end", 0) < 0:
                errors.append(f"Scene {s['id']} cue {i}: end < 0")
            if cue.get("start", 0) > cue.get("end", 0):
                errors.append(f"Scene {s['id']} cue {i}: start ({cue['start']}) > end ({cue['end']})")
            if scene_dur > 0 and cue.get("end", 0) > scene_dur:
                errors.append(f"Scene {s['id']} cue {i}: end ({cue['end']}) > scene duration ({scene_dur})")
    return errors


# ---------------------------------------------------------------------------
# Phase-1 (Research & Script) content checks.
#
# Sources: PLAN.md ("Retention scripting rules, hook 3-part structure
# (Grab/Promise/Stakes), pattern interrupt frequency, CTA placement") and
# skills/.../retention-scripting-guide.md ("verify by checking the interrupt
# log timestamps"). These run alongside check_step_requirements when
# --step >= 3 (scenes.json authored, SCRIPT.md expected to exist).
#
# Returns (errors, warnings). Errors fail the run regardless; warnings only
# fail under --strict.
# ---------------------------------------------------------------------------

# Per-scene duration drift (actual vs target voiceover length) above which we
# warn. 25% catches scene 3 of the wood-wide-web fixture (+40%) while letting
# the +20% / -16% scenes pass.
DURATION_DRIFT_WARN = 0.25

_TS_RE = re.compile(r"(\d+):(\d{2})(?::(\d{2}))?")


def _parse_ts(s):
    """Parse 'M:SS' or 'H:MM:SS' into seconds (float). None if no match."""
    m = _TS_RE.search(s)
    if not m:
        return None
    if m.group(3) is not None:  # H:MM:SS
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    return int(m.group(1)) * 60 + int(m.group(2))


def check_phase1_content(video_dir, data):
    """Phase-1 script/structure checks. Returns (errors, warnings)."""
    errors, warnings = [], []
    scenes = data.get("scenes", [])

    script_path = video_dir / "SCRIPT.md"
    if not script_path.exists():
        errors.append("SCRIPT.md not found (Phase-1 research/script artifact missing)")
        return errors, warnings
    text = script_path.read_text(encoding="utf-8")

    # Hard: pattern-interrupt log block must exist (guide-mandated verification).
    log_match = re.search(r"^##\s*Pattern Interrupt Log\s*$", text, re.IGNORECASE | re.MULTILINE)
    if not log_match:
        errors.append("SCRIPT.md: missing '## Pattern Interrupt Log' block (retention-scripting-guide requires it for verification)")
        log_body = ""
    else:
        after = text[log_match.end():]
        next_h = re.search(r"^##\s+", after, re.MULTILINE)
        log_body = after[: next_h.start()] if next_h else after

    # Warnings: hook + promise + CTA scene presence.
    titles_blob = " ".join((s.get("title", "") + " " + s.get("script_text", "")).lower()
                           for s in scenes)
    if scenes and "hook" not in (scenes[0].get("title", "") + scenes[0].get("script_text", "")).lower():
        warnings.append("Scene 1 does not look like a hook (no 'hook' in title/script_text)")
    if "promise" not in titles_blob and "promise" not in text.lower():
        warnings.append("No 'Promise' scene/section found (hook 3-part: Grab/Promise/Stakes)")
    last_vo = (scenes[-1].get("voiceover_text", "") if scenes else "").lower()
    if scenes and not re.search(r"subscribe|follow|comment|like|next video|check out", last_vo):
        warnings.append("Final scene has no CTA marker (subscribe/follow/comment/like/next video)")

    # Warnings: pattern-interrupt log density + average spacing.
    if log_body:
        ts_entries = [_parse_ts(line) for line in log_body.splitlines()]
        ts_entries = [t for t in ts_entries if t is not None]
        if len(ts_entries) < 3:
            warnings.append(f"Pattern-interrupt log has only {len(ts_entries)} timestamped entries (want >= 3)")
        if len(ts_entries) >= 2:
            ts_sorted = sorted(ts_entries)
            intervals = [b - a for a, b in zip(ts_sorted, ts_sorted[1:])]
            avg = sum(intervals) / len(intervals)
            total_dur = sum(s.get("actual_duration_seconds") or 0 for s in scenes) or sum(
                s.get("target_duration_seconds") or 0 for s in scenes)
            threshold = 15.0 if total_dur < 120 else 90.0
            if avg > threshold:
                warnings.append(f"Pattern-interrupt average interval {avg:.1f}s exceeds {threshold:.0f}s target")

    # Warning: per-scene duration drift (actual vs target).
    for s in scenes:
        tgt = s.get("target_duration_seconds")
        act = s.get("actual_duration_seconds")
        if tgt and act and tgt > 0:
            drift = abs(act - tgt) / tgt
            if drift > DURATION_DRIFT_WARN:
                warnings.append(
                    f"Scene {s['id']} duration drift {drift*100:.0f}% "
                    f"(target {tgt}s, actual {act:.1f}s) > {DURATION_DRIFT_WARN*100:.0f}%")

    return errors, warnings


def validate_animations(video_dir: Path) -> list:
    """Validate every animations/ template's defaults.json against its schema.

    Pulled in from scripts/publish_animations.py — reuses the referencing
    Registry wiring so local $id URIs resolve without network fetches.
    Returns list of error strings (empty == all OK).
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import publish_animations as pa  # noqa: E402
    errors = []
    templates = pa.collect_templates()
    if not templates:
        return []  # no animations/ present — silently OK
    for t in templates:
        defaults_path = t / "config" / "defaults.json"
        schema_path = t / "config" / "schema.json"
        errors += pa.validate_defaults(defaults_path, schema_path)
    return errors


def main():
    parser = argparse.ArgumentParser(description="Validate scenes.json and pipeline_state.json")
    parser.add_argument("video_dir", help="Path to the video project directory")
    parser.add_argument("--step", type=int, default=0,
                        help="Step number for step-specific requirements (default: 0 = no step checks)")
    parser.add_argument("--validate-animations", action="store_true",
                        help="Also validate every template's defaults.json against its schema + the global animations schema")
    parser.add_argument("--strict", action="store_true",
                        help="Promote Phase-1 content warnings to errors (exit 7)")
    args = parser.parse_args()

    video_dir = Path(args.video_dir).resolve()
    step = args.step

    if not video_dir.is_dir():
        print(f"ERROR: not a directory: {video_dir}", file=sys.stderr)
        sys.exit(2)

    all_errors = []
    all_errors += validate_file(video_dir / "scenes.json", SCHEMAS_DIR / "scenes.schema.json")
    all_errors += validate_file(video_dir / "pipeline_state.json",
                                SCHEMAS_DIR / "pipeline_state.schema.json")

    # Opt-in animation schema check (mirrors what publish_animations.py runs
    # during the scaffold step). Useful for catching broken template defaults
    # before creating a new video.
    if args.validate_animations:
        anim_errors = validate_animations(video_dir)
        for e in anim_errors:
            all_errors.append(f"(animations) {e}")

    exit_code = 1 if all_errors else 0

    warnings = []
    if exit_code == 0 and step > 0:
        scenes_path = video_dir / "scenes.json"
        if scenes_path.exists():
            with open(scenes_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            step_errors = check_step_requirements(video_dir, data, step)
            if step_errors:
                all_errors.extend(step_errors)
                exit_code = 3

            caption_errors = check_captions(data)
            if caption_errors:
                all_errors.extend(caption_errors)
                if exit_code == 0:
                    exit_code = 5

            # Phase-1 content checks (script structure, pattern interrupts, CTA,
            # duration drift). Hard failures add to all_errors (exit 6);
            # warnings print separately and only fail under --strict (exit 7).
            if step >= 3:
                p1_errors, p1_warnings = check_phase1_content(video_dir, data)
                if p1_errors:
                    all_errors.extend(f"(phase-1) {e}" for e in p1_errors)
                    if exit_code == 0:
                        exit_code = 6
                if p1_warnings:
                    if args.strict:
                        all_errors.extend(f"(phase-1, --strict) {e}" for e in p1_warnings)
                        if exit_code == 0:
                            exit_code = 7
                    else:
                        warnings.extend(p1_warnings)

    if warnings:
        print(f"Phase-1 warnings ({len(warnings)}):")
        for w in warnings:
            print(f"  WARNING: {w}")

    if all_errors:
        print(f"VALIDATION FAILED ({len(all_errors)} errors):")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(exit_code)
    print("VALIDATION OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
