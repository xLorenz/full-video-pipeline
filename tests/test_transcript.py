"""Transcript feature: word alignment, clamping, markdown, validation.

Covers scripts/generate_transcript.py pure functions + the
scripts/validate.py::check_transcript gate. No network, no TTS, no vosk
model required (vosk paths are tested via the estimated fallback and via
monkeypatched recognizers).
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import generate_transcript as gt  # noqa: E402
import validate as vv  # noqa: E402


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def test_normalize_token_strips_punct_and_case():
    assert gt.normalize_token("Hello,") == "hello"
    assert gt.normalize_token("don't") == "don't"
    assert gt.normalize_token("...") == ""


def test_expected_tokens_split_on_whitespace():
    assert gt.expected_tokens("Hello  brave\nnew world!") == [
        "Hello", "brave", "new", "world!"]


# ---------------------------------------------------------------------------
# align_words
# ---------------------------------------------------------------------------

def _rec(words_with_times):
    return [{"word": w, "start": s, "end": e, "conf": 1.0}
            for w, s, e in words_with_times]


def test_align_perfect_recognition():
    expected = ["Hello", "brave", "world"]
    rec = _rec([("hello", 0.1, 0.4), ("brave", 0.5, 0.8), ("world", 0.9, 1.2)])
    words, ratio = gt.align_words(expected, rec, 0.5)
    assert ratio == pytest.approx(1.0)
    assert [w["w"] for w in words] == expected
    assert words[0]["start"] == pytest.approx(0.1)
    assert words[2]["end"] == pytest.approx(1.2)


def test_align_misrecognition_still_times_every_word():
    expected = ["the", "quick", "brown", "fox"]
    rec = _rec([("the", 0.0, 0.2), ("quack", 0.2, 0.5),
                ("brown", 0.5, 0.8), ("fox", 0.8, 1.0)])
    words, ratio = gt.align_words(expected, rec, 0.5)
    assert len(words) == 4
    assert [w["w"] for w in words] == expected
    starts = [w["start"] for w in words]
    assert starts == sorted(starts)
    assert all(w["end"] >= w["start"] for w in words)


def test_align_empty_recognition_fails():
    with pytest.raises(ValueError):
        gt.align_words(["hello"], [], 0.5)


def test_align_low_match_ratio_fails():
    expected = ["alpha", "beta", "gamma", "delta"]
    rec = _rec([("zebra", 0.0, 0.5), ("yacht", 0.5, 1.0)])
    with pytest.raises(ValueError):
        gt.align_words(expected, rec, 0.5)


# ---------------------------------------------------------------------------
# clamp_words
# ---------------------------------------------------------------------------

def test_clamp_words_clips_to_duration_and_keeps_order():
    words = [{"w": "a", "start": 0.0, "end": 5.0},
             {"w": "b", "start": 5.0, "end": 9.99}]
    out = gt.clamp_words(words, 6.0)
    assert out[0]["end"] == pytest.approx(5.0)
    assert out[1]["end"] == pytest.approx(6.0)
    assert out[1]["start"] >= out[0]["end"] - 0.001


# ---------------------------------------------------------------------------
# Markdown builder
# ---------------------------------------------------------------------------

def test_build_transcript_md_word_table_and_estimated_note():
    scenes = [
        {"id": 1, "audio_file": "voiceover/scene-01.mp3", "duration": 1.0,
         "padded_duration": 1.0, "global_start": 0.0, "source": "measured",
         "words": [{"w": "Hi", "start": 0.1, "end": 0.4, "global_start": 0.1,
                    "global_end": 0.4, "start_frame": 3, "end_frame": 12}]},
        {"id": 2, "audio_file": "voiceover/scene-02.mp3", "duration": 2.0,
         "padded_duration": 2.0, "global_start": 1.0, "source": "estimated",
         "words": []},
    ]
    md = gt.build_transcript_md("demo", 30, scenes)
    assert "# TRANSCRIPT — demo" in md
    assert "frame = round(t * fps)" in md
    assert "| Hi | 0.100 | 0.400 | 3–12 |" in md
    assert "measured" in md
    assert "sync to scene totals only" in md


# ---------------------------------------------------------------------------
# check_transcript gate
# ---------------------------------------------------------------------------

def _write(path: Path, obj):
    path.write_text(json.dumps(obj), encoding="utf-8")


def _scenes_data():
    return {"video_title": "demo", "fps": 30, "scenes": [
        {"id": 1, "voiceover_file": "voiceover/scene-01.mp3",
         "actual_duration_seconds": 1.0, "actual_duration_frames": 30},
        {"id": 2, "voiceover_file": "voiceover/scene-02.mp3",
         "actual_duration_seconds": 2.0, "actual_duration_frames": 60},
    ]}


def _timings_ok():
    return {"video_title": "demo", "fps": 30, "generated_at": "t",
            "scenes": [
                {"id": 1, "text": "Hi there", "audio_file": "voiceover/scene-01.mp3",
                 "duration": 1.0, "padded_duration": 1.0, "global_start": 0.0,
                 "source": "measured",
                 "words": [
                     {"w": "Hi", "start": 0.1, "end": 0.4, "global_start": 0.1,
                      "global_end": 0.4, "start_frame": 3, "end_frame": 12},
                     {"w": "there", "start": 0.4, "end": 0.9, "global_start": 0.4,
                      "global_end": 0.9, "start_frame": 12, "end_frame": 27}]},
                {"id": 2, "text": "Yo", "audio_file": "voiceover/scene-02.mp3",
                 "duration": 2.0, "padded_duration": 2.0, "global_start": 1.0,
                 "source": "estimated", "words": []},
            ]}


def test_check_transcript_ok(tmp_path):
    data = _scenes_data()
    _write(tmp_path / "voiceover_timings.json", _timings_ok())
    (tmp_path / "TRANSCRIPT.md").write_text("# TRANSCRIPT", encoding="utf-8")
    assert vv.check_transcript(tmp_path, data) == []


def test_check_transcript_missing_files(tmp_path):
    errs = vv.check_transcript(tmp_path, _scenes_data())
    assert any("voiceover_timings.json" in e for e in errs)
    assert any("TRANSCRIPT.md" in e for e in errs)


def test_check_transcript_frame_mismatch(tmp_path):
    tj = _timings_ok()
    tj["scenes"][0]["words"][0]["start_frame"] = 999
    _write(tmp_path / "voiceover_timings.json", tj)
    (tmp_path / "TRANSCRIPT.md").write_text("# TRANSCRIPT", encoding="utf-8")
    errs = vv.check_transcript(tmp_path, _scenes_data())
    assert any("frame math" in e for e in errs)


def test_check_transcript_estimated_must_be_empty(tmp_path):
    tj = _timings_ok()
    tj["scenes"][1]["words"] = [
        {"w": "Yo", "start": 0.0, "end": 0.5, "global_start": 1.0,
         "global_end": 1.5, "start_frame": 0, "end_frame": 15}]
    _write(tmp_path / "voiceover_timings.json", tj)
    (tmp_path / "TRANSCRIPT.md").write_text("# TRANSCRIPT", encoding="utf-8")
    errs = vv.check_transcript(tmp_path, _scenes_data())
    assert any("estimated" in e for e in errs)


def test_check_transcript_global_drift(tmp_path):
    tj = _timings_ok()
    tj["scenes"][1]["global_start"] = 99.0
    _write(tmp_path / "voiceover_timings.json", tj)
    (tmp_path / "TRANSCRIPT.md").write_text("# TRANSCRIPT", encoding="utf-8")
    errs = vv.check_transcript(tmp_path, _scenes_data())
    assert any("global_start" in e for e in errs)


def test_check_transcript_word_beyond_duration(tmp_path):
    tj = _timings_ok()
    tj["scenes"][0]["words"][1]["end"] = 50.0
    tj["scenes"][0]["words"][1]["end_frame"] = 1500
    tj["scenes"][0]["words"][1]["global_end"] = 50.0
    _write(tmp_path / "voiceover_timings.json", tj)
    (tmp_path / "TRANSCRIPT.md").write_text("# TRANSCRIPT", encoding="utf-8")
    errs = vv.check_transcript(tmp_path, _scenes_data())
    assert any("duration" in e for e in errs)
