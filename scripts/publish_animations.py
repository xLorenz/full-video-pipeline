#!/usr/bin/env python3
"""
publish_animations.py — publish animation templates into a per-video project.

Walks the repo-root `animations/` directory and copies each template's
component.tsx, config/*.json, animation.md, and preview/ into the per-video
Remotion project at `videos/<title>/remotion/src/components/animations/<name>/`.
Also publishes the shared helpers in `animations/_shared/` and generates a
barrel `index.ts` re-exporting every template component.

Templates whose `config/defaults.json` fails validation against either the
global `schemas/animations.schema.json` or the template's own
`config/schema.json` are rejected — the script exits non-zero and the
scaffold aborts, mirroring how `scripts/validate.py` rejects bad scenes.json.

Usage:
    python3 scripts/publish_animations.py <video_dir>            # required
    python3 scripts/publish_animations.py <video_dir> --dry-run  # report without writing

Exit codes:
    0   All templates validated and copied cleanly (or dry-run with no issues)
    1   One or more templates failed schema validation
    2   Usage error / missing paths
    3   No animations/ directory at repo root (treated as a no-op with a warning)
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install -r scripts/requirements.txt",
          file=sys.stderr)
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
ANIMATIONS_DIR = REPO_ROOT / "animations"
GLOBAL_SCHEMA = REPO_ROOT / "schemas" / "animations.schema.json"
SHARED_DIR_NAME = "_shared"          # within animations/
EXAMPLES_DIR_NAME = "examples"       # within animations/
INDEX_FILE = "index.ts"              # within animations/
REQUIRED_TEMPLATE_FILES = ("component.tsx", "animation.md")
REQUIRED_TEMPLATE_DIRS = ("config", "preview")
REQUIRED_CONFIG_FILES = ("defaults.json", "schema.json")


def fail(msg: str, code: int = 1) -> "NoReturn":  # noqa: F821
    print(msg, file=sys.stderr)
    sys.exit(code)


def load_json(path: Path) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        fail(f"ERROR: failed to load {path}: {e}", 1)


def validate_defaults(defaults_path: Path, schema_path: Path) -> list:
    """Validate a template's defaults.json against both global + per-template schema."""
    errors = []
    if not defaults_path.exists():
        return [f"{defaults_path}: defaults.json not found"]
    if not schema_path.exists():
        return [f"{schema_path}: config/schema.json not found"]
    try:
        defaults = load_json(defaults_path)
    except SystemExit:
        return [f"{defaults_path}: invalid JSON"]
    try:
        schema = load_json(schema_path)
    except SystemExit:
        return [f"{schema_path}: invalid JSON"]

    # Per-template schema layers on top of the global one. Validate against
    # that first (it usually $refs the global schema via its own $schema key).
    validator = jsonschema.Draft7Validator(schema)
    errors += [
        f"{defaults_path.name} (per-template): {e.message} at /{'/'.join(str(p) for p in e.absolute_path) or '(root)'}"
        for e in sorted(validator.iter_errors(defaults), key=lambda x: list(x.absolute_path))
    ]

    # Also validate against the global schema to catch issues where the
    # per-template schema truncated required fields. Skip if the per-template
    # schema already $refs the global definitions via its own $id — Draft7
    # handles that and we don't want to double-report.
    if GLOBAL_SCHEMA.exists():
        global_schema = load_json(GLOBAL_SCHEMA)
        # Only validate if the per-template schema doesn't already $ref into the
        # global schema's $id ( avoidance of duplicate errors).
        ref_uses_global = any(
            isinstance(v, dict) and isinstance(v.get("$ref", ""), str) and
            "animations.schema.json" in v["$ref"]
            for v in (schema.get("properties", {}) or {}).values()
        )
        if not ref_uses_global:
            g_validator = jsonschema.Draft7Validator(global_schema)
            errors += [
                f"{defaults_path.name} (global): {e.message} at /{'/'.join(str(p) for p in e.absolute_path) or '(root)'}"
                for e in sorted(g_validator.iter_errors(defaults), key=lambda x: list(x.absolute_path))
            ]
    return errors


