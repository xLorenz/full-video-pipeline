"""Unit tests for pipeline.py's pure state-machine helpers.

pipeline.py is imported with PIPELINE_FORCE_NON_POSIX=1 (set in conftest)
so the module-level Linux guard does not sys.exit(2) on import.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pipeline  # noqa: E402
import _pipeline_lib as pl  # noqa: E402


def _state(statuses: dict) -> dict:
    """Build a minimal state dict; statuses maps step number -> status."""
    state = {"video_title": "demo", "current_step": 1, "steps": {}}
    for i, key in enumerate(pl.STEP_KEYS, start=1):
        state["steps"][key] = {"status": statuses.get(i, "pending")}
    return state


def test_find_next_step_starts_at_first_pending():
    n, key = pipeline.find_next_step(_state({}))
    assert (n, key) == (1, pl.STEP_KEYS[0])


def test_find_next_step_skips_completed_prefix():
    st = _state({1: "complete", 2: "complete", 3: "complete"})
    n, key = pipeline.find_next_step(st)
    assert (n, key) == (4, pl.STEP_KEYS[3])


def test_find_next_step_returns_failed_before_pending():
    st = _state({1: "complete", 2: "complete", 3: "complete", 4: "complete",
                 5: "failed", 6: "pending"})
    n, key = pipeline.find_next_step(st)
    assert (n, key) == (5, pl.STEP_KEYS[4])


def test_find_next_step_revisits_gaps_before_pointer():
    # Gaps before current_step are revisited (force-gaps must not be skipped).
    st = _state({1: "complete", 2: "complete", 3: "complete", 4: "complete",
                 5: "in_progress", 6: "pending"})
    st["current_step"] = 6
    n, key = pipeline.find_next_step(st)
    assert (n, key) == (5, pl.STEP_KEYS[4])


def test_find_next_step_all_complete():
    st = _state({i: "complete" for i in range(1, 14)})
    assert pipeline.find_next_step(st) == (None, None)


def test_phase_mapping_covers_all_steps_exactly_once():
    seen = []
    for info in pl.PHASES.values():
        seen.extend(info["steps"])
    assert sorted(seen) == list(range(1, len(pl.STEP_KEYS) + 1))


@pytest.mark.parametrize("step_key,phase", [
    ("1_topic_selection", 1), ("3_script_writing", 1),
    ("4_voiceover_writing", 2), ("6_duration_measurement", 2),
    ("7_style_definition", 3), ("10_stitching", 3),
    ("11_metadata_generation", 4), ("13_thumbnail_rendering", 4),
])
def test_phase_for_step(step_key, phase):
    got, anchor = pl._phase_for_step(step_key)
    assert got == phase
    assert anchor.startswith("#phase-")


def test_phase_for_step_unknown():
    assert pl._phase_for_step("bogus") == (0, "")
    assert pl._phase_for_step("") == (0, "")


def test_creative_vs_automated_partition():
    automated = {pl.STEP_KEYS.index(k) + 1 for k in pl.AUTOMATED_STEPS}
    assert sorted(automated) == [5, 6, 9, 10, 13]
    creative = {pl.STEP_KEYS.index(k) + 1 for k in pl.CREATIVE_STEPS}
    assert sorted(creative) == [1, 2, 3, 4, 7, 8, 11, 12]
    assert not (automated & creative)


def test_expected_artifacts_declared_for_every_validated_creative_step():
    for key in pl.CREATIVE_STEPS - pl.UNVALIDATED_CREATIVE_STEPS:
        assert pl.EXPECTED_ARTIFACTS.get(key), f"missing artifacts for {key}"


def test_trailer_emits_parseable_json(capsys):
    pl.emit_trailer(8, "8_remotion_coding", "await_complete", 0,
                    next_cmd="python3 pipeline.py complete demo")
    line = capsys.readouterr().out.strip().splitlines()[-1]
    assert line.startswith("__PIPELINE_NEXT__ ")
    payload = json.loads(line[len("__PIPELINE_NEXT__ "):])
    assert payload["step"] == 8
    assert payload["kind"] == "creative"
    assert payload["phase"] == 3
    assert "expected_artifacts" in payload


def _write_state(tmp_path, statuses, current_step=7):
    vdir = tmp_path / "videos" / "demo"
    vdir.mkdir(parents=True, exist_ok=True)
    state = {"video_title": "demo", "current_step": current_step, "steps": {}}
    for i, key in enumerate(pl.STEP_KEYS, start=1):
        state["steps"][key] = {"status": statuses.get(i, "pending"), "attempts": 2}
    (vdir / "pipeline_state.json").write_text(json.dumps(state))
    return state


def _args(step):
    return type("Args", (), {"title": "demo", "step": step})()


def test_redo_resets_step_and_dependents(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_state(tmp_path, {1: "complete", 2: "complete", 3: "complete",
                             4: "complete", 5: "complete", 6: "complete"})
    pipeline.cmd_redo(_args(5))
    out = capsys.readouterr().out
    assert "Reset Step 5" in out and "Reset Step 6" in out
    state = pl.load_state("demo")
    assert state["steps"]["5_voiceover_generation"]["status"] == "pending"
    assert state["steps"]["6_duration_measurement"]["status"] == "pending"
    assert state["steps"]["5_voiceover_generation"]["attempts"] == 2
    assert "redo" in state["steps"]["5_voiceover_generation"]["last_error"]
    # untouched steps keep status
    assert state["steps"]["4_voiceover_writing"]["status"] == "complete"
    n, key = pipeline.find_next_step(state)
    assert (n, key) == (5, "5_voiceover_generation")


def test_redo_refuses_creative_step(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_state(tmp_path, {3: "complete"})
    with pytest.raises(SystemExit) as e:
        pipeline.cmd_redo(_args(3))
    assert e.value.code == 2
    assert pl.load_state("demo")["steps"]["3_script_writing"]["status"] == "complete"


def test_redo_noop_when_not_complete(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_state(tmp_path, {})
    pipeline.cmd_redo(_args(5))
    assert "nothing to reset" in capsys.readouterr().out.lower()


def test_redo_rejects_out_of_range(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_state(tmp_path, {})
    with pytest.raises(SystemExit) as e:
        pipeline.cmd_redo(_args(99))
    assert e.value.code == 2


def _write_scenes(tmp_path, ids):
    vdir = tmp_path / "videos" / "demo"
    vdir.mkdir(parents=True, exist_ok=True)
    scenes = [{"id": i, "title": f"s{i}"} for i in ids]
    (vdir / "scenes.json").write_text(json.dumps(
        {"video_title": "demo", "fps": 30, "width": 1920, "height": 1080,
         "scenes": scenes}))


def test_regen_scene_map_all_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_scenes(tmp_path, [1, 2, 3])
    vdir = tmp_path / "videos" / "demo"
    ok, msg = pipeline.regen_scene_map(vdir, "demo")
    assert ok
    text = (vdir / "remotion" / "src" / "scenes" / "SceneMap.generated.ts").read_text()
    assert "Scene01" in text and "Scene03" in text and "2: Scene02" in text


def test_regen_scene_map_only_existing(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_scenes(tmp_path, [1, 2])
    vdir = tmp_path / "videos" / "demo"
    (vdir / "remotion" / "src" / "scenes").mkdir(parents=True, exist_ok=True)
    (vdir / "remotion" / "src" / "scenes" / "Scene01.tsx").write_text("x")
    ok, msg = pipeline.regen_scene_map(vdir, "demo", only_existing=True)
    assert ok
    text = (vdir / "remotion" / "src" / "scenes" / "SceneMap.generated.ts").read_text()
    assert "Scene01" in text and "Scene02" not in text


def test_regen_scene_map_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _write_scenes(tmp_path, [])
    vdir = tmp_path / "videos" / "demo"
    ok, msg = pipeline.regen_scene_map(vdir, "demo")
    assert not ok and "no scenes" in msg


def test_load_state_backfills_missing_step_keys(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    vdir = tmp_path / "videos" / "demo"
    vdir.mkdir(parents=True)
    (vdir / "pipeline_state.json").write_text(json.dumps(
        {"video_title": "demo", "current_step": 2,
         "steps": {pl.STEP_KEYS[0]: {"status": "complete"}}}))
    state = pl.load_state("demo")
    assert len(state["steps"]) == len(pl.STEP_KEYS)
    assert state["steps"][pl.STEP_KEYS[1]] == {"status": "pending"}
