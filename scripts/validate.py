#!/usr/bin/env python3
"""
validate.py — Validate scenes.json and pipeline_state.json against the schemas.

Usage:
    python3 scripts/validate.py <video_dir>              # Schema validation only
    python3 scripts/validate.py <video_dir> --step 3     # Schema + step requirements

Exit codes:
    0  All checks pass
    1  JSON Schema validation failure
    2  Usage error / missing file / jsonschema import error
    3  Step-requirement failure (e.g. empty scenes at step 3)
    4  Artifact-not-found (expected file missing or empty on disk)
    5  Caption integrity violation (start > end, end > scene_duration)
"""

import argparse
import json
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

    if all_errors:
        print(f"VALIDATION FAILED ({len(all_errors)} errors):")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(exit_code)
    print("VALIDATION OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
