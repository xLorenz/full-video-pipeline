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


# ---------------------------------------------------------------------------
# A/V sync regression: silent audio tracks in scene MP4s drifted the video
# timeline late (~1 frame/scene) vs the frame-exact voiceover/SFX, and the
# final -shortest silently amputated the tail to hide it (long videos only).
# ---------------------------------------------------------------------------

def _streams(video_dur, video_frames, audio_dur=None):
    out = [{"codec_type": "video", "codec_name": "h264",
            "width": 1920, "height": 1080, "r_frame_rate": "30/1",
            "duration": str(video_dur), "nb_frames": str(video_frames)}]
    if audio_dur is not None:
        out.append({"codec_type": "audio", "codec_name": "aac",
                    "duration": str(audio_dur)})
    return out


def test_has_audio_stream_detects_silent_track(monkeypatch):
    monkeypatch.setattr(pl, "ffprobe_streams",
                        lambda p: _streams(8.9, 267, audio_dur=8.96))
    assert pl.has_audio_stream("scene-01.mp4") is True
    monkeypatch.setattr(pl, "ffprobe_streams",
                        lambda p: _streams(8.9, 267))
    assert pl.has_audio_stream("scene-01.mp4") is False
    monkeypatch.setattr(pl, "ffprobe_streams", lambda p: None)
    assert pl.has_audio_stream("missing.mp4") is False


def test_video_stream_info_prefers_video_stream(monkeypatch):
    # Audio listed first must not be mistaken for the video stream.
    streams = list(reversed(_streams(8.9, 267, audio_dur=8.96)))
    assert streams[0]["codec_type"] == "audio"
    monkeypatch.setattr(pl, "ffprobe_streams", lambda p: streams)
    dur, nfr = pl.video_stream_info("scene-01.mp4")
    assert dur == 8.9 and nfr == 267
    monkeypatch.setattr(pl, "ffprobe_streams", lambda p: None)
    assert pl.video_stream_info("missing.mp4") == (0.0, 0)


def test_check_video_timeline_accepts_exact_match(monkeypatch):
    monkeypatch.setattr(pl, "video_stream_info", lambda p: (706.167, 21185))
    ok, detail = pl.check_video_timeline("video_only.mp4", 21185, 30)
    assert ok is True
    assert "21185" in detail


def test_check_video_timeline_catches_frame_shortfall(monkeypatch):
    # The observed failure: 21096 frames over 706.16s (frozen boundary
    # frames from silent-audio concat offsets, tail cut by -shortest).
    monkeypatch.setattr(pl, "video_stream_info", lambda p: (706.16, 21096))
    ok, detail = pl.check_video_timeline("video_only.mp4", 21185, 30)
    assert ok is False
    assert "21096" in detail and "21185" in detail


def test_check_video_timeline_catches_duration_drift(monkeypatch):
    # Right frame count but stretched durations (boundary frames held).
    monkeypatch.setattr(pl, "video_stream_info", lambda p: (709.18, 21185))
    ok, detail = pl.check_video_timeline("video_only.mp4", 21185, 30)
    assert ok is False
    assert "709.18" in detail


def test_check_video_timeline_skips_unknown_probe(monkeypatch):
    # Unprobeable file must not fail the gate on a probe hiccup.
    monkeypatch.setattr(pl, "video_stream_info", lambda p: (0.0, 0))
    ok, _ = pl.check_video_timeline("video_only.mp4", 21185, 30)
    assert ok is True


def test_voiceover_pad_graph_trims_each_chunk_to_whole_dur(tmp_path):
    # apad pads short inputs up but passes long ones through (decoded MP3s
    # overshoot via encoder padding) — the trailing atrim forces exactness.
    vo = tmp_path / "voiceover"
    vo.mkdir()
    scenes = []
    for i, frames in ((1, 267), (2, 336)):
        (vo / f"scene-{i:02d}.mp3").write_bytes(b"\xff\xfb fake mp3")
        scenes.append({"id": i, "actual_duration_frames": frames,
                       "actual_duration_seconds": round(frames / 30, 3)})
    _, graph, _ = pl.voiceover_pad_graph(vo, scenes, 30)
    for frames in (267, 336):
        dur = f"{frames / 30:.6f}"
        assert f"apad=whole_dur={dur},atrim=0:{dur}" in graph


