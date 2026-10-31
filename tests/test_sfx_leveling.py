"""Sample level law: render-time loudness matching against the measured voiceover.

The law exists so a bundled/imported sample can never be inaudible (soft floor),
never louder than the narration's peak (hard ceiling), and always sits above the
BGM bed it competes with. These tests pin the corridor, not exact dB values.
"""
import json
import math
import struct
import sys
from array import array
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import generate_sfx as g  # noqa: E402
import sfx_catalog as sfx  # noqa: E402

SR = 8000


def _tone(amp, seconds, sr=SR, freq=220.0):
    n = int(seconds * sr)
    return [amp * math.sin(2 * math.pi * freq * i / sr) for i in range(n)]


def _spiky(seconds=2.0, sr=SR, amp=0.001, spike=0.9, every=1600, width=20):
    """Low bed with a few sharp transients: high crest factor, low L400."""
    x = _tone(amp, seconds, sr)
    for start in range(0, len(x) - width, every):
        for i in range(start, start + width):
            x[i] = spike if i % 2 == 0 else -spike
    return x


def _sound(**kw):
    base = dict(sound="t", aliases=(), backend="sample", recipe=None, asset="x.mp3",
                tags=(), moods=(), default_volume=0.5, max_tail_seconds=2.0,
                params={}, description="", path=None, level={})
    base.update(kw)
    return sfx.SoundDef(**base)


def _cfg(**level):
    cfg = {
        "enabled": True, "accent_offset_db": -12.0, "max_below_vo_db": 24.0,
        "over_bed_db": 3.0, "masking_db": 8.0, "vo_headroom_db": 6.0,
        "sample_peak_ceiling_db": -1.0, "gain_clamp_db": [-36.0, 9.0],
        "max_deviation_db": 10.0, "window_seconds": 0.4, "hop_seconds": 0.1,
    }
    cfg.update(level)
    return {"sfx": {"full_scale_db": -10.0, "tail_fade_seconds": 0.5, "level": cfg},
            "bgm": {"duck_ratio": 1.0}}          # duck off: floor-law tests isolate the floor


VO = (-1.0, -20.0, [-20.0] * 200)      # peak, integrated, momentary series


def _bed_env(dbfs, hop=0.1):
    return [10.0 ** (dbfs / 10.0)] * 400


# ---------------------------------------------------------------------------
# measurement primitives
# ---------------------------------------------------------------------------


def test_peak_dbfs_of_silence_is_floor():
    assert g.peak_dbfs([]) == -120.0
    assert g.peak_dbfs([0.0] * 100) == -120.0


def test_loudest_window_of_constant_tone_is_its_rms():
    got = g.loudest_window_db(_tone(0.5, 1.0), SR)
    assert got == pytest.approx(20 * math.log10(0.5 / math.sqrt(2)), abs=0.3)


def test_loudest_window_short_clip_uses_whole_clip_not_padding():
    # A 90 ms blip must not be measured as (level - 10*log10(400/90)) just because
    # it is shorter than the 400 ms window.
    blip = _tone(0.5, 0.09)
    full = _tone(0.5, 0.4)
    assert g.loudest_window_db(blip, SR) == pytest.approx(
        g.loudest_window_db(full, SR), abs=0.5)


def test_loudest_window_finds_the_hot_spot_wherever_it_is():
    quiet = _tone(0.01, 2.0)
    loud = _tone(0.5, 0.4)
    early = loud + quiet[len(loud):]
    late = quiet[: len(quiet) - len(loud)] + loud
    assert g.loudest_window_db(early, SR) == pytest.approx(
        g.loudest_window_db(late, SR), abs=0.3)


def test_envelope_level_reads_the_bed_at_a_point_in_time():
    env = g.energy_envelope(_tone(0.1, 1.0), SR)
    assert g.envelope_level_db(env, 0.1, 0.0, 0.4) == pytest.approx(-23.0, abs=1.0)
    assert g.envelope_level_db([], 0.1, 0.0, 0.4) == -120.0


# ---------------------------------------------------------------------------
# the law
# ---------------------------------------------------------------------------


def test_loud_sample_is_pulled_down_to_the_accent_corridor():
    raw = _tone(0.9, 2.0)
    out, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, None, _cfg(), 0.0)
    assert plan["mode"] == "auto"
    assert plan["target_dbfs"] == pytest.approx(-32.0, abs=0.01)   # vo_I + accent
    assert g.loudest_window_db(out, SR) == pytest.approx(-32.0, abs=0.4)
    assert plan["flags"] == []


