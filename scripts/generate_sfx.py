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


def scene_duration(s):
    """Actual duration (Step 6 value); falls back to target for pre-measure previews."""
    return float(s.get("actual_duration_seconds") or s.get("target_duration_seconds") or 0.0)


def cumulative_offsets(scenes):
    """{scene_id: absolute_start_seconds}; returns (offsets, video_total_seconds)."""
    off, total, out = 0.0, 0.0, {}
    for s in sorted(scenes, key=lambda x: x["id"]):
        out[s["id"]] = off
        d = scene_duration(s)
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
    end = min(samples_total, start + len(seg))
    if end < len(seg):                                  # tail would cross video end
        seg = seg[: end - start]
        remaining = end - start
        fade_sec = cue_fade_out if cue_fade_out is not None else tail_fade_seconds
        fade_len = min(fade_sec * SR, max(0.0, remaining / 2.0))
        if fade_len > 16:
            fade = [(1.0 - i / fade_len) ** 2 for i in range(int(fade_len))]
            seg[-len(fade):] = [vi * fa for vi, fa in zip(seg[-len(fade):], fade)]
    return start, seg


# ---------------------------------------------------------------------------
# Voiceover measurement (§4.5)
# ---------------------------------------------------------------------------


def measure_voiceover(video_dir):
    """Returns (vo_peak_db, vo_integrated_lufs) from voiceover_aligned.mp3.

    vo_peak_db:  `volumedetect` max_volume (dBFS, negative).
    vo_integrated_lufs: LAST `I:` value from the ebur128 filter (integrated loudness, negative).
    Exits 1 if either cannot be parsed.
    """
    mp3 = Path(video_dir) / "voiceover_aligned.mp3"
    peak, integrated = None, None

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
    ms = __import__("re").findall(r"^\s*I:\s*([-\d.]+)\s*LUFS", text2, __import__("re").MULTILINE)
    if ms:
        integrated = float(ms[-1])

    if peak is None or integrated is None:
        print("ERROR: could not measure voiceover loudness from voiceover_aligned.mp3")
        sys.exit(1)
    return peak, integrated


def ensure_voiceover_aligned(video_dir, scenes):
    """Rebuild voiceover_aligned.mp3 when missing (retention cleanup deletes it post-stitch)."""
    video_dir = Path(video_dir)
    aligned = video_dir / "voiceover_aligned.mp3"
    if aligned.exists():
        return
    voiceover_dir = video_dir / "voiceover"
    with tempfile.TemporaryDirectory(prefix=".vo_align_", dir=str(video_dir)) as td:
        tmp = Path(td)
        lst = tmp / "audio_concat.txt"
        with open(lst, "w", encoding="utf-8") as f:
            for s in sorted(scenes, key=lambda x: x["id"]):
                mp3 = voiceover_dir / f"scene-{s['id']:02d}.mp3"
                if not mp3.exists():
                    print(f"ERROR: Voiceover MP3 missing for scene {s['id']}: {mp3}")
                    sys.exit(1)
                f.write(f"file '{mp3.resolve().as_posix()}'\n")
        out_tmp = tmp / "aligned.mp3"
        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out_tmp)],
            capture_output=True, text=True,
        )
        if result.returncode != 0 or not out_tmp.exists():
            print("ERROR: could not rebuild voiceover_aligned.mp3")
            sys.exit(1)
        os.replace(out_tmp, aligned)


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
    return array("f", (s * g for s in x))


def mix_add(master, start_sample, samples, gain=1.0):
    """Add `samples` into master at start_sample (in place)."""
    for k, v in enumerate(samples):
        master[start_sample + k] += v * gain


# ---------------------------------------------------------------------------
# DSP primitives (§4.7)
# ---------------------------------------------------------------------------


def _white(rng, n):
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


def _sine(freq, n, phase=0.0):
    return [math.sin(phase + 2.0 * math.pi * freq * i / SR) for i in range(n)]


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
    for freq, amp in ((65.41, 0.05), (155.56, 0.05), (196.0, 0.05)):
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


BGM_FUNCS = {
    "pulse_light": pulse_light,
    "pulse_dark": pulse_dark,
    "ambient_calm": ambient_calm,
    "tension_riser": tension_riser,
}


# ---------------------------------------------------------------------------
# Track rendering (§4.10 / §4.11)
# ---------------------------------------------------------------------------


