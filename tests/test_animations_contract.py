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


def _pascal(folder: str) -> str:
    return "".join(p.capitalize() for p in folder.split("-") if p)


# Old treatment primaries, kept as @deprecated aliases.
DEPRECATED_RIP_ALIASES = {
    "bend": "BendRip", "blaze": "BlazeRip", "droplets": "DropletsRip",
    "flame-wrap": "FlameWrapRip", "vhs": "VHSRip",
    "glyph-rain": "GlyphRainRip", "shatter": "ShatterRip",
    "decrypt-reveal": "DecryptRip",
}


def test_component_exports_folder_pascalcase():
    bad = []
    for p in template_dirs():
        text = (p / "component.tsx").read_text(encoding="utf-8")
        if f"export const {_pascal(p.name)}" not in text:
            bad.append(p.name)
    assert bad == [], f"component.tsx missing canonical PascalCase export: {bad}"


def test_deprecated_rip_aliases_present():
    bad = []
    for folder, old in DEPRECATED_RIP_ALIASES.items():
        text = (ANIM / folder / "component.tsx").read_text(encoding="utf-8")
        if f"export const {old} =" not in text or "@deprecated" not in text:
            bad.append(folder)
    assert bad == [], f"missing @deprecated Rip aliases: {bad}"


def test_no_primary_rip_exports_remain():
    bad = []
    for p in template_dirs():
        text = (p / "component.tsx").read_text(encoding="utf-8")
        for m in re.finditer(r"export const (\w+): React\.FC", text):
            name = m.group(1)
            if name.endswith("Rip") and name != "GlitchRip":
                bad.append(f"{p.name}: {name}")
    assert bad == [], f"old *Rip primaries remain: {bad}"


def test_shared_types_define_both_prop_families():
    text = (ANIM / "_shared" / "types.ts").read_text(encoding="utf-8")
    for name in ["TemplateProps", "TreatmentProps", "StyleMaps"]:
        assert re.search(rf"(interface|type)\s+{name}\b", text), \
            f"_shared/types.ts missing {name}"
    assert "children" in text, "TreatmentProps must declare children"


def test_global_schema_documents_treatment_elements():
    import json
    schema = json.loads((REPO / "schemas" / "animations.schema.json")
                        .read_text(encoding="utf-8"))
    desc = schema["properties"]["elements"].get("description", "")
    assert "treatment" in desc.lower() or "children" in desc.lower(), \
        "global schema must document that treatments ignore elements[]"


def test_all_templates_listed_in_contract_table():
    text = (ANIM / "README.md").read_text(encoding="utf-8")
    for name in [p.name for p in template_dirs()]:
        assert name in text, f"template {name} missing from README contract docs"


def test_shared_content_helper_exported():
    text = (ANIM / "_shared" / "content.ts").read_text(encoding="utf-8")
    assert "buildSlotOverrideMap" in text
    assert "useSlotOverrides" in text
    index = (ANIM / "_shared" / "index.ts").read_text(encoding="utf-8")
    assert '"./content"' in index or "'./content'" in index


def test_no_hand_rolled_override_maps():
    bad = []
    for p in template_dirs():
        comp = p / "component.tsx"
        if not comp.exists():
            continue
        text = comp.read_text(encoding="utf-8")
        if "new Map<string, ElementOverride>()" in text:
            bad.append(p.name)
    assert bad == [], f"hand-rolled override maps (use useSlotOverrides): {bad}"


def test_no_loose_element_colors_in_schemas():
    import json
    bad = []
    for f in sorted(ANIM.rglob("config/schema.json")):
        text = f.read_text(encoding="utf-8")
        # Element-level color must $ref the global hex-patterned definition
        # (custom.* nested colors are template-specific and out of scope).
        for m in re.finditer(r'"color":\s*\{\s*"type":\s*\[\s*"string",\s*"null"\s*\]\s*\}',
                             text):
            # Allow only when nested inside a "custom" block
            start = text.rfind('"custom"', 0, m.start())
            elem = text.rfind('"elements"', 0, m.start())
            if start > elem:
                continue
            bad.append(str(f.relative_to(REPO)))
    assert bad == [], f"loose element.color without hex pattern: {bad}"


def test_glitch_skips_still_band_clones():
    text = (ANIM / "glitch-rip" / "component.tsx").read_text(encoding="utf-8")
    # Zero-displacement bands skip the full-children clone (pixel-identical:
    # the source layer beneath shows the same pixels at the same opacity).
    assert "!still && renderBandSlice(band)" in text
    assert "body-${band.y}" in text


def test_signature_easings_fall_back_to_global():
    for folder, knob in [("comparison-grid", "flipEasing"),
                         ("bar-code-scan", "scanEasing"),
                         ("radial-gauge", "arcEasing"),
                         ("trend-line", "drawEasing")]:
        text = (ANIM / folder / "component.tsx").read_text(encoding="utf-8")
        assert re.search(rf"{knob}.*\?\?.*config\.global\?\.easing", text, re.DOTALL), \
            f"{folder}: {knob} must fall back to config.global?.easing"


SCHOOL1_SECTIONS = ["## When to use", "## Quick start",
                    "## Recognized element ids", "## Customization recipes",
                    "## To preview"]


def test_treatment_docs_have_school1_structure():
    bad = []
    for p in template_dirs():
        text = (p / "animation.md").read_text(encoding="utf-8")
        missing = []
        for h in SCHOOL1_SECTIONS:
            if h in text or f"{h} (" in text:
                continue
            # "### Recognized `elements[].id`" subsection counts
            if h == "## Recognized element ids" and "Recognized `elements[].id`" in text:
                continue
            missing.append(h)
        if missing:
            bad.append(f"{p.name}: missing {missing}")
    assert bad == [], bad


# Demonstrative defaults entries must mirror base content (zero visual delta).
MIRROR_CASES = {
    "data-bars": ("bar-0", "A", ["labels", 0]),
    "kinetic-title-mosaic": ("word-0", "DATA", ["words", 0]),
    "timeline-marker": ("event-0", "1950", ["events", 0, "label"]),
    "orbit-chip-cloud": ("chip-0", "PILLAR A", ["chips", 0]),
    "comparison-grid": ("cell-0-0", "Option", ["cells", 0, 0]),
    "bar-code-scan": ("bar-0", "A", ["barcodeBars", 0]),
}


def test_defaults_elements_mirror_base_content():
    import json
    bad = []
    for folder, (eid, text, path) in MIRROR_CASES.items():
        data = json.loads((ANIM / folder / "config" / "defaults.json")
                          .read_text(encoding="utf-8"))
        els = [e for e in data.get("elements", []) if e.get("id") == eid]
        if not els or els[0].get("text") != text:
            bad.append(f"{folder}: missing mirror entry {eid}={text!r}")
            continue
        node = data["extras"]
        for key in path:
            node = node[key]
        if node != text:
            bad.append(f"{folder}: mirror entry {eid} diverged from extras base")
    assert bad == [], bad