def test_quiet_sample_is_lifted_but_never_past_the_corridor_cap():
    raw = _tone(0.01, 1.0)
    out, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, None, _cfg(), 0.0)
    # +15 dB would be needed; the upward clamp stops at +9 and says so.
    assert "gain_ceiling_clamp" in plan["flags"]
    assert g.loudest_window_db(out, SR) == pytest.approx(-33.9, abs=0.4)


def _event_margin(out, bed_db, sr=SR):
    """Worst (cue - bed - margin) over the cue's event windows; +99 when silent.

    The mask test as the engine runs it: the cue's own 10 ms level against the
    bed's sustained level, over the moments the cue is an event.
    """
    fine = g.energy_envelope(out, sr, 0.01)
    if not fine:
        return 99.0
    thr = max(fine) * (10 ** (-12.0 / 10.0))
    worst = 99.0
    for e in fine:
        if e < thr:
            continue
        worst = min(worst, g._energy_db(e) - bed_db - 3.0)
    return worst


def test_bed_raises_the_floor_so_a_cue_is_never_buried():
    raw = _tone(0.035, 2.0)                      # L400 ~= -32.1 dBFS
    out, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, _bed_env(-29.0), _cfg(), 0.0)
    # the cue is lifted until its own level clears the bed by over_bed_db
    assert plan["target_dbfs"] == pytest.approx(plan["floor_dbfs"], abs=0.01)
    assert _event_margin(out, -29.0) >= -0.2
    assert "floor_capped" not in plan["flags"]


def test_a_lift_past_the_accent_cap_is_flagged_but_still_honoured():
    from_bed = _bed_env(-10.0)                   # absurdly loud bed
    _, plan = g.prepare_sample(_sound(), {}, _tone(0.035, 2.0), SR, VO, from_bed,
                               _cfg(), 0.0)
    # the mask promise outranks the accent corridor...
    assert plan["target_dbfs"] == pytest.approx(plan["floor_dbfs"], abs=0.01)
    assert plan["target_dbfs"] > -32.0 + 10.0     # ...lifted past the usual cap
    assert "floor_capped" in plan["flags"]
    assert plan["bed_drop_needed_db"] > 0         # and says how far the bed must drop


def test_explicit_volume_is_honoured_and_flagged_when_below_the_floor():
    raw = _tone(0.035, 2.0)
    _, plan = g.prepare_sample(_sound(), {"volume": 0.05}, raw, SR, VO,
                               _bed_env(-29.0), _cfg(), 0.0)
    assert plan["target_dbfs"] == pytest.approx(-36.5, abs=0.01)   # nominal, not floor
    assert "below_floor_explicit_volume" in plan["flags"]


def test_peak_ceiling_is_hard_and_wins_over_the_floor():
    # A transient-heavy sample over a hot bed: reaching the floor would push
    # its peak over the ceiling, so the ceiling wins and the conflict is said.
    raw = _spiky()
    out, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, _bed_env(-10.0), _cfg(), 0.0)
    assert plan["ceiling_dbfs"] == pytest.approx(-7.0, abs=0.01)   # vo_peak - headroom
    assert "peak_clamped" in plan["flags"]
    assert "corridor_conflict" in plan["flags"]
    assert g.peak_dbfs(out) <= plan["ceiling_dbfs"] + 0.01


def test_no_cue_can_ever_exceed_the_voiceover_peak():
    cfg = _cfg()
    for raw in (_tone(0.9, 1.0), _tone(0.02, 1.0), _spiky(), _tone(0.5, 0.09)):
        out, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, _bed_env(-20.0),
                                     cfg, 0.0)
        assert g.peak_dbfs(out) <= VO[0] - 6.0 + 0.05, plan
        assert g.peak_dbfs(out) <= -0.95, plan


def test_masking_is_reported_when_the_cue_reaches_the_narration():
    # Momentary VO is nearly silent here, so an accent at -26 dB sits inside it.
    quiet_vo = (-1.0, -20.0, [-30.0] * 200)
    _, plan = g.prepare_sample(_sound(), {}, _tone(0.035, 2.0), SR, quiet_vo,
                               _bed_env(-29.0), _cfg(), 0.0)
    assert "masks_voice" in plan["flags"]


