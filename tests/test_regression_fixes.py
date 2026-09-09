"""Regression tests for audit fixes (stdlib-only, no numpy)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import _pipeline_lib as pl


def test_atomic_write_uses_unique_tmp(tmp_path):
    p = tmp_path / "state.json"
    pl._atomic_write_json(p, {"a": 1})
    pl._atomic_write_json(p, {"a": 2})
    assert json.loads(p.read_text()) == {"a": 2}
    # No fixed *.tmp leftover
    assert list(tmp_path.glob("*.tmp")) == []


def test_voiceover_pad_graph_n0_returns_anullsrc(tmp_path):
    inputs, graph, missing = pl.voiceover_pad_graph(tmp_path, [], 30)
    assert inputs == []
    assert "anullsrc" in graph


def test_voiceover_pad_graph_skips_malformed():
    inputs, graph, missing = pl.voiceover_pad_graph(
        Path("/nonexistent"), [{"id": "x"}, {"foo": 1}], 30)
    assert inputs == [] and missing == []


def test_scene_hash_ignores_scenemap_and_backup(tmp_path):
    src = tmp_path / "remotion" / "src"
    (src / "scenes").mkdir(parents=True)
    (src / "lib").mkdir(parents=True)
    (src / "scenes" / "Scene01.tsx").write_text("one\n")
    (src / "scenes" / "SceneMap.generated.ts").write_text("gen1\n")
    (src / "scenes" / "Scene1backup.tsx").write_text("junk\n")
    (src / "lib" / "a.ts").write_text("shared\n")
    h1 = pl.compute_scene_render_hashes(tmp_path)
    assert set(h1) == {1}
    (src / "scenes" / "SceneMap.generated.ts").write_text("gen2-changed\n")
    h2 = pl.compute_scene_render_hashes(tmp_path)
    assert h2 == h1  # scenemap churn must not invalidate
    (src / "scenes" / "Scene1backup.tsx").write_text("junk2\n")
    h3 = pl.compute_scene_render_hashes(tmp_path)
    assert set(h3) == {1}  # phantom file ignored (goes to shared, but no new id)


def test_load_config_abs_path(tmp_path):
    vdir = tmp_path / "vid"
    vdir.mkdir()
    (vdir / "pipeline_config.json").write_text(json.dumps({"video": {"fps": 60}}))
    cfg = pl.load_config(video_dir=vdir)
    assert cfg["video"]["fps"] == 60
    # str abs path also works
    cfg2 = pl.load_config(video_dir=str(vdir))
    assert cfg2["video"]["fps"] == 60


def test_run_cmd_list_no_shell(tmp_path):
    # Path with spaces must survive as one argv element.
    out = tmp_path / "my file.txt"
    r = pl.run_cmd([sys.executable, "-c",
                    "import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('ok')",
                    str(out)])
    assert r.returncode == 0
    assert out.read_text() == "ok"


def test_run_cmd_list_uses_shell_on_windows(monkeypatch):
    import subprocess as _sp
    seen = {}

    def fake_run(argv, shell=False, **kw):
        seen["shell"] = shell
        seen["argv"] = argv
        class R:
            returncode = 0
            stdout = b""
        return R()

    monkeypatch.setattr(_sp, "run", fake_run)
    monkeypatch.setattr(pl.os, "name", "nt")
    pl.run_cmd(["npx", "remotion", "compositions", "src/Root.tsx"])
    assert seen["shell"] is True
    assert isinstance(seen["argv"], str)
    assert "npx" in seen["argv"]


def test_run_cmd_list_no_shell_on_posix(monkeypatch):
    import subprocess as _sp
    seen = {}

    def fake_run(argv, shell=False, **kw):
        seen["shell"] = shell
        seen["argv"] = argv
        class R:
            returncode = 0
            stdout = b""
        return R()

    monkeypatch.setattr(_sp, "run", fake_run)
    monkeypatch.setattr(pl.os, "name", "posix")
    pl.run_cmd(["npx", "remotion", "compositions", "src/Root.tsx"])
    assert seen["shell"] is False
    assert isinstance(seen["argv"], list)


def test_place_cue_tail_trim():
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import generate_sfx as g
    g.SR = 44100
    # 1s video (44100 samples), 0.5s cue starting at 0.8s -> 0.2s fits, fade applies
    seg = [1.0] * int(0.5 * 44100)
    placed = g.place_cue(44100, seg, 0.8, 0.5)
    assert placed is not None
    start, trimmed = placed
    assert start == int(round(0.8 * 44100))
    assert len(trimmed) == 44100 - start
    # Tail faded (last sample < first); fade_len > 16 so it fires
    assert trimmed[-1] < trimmed[0]
    # Fully-fitting cue unchanged
    placed2 = g.place_cue(44100 * 10, [1.0] * 10, 1.0, 0.5)
    assert list(placed2[1]) == [1.0] * 10


def test_mood_null_schema():
    schema = json.loads((Path(__file__).resolve().parent.parent /
                         "schemas" / "scenes.schema.json").read_text())
    import jsonschema
    mood_schema = schema["properties"]["scenes"]["items"]["properties"]["mood"]
    jsonschema.validate(None, mood_schema)
    jsonschema.validate("calm", mood_schema)
    with pytest.raises(Exception):
        jsonschema.validate("wild", mood_schema)


def test_pipeline_state_preview_flags_schema():
    schema = json.loads((Path(__file__).resolve().parent.parent /
                         "schemas" / "pipeline_state.schema.json").read_text())
    import jsonschema
    # Minimal valid state with preview flags
    state = {"video_title": "x", "current_step": 1,
             "animations_preview_requested": True,
             "sfx_preview_requested": False,
             "steps": {k: {"status": "pending"} for k in pl.STEP_KEYS}}
    jsonschema.validate(state, schema)


def test_find_next_step_revisits_gaps():
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import pipeline as pipe
    state = {"current_step": 5,
             "steps": {k: {"status": "complete"} for k in pl.STEP_KEYS}}
    state["steps"]["2_research"] = {"status": "pending"}
    n, k = pipe.find_next_step(state)
    assert (n, k) == (2, "2_research")
    # Unknown status surfaces instead of false-done
    state2 = {"current_step": 1,
              "steps": {k: {"status": "complete"} for k in pl.STEP_KEYS}}
    state2["steps"]["3_script_writing"] = {"status": "weird"}
    n2, k2 = pipe.find_next_step(state2)
    assert (n2, k2) == (3, "3_script_writing")


def test_root_calculate_metadata_tolerates_empty_defaults():
    root = (Path(__file__).resolve().parent.parent / "remotion-foundation"
            / "src" / "Root.tsx").read_text(encoding="utf-8")
    assert "totalFrames || 1" in root
    assert "no scenes" not in root


def test_atomic_replace_temp_preserves_extension_and_format(monkeypatch, tmp_path):
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import assemble as _asm
    seen = {}

    def fake_run(cmd, check=False):
        seen["cmd"] = cmd
        out = Path(cmd[-1])
        out.write_bytes(b"x")
        class R:
            returncode = 0
        return R()

    monkeypatch.setattr(_asm.pl, "run_cmd", fake_run)
    out = tmp_path / "voiceover_aligned.mp3"
    ok = _asm.atomic_replace_temp(out, ["ffmpeg", "-y", "-i", "a.mp3", str(out)])
    assert ok
    assert out.exists()
    # tmp kept a real extension and an explicit -f preceded it
    assert not (tmp_path / "voiceover_aligned.mp3.tmp").exists()
    cmd = seen["cmd"]
    assert cmd[-1].endswith(".tmp.mp3")
    assert "-f" in cmd and "mp3" in cmd


def test_lint_gate_passes_props_to_compositions(monkeypatch, tmp_path):
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import pipeline as pipe
    seen = {}

    def fake_run(cmd, cwd=None, check=True, logpath=None):
        seen["cmd"] = cmd
        class R:
            returncode = 0
            stdout = "MainVideo\nThumbnail\n"
        return R()

    monkeypatch.setattr(pipe, "run_cmd", fake_run)
    (tmp_path / "videos" / "demo" / "remotion").mkdir(parents=True)
    (tmp_path / "videos" / "demo" / "remotion" / "package.json").write_text("{}")
    (tmp_path / "videos" / "demo" / "scenes.json").write_text("{}")
    monkeypatch.setattr(pipe, "REPO_ROOT", Path(__file__).resolve().parent.parent)
    monkeypatch.setattr(pipe.pl, "log_path", lambda *a, **k: tmp_path / "x.log")
    monkeypatch.setattr(pipe, "load_scenes", lambda title: [
        {"id": 1, "actual_duration_frames": 30}])
    import render_scene as _rs
    monkeypatch.setattr(_rs, "build_props_json",
                        lambda *a, **k: (0, 29))
    ok, _ = pipe.lint_gate("demo", tmp_path / "videos" / "demo")
    assert ok
    assert any(str(x).startswith("--props=") for x in seen["cmd"])


def _fake_psutil_for_reaper(parent_behavior):
    """Build a strict psutil stand-in for kill_orphaned_chrome tests.

    parent_behavior: "alive" (node parent) or "dead" (NoSuchProcess).
    FakeParent.cmdline() mirrors real psutil: it accepts NO arguments, so
    any timeout= kwarg raises TypeError exactly like psutil>=5.9 does.
    """
    class _NoSuchProcess(Exception):
        pass

    class FakeParent:
        def cmdline(self):
            return ["node", "remotion-render"]

    class FakeProc:
        pid = 1234
        killed = False
        info = {"pid": 1234, "ppid": 999,
                "name": "chrome-headless-shell",
                "cmdline": ["chrome-headless-shell", "--headless"]}

        def kill(self):
            FakeProc.killed = True

        def wait(self, timeout=None):
            return 0

    class FakePsutil:
        NoSuchProcess = _NoSuchProcess
        AccessDenied = type("AccessDenied", (Exception,), {})
        TimeoutExpired = type("TimeoutExpired", (Exception,), {})
        ZombieProcess = type("ZombieProcess", (Exception,), {})

        @staticmethod
        def process_iter(attrs=None):
            FakeProc.killed = False
            return iter([FakeProc()])

        @staticmethod
        def Process(pid):
            assert pid == 999
            if parent_behavior == "dead":
                raise _NoSuchProcess(pid)
            return FakeParent()

    return FakePsutil, FakeProc


def test_kill_orphaned_chrome_cmdline_takes_no_kwargs(monkeypatch):
    """Regression: parent.cmdline(timeout=2) raised TypeError on every psutil
    version (Process.cmdline takes no kwargs) and the old except clause did
    not catch it — the reaper could abort a healthy render."""
    import render_scene as _rs
    fake_psutil, fake_proc = _fake_psutil_for_reaper("alive")
    monkeypatch.setattr(_rs, "psutil", fake_psutil)
    # Must not raise; live node parent means no orphan to reap.
    assert _rs.kill_orphaned_chrome() == 0
    assert fake_proc.killed is False


def test_kill_orphaned_chrome_reaps_dead_parent(monkeypatch):
    import render_scene as _rs
    fake_psutil, fake_proc = _fake_psutil_for_reaper("dead")
    monkeypatch.setattr(_rs, "psutil", fake_psutil)
    assert _rs.kill_orphaned_chrome() == 1
    assert fake_proc.killed is True


def _sfx_data(mood, sound):
    return {
        "style": {"mood": mood},
        "scenes": [{
            "id": 1,
            "actual_duration_seconds": 10.0,
            "beats": [{"name": "intro"}],
            "sfx": [{"sound": sound, "when": 1.0}],
        }],
    }


def test_check_sfx_neutral_fits_everywhere():
    """'neutral' sounds must not warn in any video mood (sfx-design.md,
    sfx/README.md, sfx.schema.json). Previously check_sfx demanded a
    literal mood intersection."""
    import validate as _v
    errors, warnings = _v.check_sfx(_sfx_data("serious", "tick"))
    assert errors == []
    assert not any("tick" in w and "conflicts" in w for w in warnings)


def test_check_sfx_real_conflict_still_warns():
    """Guard against overcorrection: a non-neutral sound whose moods miss
    the scene mood must still warn (siren is serious/tense, not playful)."""
    import validate as _v
    errors, warnings = _v.check_sfx(_sfx_data("playful", "siren"))
    assert errors == []
    assert any("siren" in w and "conflicts" in w for w in warnings)
