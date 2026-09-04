"""Unit tests for scripts/render_thumbnail.py pure parsers."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import render_thumbnail as rt


def test_read_title_md_ignores_html_comments(tmp_path):
    (tmp_path / "TITLE.md").write_text(
        "# Title Variants\n\n"
        "1. **Search:** Moon Leaves Earth\n"
        "3. **Hybrid** | Moon Leaves Earth\n\n"
        "## Recommended Title\n"
        '<!-- render_thumbnail.py reads this block first; falls back to the "3. **Hybrid** |" line above. -->\n'
        "Title: Moon Leaves Earth\n",
        encoding="utf-8",
    )
    assert rt.read_title_md(tmp_path) == "Moon Leaves Earth"


def test_read_title_md_comment_only_template_garbage_rejected(tmp_path):
    # The exact failure from the field: only the pasted template comment
    # contains "Hybrid" + "|", and must not parse as a title.
    (tmp_path / "TITLE.md").write_text(
        "# Title Variants\n\n"
        '<!-- falls back to the "3. **Hybrid** |" line above. -->\n',
        encoding="utf-8",
    )
    assert rt.read_title_md(tmp_path) is None


def test_build_thumbnail_props_merges_palette_per_key(tmp_path):
    (tmp_path / "STYLES.md").write_text(
        "# Styles\n\n## Palette (machine-readable)\n"
        "Primary: #111111\nSecondary: #222222\nBackground: #333333\nText: #444444\n",
        encoding="utf-8",
    )
    (tmp_path / "scenes.json").write_text(
        json.dumps({"video_title": "demo", "fps": 30, "scenes": []}))
    props = rt.build_thumbnail_props(tmp_path, tmp_path / "scenes.json")
    assert props["palette"]["primary"] == "#111111"
    assert props["palette"]["accent"] == "#FFB300"
    assert set(props["palette"]) >= {"primary", "secondary", "accent",
                                     "background", "text"}
