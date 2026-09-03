"""Contract tests for the animations/ template catalog (Phase 0+).

Guards the agent-facing index consistency: every template folder is listed
in README/CATALOG/examples, no phantom references, one preview per template,
no duplicate tag headers.
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ANIM = REPO / "animations"
SKIP_DIRS = {"_shared", "examples", "__pycache__"}


def template_dirs():
    return sorted(p for p in ANIM.iterdir()
                  if p.is_dir() and p.name not in SKIP_DIRS)


def test_no_phantom_before_after_split():
    for rel in ["README.md", "CATALOG.md", "examples/README.md", "SCHEMA.md"]:
        text = (ANIM / rel).read_text(encoding="utf-8")
        assert "before-after-split" not in text, f"phantom reference in {rel}"


def test_every_template_in_readme_table():
    text = (ANIM / "README.md").read_text(encoding="utf-8")
    missing = [p.name for p in template_dirs() if f"{p.name}/animation.md" not in text]
    assert missing == [], f"templates missing from README table: {missing}"


def test_every_template_in_catalog():
    text = (ANIM / "CATALOG.md").read_text(encoding="utf-8")
    missing = [p.name for p in template_dirs() if f"{p.name}/" not in text]
    assert missing == [], f"templates missing from CATALOG: {missing}"


def test_every_template_in_examples():
    text = (ANIM / "examples" / "README.md").read_text(encoding="utf-8")
    missing = [p.name for p in template_dirs()
               if f"`{p.name}`" not in text]
    assert missing == [], f"templates missing from examples/README: {missing}"


# Known README violations, slated for removal in the previews phase
# (fold card variants into the single preview.tsx as comments).
KNOWN_PREVIEW_VIOLATIONS = {"decrypt-reveal", "shatter"}


def test_one_preview_per_template():
    bad = []
    for p in template_dirs():
        if p.name in KNOWN_PREVIEW_VIOLATIONS:
            continue
        variants = [f.name for f in (p / "preview").glob("preview-*")
                    if f.name not in ("preview.tsx", "preview.mp4")]
        if variants:
            bad.append(f"{p.name}: {variants}")
    assert bad == [], f"forbidden secondary preview variants: {bad}"


def test_known_preview_violations_still_tracked():
    # Fails when the previews phase removes them — then drop the allowlist.
    remaining = set()
    for name in KNOWN_PREVIEW_VIOLATIONS:
        variants = [f.name for f in (ANIM / name / "preview").glob("preview-*")
                    if f.name not in ("preview.tsx", "preview.mp4")]
        if variants:
            remaining.add(name)
    assert remaining == KNOWN_PREVIEW_VIOLATIONS, (
        f"allowlist out of date, remaining: {sorted(remaining)}")


def test_preview_files_present():
    missing = []
    for p in template_dirs():
        if not (p / "preview" / "preview.tsx").exists():
            missing.append(f"{p.name}/preview/preview.tsx")
        if not (p / "preview" / "preview.mp4").exists():
            missing.append(f"{p.name}/preview/preview.mp4")
    assert missing == [], f"missing preview files: {missing}"


def test_template_folder_layout():
    bad = []
    for p in template_dirs():
        for rel in ["animation.md", "component.tsx",
                    "config/defaults.json", "config/schema.json"]:
            if not (p / rel).exists():
                bad.append(f"{p.name}/{rel}")
    assert bad == [], f"template folders missing required files: {bad}"


def test_catalog_tag_headers_unique():
    text = (ANIM / "CATALOG.md").read_text(encoding="utf-8")
    headers = re.findall(r"^- `([^`]+)` — ", text, re.MULTILINE)
    dupes = sorted({h for h in headers if headers.count(h) > 1})
    assert dupes == [], f"duplicate tag headers in CATALOG: {dupes}"
