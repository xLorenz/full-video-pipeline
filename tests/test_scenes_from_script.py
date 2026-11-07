"""Unit tests for `pipeline.py scenes-from-script` and the RESEARCH.md gate.

The converter is the only path from SCRIPT.md to scenes.json, so its parser is
the contract the script writer codes against: heading syntax, `(silent)`
markers, the retention tail not leaking into the last scene, and re-runs never
clobbering orchestrator-owned render/audio state.
"""
import argparse
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pipeline  # noqa: E402
import validate  # noqa: E402


GOOD_SCRIPT = """\
# Script: Demo

## Scene 1: Hook — Grab (~8s)
**Script:** Fast cuts over a server rack.
**Voiceover:** Your laptop is lying to you about what a kernel does.
**Transition:** cut

## Scene 2: Title Card (~3s)
**Script:** Full-bleed title.
**Voiceover:** (silent)
**Transition:** fade

## Scene 3: The Reveal (~12.5s)
**Script:** Diagram animation.
**Voiceover:** Here is the trick. The kernel is
just a scheduler with good PR.
**Transition:** cut

## Pattern Interrupt Log
- Scene 3: [CAMERA CHANGE] — 0:20

## Retention Risk Map
- Risk 1: Scene 3 dense stats -> mitigation: visual reveal
"""


def test_parse_scene_fields():
    scenes, errors, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    assert errors == []
    assert [s["id"] for s in scenes] == [1, 2, 3]

    hook = scenes[0]
    assert hook["title"] == "Hook — Grab"
    assert hook["target_duration_seconds"] == 8.0
    assert hook["silent"] is False
    assert hook["voiceover_text"].startswith("Your laptop is lying")
    assert hook["transition_in"] == "cut"


def test_silent_marker_clears_voiceover():
    scenes, _, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    card = scenes[1]
    assert card["silent"] is True
    assert card["voiceover_text"] == ""
    assert card["script_text"] == "Full-bleed title."


def test_voiceover_wraps_across_lines():
    scenes, _, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    assert scenes[2]["voiceover_text"] == (
        "Here is the trick. The kernel is\njust a scheduler with good PR."
    )


def test_retention_tail_does_not_leak_into_last_scene():
    scenes, _, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    last = scenes[-1]
    assert "Pattern Interrupt Log" not in last["voiceover_text"]
    assert "Retention Risk Map" not in last["script_text"]


def test_missing_voiceover_is_an_error():
    text = "## Scene 1: Broken (~5s)\n**Script:** visuals only.\n"
    _, errors, _ = pipeline.parse_script_md(text)
    assert any("missing '**Voiceover:**'" in e for e in errors)


def test_empty_voiceover_is_an_error():
    text = "## Scene 1: Blank (~5s)\n**Script:** x\n**Voiceover:**\n"
    _, errors, _ = pipeline.parse_script_md(text)
    assert any("empty Voiceover" in e for e in errors)


def test_non_contiguous_ids_are_an_error():
    text = (
        "## Scene 1: A (~5s)\n**Script:** x\n**Voiceover:** one.\n"
        "## Scene 3: B (~5s)\n**Script:** y\n**Voiceover:** two.\n"
    )
    _, errors, _ = pipeline.parse_script_md(text)
    assert any("must run 1..2 in order" in e for e in errors)


def test_no_scene_headings_is_an_error():
    _, errors, _ = pipeline.parse_script_md("# Script: Demo\n\nNo scenes here.\n")
    assert any("no scene headings found" in e for e in errors)


def test_project_preserves_render_and_beats_state():
    parsed, _, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    existing = {
        "video_title": "demo",
        "scenes": [
            {
                "id": 1,
                "voiceover_text": parsed[0]["voiceover_text"],
                "actual_duration_seconds": 7.9,
                "actual_duration_frames": 237,
                "render_status": "rendered",
                "render_hash": "abc123",
                "voiceover_hash": "vo1",
                "voiceover_file": "voiceover/scene_01.mp3",
                "beats": [{"name": "punch", "at": 1.2}],
                "sfx": [{"cue": "thud"}],
                "bgm": {"track": "neon_drop", "volume": 0.3},
                "visual_notes": "keep the rack shot",
            },
        ],
    }
    scenes, changed = pipeline.project_scenes(parsed, existing)
    first = scenes[0]
    assert changed == []
    assert first["render_status"] == "rendered"
    assert first["render_hash"] == "abc123"
    assert first["actual_duration_frames"] == 237
    assert first["voiceover_hash"] == "vo1"
    assert first["beats"] == [{"name": "punch", "at": 1.2}]
    assert first["bgm"] == {"track": "neon_drop", "volume": 0.3}
    assert first["visual_notes"] == "keep the rack shot"


def test_project_invalidates_audio_when_text_changes():
    parsed, _, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    existing = {
        "scenes": [{
            "id": 1,
            "voiceover_text": "An older line of narration.",
            "actual_duration_seconds": 5.0,
            "actual_duration_frames": 150,
            "voiceover_hash": "stale",
            "voiceover_file": "voiceover/scene_01.mp3",
            "render_status": "rendered",
        }],
    }
    scenes, changed = pipeline.project_scenes(parsed, existing)
    first = scenes[0]
    assert changed == [1]
    assert first["voiceover_hash"] is None
    assert first["voiceover_file"] is None
    assert first["actual_duration_frames"] is None
    # Render status is orchestrator-owned: never reset by a projection.
    assert first["render_status"] == "rendered"


