"""BGM arrangement beds: asset registration, loop mapping, and playhead reuse."""
import json
import sys
import wave
from array import array
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import generate_sfx as g  # noqa: E402
import sfx_catalog as sfx  # noqa: E402


def _synth_asset(n=12000):
    return array("f", [((i % 997) / 997.0) - 0.5 for i in range(n)])


def test_neon_drop_registered_as_asset_bed():
    meta = sfx.BGM_TRACKS["neon_drop"]
    assert meta["asset"] == "bgm/neon_drop.wav"
    assert meta["bpm"] == 140
    assert meta["loop_end_seconds"] > meta["loop_start_seconds"]
    assert sfx.resolve_bgm_track("NEON_DROP")


def test_neon_drop_asset_is_mono_44k_and_manifest_hashed():
    meta = sfx.BGM_TRACKS["neon_drop"]
    path = REPO / "sfx" / "assets" / meta["asset"]
    assert path.exists(), "neon_drop asset is committed"
    with wave.open(str(path), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 44100
        assert w.getsampwidth() == 2
        assert w.getnframes() == 4838400
    manifest = json.loads((REPO / "sfx" / "assets" / "manifest.json").read_text())
    hashes = {e["file"]: e["sha256"] for e in manifest["files"]}
    assert hashes[meta["asset"]] == sfx.hash_manifest_file(meta["asset"])


def test_clear_skies_registered_as_asset_bed():
    meta = sfx.BGM_TRACKS["clear_skies"]
    assert meta["asset"] == "bgm/clear_skies.wav"
    assert meta["bpm"] == 94.5
    assert meta["loop_end_seconds"] > meta["loop_start_seconds"]
    assert sfx.resolve_bgm_track("CLEAR_SKIES")


def test_clear_skies_asset_is_mono_44k_and_manifest_hashed():
    meta = sfx.BGM_TRACKS["clear_skies"]
    path = REPO / "sfx" / "assets" / meta["asset"]
    assert path.exists(), "clear_skies asset is committed"
    with wave.open(str(path), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 44100
        assert w.getsampwidth() == 2
        assert w.getnframes() == 5376000
    manifest = json.loads((REPO / "sfx" / "assets" / "manifest.json").read_text())
    hashes = {e["file"]: e["sha256"] for e in manifest["files"]}
    assert hashes[meta["asset"]] == sfx.hash_manifest_file(meta["asset"])


def test_clear_skies_loop_bounds_land_on_the_bar_grid():
    # 94.5 bpm → one bar = 160/63 s = exactly 112,000 samples @ 44.1 kHz.
    # Head = 32 bars, loop = 16 bars: both must be whole bars, or the seam drifts.
    meta = sfx.BGM_TRACKS["clear_skies"]
    bar = 112000
    assert round(meta["loop_start_seconds"] * 44100) == 32 * bar
    assert round((meta["loop_end_seconds"] - meta["loop_start_seconds"]) * 44100) == 16 * bar


def test_quiet_signal_registered_as_asset_bed():
    meta = sfx.BGM_TRACKS["quiet_signal"]
    assert meta["asset"] == "bgm/quiet_signal.wav"
    assert meta["bpm"] == 76
    assert meta["loop_end_seconds"] > meta["loop_start_seconds"]
    assert sfx.resolve_bgm_track("QUIET_SIGNAL")


def test_quiet_signal_asset_is_mono_44k_and_manifest_hashed():
    meta = sfx.BGM_TRACKS["quiet_signal"]
    path = REPO / "sfx" / "assets" / meta["asset"]
    assert path.exists(), "quiet_signal asset is committed"
    with wave.open(str(path), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 44100
        assert w.getsampwidth() == 2
        assert w.getnframes() == 2228211
    manifest = json.loads((REPO / "sfx" / "assets" / "manifest.json").read_text())
    hashes = {e["file"]: e["sha256"] for e in manifest["files"]}
    assert hashes[meta["asset"]] == sfx.hash_manifest_file(meta["asset"])


def test_config_default_track_is_a_registered_bed():
    cfg = json.loads((REPO / "pipeline_config.json").read_text(encoding="utf-8"))
    default = cfg["bgm"]["default_track"]
    assert sfx.resolve_bgm_track(default), f"bgm.default_track '{default}' is not in BGM_TRACKS"


def test_render_asset_run_plays_head_once_then_loops():
    asset = _synth_asset()
    out = g.render_asset_run(asset, 0, 25, 10, 20)
    assert list(out) == list(asset[0:10]) + list(asset[10:20]) + list(asset[10:15])
    wrapped = g.render_asset_run(asset, 15, 10, 10, 20)
    assert list(wrapped) == list(asset[15:20]) + list(asset[10:15])
    advanced = g.render_asset_run(asset, 25, 5, 10, 20)
    assert list(advanced) == list(asset[15:20])


def test_reentry_after_other_bed_resumes_inside_loop(monkeypatch):
    asset = _synth_asset()
    monkeypatch.setattr(g, "load_bgm_asset", lambda track, sr: asset)
    monkeypatch.setattr(g, "bgm_loop_bounds", lambda track, sr: (4000, 8000))
    scenes = [
        {"id": 1, "actual_duration_frames": 1000},
        {"id": 2, "actual_duration_frames": 100, "bgm": {"track": "pulse_dark"}},
        {"id": 3, "actual_duration_frames": 100},
    ]
    cfg = {"bgm": {"enabled": True, "default_track": "neon_drop",
                   "default_volume": 1.0, "bed_db": 0.0,
                   "crossfade_seconds": 0.0, "fade_in_seconds": 0.0,
                   "fade_out_seconds": 0.0, "track_trim": {"neon_drop": 0.0}}}
    offsets, total = g.cumulative_offsets(scenes, 10)
    bm = g.render_bgm_track(scenes, offsets, total, cfg, 100, fps=10)
    assert bm[0] == asset[0]
    assert bm[11000] == asset[6000]


def test_interruption_before_loop_resumes_head(monkeypatch):
    asset = _synth_asset()
    monkeypatch.setattr(g, "load_bgm_asset", lambda track, sr: asset)
    monkeypatch.setattr(g, "bgm_loop_bounds", lambda track, sr: (4000, 8000))
    scenes = [
        {"id": 1, "actual_duration_frames": 100},
        {"id": 2, "actual_duration_frames": 100, "bgm": None},
        {"id": 3, "actual_duration_frames": 10},
    ]
    cfg = {"bgm": {"enabled": True, "default_track": "neon_drop",
                   "default_volume": 1.0, "bed_db": 0.0,
                   "crossfade_seconds": 0.0, "fade_in_seconds": 0.0,
                   "fade_out_seconds": 0.0, "track_trim": {"neon_drop": 0.0}}}
    offsets, total = g.cumulative_offsets(scenes, 10)
    bm = g.render_bgm_track(scenes, offsets, total, cfg, 100, fps=10)
    assert bm[2000] == asset[1000]


def test_same_track_volume_change_keeps_phase(monkeypatch):
    asset = _synth_asset()
    monkeypatch.setattr(g, "load_bgm_asset", lambda track, sr: asset)
    monkeypatch.setattr(g, "bgm_loop_bounds", lambda track, sr: (4000, 8000))
    scenes = [
        {"id": 1, "actual_duration_frames": 100, "bgm": {"track": "neon_drop", "volume": 1.0}},
        {"id": 2, "actual_duration_frames": 100, "bgm": {"track": "neon_drop", "volume": 0.5}},
    ]
    cfg = {"bgm": {"enabled": True, "default_track": "neon_drop",
                   "default_volume": 1.0, "bed_db": 0.0,
                   "crossfade_seconds": 0.0, "fade_in_seconds": 0.0,
                   "fade_out_seconds": 0.0, "track_trim": {"neon_drop": 0.0}}}
    offsets, total = g.cumulative_offsets(scenes, 10)
    bm = g.render_bgm_track(scenes, offsets, total, cfg, 100, fps=10)
    gain = 10.0 ** (g.bed_gain_db(0.5, 0.0) / 20.0)
    assert bm[1000] == pytest.approx(asset[1000] * gain, rel=1e-6, abs=1e-6)
