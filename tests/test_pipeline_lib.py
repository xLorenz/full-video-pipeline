import hashlib
import json
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import _pipeline_lib as pl  # noqa: E402


# ---------------------------------------------------------------------------
# sanitize_title
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("Hello World", "hello-world"),
    ("  Why Is the Sky Blue?!  ", "why-is-the-sky-blue"),
    ("already-fine-123", "already-fine-123"),
    ("ünïcode—title", "n-code-title"),
])
def test_sanitize_title(raw, expected):
    assert pl.sanitize_title(raw) == expected


def test_sanitize_title_rejects_empty():
    with pytest.raises(ValueError):
        pl.sanitize_title("!!!")


# ---------------------------------------------------------------------------
# Config merge + step command templates
# ---------------------------------------------------------------------------

def test_deep_merge_overlay_wins_and_lists_replace():
    base = {"a": {"b": 1, "c": 2}, "list": [1, 2], "x": 0}
    overlay = {"a": {"b": 9}, "list": [3], "y": 5}
    out = pl._deep_merge(base, overlay)
    assert out == {"a": {"b": 9, "c": 2}, "list": [3], "x": 0, "y": 5}


def test_render_step_command_quotes_spaces_but_keeps_clean_values():
    cfg = {"voiceover": {"voice": "needs quoting"}, "video": {}}
    cmd = pl.render_step_command(
        "{python} script.py {video_dir} --voice {voiceover.voice}",
        "/tmp/my video", cfg=cfg)
    assert "--voice needs" not in cmd          # must remain ONE argument
    assert "'/tmp/my video'" in cmd or "\"/tmp/my video\"" in cmd


def test_render_step_command_unknown_token_becomes_empty_with_warning(capsys):
    out = pl.render_step_command("x {nope.missing} y", "/v", cfg={})
    assert out == "x  y"
    assert "unknown token" in capsys.readouterr().err


def test_get_step_command_template_prefers_config_over_default():
    cfg = {"steps": {"10_stitching": {"command_template": "custom {video_dir}"}}}
    assert pl.get_step_command_template("10_stitching", cfg) == "custom {video_dir}"
    assert pl.get_step_command_template("6_duration_measurement", cfg) == \
        pl._DEFAULT_STEP_COMMAND_TEMPLATES["6_duration_measurement"]
    assert pl.get_step_command_template("not_a_step", cfg) is None


# ---------------------------------------------------------------------------
# Hashes
# ---------------------------------------------------------------------------

def test_hash_voiceover_includes_engine_in_key():
    common = ("text", "alba", "+0%", "+0%", "+0Hz")
    h_edge = pl.hash_voiceover(*common, engine="edge")
    h_pocket = pl.hash_voiceover(*common, engine="pocket")
    assert h_edge != h_pocket
    assert h_edge == pl.hash_voiceover(*common, engine="edge")  # stable


def test_hash_voiceover_known_shape():
    payload = json.dumps(
        {"text": "t", "voice": "v", "rate": "r", "volume": "v", "pitch": "p",
         "engine": "edge"},
        sort_keys=True, ensure_ascii=False)
    assert pl.hash_voiceover("t", "v", "r", "v", "p") == \
        hashlib.sha256(payload.encode()).hexdigest()


def test_hash_sfx_is_order_insensitive_for_dicts():
    assert pl.hash_sfx({"a": 1, "b": 2}) == pl.hash_sfx({"b": 2, "a": 1})


# ---------------------------------------------------------------------------
# Frame-exact padding graph (H3)
# ---------------------------------------------------------------------------

def _mk_vo(tmp_path, n=3, frames=(16, 39, 28)):
    vo = tmp_path / "voiceover"
    vo.mkdir(exist_ok=True)
    scenes = []
    for i in range(1, n + 1):
        (vo / f"scene-{i:02d}.mp3").write_bytes(b"\xff\xfb fake mp3")
        scenes.append({"id": i, "actual_duration_frames": frames[i - 1],
                       "actual_duration_seconds": round(frames[i - 1] / 30, 3)})
    return vo, scenes


def test_voiceover_pad_graph_durations_are_frame_exact(tmp_path):
    vo, scenes = _mk_vo(tmp_path)
    inputs, graph, missing = pl.voiceover_pad_graph(vo, scenes, 30)
    assert missing == []
    assert len(inputs) == 6  # 3 scenes x ("-i", path)
    for s in scenes:
        dur = f"apad=whole_dur={s['actual_duration_frames'] / 30:.6f}"
        assert dur in graph
    assert graph.endswith(f"concat=n=3:v=0:a=1[aout]")


def test_voiceover_pad_graph_reports_missing_files(tmp_path):
    vo, scenes = _mk_vo(tmp_path, n=2)
    (vo / "scene-01.mp3").unlink()
    _, _, missing = pl.voiceover_pad_graph(vo, scenes, 30)
    assert missing == [1]


def test_scene_padded_duration_fallback_chain():
    assert pl.scene_padded_duration({"id": 1, "actual_duration_frames": 45}, 30) == 1.5
    assert pl.scene_padded_duration(
        {"id": 1, "actual_duration_seconds": 2.25}, 30) == 2.25
    assert pl.scene_padded_duration({"id": 1, "target_duration_seconds": 3}, 30) == 3.0
    assert pl.scene_padded_duration({"id": 1}, 30) == 0.0


def test_measure_policy_matches_padding_helper():
    # ceil policy from measure_durations.py vs scene_padded_duration
    fps = 30
    raw = 1.27
    frames = max(1, math.ceil(raw * fps))
    assert pl.scene_padded_duration({"actual_duration_frames": frames}, fps) == frames / fps


# ---------------------------------------------------------------------------
# Scene render hashes (H2)
# ---------------------------------------------------------------------------

