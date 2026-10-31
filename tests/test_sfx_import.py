"""Pack importer: plan validation, media transcoding, catalog entry writing."""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import jsonschema
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import generate_sfx as g  # noqa: E402
import import_sfx_pack as imp  # noqa: E402
import sfx_catalog as sfx  # noqa: E402

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None,
                                  reason="ffmpeg not on PATH")


def _entry(**kw):
    base = {
        "source": "mechanical sfx/test tone.wav",
        "id": "test_tone",
        "family": "mechanical",
        "aliases": ["test-alias"],
        "tags": ["ui"],
        "moods": ["neutral"],
        "default_volume": 0.4,
        "description": "Test tone - only used by the importer tests.",
        "use": ["a test"],
        "avoid": ["production"],
    }
    base.update(kw)
    return base


def _plan(tmp_path, entries):
    p = tmp_path / "plan.json"
    p.write_text(json.dumps({"entries": entries}), encoding="utf-8")
    return p


def _args(**kw):
    base = dict(format="mp3", bitrate="192k", max_seconds=8.0, fade_out=0.3,
                peak_ceiling=-1.0, only="", force=False, dry_run=False,
                check=False, no_catalog_md=True)
    base.update(kw)
    return argparse.Namespace(**base)


# ---------------------------------------------------------------------------
# plan validation
# ---------------------------------------------------------------------------


def test_plan_accepts_the_shipped_pack_plan():
    plan = REPO / "sfx" / "import" / "sfx-pack-plan.json"
    entries = imp.load_plan(plan)
    assert len(entries) == 55
    assert len({e["id"] for e in entries}) == 55
    assert imp.check_alias_collisions(entries) == []


@pytest.mark.parametrize("bad", [
    {"id": "Bad Id"},
    {"tags": ["nope"]},
    {"moods": ["angry"]},
    {"default_volume": 1.5},
])
def test_plan_rejects_bad_metadata(tmp_path, bad):
    with pytest.raises(SystemExit):
        imp.load_plan(_plan(tmp_path, [_entry(**bad)]))


def test_plan_rejects_duplicate_ids(tmp_path):
    with pytest.raises(SystemExit):
        imp.load_plan(_plan(tmp_path, [_entry(), _entry()]))


def test_alias_cannot_shadow_an_existing_sound():
    errors = imp.check_alias_collisions([_entry(aliases=["swoosh"])])
    assert any("swoosh" in e for e in errors)


def test_alias_cannot_shadow_another_plan_entry():
    errors = imp.check_alias_collisions([
        _entry(id="one", aliases=["shared-name"]),
        _entry(id="two", aliases=["shared-name"]),
    ])
    assert any("shared-name" in e for e in errors)


def test_id_cannot_reuse_a_bundled_sample():
    errors = imp.check_alias_collisions([_entry(id="siren", aliases=[])])
    assert any("siren" in e for e in errors)


# ---------------------------------------------------------------------------
# naming / layout
# ---------------------------------------------------------------------------


def test_slug_and_layout_are_tidy():
    assert imp.slug("wooshes, risers, and hits") == "wooshes_risers_and_hits"
    assert imp.slug("video games") == "video_games"
    assert imp.slug("Mechanical  SFX") == "mechanical_sfx"
    assert imp.asset_relpath(_entry(family="video games"), "mp3") == \
        "pack/video_games/test_tone.mp3"


# ---------------------------------------------------------------------------
# catalog writing
# ---------------------------------------------------------------------------


def test_config_is_schema_valid_and_records_provenance(tmp_path, monkeypatch):
    monkeypatch.setattr(sfx, "SOUNDS_DIR", tmp_path / "sounds")
    measured = {"duration_seconds": 1.234, "loudest_400ms_dbfs": -21.5,
                "true_peak_dbfs": -1.2, "integrated_lufs": -18.0}
    path, cfg = imp.write_config(_entry(), measured, "pack/mechanical/test_tone.mp3")
    schema = json.loads((REPO / "schemas" / "sfx.schema.json").read_text(encoding="utf-8"))
    jsonschema.validate(cfg, schema)
    assert cfg["backend"] == "sample"
    assert cfg["source"] == "mechanical sfx/test tone.wav"
    assert cfg["level"]["mode"] == "auto"
    assert cfg["level"]["measured"]["loudest_400ms_dbfs"] == -21.5
    assert cfg["max_tail_seconds"] == 1.23
    assert json.loads(path.read_text(encoding="utf-8"))["sound"] == "test_tone"