def test_force_drops_preserved_state():
    parsed, _, _ = pipeline.parse_script_md(GOOD_SCRIPT)
    existing = {"scenes": [{"id": 1, "render_status": "rendered",
                            "render_hash": "abc", "beats": [{"a": 1}]}]}
    scenes, _ = pipeline.project_scenes(parsed, existing, force=True)
    assert scenes[0]["render_status"] == "pending"
    assert scenes[0]["beats"] == []
    assert "render_hash" not in scenes[0]


def _fake_project(tmp_path, monkeypatch, script_text, scenes_payload=None):
    vdir = tmp_path / "videos" / "demo"
    vdir.mkdir(parents=True)
    (vdir / "SCRIPT.md").write_text(script_text, encoding="utf-8")
    payload = scenes_payload or {
        "video_title": "demo", "fps": 30, "width": 1920, "height": 1080,
        "created_at": "2026-01-01T00:00:00Z", "style": None,
        "scenes": [], "total_estimated_seconds": 0, "total_actual_seconds": 0,
    }
    (vdir / "scenes.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    monkeypatch.setattr(pipeline, "video_dir", lambda title: vdir)
    monkeypatch.setattr(pipeline, "scenes_json_path", lambda title: vdir / "scenes.json")
    return vdir


def test_cmd_writes_scenes_json(tmp_path, monkeypatch):
    vdir = _fake_project(tmp_path, monkeypatch, GOOD_SCRIPT)
    args = argparse.Namespace(title="demo", dry_run=False, force=False)
    pipeline.cmd_scenes_from_script(args)

    data = json.loads((vdir / "scenes.json").read_text(encoding="utf-8"))
    assert len(data["scenes"]) == 3
    assert data["total_estimated_seconds"] == pytest.approx(23.5)
    assert data["video_title"] == "demo"
    assert data["fps"] == 30  # scaffold keys preserved
    assert data["scenes"][1]["silent"] is True


def test_cmd_dry_run_writes_nothing(tmp_path, monkeypatch):
    vdir = _fake_project(tmp_path, monkeypatch, GOOD_SCRIPT)
    before = (vdir / "scenes.json").read_text(encoding="utf-8")
    args = argparse.Namespace(title="demo", dry_run=True, force=False)
    pipeline.cmd_scenes_from_script(args)
    assert (vdir / "scenes.json").read_text(encoding="utf-8") == before


def test_cmd_refuses_broken_script(tmp_path, monkeypatch):
    vdir = _fake_project(tmp_path, monkeypatch, "## Scene 1: No voiceover (~5s)\n")
    args = argparse.Namespace(title="demo", dry_run=False, force=False)
    with pytest.raises(SystemExit) as exc:
        pipeline.cmd_scenes_from_script(args)
    assert exc.value.code == 1


# RESEARCH.md gate (Step 2) ------------------------------------------------

def _research(tmp_path, text):
    (tmp_path / "RESEARCH.md").write_text(text, encoding="utf-8")
    return tmp_path


STUB_RESEARCH = """\
# Research: Demo

Short notes.
"""

GOOD_RESEARCH = """\
# Research: Demo

## Angle
A short, specific promise about kernels that fills about eight minutes.

## Key Claims
- The kernel schedules processes - [1]
- Context switches are not free - [2]
- Userspace cannot touch hardware directly - [3]

## Numbers
- 1000 context switches per second per core is typical - [2]

## Sources
1. https://example.com/kernel
2. https://example.org/scheduling
3. https://example.net/context-switches
"""


def test_research_gate_rejects_missing_file(tmp_path):
    errors = validate.check_research_md(tmp_path)
    assert any("RESEARCH.md not found" in e for e in errors)


def test_research_gate_rejects_stub(tmp_path):
    errors = validate.check_research_md(_research(tmp_path, STUB_RESEARCH))
    assert any("too thin" in e for e in errors)
    assert any("Key Claims" in e for e in errors)
    assert any("Sources" in e for e in errors)


def test_research_gate_rejects_thin_source_list(tmp_path):
    text = GOOD_RESEARCH.replace(
        "3. https://example.net/context-switches\n", "")
    errors = validate.check_research_md(_research(tmp_path, text))
    assert any("distinct" in e and "URL" in e for e in errors)


def test_research_gate_accepts_full_research(tmp_path):
    assert validate.check_research_md(_research(tmp_path, GOOD_RESEARCH)) == []


def test_step2_requirements_include_research_gate(tmp_path):
    (tmp_path / "RESEARCH.md").write_text(STUB_RESEARCH, encoding="utf-8")
    errors = validate.check_step_requirements(tmp_path, {"scenes": []}, 2)
    assert any("Key Claims" in e for e in errors)


def test_step3_does_not_re_gate_legacy_projects(tmp_path):
    # Projects that predate RESEARCH.md must still be able to run the Step-3
    # lint loop (`validate --step 3 --strict`) on their existing artifacts.
    errors = validate.check_step_requirements(tmp_path, {"scenes": []}, 3)
    assert not any("RESEARCH.md" in e for e in errors)


def test_research_md_is_a_declared_step2_artifact():
    import _pipeline_lib as pl
    assert pl.EXPECTED_ARTIFACTS["2_research"] == ["RESEARCH.md"]
    assert "2_research" not in pl.UNVALIDATED_CREATIVE_STEPS
