"""Retention/log/config-guard regression tests (Fix 1/3/4 batch).

Covers: duplicate-JSON-key guard, log pruning semantics
(keep_last_n_log_runs), size-rotation at log open (max_log_size_mb).
"""
import json
import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import _pipeline_lib as pl  # noqa: E402


# ---------------------------------------------------------------------------
# Duplicate JSON key guard
# ---------------------------------------------------------------------------

def test_load_json_strict_rejects_duplicate_keys(tmp_path):
    p = tmp_path / "c.json"
    p.write_text('{"a": 1, "a": 2}', encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate key 'a'"):
        pl._load_json_strict(p)


def test_load_json_strict_accepts_unique_keys(tmp_path):
    p = tmp_path / "c.json"
    p.write_text('{"a": 1, "b": {"a": 2}}', encoding="utf-8")
    assert pl._load_json_strict(p) == {"a": 1, "b": {"a": 2}}


def test_load_config_rejects_dup_key_in_per_video_config(tmp_path):
    vdir = tmp_path / "vid"
    vdir.mkdir()
    # Inner dup (like the retention.true/false bug that shipped silently)
    (vdir / "pipeline_config.json").write_text(
        '{"retention": {"keep_versions": 2, "keep_versions": 9}}',
        encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate key 'keep_versions'"):
        pl.load_config(video_dir=vdir)


def test_validate_file_reports_duplicate_keys(tmp_path):
    import validate
    p = tmp_path / "state.json"
    p.write_text('{"video_title": "a", "video_title": "b"}', encoding="utf-8")
    schema = Path(__file__).resolve().parent.parent / "schemas" / \
        "pipeline_state.schema.json"
    errors = validate.validate_file(p, schema)
    assert any("duplicate key 'video_title'" in e for e in errors), errors


# ---------------------------------------------------------------------------
# prune_logs (keep_last_n_log_runs)
# ---------------------------------------------------------------------------

def _mk_log(logs: Path, name: str, mtime: float, body: str = "x\n"):
    f = logs / name
    f.write_text(body, encoding="utf-8")
    os.utime(f, (mtime, mtime))
    return f


def _mk_state(vdir: Path, statuses: dict):
    steps = {k: {"status": "pending"} for k in pl.STEP_KEYS}
    for num, status in statuses.items():
        steps[pl.STEP_KEYS[num - 1]]["status"] = status
    (vdir / "pipeline_state.json").write_text(
        json.dumps({"video_title": "t", "current_step": 1, "steps": steps}),
        encoding="utf-8")


def _mk_video(tmp_path):
    vdir = tmp_path / "vid"
    logs = vdir / "logs"
    logs.mkdir(parents=True)
    _mk_state(vdir, {n: "complete" for n in range(1, 14)})
    return vdir, logs


def test_prune_keeps_main_logs_and_newest_aux(tmp_path):
    vdir, logs = _mk_video(tmp_path)
    base = 1_000_000.0
    main = _mk_log(logs, "step-5.log", base)
    old_aux = [_mk_log(logs, f"step-9-scene-{i}.log", base + i) for i in range(5)]
    deleted = pl.prune_logs(vdir, keep_last_n=2)
    assert main.exists(), "main step log must never be pruned"
    remaining = sorted(f.name for f in logs.glob("step-9-scene-*.log"))
    assert remaining == ["step-9-scene-3.log", "step-9-scene-4.log"]
    assert len(deleted) == 3
    assert {p.name for p, _ in deleted} == {
        "step-9-scene-0.log", "step-9-scene-1.log", "step-9-scene-2.log"}
    assert all(sz > 0 for _, sz in deleted)
    # old_aux referenced so linters see them
    assert len(old_aux) == 5


def test_prune_protects_current_invocation(tmp_path):
    vdir, logs = _mk_video(tmp_path)
    now = time.time()
    for i in range(4):
        _mk_log(logs, f"step-9-scene-{i}.log", now - 10_000 + i)
    fresh = _mk_log(logs, "step-9-scene-99.log", now)
    deleted = pl.prune_logs(vdir, keep_last_n=1, protect_since=now - 1)
    assert fresh.exists(), "logs written by the current run must survive"
    assert fresh.name not in {p.name for p, _ in deleted}
    # budget of 1 keeps the newest of the unprotected ones
    assert sum(1 for i in range(4)
               if (logs / f"step-9-scene-{i}.log").exists()) == 1


def test_prune_protects_failed_steps(tmp_path):
    vdir, logs = _mk_video(tmp_path)
    base = 1_000_000.0
    _mk_state(vdir, {n: "complete" for n in range(1, 14)})
    steps = json.loads((vdir / "pipeline_state.json").read_text())
    steps["steps"]["9_scene_rendering"]["status"] = "failed"
    (vdir / "pipeline_state.json").write_text(json.dumps(steps), encoding="utf-8")
    for i in range(4):
        _mk_log(logs, f"step-9-scene-{i}.log", base + i)
    for i in range(2):
        _mk_log(logs, f"step-13-scene-{i}.log", base + 100 + i)
    deleted = pl.prune_logs(vdir, keep_last_n=1)
    deleted_names = {p.name for p, _ in deleted}
    assert not any(n.startswith("step-9-scene") for n in deleted_names), \
        "logs of a failed step must never be pruned"
    assert deleted_names == {"step-13-scene-0.log"}


def test_prune_disabled_when_keep_zero(tmp_path):
    vdir, logs = _mk_video(tmp_path)
    for i in range(5):
        _mk_log(logs, f"step-9-scene-{i}.log", 1_000_000.0 + i)
    assert pl.prune_logs(vdir, keep_last_n=0) == []
    assert len(list(logs.glob("*.log"))) == 5


def test_prune_treats_rotated_archives_as_aux(tmp_path):
    vdir, logs = _mk_video(tmp_path)
    base = 1_000_000.0
    main = _mk_log(logs, "step-5.log", base + 1000)
    # .1 is the most recent rotation (rotate_log_if_needed writes new
    # archives at .1), so it must win the keep budget.
    for i in range(3):
        _mk_log(logs, f"step-5.log.{i + 1}", base + (3 - i))
    deleted = pl.prune_logs(vdir, keep_last_n=1)
    assert main.exists()
    assert (logs / "step-5.log.1").exists()
    assert not (logs / "step-5.log.2").exists()
    assert not (logs / "step-5.log.3").exists()
    assert len(deleted) == 2


# ---------------------------------------------------------------------------
# max_log_size_mb rotation at run_cmd open
# ---------------------------------------------------------------------------

def test_run_cmd_rotates_oversized_log_at_open(tmp_path):
    logs = tmp_path / "logs"
    logs.mkdir()
    logp = logs / "step-5.log"
    logp.write_text("OLD RUN CONTENT\n" * 50, encoding="utf-8")
    cfg = {"retention": {"max_log_size_mb": 0.00001, "keep_last_n_log_runs": 2}}
    cfg_path = tmp_path / "override.json"
    cfg_path.write_text(json.dumps(cfg), encoding="utf-8")
    pl.set_config_override(cfg_path)
    try:
        pl.run_cmd([sys.executable, "-c", "print('new run')"], logpath=logp)
    finally:
        pl.set_config_override(None)
    assert (logs / "step-5.log.1").exists(), "old run should be archived"
    assert "OLD RUN CONTENT" in (logs / "step-5.log.1").read_text(encoding="utf-8")
    current = logp.read_text(encoding="utf-8")
    assert "new run" in current
    assert "OLD RUN CONTENT" not in current


def test_run_cmd_skips_rotation_when_disabled(tmp_path):
    logp = tmp_path / "step-5.log"
    logp.write_text("KEEP ME\n", encoding="utf-8")
    pl.run_cmd([sys.executable, "-c", "print('hi')"], logpath=logp)
    assert not (tmp_path / "step-5.log.1").exists()
    assert "KEEP ME" in logp.read_text(encoding="utf-8")
