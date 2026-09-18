"""Unit tests for scripts/render_thumbnail.py pure parsers."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import render_thumbnail as rt


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
