import os
import sys
from pathlib import Path
import subprocess
import tempfile

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import _pipeline_lib as pl  # noqa: E402


# ---------------------------------------------------------------------------
# shell_quote_arg — per-platform quoting
# ---------------------------------------------------------------------------

def test_shell_quote_simple_stays_unquoted():
    assert pl.shell_quote_arg("hello") == "hello"
    assert pl.shell_quote_arg("en-GB-RyanNeural") == "en-GB-RyanNeural"


def test_shell_quote_spaces_get_quoted():
    quoted = pl.shell_quote_arg("hello world")
    # Must not contain an unquoted space — it would split into two args.
    if os.name == "nt":
        assert quoted.startswith('"') and quoted.endswith('"')
        assert "hello world" in quoted
    else:
        assert quoted.startswith("'") and quoted.endswith("'")


def test_shell_quote_roundtrip_posix(monkeypatch):
    # Force POSIX quoting even on Windows to test shlex semantics.
    monkeypatch.setattr(os, "name", "posix")
    import shlex

    for val in ["a b", "a\tb", "a\"b"]:
        q = pl.shell_quote_arg(val)
        assert shlex.split(q) == [val]


# ---------------------------------------------------------------------------
# resolve_gl_backend
# ---------------------------------------------------------------------------

def test_resolve_gl_backend_auto_per_platform(monkeypatch):
    monkeypatch.setattr(pl.sys, "platform", "linux")
    assert pl.resolve_gl_backend({}) == "swangle"
    assert pl.resolve_gl_backend({"render": {"gl_backend": "auto"}}) == "swangle"

    monkeypatch.setattr(pl.sys, "platform", "win32")
    assert pl.resolve_gl_backend({}) == "angle"
    assert pl.resolve_gl_backend({"render": {"gl_backend": "auto"}}) == "angle"

    monkeypatch.setattr(pl.sys, "platform", "darwin")
    assert pl.resolve_gl_backend({}) == "angle"


def test_resolve_gl_backend_explicit_pin_wins(monkeypatch):
    monkeypatch.setattr(pl.sys, "platform", "linux")
    assert pl.resolve_gl_backend({"render": {"gl_backend": "angle"}}) == "angle"
    monkeypatch.setattr(pl.sys, "platform", "win32")
    assert pl.resolve_gl_backend({"render": {"gl_backend": "swangle"}}) == "swangle"


# ---------------------------------------------------------------------------
# resolve_tmpdir
# ---------------------------------------------------------------------------

def test_resolve_tmpdir_custom_template():
    cfg = {"system": {"temp_dir": "/tmp/remotion/{title}"}}
    assert pl.resolve_tmpdir(cfg, "my-video") == Path("/tmp/remotion/my-video")


def test_resolve_tmpdir_auto_uses_os_temp(monkeypatch, tmp_path):
    monkeypatch.setattr(pl.tempfile, "gettempdir", lambda: str(tmp_path))
    p = pl.resolve_tmpdir({}, "demo")
    assert p == tmp_path / "remotion" / "demo"


def test_resolve_tmpdir_auto_empty_title(monkeypatch, tmp_path):
    monkeypatch.setattr(pl.tempfile, "gettempdir", lambda: str(tmp_path))
    p = pl.resolve_tmpdir({}, "")
    assert p == tmp_path / "remotion"


# ---------------------------------------------------------------------------
# apply_render_env
# ---------------------------------------------------------------------------

def test_apply_render_env_sets_all_vars(monkeypatch, tmp_path):
    monkeypatch.delenv("TMPDIR", raising=False)
    monkeypatch.delenv("TEMP", raising=False)
    monkeypatch.delenv("TMP", raising=False)
    monkeypatch.delenv("REMOTION_TMPDIR", raising=False)
    pl.apply_render_env(tmp_path)
    assert os.environ["TMPDIR"] == str(tmp_path)
    assert os.environ["TEMP"] == str(tmp_path)
    assert os.environ["TMP"] == str(tmp_path)
    assert os.environ["REMOTION_TMPDIR"] == str(tmp_path)


# ---------------------------------------------------------------------------
# init_console — must not crash even with odd streams
# ---------------------------------------------------------------------------

def test_init_console_idempotent():
    pl.init_console()
    pl.init_console()  # second call must not crash


# ---------------------------------------------------------------------------
# atomic_replace — retry on PermissionError (Windows AV lock)
# ---------------------------------------------------------------------------

def test_atomic_replace_retries_permission_error(monkeypatch, tmp_path):
    src = tmp_path / "a.tmp"
    dst = tmp_path / "b.json"
    src.write_text("hello")
    calls = {"n": 0}
    real_replace = os.replace

    def flaky(src_, dst_):
        calls["n"] += 1
        if calls["n"] == 1:
            raise PermissionError("simulated AV lock")
        return real_replace(src_, dst_)

    monkeypatch.setattr(os, "replace", flaky)
    pl.atomic_replace(src, dst)
    assert dst.read_text() == "hello"
    assert calls["n"] == 2


def test_atomic_replace_succeeds_first_try(tmp_path):
    src = tmp_path / "a.tmp"
    dst = tmp_path / "b.json"
    src.write_text("x")
    pl.atomic_replace(src, dst)
    assert dst.read_text() == "x"


# ---------------------------------------------------------------------------
# run_cmd — list joining + child env
# ---------------------------------------------------------------------------

def test_run_cmd_list_join_executes():
    # sys.executable -c is portable on both platforms; list join must work.
    r = pl.run_cmd([sys.executable, "-c", "print('ok')"], check=False)
    assert r.returncode == 0
    assert "ok" in r.stdout.decode()
