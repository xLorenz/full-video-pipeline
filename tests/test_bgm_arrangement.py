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
