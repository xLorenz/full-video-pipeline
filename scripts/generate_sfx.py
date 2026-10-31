#!/usr/bin/env python3
"""generate_sfx.py — build sfx_aligned.mp3 + bgm_aligned.mp3 on the absolute timeline.

Pipeline rule served: "render silent, mux at stitch" — SFX/BGM are mixed at
assemble time, never baked into scene videos. Fully local: Tone.js/WebAudio
recipes (node) + bundled CC0 samples; no network, no new dependencies.

Usage: python3 generate_sfx.py <video_dir> [--force]
"""

import hashlib
import json
import math
import os
import random
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl          # noqa: E402
import sfx_catalog as sfx          # noqa: E402
import tone_render                 # noqa: E402  (Tone.js/WebAudio engine bridge)

SR = 44100                          # overridden from config at runtime; keep const names SR

MAX_TRACK_BYTES = 512 * 1024 * 1024  # 512 MB float buffer guard per track


# ---------------------------------------------------------------------------
# Timeline resolution (§4.4)
# ---------------------------------------------------------------------------


FPS = 30                            # overridden from scenes.json at runtime


def scene_duration(s, fps=None):
    """Frame-exact scene duration (actual_duration_frames / fps) so cue and bed
    positions share the SAME timeline as the video scenes and assemble.py's
    frame-padded voiceover. Falls back to raw measured seconds when frames are
    missing (pre-Step-6 previews), then target seconds."""
    f = fps if fps else globals().get("FPS", 30)
    frames = s.get("actual_duration_frames")
    if frames and f:
        return float(frames) / float(f)
    return float(s.get("actual_duration_seconds") or s.get("target_duration_seconds") or 0.0)


def cumulative_offsets(scenes, fps=None):
    """{scene_id: absolute_start_seconds}; returns (offsets, video_total_seconds)."""
    off, total, out = 0.0, 0.0, {}
    for s in sorted(scenes, key=lambda x: x["id"]):
        out[s["id"]] = off
        d = scene_duration(s, fps)
        off += d
        total += d
    return out, total


def resolve_when(when, dur, beats):
    """When-grammar -> scene-relative seconds. Raises ValueError with actionable messages."""
    if isinstance(when, str):
        if when == "start":
            return 0.0
        if when == "mid":
            return dur / 2.0
        if when == "end":
            return dur
        if when.startswith("beat:"):
            name = when[len("beat:"):]
            if name not in beats:
                raise ValueError(f"beat '{name}' not defined in this scene's beats")
            return float(beats[name]["time"])
        raise ValueError(f"unrecognized when value {when!r}")
    return float(when)


def place_cue(samples_total, cue_samples, start_abs, tail_fade_seconds, cue_fade_out=None):
    """Returns (start_sample, segment trimmed to fit), or None when inaudible.

    cue_fade_out (seconds) overrides config tail_fade_seconds for THIS cue's tail-trim
    only; when None, the config default applies. Only the end-of-video tail-trim is
    faded — cues that fit entirely within the timeline are returned unchanged.
    """
    start = int(round(start_abs * SR))
    if start >= samples_total:
        return None                                    # inaudible — dropped with WARN (caller prints)
    seg = cue_samples
    if start + len(seg) > samples_total:               # tail would cross video end
        end = samples_total
        seg = seg[: end - start]
        remaining = end - start
        fade_sec = cue_fade_out if cue_fade_out is not None else tail_fade_seconds
        fade_len = min(fade_sec * SR, max(0.0, remaining / 2.0))
        if fade_len > 16:
            n_fade = int(fade_len)
            # In-place squared fade on the tail slice (avoids temp list copies).
            tail_start = len(seg) - n_fade
            for i in range(n_fade):
                f = 1.0 - i / fade_len
                seg[tail_start + i] *= f * f
    return start, seg


# ---------------------------------------------------------------------------
# Voiceover measurement (§4.5)
# ---------------------------------------------------------------------------