def per_cue_seed(sound_id, params, start_abs):
    blob = f"{sound_id}:{json.dumps(params or {}, sort_keys=True)}:{start_abs:.3f}:{sfx.CATALOG_VERSION}"
    return int(hashlib.sha256(blob.encode()).hexdigest()[:16], 16)


def decode_to_floats(path):
    """Decode an audio file to mono float samples at SR via ffmpeg pipe."""
    result = subprocess.run(
        ["ffmpeg", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True,
    )
    if result.returncode != 0 or not result.stdout:
        print(f"ERROR: could not decode audio file {path}")
        sys.exit(1)
    data = result.stdout
    n = len(data) // 4
    return struct.unpack(f"<{n}f", data[: n * 4])


def render_sfx_track(resolved_cues, cfg, sr, samples_total):
    """-> array('f') master buffer or None when no cues."""
    if not resolved_cues:
        return None
    master = array("f", [0.0]) * samples_total
    defs = sfx.load_sound_defs()                      # hoist: load the catalog once, not per cue
    scfg = cfg.get("sfx", {})
    tail_fade = scfg.get("tail_fade_seconds", 0.5)
    full_scale_db = scfg.get("full_scale_db", -10.0)

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
    tone_rendered = tone_render.render_tone_cues(tone_jobs)

    for cue in resolved_cues:
        scene_id, i = cue["scene"], cue["cue_index"]
        sound = defs[cue["sound"]]
        params = sfx.param_defaults(sound)
        if cue.get("params"):
            params.update(cue["params"])
        rng = random.Random(per_cue_seed(cue["sound"], params, cue["start_abs"]))
        if sound.backend == "tone":
            raw = tone_rendered[f"{scene_id}_{i}"]
            if "pitch" in params:
                raw = _resample(raw, float(params["pitch"]))
        else:
            raw = _normalize(decode_to_floats(sfx.ASSETS_DIR / sound.asset), 0.9)
        placed = place_cue(samples_total, raw, cue["start_abs"], tail_fade, cue.get("fade_out"))
        if placed is None:
            print(f"  WARN: scene {scene_id} cue {i}: starts at/after video end — dropped (inaudible)")
            continue
        start, seg = placed
        seg = apply_gain_db(seg, cue_gain_db(cue["volume"], full_scale_db))
        mix_add(master, start, seg)
    return master


def render_bgm_track(scenes, offsets, total_sec, cfg, sr):
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
    master = array("f", [0.0]) * int(total_sec * sr)
    default_track = bcfg.get("default_track", "pulse_light")
    default_vol = bcfg.get("default_volume", 0.6)
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
    for a, b, tv in runs:
        if tv is None:
            continue
        track, vol = tv
        start_abs = offsets[order[a]["id"]]
        dur = sum(scene_duration(order[k]) for k in range(a, b + 1))
        if dur <= 0:
            continue
        rng = random.Random(per_cue_seed(track, {"volume": vol}, start_abs))
        loop = _loop_pad(BGM_FUNCS[track](rng, sr, dur))
        seg = apply_gain_db(_tile(loop, int(dur * sr)),
                            bed_gain_db(vol, bcfg.get("bed_db", -12.0)))
        segs.append((int(start_abs * sr), seg))

    if not segs:                                       # all-silent run set → no track
        return None

    # 4. write into master; equal-power blend where adjacent segments differ
    prev = None                      # (start_sample, samples)
    for start, seg in segs:
        if prev is not None and abs(start - (prev[0] + len(prev[1]))) <= 1:
            X = min(int(xfade * sr), len(prev[1]) // 2, len(seg) // 2)
            if X > 32:               # blend region straddles the boundary
                for k in range(X):
                    t = k / X
                    master[start - X + k] = \
                        prev[1][-X + k] * math.cos(t * math.pi / 2.0) + \
                        seg[k] * math.sin(t * math.pi / 2.0)
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


def _sha256_file(path):
    """SHA-256 hex of an arbitrary file, None on missing."""
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


def build_sfx_hash(scene, all_scenes, resolved_cues_for_scene, cfg, offsets, total_sec):
    bcfg = cfg.get("bgm", {})
    scfg = cfg.get("sfx", {})
    defs = sfx.load_sound_defs()
    tone_recipes = {}
    for cue in resolved_cues_for_scene:
        sound = defs[cue["sound"]]
        if sound.backend == "tone":
            rel = f"sfx/sounds/{sound.sound}/recipe.mjs"
            tone_recipes[rel] = _sha256_file(Path(__file__).resolve().parent.parent / rel)
    return pl.hash_sfx({
        "catalog_version": sfx.CATALOG_VERSION,
        "sfx_config": {"sample_rate": SR, "full_scale_db": scfg.get("full_scale_db", -10.0),
                        "tail_fade_seconds": scfg.get("tail_fade_seconds", 0.5)},
        "bgm_config": {"enabled": bcfg.get("enabled", True),
                       "default_track": bcfg.get("default_track", "pulse_light"),
                       "default_volume": bcfg.get("default_volume", 0.6),
                       "bed_db": bcfg.get("bed_db", -12.0),
                       "fade_out_seconds": bcfg.get("fade_out_seconds", 1.0),
                       "fade_in_seconds": bcfg.get("fade_in_seconds", 0.5),
                       "crossfade_seconds": bcfg.get("crossfade_seconds", 0.5)},
        "durations": {str(x["id"]): round(scene_duration(x), 4) for x in all_scenes},
        "total_seconds": round(total_sec, 4),
        "scene_bgm": scene.get("bgm"),                 # raw override (None / {..} / absent->None)
        "cues": resolved_cues_for_scene,               # scene-relative, sorted by (when, sound)
        "tone_recipes": tone_recipes,                  # recipe .mjs sha256s (tone backend only)
    })


# ---------------------------------------------------------------------------
# Outputs (§4.13)
# ---------------------------------------------------------------------------


def write_wav(path, samples, sr):
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = bytearray()
        for v in samples:
            clipped = max(-1.0, min(1.0, v))
            frames += struct.pack("<h", int(round(clipped * 32767)))
        w.writeframes(bytes(frames))


def encode_mp3(wav, out):
    tmp = str(out) + ".tmp"
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", tmp],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or not Path(tmp).exists():
        if Path(tmp).exists():
            Path(tmp).unlink()
        return False
    os.replace(tmp, out)
    return out.stat().st_size > 1000


# ---------------------------------------------------------------------------
# main (§4.14)
# ---------------------------------------------------------------------------


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

    offsets, total_sec = cumulative_offsets(scenes)
    samples_total = int(total_sec * SR)
    if samples_total * 4 > MAX_TRACK_BYTES:
        mb = samples_total * 4 / (1024 * 1024)
        print(f"ERROR: video too long for the SFX engine ({mb:.0f} MB float buffer) — shorten or split")
        sys.exit(1)

    # resolve cues per scene (defensive re-validation)
    resolved = []
    bcfg = cfg.get("bgm", {})
    # A bed runs iff bgm is enabled AND at least one scene does not opt out via "bgm": null
    # (scenes with no bgm key inherit the default bed).
    bgm_active = bcfg.get("enabled", True) and any(s.get("bgm") is not None for s in scenes)
    defs = sfx.load_sound_defs()
    for s in sorted(scenes, key=lambda x: x["id"]):
        sid = s["id"]
        beats = {b["name"]: b for b in s.get("beats", [])}
        dur = scene_duration(s)
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
        hashes[s["id"]] = build_sfx_hash(s, scenes, sc, cfg, offsets, total_sec)

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
    ensure_voiceover_aligned(video_dir, scenes)
    vo_peak_db, vo_I = measure_voiceover(video_dir)

    tmp_dir = video_dir / ".sfx_tmp"
    tmp_dir.mkdir(exist_ok=True)
    try:
        # SFX track
        master = render_sfx_track(resolved, cfg, SR, samples_total)
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

        # BGM track
        bmaster = render_bgm_track(scenes, offsets, total_sec, cfg, SR)
        if bmaster is None:
            stale = video_dir / "bgm_aligned.mp3"
            if stale.exists():
                stale.unlink()
                print("  Removed stale bgm_aligned.mp3 (bed inactive)")
        else:
            wav = tmp_dir / "bgm.wav"
            write_wav(wav, bmaster, SR)
            out = video_dir / "bgm_aligned.mp3"
            if not encode_mp3(wav, out):
                print("ERROR: failed to encode bgm_aligned.mp3")
                sys.exit(1)
            print(f"  Created bgm_aligned.mp3 ({total_sec:.1f} s)")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # persist hashes
    for s in scenes:
        s["sfx_hash"] = hashes[s["id"]]
    pl.save_scenes_full(video_dir, data)

    print(f"  Voiceover anchor: peak {vo_peak_db:.1f} dB, integrated {vo_I:.1f} LUFS")
    print("  SFX/BGM generation complete.")


if __name__ == "__main__":
    main()