def test_manual_documents_params_and_trim(tmp_path, monkeypatch):
    monkeypatch.setattr(sfx, "SOUNDS_DIR", tmp_path / "sounds")
    measured = {"duration_seconds": 9.0, "loudest_400ms_dbfs": -21.5,
                "true_peak_dbfs": -1.2, "integrated_lufs": None}
    entry = _entry()
    entry["_trimmed_from"] = 14.04
    _, cfg = imp.write_config(entry, measured, "pack/mechanical/test_tone.mp3")
    md = imp.write_manual(cfg, entry, measured)
    text = md.read_text(encoding="utf-8")
    assert "Moods: neutral" in text
    assert "trimmed from 14.04 s" in text
    assert "`duration`" in text and "`pitch`" in text
    assert '"sound": "test_tone"' in text


def test_manifest_upsert_is_sorted_and_idempotent(tmp_path, monkeypatch):
    manifest = tmp_path / "manifest.json"
    monkeypatch.setattr(sfx, "MANIFEST_PATH", manifest)
    imp.upsert_manifest("pack/b/two.mp3", "b" * 64)
    imp.upsert_manifest("pack/a/one.mp3", "a" * 64)
    imp.upsert_manifest("pack/b/two.mp3", "c" * 64)
    data = json.loads(manifest.read_text(encoding="utf-8"))
    assert [e["file"] for e in data["files"]] == ["pack/a/one.mp3", "pack/b/two.mp3"]
    assert data["files"][1]["sha256"] == "c" * 64
    assert data["version"] == 2


# ---------------------------------------------------------------------------
# end to end (needs ffmpeg)
# ---------------------------------------------------------------------------


@needs_ffmpeg
def test_import_end_to_end_strips_silence_trims_and_registers(tmp_path, monkeypatch):
    sr = 44100
    src_root = tmp_path / "pack"
    (src_root / "mechanical sfx").mkdir(parents=True)
    lead = [0.0] * int(1.0 * sr)
    body = [0.4 * math.sin(2 * math.pi * 440 * i / sr) for i in range(int(9.0 * sr))]
    g.write_wav(src_root / "mechanical sfx" / "test tone.wav",
                g.array("f", lead + body), sr)

    monkeypatch.setattr(sfx, "ASSETS_DIR", tmp_path / "assets")
    monkeypatch.setattr(sfx, "SOUNDS_DIR", tmp_path / "sounds")
    monkeypatch.setattr(sfx, "MANIFEST_PATH", tmp_path / "assets" / "manifest.json")
    args = _args(max_seconds=4.0)
    entry = _entry()
    res = imp.import_entry(entry, tmp_path / "pack", args, {})

    asset = tmp_path / "assets" / res["asset"]
    assert asset.exists() and asset.suffix == ".mp3"
    info = imp.probe(asset)
    assert info["channels"] == 1 and info["sample_rate"] == 44100
    # 1 s of leading silence stripped, 9 s body trimmed to the 4 s cap.
    assert info["duration"] == pytest.approx(4.0, abs=0.15)
    assert res["measured"]["true_peak_dbfs"] <= -0.9
    # onset still exists right after the pre-roll (silence was not clipped away)
    samples = g.decode_to_floats(asset)
    assert g.peak_dbfs(samples) == pytest.approx(-8.0, abs=1.0)
    assert imp.leading_silence(asset) < 0.1

    cfg = json.loads((tmp_path / "sounds" / "test_tone" / "config.json")
                     .read_text(encoding="utf-8"))
    assert cfg["asset"] == res["asset"]
    manifest = json.loads((tmp_path / "assets" / "manifest.json").read_text(encoding="utf-8"))
    assert {e["file"]: e["sha256"] for e in manifest["files"]}[res["asset"]] == \
        imp.sha256_file(asset)


@needs_ffmpeg
def test_import_is_idempotent_and_check_reports_status(tmp_path, monkeypatch):
    sr = 44100
    src_root = tmp_path / "pack"
    src_root.mkdir()
    g.write_wav(src_root / "tone.wav",
                g.array("f", [0.3 * math.sin(2 * math.pi * 300 * i / sr)
                              for i in range(sr)]), sr)
    monkeypatch.setattr(sfx, "ASSETS_DIR", tmp_path / "assets")
    monkeypatch.setattr(sfx, "SOUNDS_DIR", tmp_path / "sounds")
    monkeypatch.setattr(sfx, "MANIFEST_PATH", tmp_path / "assets" / "manifest.json")
    entry = _entry(source="tone.wav")
    args = _args()
    assert imp.status_of(entry, args) == "missing"
    imp.import_entry(entry, src_root, args, {})
    assert imp.status_of(entry, args) == "ok"
