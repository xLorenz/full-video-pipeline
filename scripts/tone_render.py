"""Tone.js/WebAudio SFX engine bridge (PHASE-09).

Renders `tone`-backend sound cues by batching them into a single
`node sfx-render/render.js` invocation and decoding the produced WAVs back
to float samples. Deterministic: one node process per batch, seeded per cue
(Math.random patched inside render.js; recipes must use the injected rng).
"""
import array
import hashlib
import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError, OSError):
    pass

REPO_ROOT = Path(__file__).resolve().parent.parent
import shutil as _shutil
NODE_BIN = _shutil.which("node") or _shutil.which("nodejs") or "node"
RENDER_JS = REPO_ROOT / "sfx-render" / "render.js"
SOUNDS_DIR = REPO_ROOT / "sfx" / "sounds"
# Per-batch cap so a rogue recipe cannot hang the pipeline forever.
TONE_RENDER_TIMEOUT = 300


def recipe_path(sound_id: str) -> Path:
    return SOUNDS_DIR / sound_id / "recipe.mjs"


def seed_to_uint32(seed_str) -> int:
    """Stable uint32 from a per_cue_seed value (int) or arbitrary string."""
    if isinstance(seed_str, int):
        return seed_str & 0xFFFFFFFF
    return int(hashlib.sha256(seed_str.encode("utf-8")).hexdigest()[:8], 16)


def decode_wav(path: Path):
    """-> (sample_rate, array('f') mono samples). Uses wave (handles fact/LIST)."""
    import wave as _wave
    try:
        with _wave.open(str(path), "rb") as w:
            sr = w.getframerate()
            n = w.getnframes()
            raw = w.readframes(n)
    except (_wave.Error, OSError) as e:
        raise RuntimeError(f"{path}: not a readable WAV file ({e})")
    if len(raw) < n * 2:
        raise RuntimeError(f"{path}: truncated WAV data")
    vals = struct.unpack_from(f"<{n}h", raw, 0)
    return sr, array.array("f", (v / 32768.0 for v in vals))


def render_tone_cues(jobs, sample_rate=44100, timeout=TONE_RENDER_TIMEOUT):
    """Render tone-backend cues in one batched node invocation.

    jobs: list of dicts {id, sound, params, seed_str} (seed_str = per_cue_seed).
    -> {id: array('f')} floats at sample_rate Hz, already normalized (peak 0.9).
    """
    if not jobs:
        return {}
    for j in jobs:
        dur = (j.get("params") or {}).get("duration", j.get("duration", 1.0))
        if isinstance(dur, (int, float)) and not (dur > 0):
            raise ValueError(f"invalid duration for job {j.get('id')}: {dur!r}")
    manifest = [
        {
            "id": j["id"],
            "recipe": str(recipe_path(j["sound"])),
            "params": j.get("params") or {},
            "seed": seed_to_uint32(j["seed_str"]),
            "duration": j.get("duration", 2.0),
        }
        for j in jobs
    ]
    with tempfile.TemporaryDirectory(prefix="tone_render_") as td:
        td = Path(td)
        (td / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
        )
        try:
            r = subprocess.run(
                [NODE_BIN, str(RENDER_JS), "--manifest", str(td / "manifest.json"),
                 "--out", str(td), "--sr", str(sample_rate)],
                capture_output=True, text=True, timeout=timeout,
                encoding="utf-8", errors="replace",
            )
        except FileNotFoundError:
            raise RuntimeError(f"node binary not found ({NODE_BIN}) — install Node 18+")
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"tone render timed out after {timeout}s — rogue recipe?")
        if r.returncode != 0:
            detail = (r.stdout or "")[-1500:] + (r.stderr or "")[-1500:]
            raise RuntimeError(f"tone render failed (exit {r.returncode}):\n{detail}")
        try:
            # render.js prints only JSON to stdout; guard against log pollution.
            start = r.stdout.find("[")
            results = json.loads(r.stdout[start:] if start >= 0 else (r.stdout or "[]"))
        except json.JSONDecodeError as e:
            raise RuntimeError(f"tone render returned non-JSON stdout: {e}\n{(r.stdout or '')[:500]}")
        bad = [x for x in results if not x.get("ok")]
        if bad:
            detail = "; ".join(f"{x.get('id')}: {x.get('error', '?')}" for x in bad)
            detail += "\n" + (r.stderr or "")[-1500:]
            raise RuntimeError(f"tone render failed for {len(bad)} job(s):\n{detail}")
        out = {}
        for x in results:
            sr, floats = decode_wav(Path(x["wav"]))
            if sr != sample_rate:
                raise RuntimeError(f"{x['id']}: unexpected sample rate {sr} (want {sample_rate})")
            out[x["id"]] = floats
        return out


def check_recipe_syntax(sound_id: str, timeout: int = 30) -> str | None:
    """`node --check` the recipe; returns an error message or None."""
    p = recipe_path(sound_id)
    if not p.exists():
        return f"{SOUNDS_DIR.relative_to(REPO_ROOT)}/{sound_id}/recipe.mjs: missing"
    try:
        r = subprocess.run([NODE_BIN, "--check", str(p)], capture_output=True, text=True,
                           timeout=timeout, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return f"node binary not found ({NODE_BIN})"
    except subprocess.TimeoutExpired:
        return f"{p.relative_to(REPO_ROOT)}: node --check timed out"
    if r.returncode != 0:
        return f"{p.relative_to(REPO_ROOT)}: node --check failed: {(r.stderr or r.stdout).strip()[:300]}"
    return None


if __name__ == "__main__":
    # ad-hoc single-sound render for debugging: python tone_render.py <sound> [seed]
    if len(sys.argv) < 2:
        print("usage: tone_render.py <sound> [seed]", file=sys.stderr)
        sys.exit(2)
    sound = sys.argv[1]
    seed = sys.argv[2] if len(sys.argv) > 2 else "debug"
    res = render_tone_cues([{"id": "probe", "sound": sound, "params": {},
                             "seed_str": seed}])
    floats = res["probe"]
    peak = max((abs(v) for v in floats), default=0.0)
    print(f"{sound}: {len(floats) / 44100:.3f}s peak {20 * math.log10(peak or 1e-9):.1f} dB")