def test_level_disabled_falls_back_to_peak_normalisation():
    out, plan = g.prepare_sample(_sound(), {}, _tone(0.5, 1.0), SR, VO, None,
                                 _cfg(enabled=False), 0.0)
    assert plan["mode"] == "peak"
    assert g.peak_dbfs(out) == pytest.approx(-15.9, abs=0.1)       # 0.9 peak, -15 dB


def test_per_sound_peak_mode_is_an_escape_hatch():
    _, plan = g.prepare_sample(_sound(level={"mode": "peak"}), {}, _tone(0.5, 1.0),
                               SR, VO, None, _cfg(), 0.0)
    assert plan["mode"] == "peak"


def test_trim_db_and_cue_gain_db_stack_on_the_target():
    _, plan = g.prepare_sample(_sound(level={"trim_db": 3.0}),
                               {"params": {"gain_db": -2.0}}, _tone(0.9, 1.0), SR,
                               VO, None, _cfg(), 0.0)
    assert plan["target_dbfs"] == pytest.approx(-31.0, abs=0.01)


def test_peak_clamped_cue_reports_the_achieved_level_not_the_wish():
    # Near-silent body with one sharp hit: ~32 dB crest, so matching its
    # loudness would blow the peak ceiling.
    raw = _tone(0.0005, 2.0)
    raw[100:102] = [0.9, -0.9]
    out, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, None, _cfg(), 0.0)
    assert "peak_clamped" in plan["flags"]
    assert plan["achieved_dbfs"] < plan["target_dbfs"] - 6.0
    assert plan["achieved_dbfs"] == pytest.approx(
        plan["sample_loudest_dbfs"] + plan["gain_db"], abs=0.01)


def test_floor_capped_is_reported_only_when_the_cap_bites():
    # A normal bed is reachable, so no floor_capped on the routine path.
    _, plan = g.prepare_sample(_sound(), {}, _tone(0.035, 2.0), SR, VO,
                               _bed_env(-29.0), _cfg(), 0.0)
    assert "floor_capped" not in plan["flags"]


# ---------------------------------------------------------------------------
# the bed is ducked at stitch time, so the floor must use the ducked level
# ---------------------------------------------------------------------------

def test_bed_duck_fallback_follows_the_sidechain_law():
    bcfg = {"duck_threshold_db": -25.0, "duck_ratio": 8.0,
            "duck_detect_offset_db": 8.0}
    assert g.bed_duck_db(None, bcfg) == 0.0
    assert g.bed_duck_db(-40.0, bcfg) == 0.0            # key below threshold
    assert g.bed_duck_db(-33.0, bcfg) == 0.0            # -33 + 8 = -25 exactly
    # -19 + 8 = -11 -> 14 dB over threshold, x (1 - 1/8) = 12.25 dB
    assert g.bed_duck_db(-19.0, bcfg) == pytest.approx(12.25, abs=0.01)
    assert g.bed_duck_db(-19.0, dict(bcfg, duck_ratio=1.0)) == 0.0


def test_floor_uses_the_measured_ducked_bed_not_the_rendered_bed():
    raw = _tone(0.035, 2.0)                      # L400 ~= -32.1 dBFS
    bed = _bed_env(-29.0)
    ducked_bed = _bed_env(-39.5)                  # 10.5 dB of sidechain duck
    _, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, bed, _cfg(), 0.0,
                               bed_env_ducked=ducked_bed)
    assert plan["bed_duck_db"] == pytest.approx(10.5, abs=0.1)
    assert plan["bed_ducked_dbfs"] == pytest.approx(-39.5, abs=0.1)
    # the music is 10 dB lower by the time it plays, so the cue needs no lift
    assert plan["target_dbfs"] == pytest.approx(-32.0, abs=0.01)


def test_floor_falls_back_to_the_analytic_duck_when_the_bed_is_not_measured():
    raw = _tone(0.035, 2.0)
    bed = _bed_env(-29.0)
    cfg = _cfg()
    cfg["bgm"] = {"duck_threshold_db": -25.0, "duck_ratio": 8.0,
                  "duck_detect_offset_db": 8.0}
    _, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, bed, cfg, 0.0)
    # vo_I - 20 is the 400 ms momentary level in VO; -20 + 8 - (-25) = 13 dB over
    # threshold, x (1 - 1/8) = 11.375 dB of duck.
    assert plan["bed_duck_db"] == pytest.approx(11.375, abs=0.05)
    # the ducked bed (-40.4) leaves the cue at its accent level, no lift
    assert plan["target_dbfs"] == pytest.approx(-32.0, abs=0.01)