def _fixture_project(root: Path) -> Path:
    src = root / "remotion" / "src"
    (src / "lib").mkdir(parents=True, exist_ok=True)
    (src / "scenes").mkdir(parents=True, exist_ok=True)
    (src / "lib" / "styles.ts").write_text("export const A = 1;\n")
    (src / "index.css").write_text("body{}\n")
    (src / "scenes" / "Scene01.tsx").write_text("one\n")
    (src / "scenes" / "Scene02.tsx").write_text("two\n")
    return root


def test_scene_hash_scene_edit_only_invalidates_that_scene(tmp_path):
    vdir = _fixture_project(tmp_path)
    h1 = pl.compute_scene_render_hashes(vdir)
    (vdir / "remotion" / "src" / "scenes" / "Scene02.tsx").write_text("two!\n")
    h2 = pl.compute_scene_render_hashes(vdir)
    assert h2[1] == h1[1]
    assert h2[2] != h1[2]


def test_scene_hash_shared_edit_invalidates_all(tmp_path):
    vdir = _fixture_project(tmp_path)
    h1 = pl.compute_scene_render_hashes(vdir)
    (vdir / "remotion" / "src" / "lib" / "styles.ts").write_text("export const A = 2;\n")
    h2 = pl.compute_scene_render_hashes(vdir)
    assert h2[1] != h1[1] and h2[2] != h1[2]


def test_scene_hash_missing_project_returns_empty(tmp_path):
    assert pl.compute_scene_render_hashes(tmp_path / "nope") == {}


# ---------------------------------------------------------------------------
# Version pruning
# ---------------------------------------------------------------------------

def test_find_versions_to_prune_keeps_newest_n(tmp_path):
    versions = tmp_path / "versions"
    versions.mkdir()
    names = ["demo-v1.mp4", "demo-v2.mp4", "demo-v3.mp4",
             "demo-thumbnail-v1.png", "other.mp4"]
    for n in names:
        (versions / n).write_bytes(b"x")
    prune = pl.find_versions_to_prune(versions, "demo", r"{title}-v(\d+)\.mp4", keep=2)
    assert [p.name for p in prune] == ["demo-v1.mp4"]


def test_find_versions_to_prune_clamps_keep_to_one(tmp_path):
    versions = tmp_path / "v"
    versions.mkdir()
    for n in ["a-v1.mp4", "a-v2.mp4"]:
        (versions / n).write_bytes(b"x")
    # keep=0 is clamped to 1 -> only v1 exceeds the retention window
    assert [p.name for p in pl.find_versions_to_prune(
        versions, "a", r"{title}-v(\d+)\.mp4", 0)] == ["a-v1.mp4"]


# ---------------------------------------------------------------------------
# Speech duration estimates + truncation gate
# ---------------------------------------------------------------------------

def test_speech_rate_strips_engine_suffix():
    assert pl.speech_rate_for_language("spanish_24l") == \
        pl.SPEECH_CHARS_PER_SEC["spanish"]
    assert pl.speech_rate_for_language("ENGLISH") == \
        pl.SPEECH_CHARS_PER_SEC["english"]
    assert pl.speech_rate_for_language("klingon") == \
        pl.SPEECH_CHARS_PER_SEC["english"]  # unknown -> default


def test_estimate_speech_duration_override_wins():
    assert pl.estimate_speech_duration("x" * 100, "english") == \
        pytest.approx(100 / pl.SPEECH_CHARS_PER_SEC["english"])
    assert pl.estimate_speech_duration("x" * 100, "english",
                                       rate_override=20.0) == pytest.approx(5.0)


def test_truncation_gate_catches_short_audio():
    # Reporter's incident: ~405 chars of Spanish at ~13s (real rate ~18/s).
    text = "x" * 405
    ok, expected, ratio = pl.check_audio_duration_plausible(text, 13.28, "spanish")
    assert not ok
    assert expected == pytest.approx(405 / pl.SPEECH_CHARS_PER_SEC["spanish"])
    assert ratio == pytest.approx(13.28 / expected)


def test_truncation_gate_passes_normal_audio():
    text = "x" * 405
    ok, _, ratio = pl.check_audio_duration_plausible(text, 23.0, "spanish")
    assert ok and ratio == pytest.approx(23.0 / (405 / 17.0))


def test_truncation_gate_skips_tiny_scenes():
    ok, _, _ = pl.check_audio_duration_plausible("hi", 0.5, "english")
    assert ok


def test_check_cached_audio_statuses(tmp_path, monkeypatch):
    mp3 = tmp_path / "scene-01.mp3"
    mp3.write_bytes(b"fake")
    # Missing hash -> hash_mismatch (no ffprobe needed).
    assert pl.check_cached_audio(
        str(mp3), "new-hash", "old-hash", 5.0)[0] == "hash_mismatch"
    # Missing file.
    assert pl.check_cached_audio(
        str(tmp_path / "nope.mp3"), "h", "h", 5.0)[0] == "missing"
    # Hash matches: verdict depends on measured vs registered duration.
    monkeypatch.setattr(pl, "get_audio_duration", lambda p: 10.0)
    assert pl.check_cached_audio(
        str(mp3), "h", "h", 10.0) == ("current", 10.0)
    assert pl.check_cached_audio(
        str(mp3), "h", "h", 20.0)[0] == "stale"  # renumber leftover
    assert pl.check_cached_audio(
        str(mp3), "h", "h", 0)[0] == "stale"  # no registered duration
    monkeypatch.setattr(pl, "get_audio_duration", lambda p: 0.0)
    assert pl.check_cached_audio(
        str(mp3), "h", "h", 10.0)[0] == "unmeasurable"