def test_probe_scene_file_prefers_video_stream(monkeypatch):
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import assemble as _asm
    streams = list(reversed(_streams(8.9, 267, audio_dur=8.96)))
    monkeypatch.setattr(_asm.pl, "ffprobe_streams", lambda p: streams)
    info = _asm.probe_scene_file("scene-01.mp4")
    assert info["codec"] == "h264"
    assert info["width"] == 1920 and info["fps"] == "30/1"


def test_probe_scene_file_prefers_video_stream(monkeypatch):
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import assemble as _asm
    streams = list(reversed(_streams(8.9, 267, audio_dur=8.96)))
    monkeypatch.setattr(_asm.pl, "ffprobe_streams", lambda p: streams)
    info = _asm.probe_scene_file("scene-01.mp4")
    assert info["codec"] == "h264"
    assert info["width"] == 1920 and info["fps"] == "30/1"


# ---------------------------------------------------------------------------
# Silent scenes (voiceless by design: titles, cards, tension holds).
# Convention: "silent": true + empty voiceover_text + NO VOICEOVER.md block;
# durations derive from target_duration_seconds; the stitch pads anullsrc.
# ---------------------------------------------------------------------------

def _silent_scene(sid=2, target=2.5, **kw):
    d = {"id": sid, "title": f"Silent {sid}", "script_text": "visual direction",
         "voiceover_text": "", "silent": True,
         "target_duration_seconds": target,
         "actual_duration_seconds": None, "actual_duration_frames": None,
         "voiceover_file": None, "voiceover_hash": None}
    d.update(kw)
    return d


def _voiced_scene(sid=1, frames=267, seconds=8.9):
    return {"id": sid, "title": f"Voiced {sid}", "script_text": "narration",
            "voiceover_text": "spoken words here",
            "target_duration_seconds": seconds,
            "actual_duration_seconds": seconds,
            "actual_duration_frames": frames,
            "voiceover_file": f"voiceover/scene-{sid:02d}.mp3",
            "voiceover_hash": "hash"}


def test_durations_for_silent_scene_exact():
    sec, frames = pl.durations_for_silent_scene(_silent_scene(target=2.5), 30)
    assert (sec, frames) == (2.5, 75)
    sec, frames = pl.durations_for_silent_scene(_silent_scene(target=10.0), 30)
    assert (sec, frames) == (10.0, 300)
    # round(), not ceil(): exact authoring maps to the nearest frame.
    sec, frames = pl.durations_for_silent_scene(_silent_scene(target=0.05), 30)
    assert frames == 2  # 1.5 frames -> nearest (banker's: 2)


def test_durations_for_silent_scene_rejects_bad_targets():
    import pytest as _pytest
    for bad in (None, 0, -3.0, "nonsense"):
        with _pytest.raises(ValueError):
            pl.durations_for_silent_scene(_silent_scene(target=bad), 30)
    with _pytest.raises(ValueError):
        pl.durations_for_silent_scene(
            _silent_scene(target=pl.SILENT_SCENE_MAX_SECONDS + 1), 30)


def test_check_vo_blocks_vs_scenes():
    blocks = [{"id": 1, "text": "spoken"}]
    scenes = [_voiced_scene(1), _silent_scene(2)]
    assert pl.check_vo_blocks_vs_scenes(blocks, scenes) == []
    # Block for a silent scene: TTS would speak silence aloud.
    errs = pl.check_vo_blocks_vs_scenes(blocks + [{"id": 2, "text": "oops"}],
                                        scenes)
    assert any("silent" in e and "2" in e for e in errs)
    # Voiced scene without a block: fail fast here, not vaguely at Step 6.
    errs = pl.check_vo_blocks_vs_scenes([], scenes)
    assert any("1" in e and "no VOICEOVER.md block" in e for e in errs)
    # Block with no matching scene.
    errs = pl.check_vo_blocks_vs_scenes([{"id": 9, "text": "ghost"}], scenes)
    assert any("9" in e and "no matching scene" in e for e in errs)