def test_duck_off_keeps_the_floor_on_the_rendered_bed():
    raw = _tone(0.035, 2.0)
    bed = _bed_env(-29.0)
    dry_cfg = _cfg()
    dry_cfg["bgm"] = {"duck_ratio": 1.0}
    out, dry = g.prepare_sample(_sound(), {}, raw, SR, VO, bed, dry_cfg, 0.0)
    assert dry["target_dbfs"] == pytest.approx(dry["floor_dbfs"], abs=0.01)
    assert _event_margin(out, -29.0) >= -0.2


# ---------------------------------------------------------------------------
# cue-level trimming (the "runs too long" problem)
# ---------------------------------------------------------------------------


def test_slice_cue_trims_with_a_squared_fade_out():
    raw = [1.0] * 1000
    seg, trimmed = g._slice_cue(raw, {"duration": 0.25, "fade": 0.1}, 1000)
    assert trimmed and len(seg) == 250
    assert seg[149] == pytest.approx(1.0)
    assert seg[150] == pytest.approx(1.0)          # fade starts one sample later
    assert abs(seg[-1]) < 0.01
    assert raw[-1] == 1.0                          # source untouched


def test_slice_cue_offset_skips_into_the_asset_and_guards_the_click():
    raw = [float(i) for i in range(1000)]
    seg, trimmed = g._slice_cue(raw, {"offset": 0.5}, 1000)
    assert trimmed and len(seg) == 500
    assert seg[0] == 0.0                       # 5 ms click guard
    assert seg[5] == pytest.approx(505.0)      # then the real offset material
    assert seg[-1] == pytest.approx(999.0)


def test_slice_cue_offset_past_the_end_is_dropped_not_wrapped():
    seg, trimmed = g._slice_cue([1.0] * 100, {"offset": 5.0}, 100)
    assert seg is None and trimmed


def test_slice_cue_without_duration_keeps_the_whole_asset():
    seg, trimmed = g._slice_cue([1.0] * 100, {}, 100)
    assert len(seg) == 100 and trimmed is False


# ---------------------------------------------------------------------------
# the audibility guard — broadband loudness is blind to WHERE a cue lives
# ---------------------------------------------------------------------------


def _env(dbfs, points=200):
    """A 10 Hz energy envelope sitting at one level."""
    return [10.0 ** (dbfs / 10.0)] * points


def test_a_cue_that_lives_below_the_speaker_band_is_flagged():
    # 60 Hz rumble: on a laptop or phone speaker this cue is 14 dB quieter
    # than the mix says it is, so the law has to say so.
    _, plan = g.prepare_sample(_sound(), {}, _tone(0.5, 2.0, freq=60.0), SR, VO,
                               None, _cfg(), 0.0)
    assert "subsonic_asset" in plan["flags"]
    assert plan["audibility"]["subsonic_drop_db"] > 10.0


def test_a_mid_forward_cue_is_not_flagged_as_subsonic():
    _, plan = g.prepare_sample(_sound(), {}, _tone(0.5, 2.0, freq=1000.0), SR, VO,
                               None, _cfg(), 0.0)
    assert "subsonic_asset" not in plan["flags"]
    assert plan["audibility"]["subsonic_drop_db"] < 10.0


def test_a_cue_the_narration_masks_is_flagged():
    # The voice's presence band sits 10 dB below its broadband level, so the
    # cue's presence peak is measured against -30 dB here.
    raw = _tone(0.035, 2.0, freq=1500.0)
    _, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, None, _cfg(), 0.0,
                               vo_presence_offset_db=-10.0)
    assert "masked_by_voice" in plan["flags"]
    assert plan["audibility"]["voice_presence_dbfs"] == pytest.approx(-30.0, abs=0.1)