def collect_templates() -> list:
    """Return list of template directories (sorted by name)."""
    if not ANIMATIONS_DIR.is_dir():
        return []
    templates = []
    for entry in sorted(ANIMATIONS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name in (SHARED_DIR_NAME, EXAMPLES_DIR_NAME):
            continue
        if entry.name.startswith("."):
            continue
        templates.append(entry)
    return templates


def verify_template_layout(template_dir: Path, errors: list) -> bool:
    """Confirm a template has all required files + dirs. False if malformed."""
    ok = True
    for f in REQUIRED_TEMPLATE_FILES:
        if not (template_dir / f).exists():
            errors.append(f"{template_dir.name}: missing required file {f}")
            ok = False
    for d in REQUIRED_TEMPLATE_DIRS:
        if not (template_dir / d).is_dir():
            errors.append(f"{template_dir.name}: missing required directory {d}/")
            ok = False
    for f in REQUIRED_CONFIG_FILES:
        if not (template_dir / "config" / f).exists():
            errors.append(f"{template_dir.name}: missing config/{f}")
            ok = False
    return ok


def copy_template(template_dir: Path, dest_anim_dir: Path, dry_run: bool) -> None:
    """Copy template files (no validation) into the per-video project."""
    dest = dest_anim_dir / template_dir.name
    if dry_run:
        print(f"  (dry-run) would copy {template_dir.name}/ -> {dest}")
        return
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    # Copy the tracked files and the config/, preview/ subdirs. Skip docs that
    # only matter in the source repo (.git, .DS_Store, etc.) — we DO copy
    # animation.md because the per-video agent needs to read it without
    # nawigating back to the repo root.
    def _ignore(_src, names):
        return {n for n in names if n.startswith(".")}
    shutil.copytree(
        template_dir,
        dest,
        ignore=_ignore,
        dirs_exist_ok=True,
    )


def publish_shared(dest_anim_dir: Path, dry_run: bool) -> None:
    """Copy `_shared/` verbatim into the per-video animations directory."""
    shared_src = ANIMATIONS_DIR / SHARED_DIR_NAME
    if not shared_src.is_dir():
        return
    dest = dest_anim_dir / SHARED_DIR_NAME
    if dry_run:
        print(f"  (dry-run) would copy _shared/ -> {dest}")
        return
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(shared_src, dest, dirs_exist_ok=True)


def components_name(template_name: str) -> str:
    """Convert a folder name to a PascalCase component name."""
    return "".join(part.capitalize() for part in template_name.split("-") if part)


def write_barrel_index(dest_anim_dir: Path, templates: list, dry_run: bool) -> None:
    """Generate `index.ts` re-exporting every template component."""
    lines = [
        "// AUTO-GENERATED by scripts/publish_animations.py — do not edit.",
        "// Re-exports every published animation template's component.",
        "",
    ]
    for t in templates:
        cname = components_name(t.name)
        lines.append(
            f'export {{ {cname} }} from "./{t.name}/component";'
        )
    lines.append("")
    lines.append('export * from "./_shared";')
    lines.append("")
    if dry_run:
        print(f"  (dry-run) would write index.ts with {len(templates)} exports")
        return
    (dest_anim_dir / "index.ts").write_text("\n".join(lines), encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Publish animation templates into a per-video project.")
    parser.add_argument("video_dir", help="Path to the video project directory")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report actions without writing files")
    args = parser.parse_args(argv)

    video_dir = Path(args.video_dir).resolve()
    if not video_dir.is_dir():
        fail(f"ERROR: not a directory: {video_dir}", 2)

    # The per-video Remotion project root is `videos/<title>/remotion/`.
    remotion_dir = video_dir / "remotion"
    if not remotion_dir.is_dir():
        fail(f"ERROR: {remotion_dir} not found (run pipeline.py scaffold first)", 2)
    dest_anim_dir = remotion_dir / "src" / "components" / "animations"

    if not ANIMATIONS_DIR.is_dir():
        print(f"WARN: {ANIMATIONS_DIR} not found — skipping animation publishing (no-op).")
        sys.exit(0)

    templates = collect_templates()
    print(f"Found {len(templates)} animation template(s).")

    all_errors = []
    ok_templates = []
    for t in templates:
        template_errors: list = []
        layout_ok = verify_template_layout(t, template_errors)
        if not layout_ok:
            all_errors.extend(template_errors)
            continue
        validation_errors = validate_defaults(
            t / "config" / "defaults.json",
            t / "config" / "schema.json",
        )
        all_errors.extend(validation_errors)
        if not validation_errors and layout_ok:
            ok_templates.append(t)

    if all_errors:
        print("\nVALIDATION FAILED ({} errors):".format(len(all_errors)), file=sys.stderr)
        for e in all_errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Validation OK for {len(ok_templates)} template(s).")
    dest_anim_dir.mkdir(parents=True, exist_ok=True)
    publish_shared(dest_anim_dir, args.dry_run)
    for t in ok_templates:
        copy_template(t, dest_anim_dir, args.dry_run)
    write_barrel_index(dest_anim_dir, ok_templates, args.dry_run)

    print(f"Published {len(ok_templates)} template(s) -> {dest_anim_dir}")
    sys.exit(0)


if __name__ == "__main__":
    main()
