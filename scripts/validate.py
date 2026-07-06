#!/usr/bin/env python3
"""
validate.py — Validate scenes.json and pipeline_state.json against the schemas.

Exits non-zero with a human-readable error list on failure.

Usage:
    python3 scripts/validate.py <video_dir>
"""

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install -r scripts/requirements.txt",
          file=sys.stderr)
    sys.exit(2)

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


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/validate.py <video_dir>", file=sys.stderr)
        sys.exit(2)

    video_dir = Path(sys.argv[1]).resolve()
    if not video_dir.is_dir():
        print(f"ERROR: not a directory: {video_dir}", file=sys.stderr)
        sys.exit(2)

    all_errors = []
    all_errors += validate_file(video_dir / "scenes.json", SCHEMAS_DIR / "scenes.schema.json")
    all_errors += validate_file(video_dir / "pipeline_state.json",
                                SCHEMAS_DIR / "pipeline_state.schema.json")

    if all_errors:
        print(f"VALIDATION FAILED ({len(all_errors)} errors):")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(1)
    print("VALIDATION OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
