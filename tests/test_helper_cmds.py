"""Unit tests for pipeline.py's transcript + logs slicer subcommands.

These exist to keep agent context small: per-scene word timings and bounded
log tails instead of whole-file reads of 100+ KB artifacts.
"""
import argparse
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pipeline  # noqa: E402
import _pipeline_lib as pl  # noqa: E402


def _vdir(tmp_path):
    vdir = tmp_path / "videos" / "demo"
    (vdir / "logs").mkdir(parents=True)
    return vdir


def _write_timings(vdir):
    data = {
        "video_title": "demo",
        "fps": 30,
        "scenes": [
            {"id": 1, "text": "hello world", "duration": 2.0,
             "padded_duration": 2.0, "global_start": 0.0, "source": "aligned",
             "words": [
                 {"w": "hello", "start": 0.0, "end": 0.5,
                  "start_frame": 0, "end_frame": 15},
                 {"w": "world", "start": 0.5, "end": 1.0,
                  "start_frame": 15, "end_frame": 30},
             ]},
            {"id": 2, "text": "no timings", "duration": 1.0,
             "padded_duration": 1.0, "global_start": 2.0, "source": "estimated",
             "words": []},
        ],
    }
    (vdir / "voiceover_timings.json").write_text(json.dumps(data), encoding="utf-8")


# ---------------------------------------------------------------------------
# transcript
# ---------------------------------------------------------------------------

def test_transcript_prints_one_scene_only(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    vdir = _vdir(tmp_path)
    _write_timings(vdir)
    pipeline.cmd_transcript(argparse.Namespace(title="demo", scene=1))
    out = capsys.readouterr().out
    assert "hello | 0.0 | 0.5 | 0-15" in out
    assert "world | 0.5 | 1.0 | 15-30" in out
    assert "aligned" in out
    assert "no timings" not in out  # scene 2 must not leak in


def test_transcript_estimated_scene_has_no_words(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    vdir = _vdir(tmp_path)
    _write_timings(vdir)
    pipeline.cmd_transcript(argparse.Namespace(title="demo", scene=2))
    out = capsys.readouterr().out
    assert "estimated" in out


def test_transcript_missing_scene_exits_2(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    vdir = _vdir(tmp_path)
    _write_timings(vdir)
    with pytest.raises(SystemExit) as e:
        pipeline.cmd_transcript(argparse.Namespace(title="demo", scene=99))
    assert e.value.code == 2


def test_transcript_missing_file_exits_2(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _vdir(tmp_path)
    with pytest.raises(SystemExit) as e:
        pipeline.cmd_transcript(argparse.Namespace(title="demo", scene=1))
    assert e.value.code == 2


# ---------------------------------------------------------------------------
# logs
# ---------------------------------------------------------------------------

def test_logs_prints_bounded_tail(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    vdir = _vdir(tmp_path)
    (vdir / "logs" / "step-9-scene-4.log").write_text(
        "\n".join(f"line {i}" for i in range(100)), encoding="utf-8")
    pipeline.cmd_logs(argparse.Namespace(title="demo", step=9, scene=4, tail=5))
    out = capsys.readouterr().out
    assert "95 earlier lines omitted" in out
    assert "line 99" in out
    assert "line 0\n" not in out


def test_logs_step_level_file(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    vdir = _vdir(tmp_path)
    (vdir / "logs" / "step-6.log").write_text("a\nb\n", encoding="utf-8")
    pipeline.cmd_logs(argparse.Namespace(title="demo", step=6, scene=None, tail=30))
    out = capsys.readouterr().out
    assert "a" in out and "b" in out
    assert "omitted" not in out


def test_logs_missing_file_exits_2(tmp_path, monkeypatch):
    monkeypatch.setattr(pl, "REPO_ROOT", tmp_path)
    _vdir(tmp_path)
    with pytest.raises(SystemExit) as e:
        pipeline.cmd_logs(argparse.Namespace(title="demo", step=9, scene=1, tail=5))
    assert e.value.code == 2