def test_a_cue_that_clears_the_narration_is_not_flagged_as_masked():
    raw = _tone(0.035, 2.0, freq=1500.0)
    _, plan = g.prepare_sample(_sound(), {}, raw, SR, VO, None, _cfg(), 0.0,
                               vo_presence_offset_db=-40.0)
    assert "masked_by_voice" not in plan["flags"]


def test_a_cue_in_a_speech_gap_is_not_flagged_as_masking_the_voice():
    # The cue is loud enough to reach the narration's level, but the
    # narration is not speaking there: nothing is being masked.
    cfg = _cfg(accent_offset_db=0.0, gain_clamp_db=[-36.0, 20.0])
    raw = _tone(0.035, 2.0)
    _, speaking = g.prepare_sample(_sound(), {}, raw, SR, VO, None, cfg, 0.0,
                                   vo_env=_env(-13.0))
    assert "masks_voice" in speaking["flags"]
    _, gap = g.prepare_sample(_sound(), {}, raw, SR, VO, None, cfg, 0.0,
                              vo_env=_env(-90.0))
    assert "masks_voice" not in gap["flags"]


def test_the_band_filters_do_not_swallow_the_band_they_measure():
    # A cascade of one-pole sections must stay -3 dB at the cutoff, or every
    # mid-bass cue reads as subsonic.
    x = _tone(0.5, 2.0, freq=220.0)
    plain = g.loudest_window_db(x, SR, 0.4, 0.1)
    above = g.loudest_window_db(g.band_filter(x, SR, 150.0, SR / 2), SR, 0.4, 0.1)
    assert plain - above < 4.0
    below = g.loudest_window_db(g.band_filter(x, SR, 0.0, 100.0), SR, 0.4, 0.1)
    assert plain - below > 6.0


def test_the_voiceover_momentary_series_is_parsed():
    # ebur128 prints the momentary value WITHOUT a LUFS suffix and behind
    # ffmpeg's "[Parsed_ebur128_0 @ ...]" prefix — the series used to be
    # empty, which silently disabled the whole "is the voice here" check.
    import shutil
    import subprocess
    import wave

    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not available")
    tmp = Path(__file__).resolve().parent.parent / "tests" / "_tmp_vo"
    tmp.mkdir(exist_ok=True)
    wav = tmp / "vo.wav"
    mp3 = tmp / "voiceover_aligned.mp3"
    sr = 22050
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        # 1 s of tone, 1 s of silence
        for i in range(sr * 2):
            v = int(12000 * math.sin(2 * math.pi * 440 * i / sr)) if i < sr else 0
            w.writeframes(struct.pack("<h", v))
    subprocess.run(["ffmpeg", "-y", "-i", str(wav), "-ar", "44100", str(mp3)],
                   capture_output=True, check=True)
    peak, integrated, momentary = g.measure_voiceover(tmp)
    assert momentary, "the M: series was not parsed"
    assert max(momentary) > -40.0
    assert min(momentary) <= -70.0          # the silent half reads as silence
    wav.unlink()
    mp3.unlink()
    tmp.rmdir()


# ---------------------------------------------------------------------------
# reports and hash invalidation
# ---------------------------------------------------------------------------


def test_level_report_records_the_law_and_tallies_flags(tmp_path):
    plans = [
        {"scene": 1, "cue_index": 0, "sound": "a", "gain_db": -3.0, "flags": []},
        {"scene": 2, "cue_index": 0, "sound": "b", "gain_db": 2.0,
         "flags": ["gain_ceiling_clamp", "peak_clamped"]},
    ]
    path, flags = g.write_level_report(tmp_path, -1.0, -20.0, plans, _cfg())
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["voiceover"]["integrated_lufs"] == -20.0
    assert data["law"]["accent_offset_db"] == -12.0
    assert data["flags"] == {"gain_ceiling_clamp": 1, "peak_clamped": 1}
    assert flags == data["flags"]
    assert len(data["cues"]) == 2


def _hash(cfg, scene=None):
    scene = scene or {"id": 1, "actual_duration_frames": 300}
    return g.build_sfx_hash(scene, [scene], [], cfg, {1: 0.0}, 10.0, fps=30)


def test_sfx_hash_tracks_the_voiceover_and_the_law():
    base = _hash(_cfg())
    assert base != _hash(_cfg(accent_offset_db=-9.0))
    assert base != _hash(_cfg(), {"id": 1, "actual_duration_frames": 300,
                                  "voiceover_hash": "deadbeef"})