def test_pad_graph_silent_emits_anullsrc(tmp_path):
    vo = tmp_path / "voiceover"
    vo.mkdir()
    (vo / "scene-01.mp3").write_bytes(b"\xff\xfb fake mp3")
    scenes = [_voiced_scene(1),
              dict(_silent_scene(2), actual_duration_seconds=2.5,
                   actual_duration_frames=75)]
    inputs, graph, missing = pl.voiceover_pad_graph(vo, scenes, 30)
    assert missing == []
    # Only the voiced scene consumes an -i input; silence is synthesized.
    assert len(inputs) == 2
    assert "anullsrc=r=44100:cl=mono:d=2.500000[a1];" in graph
    assert "apad=whole_dur=8.900000" in graph
    assert graph.endswith("concat=n=2:v=0:a=1[aout]")


def test_pad_graph_silent_never_counts_as_missing(tmp_path):
    vo = tmp_path / "voiceover"
    vo.mkdir()
    scenes = [_voiced_scene(1),  # MP3 absent on disk
              dict(_silent_scene(2), actual_duration_seconds=2.5,
                   actual_duration_frames=75)]
    _, _, missing = pl.voiceover_pad_graph(vo, scenes, 30)
    assert missing == [1]


def test_validate_silent_exemptions():
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import validate as _v
    vdir = Path("/nonexistent")
    silent = _silent_scene()
    # Step 3: empty voiceover_text OK when silent; target required + capped.
    assert _v.check_step_requirements(
        vdir, {"scenes": [silent]}, 3) == []
    assert any("voiceover_text" in e for e in _v.check_step_requirements(
        vdir, {"scenes": [dict(_voiced_scene(), voiceover_text="")]}, 3))
    assert any("non-empty" in e for e in _v.check_step_requirements(
        vdir, {"scenes": [dict(silent, voiceover_text="leftover")]}, 3))
    assert any("target_duration_seconds" in e for e in _v.check_step_requirements(
        vdir, {"scenes": [_silent_scene(target=0)]}, 3))
    assert any("cap" in e for e in _v.check_step_requirements(
        vdir, {"scenes": [_silent_scene(target=999)]}, 3))
    # Step 5: no file/hash required when silent; still required when voiced.
    assert _v.check_step_requirements(
        vdir, {"scenes": [silent]}, 5) == []
    assert any("voiceover_file" in e for e in _v.check_step_requirements(
        vdir, {"scenes": [dict(_voiced_scene(), voiceover_file=None)]}, 5))


def test_schema_accepts_silent_flag():
    import jsonschema
    schema = json.loads((Path(__file__).resolve().parent.parent /
                         "schemas" / "scenes.schema.json").read_text())
    scene_schema = schema["properties"]["scenes"]["items"]
    jsonschema.validate(_silent_scene(), scene_schema)
    jsonschema.validate(_voiced_scene(), scene_schema)


def _fixture_video_dir(tmp_path, scenes):
    vdir = tmp_path / "vid"
    vdir.mkdir()
    (vdir / "scenes.json").write_text(
        json.dumps({"video_title": "vid", "fps": 30, "width": 1920,
                    "height": 1080, "scenes": scenes}),
        encoding="utf-8")
    return vdir


def test_measure_durations_silent_from_target(tmp_path, monkeypatch):
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import measure_durations as _md
    import shutil as _shutil
    vdir = _fixture_video_dir(tmp_path, [_silent_scene(2, target=2.5)])
    monkeypatch.setattr(_shutil, "which", lambda *a, **k: "/bin/ffprobe")
    monkeypatch.setattr(pl, "log_path", lambda *a, **k: tmp_path / "t.log")
    monkeypatch.setattr(_sys, "argv", ["measure_durations.py", str(vdir)])
    _md.main()
    out = json.loads((vdir / "scenes.json").read_text(encoding="utf-8"))
    s = out["scenes"][0]
    assert (s["actual_duration_seconds"], s["actual_duration_frames"]) == (2.5, 75)
    assert out["total_actual_seconds"] == 2.5


