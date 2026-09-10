"""Unit tests for render_scene.py --quiet plumbing.

Quiet mode keeps the per-scene console output to header + errors + summary;
everything else goes log-file-only (no duplication with run_cmd's tee,
which only sees this process's stdout).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import render_scene as rs  # noqa: E402


def test_split_quiet_flag_strips_anywhere():
    pos, quiet = rs.split_quiet_flag(["render_scene.py", "vdir", "4", "--quiet"])
    assert pos == ["render_scene.py", "vdir", "4"]
    assert quiet is True


def test_split_quiet_flag_absent_by_default():
    pos, quiet = rs.split_quiet_flag(["render_scene.py", "vdir", "4"])
    assert pos == ["render_scene.py", "vdir", "4"]
    assert quiet is False


def test_emitter_verbose_prints_and_logs(tmp_path, capsys):
    log = tmp_path / "s.log"
    emit = rs.make_emitter(False, log)
    emit("hello")
    assert "hello" in capsys.readouterr().out
    assert "hello" in log.read_text(encoding="utf-8")


def test_emitter_quiet_logs_only(tmp_path, capsys):
    log = tmp_path / "s.log"
    emit = rs.make_emitter(True, log)
    emit("detail")
    assert "detail" not in capsys.readouterr().out
    assert "detail" in log.read_text(encoding="utf-8")