def measure_voiceover(video_dir):
    """Returns (vo_peak_db, vo_integrated_lufs, vo_momentary_lufs).

    vo_peak_db:     `volumedetect` max_volume (dBFS, negative).
    vo_integrated:  LAST `I:` value from the ebur128 filter (integrated loudness, negative).
    vo_momentary:   the `M:` series (one value per 100 ms, LUFS) from the SAME
                    ebur128 pass — the local narration level the SFX level law
                    anchors against (a cue may never out-shout the narration
                    playing under it).

    Exits 1 when the loudness probe cannot be parsed.
    """
    mp3 = Path(video_dir) / "voiceover_aligned.mp3"
    peak, integrated, momentary = None, None, []

    r1 = subprocess.run(
        ["ffmpeg", "-i", str(mp3), "-filter:a", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    text = r1.stdout + r1.stderr
    m = __import__("re").search(r"max_volume:\s*([-\d.]+)\s*dB", text)
    if m:
        peak = float(m.group(1))

    r2 = subprocess.run(
        ["ffmpeg", "-i", str(mp3), "-filter_complex", "ebur128", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    text2 = r2.stdout + r2.stderr
    _re = __import__("re")
    ms = _re.findall(r"^\s*I:\s*([-\d.]+)\s*LUFS", text2, _re.MULTILINE)
    if ms:
        integrated = float(ms[-1])
    # The per-frame ebur128 lines print the momentary value WITHOUT a LUFS
    # suffix ("... M:-120.7 S:-120.7  I: -19.4 LUFS ..."), and the line starts
    # with ffmpeg's "[Parsed_ebur128_0 @ ...]" prefix — so the series has to be
    # read unanchored and without the suffix, and only from the per-frame
    # block (the trailing summary can repeat a field).
    frames = text2.split("Summary:")[0]
    momentary = [max(-70.0, float(v)) for v in
                 _re.findall(r"\bM:\s*(-?[\d.]+)", frames)]

    if peak is None or integrated is None:
        print("ERROR: could not measure voiceover loudness from voiceover_aligned.mp3")
        sys.exit(1)
    return peak, integrated, momentary


def measure_voice_presence_offset(video_dir, presence_low_hz=1000.0,
                                  presence_high_hz=8000.0):
    """How far the voiceover's PRESENCE band sits below its own broadband level.

    A TTS voice puts most of its energy in the low mids (200-800 Hz), so a cue
    only cuts through the narration when it carries energy up at 1-8 kHz. This
    measures the voice's spectral balance with plain RMS on BOTH sides of the
    same ruler, so the audibility guard can compare a cue against the
    narration in the band where the two actually compete.

    -> dB (negative) or None when it cannot be measured.
    """
    mp3 = Path(video_dir) / "voiceover_aligned.mp3"
    if not mp3.exists():
        return None

    def _rms_db(filter_chain):
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp3), "-af",
             f"{filter_chain},astats=metadata=1:reset=0", "-f", "null", "-"],
            capture_output=True, text=True)
        vals = re.findall(r"RMS level dB:\s*(-?[\d.]+|-inf)", proc.stderr)
        if not vals:
            return None
        last = vals[-1]
        if last in ("-inf", "-infinity"):
            return None
        try:
            return float(last)
        except ValueError:
            return None

    broad = _rms_db("anull")
    if broad is None:
        return None
    presence = _rms_db(
        f"highpass=f={presence_low_hz},lowpass=f={presence_high_hz}")
    if presence is None:
        return None
    return presence - broad


def ensure_voiceover_aligned(video_dir, scenes, fps=None):
    """Rebuild voiceover_aligned.mp3 when missing (retention cleanup deletes it post-stitch).

    Uses the SAME frame-padded concat as assemble.py (pl.voiceover_pad_graph) so
    the loudness anchor is measured on audio identical to what gets muxed.
    """
    video_dir = Path(video_dir)
    aligned = video_dir / "voiceover_aligned.mp3"
    if aligned.exists():
        return
    voiceover_dir = video_dir / "voiceover"
    inputs, graph, missing = pl.voiceover_pad_graph(voiceover_dir, scenes, fps)
    if missing:
        print(f"ERROR: Voiceover MP3 missing for scenes: {missing}")
        sys.exit(1)
    with tempfile.TemporaryDirectory(prefix=".vo_align_", dir=str(video_dir)) as td:
        out_tmp = Path(td) / "aligned.mp3"
        result = subprocess.run(
            ["ffmpeg", "-y", *inputs, "-filter_complex", graph,
             "-map", "[aout]", "-c:a", "libmp3lame", "-b:a", "192k", str(out_tmp)],
            capture_output=True, text=True,
        )
        if result.returncode != 0 or not out_tmp.exists():
            print("ERROR: could not rebuild voiceover_aligned.mp3")
            sys.exit(1)
        pl.atomic_replace(Path(out_tmp), Path(aligned))


# ---------------------------------------------------------------------------
# Gain law (§4.6)
# ---------------------------------------------------------------------------


def cue_gain_db(volume, full_scale_db):
    v = 0.5 if volume is None else float(volume)        # defensive default
    return full_scale_db + (v - 1.0) * 10.0             # 1.0→fs, 0.5→fs-5, 0.0→fs-10


def bed_gain_db(volume, bed_db):
    v = 0.6 if volume is None else float(volume)        # config default when omitted
    return bed_db + (v - 1.0) * 10.0


def apply_gain_db(x, db):                               # x: iterable of floats → new array
    g = 10.0 ** (db / 20.0)
    # Local-bound loop avoids generator overhead for large tracks.
    n = len(x)
    out = array("f", [0.0]) * n
    for i in range(n):
        out[i] = x[i] * g
    return out


def mix_add(master, start_sample, samples, gain=1.0):
    """Add `samples` into master at start_sample (in place)."""
    # Fast paths avoid per-element gain multiply; locals avoid attr lookups.
    n = len(samples)
    if n == 0:
        return
    if gain == 1.0:
        for k in range(n):
            master[start_sample + k] += samples[k]
    else:
        g = gain
        for k in range(n):
            master[start_sample + k] += samples[k] * g


# ---------------------------------------------------------------------------
# DSP primitives (§4.7)
# ---------------------------------------------------------------------------


def _white(rng, n):
    # rng.random()*2-1 is faster than uniform() (no arg validation).
    rand = rng.random
    return [rand() * 2.0 - 1.0 for _ in range(n)]


def _sine(freq, n, phase=0.0):
    step = 2.0 * math.pi * freq / SR
    sin = math.sin
    return [sin(phase + step * i) for i in range(n)]


def _sweep_sine(f0, f1, n, exp_curve=True):
    """Exponential (log) frequency glide f0→f1 over n samples."""
    out, ph = [], 0.0
    r = math.log(f1 / f0) if f0 > 0 else 0.0
    for i in range(n):
        t = i / max(1, n - 1)
        f = f0 * math.exp(r * t) if exp_curve else f0 + (f1 - f0) * t
        ph += 2.0 * math.pi * f / SR
        out.append(math.sin(ph))
    return out


def _highpass_one_pole(x, fc):
    w, y, prev, out = math.exp(-2.0 * math.pi * fc / SR), 0.0, 0.0, []
    for v in x:
        y = w * (y + v - prev)
        prev = v
        out.append(y)
    return out


def _lowpass_one_pole(x, fc):
    w, y, out = math.exp(-2.0 * math.pi * fc / SR), 0.0, []
    for v in x:
        y = (1.0 - w) * v + w * y
        out.append(y)
    return out


def _env_decay(x, tau_sec, start_at=0, tail=True):
    """Exponential decay with time constant tau applied from start_at to the end."""
    out = list(x)
    for i in range(start_at, len(out)):
        out[i] *= math.exp(-(i - start_at) / (tau_sec * SR))
    return out


def _normalize(x, peak=0.9):
    m = max((abs(v) for v in x), default=0.0)
    if m <= 1e-9:
        return list(x)
    g = peak / m
    return [v * g for v in x]


def _resample(x, speed):
    """Linear-interpolation time-stretch by factor `speed` (pitch param). speed=2 → half the samples."""
    if speed <= 0 or speed == 1.0:
        return list(x)
    n_out = max(1, int(len(x) / speed))
    out = []
    for i in range(n_out):
        p = i * speed
        i0, frac = int(p), p - int(p)
        v = x[i0] if i0 >= len(x) - 1 else x[i0] + (x[i0 + 1] - x[i0]) * frac
        out.append(v)
    return out


# ---------------------------------------------------------------------------
# Sample level law — render-time loudness matching against the measured VO
# ---------------------------------------------------------------------------


def energy_envelope(samples, sr, hop_seconds=0.1):
    """Per-hop mean-square energy (linear) — the 10 Hz bed/loudness envelope."""
    hop = max(1, int(round(hop_seconds * sr)))
    out = []
    n = len(samples)
    for i in range(0, n, hop):
        seg = samples[i:i + hop]
        s = 0.0
        for v in seg:
            s += v * v
        out.append(s / len(seg) if seg else 0.0)
    return out


def _energy_db(x):
    return 10.0 * math.log10(x + 1e-20)


def peak_dbfs(samples):
    peak = 0.0
    for v in samples:
        a = -v if v < 0.0 else v
        if a > peak:
            peak = a
    return 20.0 * math.log10(peak) if peak > 1e-9 else -120.0


# ---------------------------------------------------------------------------
# Band analysis — will the cue survive the speakers the audience has?
# ---------------------------------------------------------------------------
#
# A loudness law that only looks at broadband energy is blind to WHERE a cue
# lives. A boom whose energy is 99 % below 80 Hz measures "loud" next to the
# music and the voice, and is inaudible on every laptop and phone speaker
# (they roll off below ~150 Hz) — the mix report says the cue is fine and the
# listener hears nothing. These helpers measure the cue's energy per band so
# the law can say so out loud.


def _section_cutoff(target_hz, order):
    """Corner of each one-pole section so the CASCADE is -3 dB at target_hz.

    Cascading N identical one-pole sections stacks their attenuation, so the
    cascade's -3 dB point sits well below each section's own corner. Left
    uncorrected, a 4-section highpass at 150 Hz would already be 9 dB down at
    220 Hz — it would call a perfectly audible mid-bass cue subsonic.
    """
    factor = (10.0 ** (3.0 / (10.0 * order)) - 1.0) ** 0.5
    return target_hz * factor


def _one_pole_lp(samples, sr, cutoff_hz, order=4):
    """Lowpass built from cascaded one-pole sections (~24 dB/oct)."""
    a = 1.0 - math.exp(-2.0 * math.pi * cutoff_hz / sr)
    y = samples
    for _ in range(order):
        out = []
        z = 0.0
        for x in y:
            z += a * (x - z)
            out.append(z)
        y = out
    return y


def _one_pole_hp(samples, sr, cutoff_hz, order=4):
    """Highpass built from cascaded one-pole sections (~24 dB/oct)."""
    a = math.exp(-2.0 * math.pi * cutoff_hz / sr)
    y = samples
    for _ in range(order):
        out = []
        z = 0.0
        prev_x = 0.0
        for x in y:
            z = a * (z + x - prev_x)
            prev_x = x
            out.append(z)
        y = out
    return y


def band_filter(samples, sr, lo_hz, hi_hz, order=4):
    """Bandpass a signal: highpass at lo_hz, then lowpass at hi_hz."""
    nyq = sr / 2.0
    hi = min(float(hi_hz), nyq * 0.98)
    lo = max(0.0, min(float(lo_hz), nyq * 0.98))
    y = samples
    if lo > 0.0:
        y = _one_pole_hp(y, sr, _section_cutoff(lo, order), order)
    if hi < nyq * 0.98:
        y = _one_pole_lp(y, sr, _section_cutoff(hi, order), order)
    return y


def band_rms_dbfs(samples, sr, lo_hz, hi_hz):
    """RMS level of the signal restricted to a band (dBFS)."""
    if not samples:
        return -120.0
    y = band_filter(samples, sr, lo_hz, hi_hz)
    s = 0.0
    for v in y:
        s += v * v
    rms = math.sqrt(s / len(y))
    return 20.0 * math.log10(rms) if rms > 1e-9 else -120.0


def band_loudest_dbfs(samples, sr, lo_hz, hi_hz, win=0.05, hop=0.01):
    """Loudest short window inside a band (transient audibility, dBFS)."""
    if not samples:
        return -120.0
    y = band_filter(samples, sr, lo_hz, hi_hz)
    n = max(1, int(win * sr))
    total = 0.0
    best = -120.0
    for i, v in enumerate(y):
        total += v * v
        if i >= n:
            total -= y[i - n] * y[i - n]
        if i >= n - 1:
            rms = math.sqrt(max(total, 0.0) / n)
            if rms > 1e-9:
                db = 20.0 * math.log10(rms)
                if db > best:
                    best = db
    return best


def attack_offset(samples, sr):
    """Time (s) of the sample's loudest point — where the listener hears the hit."""
    best = 0.0
    idx = 0
    for i, v in enumerate(samples):
        a = -v if v < 0.0 else v
        if a > best:
            best = a
            idx = i
    return idx / sr if sr else 0.0


def loudest_window_db(samples, sr, window_seconds=0.4, hop_seconds=0.1):
    """Loudest rolling-window RMS in dBFS — the sample's perceived level proxy.

    Peak normalization equalizes peaks; this equalizes what you HEAR, so a dense
    loop and a short transient land at the same level. O(n), deterministic.
    """
    env = energy_envelope(samples, sr, hop_seconds)
    if not env:
        return -120.0
    k = max(1, int(round(window_seconds / hop_seconds)))
    if len(env) <= k:
        return _energy_db(sum(env) / len(env))
    s = sum(env[:k])
    best = s
    for i in range(k, len(env)):
        s += env[i] - env[i - k]
        if s > best:
            best = s
    return _energy_db(best / k)


def envelope_level_db(env, hop_seconds, t0, t1):
    """Mean level (dB) of `env` over [t0, t1) seconds; -120 when empty."""
    if not env:
        return -120.0
    i0 = max(0, int(t0 / hop_seconds))
    i1 = min(len(env), int(math.ceil(t1 / hop_seconds)) + 1)
    if i1 <= i0:
        return -120.0
    return _energy_db(sum(env[i0:i1]) / (i1 - i0))


def envelope_loudest_db(env, hop_seconds, t0, t1, window_seconds=0.4):
    """Loudest `window_seconds` mean level of `env` inside [t0, t1) seconds.

    The floor must survive the loudest moment of the bed, not its average: a
    5 s cue that starts over a quiet bar and ends over a loud one is buried by
    the average but audible by the loudest part.
    """
    if not env:
        return -120.0
    k = max(1, int(round(window_seconds / hop_seconds)))
    i0 = max(0, int(t0 / hop_seconds))
    i1 = min(len(env), int(math.ceil(t1 / hop_seconds)) + 1)
    if i1 <= i0:
        return -120.0
    span = i1 - i0
    if span <= k:
        return _energy_db(sum(env[i0:i1]) / span)
    s = sum(env[i0:i0 + k])
    best = _energy_db(s / k)
    for i in range(i0 + k, i1):
        s += env[i] - env[i - k]
        best = max(best, _energy_db(s / k))
    return best


def voice_local_lufs(momentary, hop_seconds, t0, t1):
    """Mean momentary VO loudness over [t0, t1); None when the series is empty."""
    if not momentary:
        return None
    i0 = max(0, int(t0 / hop_seconds))
    i1 = min(len(momentary), int(math.ceil(t1 / hop_seconds)) + 1)
    if i1 <= i0:
        return None
    window = momentary[i0:i1]
    return sum(window) / len(window)


def _slice_cue(raw, params, sr):
    """offset/duration/fade window over a decoded asset. -> (seg, trimmed) or (None, True)."""
    off = float(params.get("offset") or 0.0)
    dur = params.get("duration")
    a = max(0, int(round(off * sr)))
    if a >= len(raw):
        return None, True
    b = len(raw) if dur is None else min(len(raw), a + max(1, int(round(float(dur) * sr))))
    # decode_to_floats returns a tuple and the asset may be cached: always work on
    # a mutable copy so the fades below cannot touch (or fail on) the source.
    seg = list(raw[a:b])
    trimmed = a > 0 or dur is not None
    if b < len(raw):                            # we cut into the material: land it
        fade = params.get("fade")
        fade_sec = 0.12 if fade is None else float(fade)
        n = min(int(round(fade_sec * sr)), len(seg) // 2)
        for i in range(n):
            seg[len(seg) - n + i] *= (1.0 - i / n) ** 2
    if a > 0:                                   # offset starts mid-waveform: click guard
        n = min(int(round(0.005 * sr)), len(seg) // 2)
        for i in range(n):
            seg[i] *= (i / n) ** 2
    return seg, trimmed


def bed_duck_db(vo_local_db, bcfg):
    """Fallback estimate of the gain reduction the stitch sidechain applies.

    `assemble.py` ducks the BGM with `sidechaincompress` keyed by the voiceover,
    so a cue competes with the *ducked* bed, not the rendered one. The compressor
    detector is fast (5 ms attack) while `vo_local_db` is a 400 ms momentary
    loudness, so the instantaneous key sits hotter than the measured window
    (configurable via `duck_detect_offset_db`, empirically ~8 dB).

    This is only the fallback: `ducked_bed_envelope()` runs the real filter and
    measures the duck exactly, which is what the floor normally uses.
    """
    threshold = float(bcfg.get("duck_threshold_db", -25.0))
    ratio = max(1.0, float(bcfg.get("duck_ratio", 8.0)))
    detect = float(bcfg.get("duck_detect_offset_db", 8.0))
    if vo_local_db is None or vo_local_db <= -69.0:
        return 0.0
    over = (float(vo_local_db) + detect) - threshold
    if over <= 0.0:
        return 0.0
    duck = over * (1.0 - 1.0 / ratio)
    return min(duck, float(bcfg.get("duck_max_db", 24.0)))


def audio_envelope(path, sr, hop_seconds=0.1):
    """10 Hz energy envelope of an audio file, measured without a float blow-up.

    Pips f32le straight into an `array('f')` (4 bytes/sample) instead of the
    Python-float tuple `decode_to_floats` returns — a 10-minute bed would cost
    hundreds of megabytes as floats.
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
             "-ac", "1", "-ar", str(sr), "-"],
            capture_output=True, timeout=300)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0 or not result.stdout:
        return None
    buf = result.stdout
    arr = array("f")
    arr.frombytes(buf[: len(buf) - (len(buf) % 4)])
    return energy_envelope(arr, sr, hop_seconds)


def ducked_bed_envelope(video_dir, cfg, hop_seconds=0.1, sr=SR):
    """Envelope of the bed AS IT WILL PLAY under the voiceover.

    The stitch (`assemble.py`) sidechains the music off the narration, so the
    level a cue actually competes with is the ducked bed, not the rendered one.
    Rather than model the compressor, run the exact same filter chain on the
    exact same files and measure the result — the floor then matches the mix.

    Mirrors `assemble.py`'s sidechain parameters. Returns None when the bed or
    the voiceover is missing, or the render fails (the caller then falls back
    to the analytic estimate).
    """
    bcfg = cfg.get("bgm") or {}
    bgm = Path(video_dir) / "bgm_aligned.mp3"
    vo = Path(video_dir) / "voiceover_aligned.mp3"
    if not bgm.exists() or not vo.exists():
        return None
    b = (f"threshold={bcfg.get('duck_threshold_db', -25.0)}dB"
         f":ratio={bcfg.get('duck_ratio', 8.0)}"
         f":attack={bcfg.get('duck_attack_ms', 5.0)}"
         f":release={bcfg.get('duck_release_ms', 250.0)}")
    fc = (f"[1:a]asplit=2[vo][sc];[vo]anullsink;"
          f"[0:a][sc]sidechaincompress={b}[bgmd]")
    try:
        result = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(bgm), "-i", str(vo),
             "-filter_complex", fc, "-map", "[bgmd]",
             "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
            capture_output=True, timeout=300)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0 or not result.stdout:
        return None
    buf = result.stdout
    arr = array("f")
    arr.frombytes(buf[: len(buf) - (len(buf) % 4)])
    return energy_envelope(arr, sr, hop_seconds)


def prepare_sample(sound, cue, raw, sr, vo_anchor, bed_env, cfg, start_abs,
                   bed_env_ducked=None, vo_presence_offset_db=None, vo_env=None):
    """Level ONE sample cue against the measured voiceover (and the bed).

    Returns (samples, plan). The law, in order:

      nominal  = vo_I + accent_offset + (volume-0.5)*10 + trim_db
      floor    = max(ducked_bed + over_bed, vo_I - max_below_vo)        [soft]
      ceiling  = min(sample_peak_ceiling, vo_peak - vo_headroom)         [HARD]

    The soft floor lifts inaudible cues above the music, but only when the cue
    inherits its default volume — an explicit `volume` is authorial intent and is
    honoured (with a warning). The peak ceiling is applied LAST and can never be
    overruled: no cue is ever louder than the narration at its peak.

    `bed_env_ducked` is the bed envelope AFTER the stitch-time sidechain; when
    it is available the floor measures against the music that really plays.
    """
    params = cue.get("params") or {}
    volume = cue.get("volume")
    v = float(volume) if volume is not None else float(sound.default_volume)
    scfg = cfg.get("sfx", {})
    lcfg = scfg.get("level") or {}
    flags = []
    peak = peak_dbfs(raw)

    if (not lcfg.get("enabled", True)
            or (sound.level or {}).get("mode") == "peak"
            or vo_anchor is None):
        seg = _normalize(raw, 0.9)
        gain = cue_gain_db(volume if volume is not None else sound.default_volume,
                           scfg.get("full_scale_db", -10.0))
        loud = loudest_window_db(raw, sr)
        plan = {"mode": "peak", "gain_db": round(gain, 2),
                "sample_peak_dbfs": round(peak, 2),
                "sample_loudest_dbfs": round(loud, 2),
                "target_dbfs": None, "achieved_dbfs": round(loud + gain, 2),
                "floor_dbfs": None, "ceiling_dbfs": None,
                "flags": flags}
        return apply_gain_db(seg, gain), plan

    vo_peak, vo_I, vo_mom = vo_anchor
    win = float(lcfg.get("window_seconds", 0.4))
    hop = float(lcfg.get("hop_seconds", 0.1))
    burst_win = float(lcfg.get("burst_window_seconds", 0.1))
    loud = loudest_window_db(raw, sr, win, hop)
    trim_db = float((sound.level or {}).get("trim_db") or 0.0) + float(params.get("gain_db") or 0.0)
    nominal = vo_I + float(lcfg.get("accent_offset_db", -14.0)) + (v - 0.5) * 10.0 + trim_db

    local = voice_local_lufs(vo_mom, hop, start_abs, start_abs + win)
    bed = None
    bed_comp = None
    bed_at_attack = None
    duck = 0.0
    mask_required = -120.0
    floor = float(vo_I) - float(lcfg.get("max_below_vo_db", 24.0))
    if bed_env:
        # The bed level that matters is the loudest moment the cue overlaps —
        # the cue is only as safe as its worst second.
        span_end = start_abs + max(len(raw) / sr, win)
        bed = envelope_loudest_db(bed_env, hop, start_abs, span_end, win)
        extra_duck = 0.0
        if bed_env_ducked:
            # Measured: the bed as the stitch will actually play it.
            bed_comp = envelope_loudest_db(bed_env_ducked, hop, start_abs,
                                           span_end, win)
            comp_env = bed_env_ducked
            duck = max(0.0, bed - bed_comp)
        else:
            # Fallback: estimate the sidechain's gain reduction analytically.
            duck = bed_duck_db(local, cfg.get("bgm") or {})
            extra_duck = duck
            bed_comp = bed - duck
            comp_env = bed_env
        # THE MASK TEST: the cue must clear the music under it, moment by
        # moment. The two sides are paired the way the ear pairs them: the
        # cue's own level at an instant (10 ms) against the bed's SUSTAINED
        # level there (400 ms). A click is judged by its transient against the
        # music it lands on; a riser by its body against the music under it.
        # Comparing 400 ms averages on both sides buries every transient (a
        # click's peak sits 15-28 dB above its own 400 ms average); comparing
        # the bed's momentary PEAK instead lets a quiet sustained sound slip
        # under a single hi-hat it never had to fight.
        attack_abs = start_abs + attack_offset(raw, sr)
        bed_at_attack = envelope_loudest_db(comp_env, hop,
                                            attack_abs - hop / 2.0,
                                            attack_abs + hop / 2.0, burst_win)
        fine_hop = float(lcfg.get("mask_hop_seconds", 0.01))
        mask_db = float(lcfg.get("mask_window_db", 12.0))
        over_bed = float(lcfg.get("over_bed_db", 3.0))
        fine_env = energy_envelope(raw, sr, fine_hop)
        if fine_env:
            thresh = max(fine_env) * (10.0 ** (-mask_db / 10.0))
            for i, e in enumerate(fine_env):
                if e < thresh:
                    continue                    # the cue's own decay: not an event
                t_i = start_abs + i * fine_hop
                bed_db = (envelope_level_db(comp_env, hop, t_i - win / 2.0,
                                            t_i + win / 2.0) - extra_duck)
                cue_db = _energy_db(e)
                if bed_db > bed_at_attack:
                    bed_at_attack = bed_db
                required = bed_db + over_bed - cue_db
                if required > mask_required:
                    mask_required = required
        if mask_required > -119.0:
            floor = max(floor, loud + mask_required)

    max_dev = float(lcfg.get("max_deviation_db", 10.0))
    bed_drop_needed = 0.0
    if volume is None:
        # The mask promise outranks the accent corridor: a cue that cannot
        # clear the music is lifted until it can. `max_deviation_db` is the
        # point where that lift becomes unusual — past it the engine says so
        # (and how far the bed has to come down instead). The hard bounds are
        # still the gain clamp and the peak ceiling.
        target = max(nominal, floor)
        if target > nominal + max_dev + 1.0:
            flags.append("floor_capped")
            bed_drop_needed = round(target - (nominal + max_dev), 2)
    else:
        target = nominal
        if target < floor:
            flags.append("below_floor_explicit_volume")
            bed_drop_needed = round(floor - nominal, 2)

    ceiling = min(float(lcfg.get("sample_peak_ceiling_db", -1.0)),
                  float(vo_peak) - float(lcfg.get("vo_headroom_db", 3.0)))
    gain = target - loud
    lo, hi = lcfg.get("gain_clamp_db", [-18.0, 9.0])
    if gain > float(hi):
        gain = float(hi)
        flags.append("gain_ceiling_clamp")
    if gain < float(lo):
        gain = float(lo)
        flags.append("gain_floor_clamp")
    if peak + gain > ceiling:
        gain = ceiling - peak
        flags.append("peak_clamped")

    local = voice_local_lufs(vo_mom, hop, start_abs, start_abs + win)
    # `masks_voice` only means something where the narration is actually
    # speaking. The ebur128 momentary series is a 400 ms window that lags the
    # audio, so it reads "silence" while a word is still ringing and "speech"
    # long after the voice stopped; the VO's own fast envelope is the truth.
    # A cue that lands in a gap between sentences is masking nothing.
    if vo_env:
        vo_at_cue = envelope_loudest_db(vo_env, hop, start_abs,
                                         start_abs + burst_win, burst_win)
        speaking = (vo_at_cue is not None
                    and vo_at_cue > vo_I - float(lcfg.get("speech_present_db", 20.0)))
    else:
        vo_at_cue = local
        speaking = local is not None and local > -69.0
    if speaking and vo_at_cue is not None:
        if loud + gain > vo_at_cue - float(lcfg.get("masking_db", 8.0)):
            flags.append("masks_voice")
    if volume is None and floor > nominal and peak + (floor - loud) > ceiling:
        flags.append("corridor_conflict")

    # AUDIBILITY GUARD: broadband loudness says nothing about whether the cue
    # survives the speakers the audience actually has. A cue whose energy lives
    # below ~150 Hz is inaudible on laptop and phone speakers however loud the
    # mix report says it is, and a cue with no presence-band energy is masked
    # by the narration wherever it lands. Both are invisible to the dB law.
    aud_cfg = lcfg.get("audibility") or {}
    aud_info = None
    if aud_cfg.get("enabled", True) and raw:
        speaker_hz = float(aud_cfg.get("speaker_hz", 150.0))
        p_lo = float(aud_cfg.get("presence_low_hz", 1000.0))
        p_hi = float(aud_cfg.get("presence_high_hz", 8000.0))
        # What a laptop/phone speaker actually receives: the cue's loudest
        # window with everything below the speaker band removed.
        spk_db = loudest_window_db(band_filter(raw, sr, speaker_hz, sr / 2.0),
                                   sr, win, hop)
        pres_peak = band_loudest_dbfs(raw, sr, p_lo, p_hi)
        subsonic_drop = loud - spk_db
        aud_info = {"subsonic_drop_db": round(subsonic_drop, 2),
                    "presence_peak_dbfs": round(pres_peak + gain, 2),
                    "voice_presence_dbfs": None}
        if subsonic_drop > float(aud_cfg.get("subsonic_drop_db", 6.0)):
            flags.append("subsonic_asset")
        if (vo_presence_offset_db is not None and local is not None
                and local > -69.0):
            vo_pres = local + float(vo_presence_offset_db)
            aud_info["voice_presence_dbfs"] = round(vo_pres, 2)
            if (pres_peak + gain > -60.0
                    and pres_peak + gain
                    < vo_pres - float(aud_cfg.get("mask_margin_db", 8.0))):
                flags.append("masked_by_voice")

    plan = {"mode": "auto", "gain_db": round(gain, 2),
            "sample_peak_dbfs": round(peak, 2),
            "sample_loudest_dbfs": round(loud, 2),
            "target_dbfs": round(target, 2),
            "achieved_dbfs": round(loud + gain, 2),
            "floor_dbfs": round(floor, 2),
            "ceiling_dbfs": round(ceiling, 2),
            "bed_dbfs": None if bed is None else round(bed, 2),
            "bed_ducked_dbfs": None if bed_comp is None else round(bed_comp, 2),
            "bed_at_attack_dbfs": (None if bed_at_attack is None
                                   else round(bed_at_attack, 2)),
            "mask_gain_db": (None if mask_required <= -119.0
                             else round(mask_required, 2)),
            "bed_drop_needed_db": bed_drop_needed,
            "bed_duck_db": round(duck, 1),
            "audibility": aud_info,
            "flags": flags}
    return apply_gain_db(raw, gain), plan


def normalize_for_preview(raw, sr, sound, target_dbfs=-20.0, peak_ceiling_dbfs=-1.0):
    """Catalog-audition level: all samples at one loudness, offset by default_volume.

    A catalog preview has no voiceover to anchor against, so the reference is
    fixed. Tone sounds keep their design levels (unchanged in the mix).
    """
    loud = loudest_window_db(raw, sr)
    gain = (target_dbfs - loud) + (float(sound.default_volume) - 0.5) * 10.0
    peak = peak_dbfs(raw)
    if peak + gain > peak_ceiling_dbfs:
        gain = peak_ceiling_dbfs - peak
    return apply_gain_db(raw, gain)


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# BGM beds (§4.9)
# ---------------------------------------------------------------------------


def _loop_pad(loop):
    if not loop:
        return loop
    n = min(2048, len(loop) // 4)
    head, tail = list(loop[:n]), list(loop[-n:])
    for i in range(n):
        a, b = i / n, (n - i) / n
        loop[-n + i] = head[i] * a + tail[i] * b
        loop[i] = tail[i] * a + loop[i] * b
    return loop


def _tile(loop, n):
    out = []
    while len(out) < n:
        out.extend(loop)
    return out[:n]


# ---------------------------------------------------------------------------
# Asset beds (pre-rendered arrangements with a looping tail)
# ---------------------------------------------------------------------------

BGM_ASSET_CACHE = {}


def decode_audio_array(path, sr):
    """Decode an audio file to mono channel samples at `sr` (array('f'), flat RAM)."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
            capture_output=True, timeout=120,
        )
    except FileNotFoundError:
        raise RuntimeError(f"ffmpeg not found — cannot decode BGM asset {path}")
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"ffmpeg decode timed out for BGM asset {path}")
    if result.returncode != 0 or not result.stdout:
        raise RuntimeError(f"could not decode BGM asset {path}")
    raw = result.stdout
    out = array("f")
    out.frombytes(raw[: (len(raw) // 4) * 4])
    if sys.byteorder == "big":
        out.byteswap()
    return out


def load_bgm_asset(track, sr):
    """Decode + cache an asset bed, verifying its manifest SHA-256."""
    meta = sfx.BGM_TRACKS.get(track) or {}
    rel = meta.get("asset")
    if not rel:
        return None
    key = (rel, sr)
    if key in BGM_ASSET_CACHE:
        return BGM_ASSET_CACHE[key]
    path = sfx.ASSETS_DIR / rel
    if not path.exists():
        raise RuntimeError(f"BGM asset missing: {path}")
    manifest = sfx._load_manifest()
    expected = {e.get("file"): e.get("sha256")
                for e in manifest.get("files", []) if isinstance(e, dict)}
    actual = sfx.hash_manifest_file(rel)
    if expected.get(rel) is None:
        raise RuntimeError(f"BGM asset not registered in sfx/assets/manifest.json: {rel}")
    if actual != expected[rel]:
        raise RuntimeError(f"BGM asset SHA-256 mismatch: {rel}")
    samples = decode_audio_array(path, sr)
    BGM_ASSET_CACHE[key] = samples
    return samples


def bgm_loop_bounds(track, sr):
    meta = sfx.BGM_TRACKS.get(track) or {}
    start = int(round(float(meta["loop_start_seconds"]) * sr))
    end = int(round(float(meta["loop_end_seconds"]) * sr))
    if end <= start:
        raise RuntimeError(f"BGM bed '{track}': loop_end_seconds must exceed loop_start_seconds")
    return start, end


def render_asset_run(asset, start_sample, n_samples, loop_start, loop_end):
    """Samples for one continuous bed run, playing the head once then tiling
    the [loop_start, loop_end) region. start_sample is the track's playhead
    (accumulated active time across earlier runs)."""
    loop_len = loop_end - loop_start
    if len(asset) < loop_end:
        raise RuntimeError(
            f"BGM asset is {len(asset)} samples but loop_end is {loop_end} — rebuild the asset")
    out = array("f", [0.0]) * n_samples
    x, k = start_sample, 0
    while k < n_samples:
        if x < loop_start:
            take = min(n_samples - k, loop_start - x)
            out[k:k + take] = asset[x:x + take]
            x += take
            k += take
        else:
            pos = loop_start + (x - loop_start) % loop_len
            take = min(n_samples - k, loop_end - pos)
            out[k:k + take] = asset[pos:pos + take]
            x += take
            k += take
    return out


def _effective_bed_track(scene, default_track):
    sb = scene.get("bgm", "ABSENT")
    if sb == "ABSENT":
        return default_track
    if sb is None:
        return None
    return sb["track"]


def used_bgm_assets(all_scenes, cfg):
    """{asset_rel: sha256} for every asset bed this video actually uses."""
    default_track = cfg.get("bgm", {}).get("default_track", "pulse_light")
    out = {}
    for s in all_scenes:
        track = _effective_bed_track(s, default_track)
        meta = sfx.BGM_TRACKS.get(track) if track else None
        if meta and meta.get("asset"):
            rel = meta["asset"]
            out[rel] = _sha256_file(sfx.ASSETS_DIR / rel)
    return out


def pulse_light(rng, sr, duration_sec):
    step = int(60.0 / 112.0 * sr)
    n = step * 8
    out = [0.0] * n
    for step_i in range(8):
        base = step_i * step
        if step_i % 2 == 0:                              # kick on 0,2,4,6
            kick = _env_decay(_sine(55.0, int(0.18 * sr)), 0.06)
            for i, v in enumerate(kick):
                out[base + i] += 0.5 * v
        else:                                            # hat on 1,3,5,7
            hat = _highpass_one_pole(_white(rng, int(0.015 * sr)), 6000.0)
            for i, v in enumerate(hat):
                out[base + i] += 0.15 * v
    pad = [0.0] * n
    for freq, amp in ((110.0, 0.06), (261.63, 0.06), (329.63, 0.06)):
        for i in range(n):
            t = i / sr
            trem = 1.0 + 0.3 * math.sin(2.0 * math.pi * 0.2 * t)
            pad[i] += amp * trem * math.sin(2.0 * math.pi * freq * i / sr)
    return [out[i] + pad[i] for i in range(n)]


def pulse_dark(rng, sr, duration_sec):
    step = int(60.0 / 95.0 * sr)
    n = step * 8
    out = [0.0] * n
    for step_i in range(8):
        base = step_i * step
        kick = _env_decay(_sine(45.0, int(0.25 * sr)), 0.08)
        for i, v in enumerate(kick):
            out[base + i] += 0.55 * v
        if step_i in (3, 7):
            hat = _highpass_one_pole(_white(rng, int(0.015 * sr)), 6000.0)
            for i, v in enumerate(hat):
                out[base + i] += 0.10 * v
    pad = [0.0] * n
    for freq, amp in ((65.41, 0.065), (155.56, 0.065), (196.0, 0.065), (293.66, 0.03)):
        for i in range(n):
            pad[i] += amp * math.sin(2.0 * math.pi * freq * i / sr)
    return [out[i] + pad[i] for i in range(n)]


def ambient_calm(rng, sr, duration_sec):
    n = int(8.0 * sr)
    out = [0.0] * n
    chords = [
        ((220.0, 0.05), (261.63, 0.05), (329.63, 0.045), (392.0, 0.03)),     # Am7
        ((87.31, 0.05), (220.0, 0.05), (261.63, 0.05), (329.63, 0.04)),      # F
        ((130.81, 0.045), (164.81, 0.045), (196.0, 0.045), (261.63, 0.045)), # C
        ((98.0, 0.05), (246.94, 0.04), (293.66, 0.035), (196.0, 0.04)),      # G
    ]
    chord_n = int(2.0 * sr)
    for c_i, chord in enumerate(chords):
        base = c_i * chord_n
        for freq, amp in chord:
            for i in range(chord_n):
                t = i / sr                                   # seconds within the chord
                if t < 0.4:                                  # attack: 0→1 over 0.4s (sin²)
                    env = (math.sin(math.pi / 2.0 * t / 0.4)) ** 2
                elif t > 1.7:                                # release: →0 by 2.0s (sin²)
                    env = (math.sin(math.pi / 2.0 * (2.0 - t) / 0.3)) ** 2
                else:                                        # hold to 1.7s
                    env = 1.0
                out[base + i] += amp * env * math.sin(2.0 * math.pi * freq * i / sr)
    return out


def tension_riser(rng, sr, duration_sec):
    n = int(12.0 * sr)
    out = [0.0] * n
    tone = _sweep_sine(100.0, 400.0, n)
    for i in range(n):
        out[i] += 0.3 * tone[i]
    step_i = 0
    t = 0.0
    while t < 12.0:
        start = int(t * sr)
        tick = [0.0] * int(0.12 * sr)
        for i, v in enumerate(_white(rng, int(0.002 * sr))):
            tick[i] += v * 0.6
        ring = _env_decay(_sine(2000.0, int(0.12 * sr)), 0.02)
        for i in range(len(tick)):
            tick[i] += 0.3 * ring[i]
        tick = _normalize(tick, 0.9)
        for i, v in enumerate(tick):
            if start + i < n:
                out[start + i] += 0.2 * v
        step_i += 1
        t = t + max(0.12, 0.9 * (0.78 ** step_i))
    return out


def groove_light(rng, sr, duration_sec):
    # Upbeat bed: kick + offbeat hats + walking bass plucks over a bright pad.
    # 116 bpm, 8-step loop; hopeful/playful counterweight to pulse_dark.
    step = int(60.0 / 116.0 * sr)
    n = step * 8
    out = [0.0] * n
    for step_i in range(8):
        base = step_i * step
        if step_i % 2 == 0:                              # kick on 0,2,4,6
            kick = _env_decay(_sine(60.0, int(0.16 * sr)), 0.055)
            for i, v in enumerate(kick):
                out[base + i] += 0.5 * v
        else:                                            # hat on 1,3,5,7
            hat = _highpass_one_pole(_white(rng, int(0.015 * sr)), 6500.0)
            for i, v in enumerate(hat):
                out[base + i] += 0.13 * v
    # walking bass plucks: A2 F2 G2 C3 pentatonic walk, one per step
    for step_i, freq in enumerate((110.0, 87.31, 98.0, 130.81,
                                  110.0, 130.81, 164.81, 98.0)):
        base = step_i * step
        pluck = _env_decay(_sine(freq, int(0.3 * sr)), 0.09)
        for i, v in enumerate(pluck):
            if base + i < n:
                out[base + i] += 0.22 * v
    pad = [0.0] * n
    for freq, amp in ((220.0, 0.035), (277.18, 0.035), (329.63, 0.035)):
        for i in range(n):
            t = i / sr
            trem = 1.0 + 0.25 * math.sin(2.0 * math.pi * 0.25 * t)
            pad[i] += amp * trem * math.sin(2.0 * math.pi * freq * i / sr)
    return [out[i] + pad[i] for i in range(n)]


def drone_dark(rng, sr, duration_sec):
    # Dark narration-forward drone: stacked low sines with slow beating, no
    # percussion, breathy LP noise. Serious/tense counterpart to ambient_calm.
    n = int(8.0 * sr)
    out = [0.0] * n
    partials = ((55.0, 0.10), (82.41, 0.07), (110.0, 0.06),
                (110.7, 0.05), (165.0, 0.03))
    for freq, amp in partials:
        for i in range(n):
            t = i / sr
            swell = 1.0 + 0.35 * math.sin(2.0 * math.pi * 0.07 * t + freq)
            out[i] += amp * swell * math.sin(2.0 * math.pi * freq * t)
    breath = _lowpass_one_pole(_white(rng, n), 300.0)
    for i in range(n):
        t = i / sr
        air = 1.0 + 0.5 * math.sin(2.0 * math.pi * 0.05 * t)
        out[i] += 0.02 * air * breath[i]
    # gentle 1.5 s edge ramps so the 8 s tile loops without a seam step
    edge = min(int(1.5 * sr), n // 2)
    for i in range(edge):
        out[i] *= (math.sin(math.pi / 2.0 * i / edge)) ** 2
        out[n - 1 - i] *= (math.sin(math.pi / 2.0 * i / edge)) ** 2
    return out


BGM_FUNCS = {
    "pulse_light": pulse_light,
    "pulse_dark": pulse_dark,
    "ambient_calm": ambient_calm,
    "tension_riser": tension_riser,
    "groove_light": groove_light,
    "drone_dark": drone_dark,
}


# ---------------------------------------------------------------------------
# Track rendering (§4.10 / §4.11)
# ---------------------------------------------------------------------------


def per_cue_seed(sound_id, params, start_abs):
    blob = f"{sound_id}:{json.dumps(params or {}, sort_keys=True)}:{start_abs:.3f}:{sfx.CATALOG_VERSION}"
    return int(hashlib.sha256(blob.encode()).hexdigest()[:16], 16)


def decode_to_floats(path):
    """Decode an audio file to mono float samples at SR via ffmpeg pipe."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
            capture_output=True, timeout=120,
        )
    except FileNotFoundError:
        print(f"ERROR: ffmpeg not found — cannot decode {path}")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"ERROR: ffmpeg decode timed out for {path}")
        sys.exit(1)
    if result.returncode != 0 or not result.stdout:
        print(f"ERROR: could not decode audio file {path}")
        sys.exit(1)
    data = result.stdout
    n = len(data) // 4
    return struct.unpack(f"<{n}f", data[: n * 4])


SAMPLE_ASSET_CACHE = {}
_SAMPLE_ASSET_BYTES = {"n": 0}


def load_sample_asset(rel, sr, cache_mb=64):
    """Decode + cache a sample asset once per run (bounded — big packs stream)."""
    key = (rel, sr)
    cached = SAMPLE_ASSET_CACHE.get(key)
    if cached is not None:
        return cached
    samples = decode_to_floats(sfx.ASSETS_DIR / rel)
    size = len(samples) * 4
    if _SAMPLE_ASSET_BYTES["n"] + size <= int(cache_mb) * 1024 * 1024:
        SAMPLE_ASSET_CACHE[key] = samples
        _SAMPLE_ASSET_BYTES["n"] += size
    return samples


def render_sfx_track(resolved_cues, cfg, sr, samples_total, vo_anchor=None, bed_env=None,
                     bed_env_ducked=None, vo_presence_offset_db=None, vo_env=None):
    """-> (array('f') master, [level plans]) or (None, []) when no cues."""
    if not resolved_cues:
        return None, []
    master = array("f", [0.0]) * samples_total
    defs = sfx.load_sound_defs()                      # hoist: load the catalog once, not per cue
    scfg = cfg.get("sfx", {})
    tail_fade = scfg.get("tail_fade_seconds", 0.5)
    full_scale_db = scfg.get("full_scale_db", -10.0)
    cache_mb = (scfg.get("level") or {}).get("decode_cache_mb", 64)
    plans = []

    # Batch-render tone-backend cues in a single node invocation.
    tone_jobs = []
    for cue in resolved_cues:
        sound = defs[cue["sound"]]
        if sound.backend == "tone":
            params = sfx.param_defaults(sound)
            if cue.get("params"):
                params.update(cue["params"])
            tone_jobs.append({
                "id": f"{cue['scene']}_{cue['cue_index']}",
                "sound": cue["sound"],
                "params": params,
                "seed_str": per_cue_seed(cue["sound"], params, cue["start_abs"]),
            })
    tone_rendered = tone_render.render_tone_cues(tone_jobs, sample_rate=sr)

    for cue in resolved_cues:
        scene_id, i = cue["scene"], cue["cue_index"]
        sound = defs[cue["sound"]]
        params = sfx.param_defaults(sound)
        if cue.get("params"):
            params.update(cue["params"])
        if sound.backend == "tone":
            raw = tone_rendered[f"{scene_id}_{i}"]
            pitch = params.get("pitch")
            if pitch is not None and abs(float(pitch) - 1.0) > 1e-6:
                raw = _resample(raw, float(pitch))
            placed = place_cue(samples_total, raw, cue["start_abs"], tail_fade,
                               cue.get("fade_out"))
            if placed is None:
                print(f"  WARN: scene {scene_id} cue {i}: starts at/after video end — dropped (inaudible)")
                continue
            start, seg = placed
            seg = apply_gain_db(seg, cue_gain_db(cue["volume"], full_scale_db))
            mix_add(master, start, seg)
            plans.append({"scene": scene_id, "cue_index": i, "sound": sound.sound,
                          "asset": None, "mode": "tone",
                          "start_abs": round(cue["start_abs"], 3),
                          "volume": cue.get("volume"),
                          "gain_db": round(cue_gain_db(cue["volume"], full_scale_db), 2),
                          "flags": []})
            continue

        raw = load_sample_asset(sound.asset, sr, cache_mb)
        seg, _trimmed = _slice_cue(raw, params, sr)
        if seg is None:
            print(f"  WARN: scene {scene_id} cue {i}: offset {params.get('offset')}s is past "
                  f"the end of {sound.asset} — dropped")
            continue
        pitch = params.get("pitch")
        if pitch is not None and abs(float(pitch) - 1.0) > 1e-6:
            seg = _resample(seg, float(pitch))
        seg, plan = prepare_sample(sound, cue, seg, sr, vo_anchor, bed_env, cfg,
                                   cue["start_abs"], bed_env_ducked=bed_env_ducked,
                                   vo_presence_offset_db=vo_presence_offset_db,
                                   vo_env=vo_env)
        plan.update({"scene": scene_id, "cue_index": i, "sound": sound.sound,
                     "asset": sound.asset, "start_abs": round(cue["start_abs"], 3),
                     "duration_seconds": round(len(seg) / sr, 3),
                     "volume": cue.get("volume")})
        placed = place_cue(samples_total, seg, cue["start_abs"], tail_fade,
                           cue.get("fade_out"))
        if placed is None:
            print(f"  WARN: scene {scene_id} cue {i}: starts at/after video end — dropped (inaudible)")
            continue
        start, seg = placed
        mix_add(master, start, seg)
        plans.append(plan)
    return master, plans


def render_bgm_track(scenes, offsets, total_sec, cfg, sr, fps=None):
    """-> array('f') master buffer or None when disabled or fully silent scenes.

    RUNS: consecutive scenes with the same effective (track, volume) render as ONE
    continuous tiled segment — a single seed and one loop instance, so the phase
    carries across scene boundaries and repeated beds never cut. A `bgm: null` scene
    emits an empty span and breaks runs. Boundaries where the effective (track, volume)
    changes blend with an equal-power crossfade of crossfade_seconds (0.5 default, 0 =
    hard cut), applied only when both sides carry audio. Master fade-in at video start
    (fade_in_seconds, 0.5) mirrors the end fade-out (fade_out_seconds, 1.0).
    """
    bcfg = cfg.get("bgm", {})
    if not bcfg.get("enabled", True):
        return None
    # round(), not int(): sample positions must match place_cue()'s
    # int(round(...)) convention — systematic truncation biases every cue/BGM
    # segment up to 1 sample early.
    master = array("f", [0.0]) * int(round(total_sec * sr))
    default_track = bcfg.get("default_track", "pulse_light")
    default_vol = bcfg.get("default_volume", 0.6)
    trims = bcfg.get("track_trim", {})
    if not isinstance(trims, dict):
        trims = {}
    xfade = float(bcfg.get("crossfade_seconds", 0.5))
    order = sorted(scenes, key=lambda x: x["id"])

    # 1. effective (track, vol) per scene; None = silence span
    eff = []
    for s in order:
        sb = s.get("bgm", "ABSENT")
        if sb == "ABSENT":
            eff.append((default_track, default_vol))
        elif sb is None:
            eff.append(None)
        else:
            track, vol = sb["track"], sb.get("volume", default_vol)
            if not sfx.resolve_bgm_track(track):
                print(f"  WARN: scene {s['id']}: unknown bgm track '{track}' — falling back to '{default_track}'")
                track = default_track
            eff.append((track, vol))

    # 2. split into runs (equal effective values; None breaks)
    runs, i = [], 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and eff[j + 1] == eff[i]:
            j += 1
        runs.append((i, j, eff[i]))
        i = j + 1

    # 3. render each audio run: one seed, continuous tiling over the whole run span
    segs = []
    track_elapsed = {}
    for a, b, tv in runs:
        if tv is None:
            continue
        track, vol = tv
        start_abs = offsets[order[a]["id"]]
        dur = sum(scene_duration(order[k], fps) for k in range(a, b + 1))
        if dur <= 0:
            continue
        n_samples = int(round(dur * sr))
        meta = sfx.BGM_TRACKS.get(track) or {}
        if meta.get("asset"):
            asset = load_bgm_asset(track, sr)
            loop_start, loop_end = bgm_loop_bounds(track, sr)
            base = track_elapsed.get(track, 0)
            raw = render_asset_run(asset, base, n_samples, loop_start, loop_end)
            track_elapsed[track] = base + n_samples
        else:
            rng = random.Random(per_cue_seed(track, {"volume": vol}, start_abs))
            loop = _loop_pad(BGM_FUNCS[track](rng, sr, dur))
            raw = _tile(loop, n_samples)
        # Per-track trim (config bgm.track_trim): corrects inherent loudness
        # differences between bed designs (e.g. tension_riser's dense rising
        # texture runs hotter than the sparse pulse beds at equal volume).
        trim_db = float(trims.get(track, 0.0))
        seg = apply_gain_db(raw, bed_gain_db(vol, bcfg.get("bed_db", -12.0)) + trim_db)
        segs.append((int(round(start_abs * sr)), seg))

    if not segs:                                       # all-silent run set → no track
        return None

    # 4. write into master; crossfade where adjacent segments differ.
    # Segments are flush (seg starts at prev's end). The crossfade fades the
    # previous segment's tail out over [start-X, start) while the incoming
    # segment fades in over [start, start+X) — each sample is written exactly
    # once, with no timing shift from the absolute offsets. (The previous
    # version anticipated the incoming head into the prev window AND replayed
    # it at the segment start, doubling the first X samples at each boundary.)
    prev = None                      # (start_sample, samples)
    for start, seg in segs:
        if prev is not None and abs(start - (prev[0] + len(prev[1]))) <= 1:
            X = min(int(xfade * sr), len(prev[1]) // 2, len(seg) // 2)
            if X > 32:               # fade-out / fade-in handoff at the boundary
                for k in range(X):
                    t = k / X
                    master[start - X + k] = prev[1][-X + k] * math.cos(t * math.pi / 2.0)
                for k in range(X):
                    t = k / X
                    master[start + k] = seg[k] * math.sin(t * math.pi / 2.0)
                for k in range(X, len(seg)):
                    master[start + k] = seg[k]
            else:
                for k in range(len(seg)):
                    master[start + k] = seg[k]
        else:                        # silence gap between → no blending needed
            for k in range(len(seg)):
                master[start + k] = seg[k]
        prev = (start, seg)

    # 5. master fades: fade-in at head, fade-out at tail
    fi = min(int(bcfg.get("fade_in_seconds", 0.5) * sr), len(master))
    for i in range(fi):
        master[i] *= (i / fi) ** 2
    fo = min(int(bcfg.get("fade_out_seconds", 1.0) * sr), len(master))
    if fo > 0:
        for i in range(fo):
            master[len(master) - fo + i] *= (1.0 - i / fo) ** 2
    return master


# ---------------------------------------------------------------------------
# Idempotency (§4.12)
# ---------------------------------------------------------------------------


_SHA256_CACHE = {}


def _sha256_file(path):
    """SHA-256 hex of an arbitrary file, None on missing (mtime+size cached)."""
    try:
        p = Path(path)
        st = p.stat()
        key = (str(p), st.st_mtime_ns, st.st_size)
        hit = _SHA256_CACHE.get(key)
        if hit is not None:
            return hit
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        _SHA256_CACHE[key] = digest
        return digest
    except OSError:
        return None


def build_sfx_hash(scene, all_scenes, resolved_cues_for_scene, cfg, offsets, total_sec,
                   fps=None):
    bcfg = cfg.get("bgm", {})
    scfg = cfg.get("sfx", {})
    defs = sfx.load_sound_defs()
    tone_recipes = {}
    sample_assets = {}
    sample_levels = {}
    for cue in resolved_cues_for_scene:
        sound = defs[cue["sound"]]
        if sound.backend == "tone":
            rel = f"sfx/sounds/{sound.sound}/recipe.mjs"
            tone_recipes[rel] = _sha256_file(Path(__file__).resolve().parent.parent / rel)
        elif sound.asset:
            sample_assets[sound.asset] = _sha256_file(sfx.ASSETS_DIR / sound.asset)
            sample_levels[sound.sound] = sound.level or {}
    return pl.hash_sfx({
        "catalog_version": sfx.CATALOG_VERSION,
        "fps": fps,                                    # timeline basis (frame-exact)
        # The level law is anchored to the measured voiceover: a re-voiced scene
        # must invalidate the mix, or cues keep gains computed for the old VO.
        "voiceover_hash": scene.get("voiceover_hash"),
        "level_config": scfg.get("level") or {},
        "sfx_config": {"sample_rate": SR, "full_scale_db": scfg.get("full_scale_db", -10.0),
                        "tail_fade_seconds": scfg.get("tail_fade_seconds", 0.5)},
        "bgm_config": {"enabled": bcfg.get("enabled", True),
                       "default_track": bcfg.get("default_track", "pulse_light"),
                       "default_volume": bcfg.get("default_volume", 0.6),
                       "bed_db": bcfg.get("bed_db", -12.0),
                       "track_trim": bcfg.get("track_trim", {}),
                       "fade_out_seconds": bcfg.get("fade_out_seconds", 1.0),
                       "fade_in_seconds": bcfg.get("fade_in_seconds", 0.5),
                       "crossfade_seconds": bcfg.get("crossfade_seconds", 0.5),
                       # The sidechain decides how loud the bed really is under a
                       # cue, so the mix depends on it: re-mix when it changes.
                       "duck_threshold_db": bcfg.get("duck_threshold_db", -25.0),
                       "duck_ratio": bcfg.get("duck_ratio", 8.0),
                       "duck_attack_ms": bcfg.get("duck_attack_ms", 5.0),
                       "duck_release_ms": bcfg.get("duck_release_ms", 250.0),
                       # Fallback only (the measured duck is used when available).
                       "duck_detect_offset_db": bcfg.get("duck_detect_offset_db", 8.0),
                       # The bed is levelled against the measured voiceover, so
                       # this distance is part of the mix.
                       "vo_offset_db": bcfg.get("vo_offset_db", 12.0)},
        "durations": {str(x["id"]): round(scene_duration(x, fps), 4) for x in all_scenes},
        "total_seconds": round(total_sec, 4),
        "scene_bgm": scene.get("bgm"),                 # raw override (None / {..} / absent->None)
        "cues": resolved_cues_for_scene,               # scene-relative, sorted by (when, sound)
        "tone_recipes": tone_recipes,                  # recipe .mjs sha256s (tone backend only)
        "sample_assets": sample_assets,                # sample file sha256s (sample backend only)
        "sample_levels": sample_levels,                # level.mode/trim_db per used sample
        "bgm_assets": used_bgm_assets(all_scenes, cfg),  # pre-rendered bed files actually used
    })


# ---------------------------------------------------------------------------
# Outputs (§4.13)
# ---------------------------------------------------------------------------


def write_wav(path, samples, sr):
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        # Chunked pack avoids O(n^2) bytearray += and keeps peak RAM flat.
        chunk = 65536
        n = len(samples)
        for off in range(0, n, chunk):
            part = samples[off:off + chunk]
            buf = bytearray(len(part) * 2)
            for i, v in enumerate(part):
                if v > 1.0:
                    v = 1.0
                elif v < -1.0:
                    v = -1.0
                struct.pack_into("<h", buf, i * 2, int(round(v * 32767)))
            w.writeframes(bytes(buf))


def encode_mp3(wav, out):
    tmp = str(out) + ".tmp"
    Path(tmp).unlink(missing_ok=True)
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", tmp],
            capture_output=True, text=True, timeout=180,
            encoding="utf-8", errors="replace",
        )
    except FileNotFoundError:
        print("ERROR: ffmpeg not found — cannot encode MP3")
        return False
    except subprocess.TimeoutExpired:
        print(f"ERROR: ffmpeg encode timed out for {out}")
        Path(tmp).unlink(missing_ok=True)
        return False
    if result.returncode != 0 or not Path(tmp).exists():
        if Path(tmp).exists():
            Path(tmp).unlink(missing_ok=True)
        return False
    pl.atomic_replace(Path(tmp), Path(out))
    return out.stat().st_size > 1000


# ---------------------------------------------------------------------------
# main (§4.14)
# ---------------------------------------------------------------------------


def write_level_report(video_dir, vo_peak, vo_I, plans, cfg, bed_info=None):
    """Persist per-cue level decisions so the mix is auditable without listening."""
    lcfg = (cfg.get("sfx", {}).get("level") or {})
    flags = {}
    for p in plans:
        for f in p.get("flags") or []:
            flags[f] = flags.get(f, 0) + 1
    payload = {
        "voiceover": {"peak_dbfs": round(vo_peak, 2),
                      "integrated_lufs": round(vo_I, 2)},
        "law": {k: lcfg.get(k) for k in (
            "enabled", "accent_offset_db", "max_below_vo_db", "over_bed_db",
            "masking_db", "vo_headroom_db", "sample_peak_ceiling_db",
            "gain_clamp_db", "max_deviation_db", "window_seconds",
            "hop_seconds", "mask_hop_seconds", "mask_window_db",
            "burst_window_seconds")},
        "audibility": lcfg.get("audibility") or {},
        "bed": bed_info or {},
        "cues": plans,
        "flags": flags,
    }
    path = Path(video_dir) / "sfx_levels.json"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    pl.atomic_replace(tmp, path)
    return path, flags


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate sfx_aligned.mp3 + bgm_aligned.mp3")
    parser.add_argument("video_dir", help="path to the video project directory")
    parser.add_argument("--force", action="store_true", help="regenerate even when hashes match")
    args = parser.parse_args()

    video_dir = Path(args.video_dir).resolve()
    if not video_dir.exists() or not (video_dir / "scenes.json").exists():
        print(f"Usage: python3 generate_sfx.py <video_dir> [--force]")
        sys.exit(2)

    with open(video_dir / "scenes.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data.get("scenes", [])
    if not scenes:
        print("--- No SFX cues or BGM configured — nothing to generate ---")
        sys.exit(0)

    cfg = pl.load_config(video_dir=video_dir)
    global SR
    SR = int(cfg.get("sfx", {}).get("sample_rate", 44100))
    global FPS
    FPS = float(data.get("fps") or 30)

    offsets, total_sec = cumulative_offsets(scenes, FPS)
    samples_total = int(round(total_sec * SR))
    # Both tracks (sfx+bgm) can coexist — guard 2x peak RAM, not per-track.
    if samples_total * 4 * 2 > MAX_TRACK_BYTES:
        mb = samples_total * 4 * 2 / (1024 * 1024)
        print(f"ERROR: video too long for the SFX engine ({mb:.0f} MB for sfx+bgm buffers) — shorten or split")
        sys.exit(1)

    # resolve cues per scene (defensive re-validation)
    resolved = []
    bcfg = cfg.get("bgm", {})
    # A bed runs iff bgm is enabled AND at least one scene does not opt out via
    # an explicit "bgm": null. Scenes with NO bgm key inherit the default bed
    # (render_bgm_track treats ABSENT as (default_track, default_volume)), so
    # they must count as active here too — otherwise cue-less videos relying on
    # the global default bed exited before any music was rendered.
    # Sentinel "ABSENT" distinguishes a missing key from an explicit null.
    bgm_active = bcfg.get("enabled", True) and any(
        s.get("bgm", "ABSENT") is not None for s in scenes)
    defs = sfx.load_sound_defs()
    for s in sorted(scenes, key=lambda x: x["id"]):
        sid = s["id"]
        beats = {b["name"]: b for b in s.get("beats", [])}
        dur = scene_duration(s, FPS)
        for i, cue in enumerate(s.get("sfx", [])):
            sound_name = cue.get("sound", "")
            sound = sfx.resolve_sound(sound_name, defs)
            if sound is None:
                fuzzy = sfx.fuzzy_candidates(sound_name)
                extra = f"  did you mean: {', '.join(fuzzy)}" if fuzzy else ""
                print(f"ERROR: Scene {sid} cue {i}: unknown sound '{sound_name}'{extra}")
                sys.exit(1)
            perr = sfx.validate_cue_params(sound, cue.get("params"))
            if perr:
                for e in perr:
                    print(f"ERROR: Scene {sid} cue {i}: {e}")
                sys.exit(1)
            try:
                rel = resolve_when(cue.get("when"), dur, beats)
            except ValueError as e:
                print(f"ERROR: Scene {sid} cue {i}: {e}")
                sys.exit(1)
            start_abs = offsets[sid] + rel
            merged_params = sfx.param_defaults(sound)
            if cue.get("params"):
                merged_params.update(cue["params"])
            resolved.append({
                "scene": sid,
                "cue_index": i,
                "sound": sound.sound,
                "start_abs": start_abs,
                "volume": cue.get("volume"),
                "fade_out": cue.get("fade_out"),
                "params": merged_params,
                "when_raw": cue.get("when"),
            })

    # BGM active? a bed renders unless bgm.enabled is false; every scene gets a default bed
    # (or its own override). Only fully-silent runs make render_bgm_track return None.
    if not resolved and not bgm_active:
        for stale in ("sfx_aligned.mp3", "bgm_aligned.mp3"):
            p = video_dir / stale
            if p.exists():
                p.unlink()
                print(f"  Removed stale {stale} (no cues remain)")
        print("--- No SFX cues or BGM configured — nothing to generate ---")
        sys.exit(0)

    # idempotency gate
    def tracks_still_present():
        need_sfx = len(resolved) > 0
        need_bgm = bgm_active
        if not need_sfx and not need_bgm:
            return True
        if need_sfx and not (video_dir / "sfx_aligned.mp3").exists():
            return False
        if need_bgm and not (video_dir / "bgm_aligned.mp3").exists():
            return False
        return True

    per_scene_cues = {}
    for cue in resolved:
        per_scene_cues.setdefault(cue["scene"], []).append(cue)
    hashes = {}
    for s in scenes:
        sc = [{"when": c["when_raw"], "sound": c["sound"], "volume": c["volume"],
               "fade_out": c["fade_out"],
               "params": dict(sorted((c["params"] or {}).items())) if c.get("params") else None}
              for c in per_scene_cues.get(s["id"], [])]
        sc.sort(key=lambda c: (str(c["when"]), c["sound"]))
        hashes[s["id"]] = build_sfx_hash(s, scenes, sc, cfg, offsets, total_sec, fps=FPS)

    unchanged = all(s.get("sfx_hash") == hashes[s["id"]] for s in scenes)
    if unchanged and not args.force:
        if tracks_still_present():
            print("--- SFX/BGM unchanged — skipping regeneration (use --force to rebuild) ---")
            sys.exit(0)

    log_file = pl.log_path(video_dir.name, 10)
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== generate_sfx.py run {pl.now_iso()} ===\n")
        logf.write(json.dumps({"cues": len(resolved), "force": args.force}) + "\n")

    # measure the voiceover anchor
    ensure_voiceover_aligned(video_dir, scenes, FPS)
    vo_peak_db, vo_I, vo_mom = measure_voiceover(video_dir)
    vo_anchor = (vo_peak_db, vo_I, vo_mom)
    lcfg = cfg.get("sfx", {}).get("level") or {}
    hop = float(lcfg.get("hop_seconds", 0.1))
    win = float(lcfg.get("window_seconds", 0.4))

    # The audibility guard compares a cue against the narration in the band
    # where they compete (the voice's presence band), so it needs the voice's
    # own spectral balance once per mix.
    aud_cfg = lcfg.get("audibility") or {}
    vo_presence_offset_db = None
    if aud_cfg.get("enabled", True):
        vo_presence_offset_db = measure_voice_presence_offset(
            video_dir,
            presence_low_hz=float(aud_cfg.get("presence_low_hz", 1000.0)),
            presence_high_hz=float(aud_cfg.get("presence_high_hz", 8000.0)))
        if vo_presence_offset_db is not None:
            print(f"  Voiceover presence band: "
                  f"{vo_presence_offset_db:.1f} dB below its broadband level")

    # The VO's fast energy envelope: the level law needs to know whether the
    # narration is actually speaking where a cue lands (a cue in a pause is
    # masking nothing, however loud it is).
    vo_env = audio_envelope(video_dir / "voiceover_aligned.mp3", SR,
                             hop_seconds=float(lcfg.get("hop_seconds", 0.1)))

    tmp_dir = video_dir / ".sfx_tmp"
    tmp_dir.mkdir(exist_ok=True)
    plans = []
    bed_env = None
    bed_env_ducked = None
    bed_info = {}
    try:
        # BGM FIRST: the SFX level law uses the bed's local level as its audible
        # floor ("never under the music"). Only the 10 Hz envelope survives, so
        # the bed master is released before the SFX buffer is allocated.
        bmaster = render_bgm_track(scenes, offsets, total_sec, cfg, SR, fps=FPS)
        if bmaster is None:
            stale = video_dir / "bgm_aligned.mp3"
            if stale.exists():
                stale.unlink()
                print("  Removed stale bgm_aligned.mp3 (bed inactive)")
        else:
            # Level the bed against the MEASURED voiceover. The mix promises
            # (SFX above the music, music under the voice) only hold if the
            # music sits far enough below the narration — a bed authored at a
            # fixed level lands wherever the TTS happened to land. `vo_offset_db`
            # is the distance: the bed's loudest moment stays that many dB
            # below the voiceover's integrated loudness. Set it to 0 to keep the
            # bed exactly as authored.
            vo_off = (cfg.get("bgm") or {}).get("vo_offset_db", 12.0)
            bed_loud = loudest_window_db(bmaster, SR, win, hop)
            bed_info = {"vo_offset_db": float(vo_off) if vo_off else None,
                        "loudest_dbfs": round(bed_loud, 2),
                        "leveled_db": 0.0}
            if vo_anchor and vo_off:
                target = vo_I - float(vo_off)
                correction = target - bed_loud
                bed_info["target_dbfs"] = round(target, 2)
                if abs(correction) > 0.1:
                    bmaster = apply_gain_db(bmaster, correction)
                    bed_info["leveled_db"] = round(correction, 2)
                    print(f"  Bed leveled {correction:+.1f} dB -> {target:.1f} dBFS "
                          f"(VO {vo_I:.1f} LUFS, {vo_off:.0f} dB below)")
            wav = tmp_dir / "bgm.wav"
            write_wav(wav, bmaster, SR)
            out = video_dir / "bgm_aligned.mp3"
            if not encode_mp3(wav, out):
                print("ERROR: failed to encode bgm_aligned.mp3")
                sys.exit(1)
            print(f"  Created bgm_aligned.mp3 ({total_sec:.1f} s)")
            if resolved:
                # Measure the bed from the ENCODED file — the same bytes the
                # stitch sidechains — and measure its ducked twin, so the floor
                # competes with the music that really plays under the cue.
                bed_env = audio_envelope(out, SR, hop)
                bed_env_ducked = ducked_bed_envelope(video_dir, cfg, hop, SR)
                if bed_env_ducked:
                    ducks = [_energy_db(d) - _energy_db(w)
                             for d, w in zip(bed_env, bed_env_ducked)
                             if _energy_db(d) > -60.0]
                    if ducks:
                        ducks.sort()
                        print(f"  Bed duck measured: {ducks[-1]:.1f} dB max, "
                              f"{ducks[len(ducks) // 2]:.1f} dB median "
                              f"under the voiceover")
        bmaster = None

        # SFX track
        master, plans = render_sfx_track(resolved, cfg, SR, samples_total,
                                         vo_anchor=vo_anchor, bed_env=bed_env,
                                         bed_env_ducked=bed_env_ducked,
                                         vo_presence_offset_db=vo_presence_offset_db,
                                         vo_env=vo_env)
        if master is None:
            stale = video_dir / "sfx_aligned.mp3"
            if stale.exists():
                stale.unlink()
                print("  Removed stale sfx_aligned.mp3 (no cues remain)")
        else:
            wav = tmp_dir / "sfx.wav"
            write_wav(wav, master, SR)
            out = video_dir / "sfx_aligned.mp3"
            if not encode_mp3(wav, out):
                print("ERROR: failed to encode sfx_aligned.mp3")
                sys.exit(1)
            print(f"  Created sfx_aligned.mp3 ({len(resolved)} cues, {total_sec:.1f} s)")
        master = None
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    if plans:
        if bed_env:
            for p in plans:
                t = float(p.get("start_abs") or 0.0)
                span_end = t + max(float(p.get("duration_seconds") or 0.0), win)
                bed_dry = round(envelope_loudest_db(bed_env, hop, t, span_end, win), 2)
                p["bed_dbfs"] = bed_dry
                if bed_env_ducked:
                    p["bed_ducked_dbfs"] = round(
                        envelope_loudest_db(bed_env_ducked, hop, t, span_end, win), 2)
                elif p.get("mode") == "auto":
                    p["bed_ducked_dbfs"] = round(
                        bed_dry - float(p.get("bed_duck_db") or 0.0), 2)
        report_path, flags = write_level_report(video_dir, vo_peak_db, vo_I, plans,
                                                 cfg, bed_info=bed_info)
        loudest = max(plans, key=lambda p: float(p.get("achieved_dbfs") or -120))
        print(f"  Level law: {len(plans)} cues matched to VO {vo_I:.1f} LUFS "
              f"(loudest '{loudest['sound']}' at "
              f"{float(loudest.get('achieved_dbfs') or -120):.1f} dBFS)")
        if flags:
            print(f"  Level flags: {', '.join(f'{k}={v}' for k, v in sorted(flags.items()))}")
        speaker_hz = float((lcfg.get("audibility") or {}).get("speaker_hz", 150.0))
        for p in plans:
            pflags = p.get("flags") or []
            aud = p.get("audibility") or {}
            if "subsonic_asset" in pflags:
                print(f"  AUDIBILITY: '{p.get('sound')}' loses "
                      f"{float(aud.get('subsonic_drop_db') or 0):.0f} dB of its loudest "
                      f"moment below {speaker_hz:.0f} Hz — inaudible on laptop and "
                      f"phone speakers. Use a mid-forward asset, or place it in a "
                      f"pause and accept it for headphone listeners.")
            if "masked_by_voice" in pflags:
                gap = (float(aud.get("voice_presence_dbfs") or 0)
                       - float(aud.get("presence_peak_dbfs") or 0))
                print(f"  AUDIBILITY: '{p.get('sound')}' sits {gap:.0f} dB under the "
                      f"narration in the presence band — it will be masked. Move it "
                      f"into a pause between sentences.")
        print(f"  Level report: {report_path.name}")

    # persist hashes
    for s in scenes:
        s["sfx_hash"] = hashes[s["id"]]
    pl.save_scenes_full(video_dir, data)

    print(f"  Voiceover anchor: peak {vo_peak_db:.1f} dB, integrated {vo_I:.1f} LUFS")
    print("  SFX/BGM generation complete.")


if __name__ == "__main__":
    main()