def test_transcript_silent_carve_out(tmp_path, monkeypatch):
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import generate_transcript as _gt
    import validate as _v
    scenes = [dict(_silent_scene(1, target=2.5),
                   actual_duration_seconds=2.5, actual_duration_frames=75),
              dict(_silent_scene(2, target=3.0),
                   actual_duration_seconds=3.0, actual_duration_frames=90)]
    vdir = _fixture_video_dir(tmp_path, scenes)
    monkeypatch.setattr(pl, "log_path", lambda *a, **k: tmp_path / "t.log")
    monkeypatch.setattr(_sys, "argv", ["generate_transcript.py", str(vdir)])
    _gt.main()
    tj = json.loads((vdir / "voiceover_timings.json").read_text(encoding="utf-8"))
    assert [(e["id"], e["source"], e["words"]) for e in tj["scenes"]] == \
        [(1, "estimated", []), (2, "estimated", [])]
    assert [e["global_start"] for e in tj["scenes"]] == [0.0, 2.5]
    assert (vdir / "TRANSCRIPT.md").stat().st_size > 0
    # The Step 6 transcript validator accepts the wordless entries.
    data = json.loads((vdir / "scenes.json").read_text(encoding="utf-8"))
    assert _v.check_transcript(vdir, data) == []


def test_step5_all_silent_noop(tmp_path, monkeypatch):
    """Step 5 with only silent scenes synthesizes nothing and exits 0 —
    durations come from targets at Step 6."""
    import asyncio as _asyncio
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import generate_voiceover as _gv
    vdir = _fixture_video_dir(tmp_path, [_silent_scene(1, target=2.5)])
    (vdir / "VOICEOVER.md").write_text("# VOICEOVER\n", encoding="utf-8")
    monkeypatch.setattr(pl, "log_path", lambda *a, **k: tmp_path / "t.log")
    monkeypatch.setattr(_sys, "argv", ["generate_voiceover.py", str(vdir)])
    _asyncio.run(_gv.main())  # must not raise SystemExit
    assert not (vdir / "voiceover" / "scene-01.mp3").exists()


def test_step5_block_for_silent_scene_fails(tmp_path, monkeypatch, capsys):
    """A VOICEOVER block on a silent-flagged scene fails fast (would speak
    silence aloud) instead of generating TTS for it."""
    import asyncio as _asyncio
    import sys as _sys
    import pytest as _pytest
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import generate_voiceover as _gv
    vdir = _fixture_video_dir(tmp_path, [_silent_scene(1, target=2.5)])
    (vdir / "VOICEOVER.md").write_text(
        "# VOICEOVER\n---SCENE:1---\noops\n---END---\n", encoding="utf-8")
    monkeypatch.setattr(pl, "log_path", lambda *a, **k: tmp_path / "t.log")
    monkeypatch.setattr(_sys, "argv", ["generate_voiceover.py", str(vdir)])
    with _pytest.raises(SystemExit) as exc:
        _asyncio.run(_gv.main())
    assert exc.value.code == 2
    assert "silent" in capsys.readouterr().err


# ---------------------------------------------------------------------------
# .env secret loading (cloud engines, e.g. DEEPGRAM_API_KEY for deepgram).
# ---------------------------------------------------------------------------

def test_load_dotenv_manual_parses_and_never_overrides(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "# comment line\n"
        "\n"
        "DEEPGRAM_API_KEY=abc123\n"
        "QUOTED=\"hello world\"\n"
        "SINGLE='sq'\n"
        "NOT_A_LINE_WITHOUT_EQUALS\n"
        "1BAD=startswithdigit\n",
        encoding="utf-8")
    env = {"QUOTED": "keep-me"}
    assert pl._load_dotenv_manual(env_path, environ=env) is True
    assert env["DEEPGRAM_API_KEY"] == "abc123"
    assert env["QUOTED"] == "keep-me"  # existing env wins
    assert env["SINGLE"] == "sq"
    assert "NOT_A_LINE_WITHOUT_EQUALS" not in env
    assert "1BAD" not in env
    assert pl._load_dotenv_manual(tmp_path / "missing", environ={}) is False


def test_load_dotenv_file_end_to_end(tmp_path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text("DEEPGRAM_API_KEY=test-key-xyz\n", encoding="utf-8")
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    assert pl.load_dotenv_file(env_path) == env_path
    import os as _os
    assert _os.environ["DEEPGRAM_API_KEY"] == "test-key-xyz"
    # (monkeypatch teardown removes the var again automatically)
    assert pl.load_dotenv_file(tmp_path / "missing") is None


def test_env_example_documents_deepgram_key():
    example = (Path(__file__).resolve().parent.parent / ".env.example")
    assert example.exists()
    assert "DEEPGRAM_API_KEY" in example.read_text(encoding="utf-8")
