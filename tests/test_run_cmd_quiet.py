import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import _pipeline_lib as pl  # noqa: E402


def _noisy_cmd():
    """A command whose stdout mixes real lines with tool progress chatter.

    Progress text is generated with % formatting so the echoed argv line
    itself contains no progress-like literals.
    """
    code = (
        "print('hello');"
        "print('Rendered %d/339, time remaining: 28s' % 1);"
        "print('Rendered %d/339, time remaining: 12s' % 200);"
        "print('middle stays');"
        "print('Encoded %d/%d' % (339, 339));"
        "print('done')"
    )
    return [sys.executable, "-c", code]


# ---------------------------------------------------------------------------
# _is_progress_line / _collapse_progress units
# ---------------------------------------------------------------------------

def test_progress_patterns_match_tool_chatter():
    assert pl._is_progress_line("Rendered 114/339, time remaining: 28s")
    assert pl._is_progress_line("Encoded 339/339")
    assert pl._is_progress_line("Bundling code ━━━━━━╸━━━━━━ 65%")
    assert pl._is_progress_line("Getting Headless Shell - 9.5 Mb/113.3 Mb")
    assert pl._is_progress_line("frame= 104 fps=0.0 q=-1.0 size= 256KiB time=00:00:03.48")
    assert pl._is_progress_line("size= 5813KiB time=00:04:07.96 bitrate= 192.1kbits/s speed=58.8x")
    assert pl._is_progress_line("LOG (VoskAPI:ReadDataFiles():model.cc:213) Decoding params")


def test_progress_patterns_ignore_real_output():
    assert not pl._is_progress_line("Scene 1: generated scene-01.mp3 (81717 bytes, 10.40s)")
    assert not pl._is_progress_line("Bundled code 13438ms")
    assert not pl._is_progress_line("Got Headless Shell")
    assert not pl._is_progress_line("Sync gate: audio 247.97s == video timeline 247.97s")
    assert not pl._is_progress_line("")


def test_collapse_progress_keeps_last_dropped_as_summary():
    echo, collapsed, last = pl._collapse_progress(["a", "Rendered 1/3", "b", "Rendered 3/3"])
    assert echo == ["a", "b"]
    assert collapsed == 2
    assert last == "Rendered 3/3"


def test_short_cmd_truncates_long_lines():
    long_cmd = "ffmpeg " + "x" * 1000
    short = pl._short_cmd(long_cmd)
    assert len(short) < len(long_cmd)
    assert "truncated" in short
    assert pl._short_cmd("echo hi") == "echo hi"


# ---------------------------------------------------------------------------
# run_cmd integration (real subprocesses)
# ---------------------------------------------------------------------------

def test_run_cmd_collapses_progress_on_success(capsys, tmp_path):
    log = tmp_path / "out.log"
    pl.run_cmd(_noisy_cmd(), check=True, logpath=log)
    out = capsys.readouterr().out
    assert "hello" in out
    assert "middle stays" in out
    assert "done" in out
    assert "Rendered 1/339" not in out
    assert "Rendered 200/339" not in out
    assert "Encoded 339/339" in out  # last dropped line kept as summary
    assert "progress lines collapsed" in out
    # ... while the log file keeps 100% of the output
    logged = log.read_text(encoding="utf-8")
    assert "Rendered 1/339" in logged
    assert "Rendered 200/339" in logged
    assert "Encoded 339/339" in logged


def test_run_cmd_dumps_everything_on_failure(capsys):
    code = "print('Rendered %d/3' % 1); print('BOOM detail'); raise SystemExit(1)"
    with pytest.raises(pl.CmdError):
        pl.run_cmd([sys.executable, "-c", code], check=True)
    out = capsys.readouterr().out
    assert "Rendered 1/3" in out
    assert "BOOM detail" in out
    assert "collapsed" not in out


def test_run_cmd_quiet_progress_false_echoes_all(capsys):
    pl.run_cmd(_noisy_cmd(), check=True, quiet_progress=False)
    out = capsys.readouterr().out
    assert "Rendered 1/339" in out
    assert "collapsed" not in out
