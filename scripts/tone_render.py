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
NODE_BIN = "node"
RENDER_JS = REPO_ROOT / "sfx-render" / "render.js"
SOUNDS_DIR = REPO_ROOT / "sfx" / "sounds"


def recipe_path(sound_id: str) -> Path:
    return SOUNDS_DIR / sound_id / "recipe.mjs"


def seed_to_uint32(seed_str) -> int:
    """Stable uint32 from a per_cue_seed value (int) or arbitrary string."""
    if isinstance(seed_str, int):
        return seed_str & 0xFFFFFFFF
    return int(hashlib.sha256(seed_str.encode("utf-8")).hexdigest()[:8], 16)


def decode_wav(path: Path):
    """-> (sample_rate, array('f') mono samples)."""
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise RuntimeError(f"{path}: not a RIFF/WAVE file")
    sr = struct.unpack_from("<I", data, 24)[0]
    n = struct.unpack_from("<I", data, 40)[0] // 2
    vals = struct.unpack_from(f"<{n}h", data, 44)
    return sr, array.array("f", (v / 32768.0 for v in vals))


def render_tone_cues(jobs):
    """Render tone-backend cues in one batched node invocation.

    jobs: list of dicts {id, sound, params, seed_str} (seed_str = per_cue_seed).
    -> {id: array('f')} floats at 44100 Hz, already normalized (peak 0.9).
    """
    if not jobs:
        return {}
    manifest = [
        {
            "id": j["id"],
            "recipe": str(recipe_path(j["sound"])),
            "params": j.get("params") or {},
            "seed": seed_to_uint32(j["seed_str"]),
        }
        for j in jobs
    ]
    with tempfile.TemporaryDirectory(prefix="tone_render_") as td:
        td = Path(td)
        (td / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
        )
        r = subprocess.run(
            [NODE_BIN, str(RENDER_JS), "--manifest", str(td / "manifest.json"),
             "--out", str(td)],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            detail = (r.stdout or "")[-1500:] + (r.stderr or "")[-1500:]
            raise RuntimeError(f"tone render failed (exit {r.returncode}):\n{detail}")
        results = json.loads(r.stdout or "[]")
        bad = [x for x in results if not x.get("ok")]
        if bad:
            detail = "; ".join(f"{x.get('id')}: {x.get('error', '?')}" for x in bad)
            detail += "\n" + (r.stderr or "")[-1500:]
            raise RuntimeError(f"tone render failed for {len(bad)} job(s):\n{detail}")
        out = {}
        for x in results:
            sr, floats = decode_wav(Path(x["wav"]))
            if sr != 44100:
                raise RuntimeError(f"{x['id']}: unexpected sample rate {sr}")
            out[x["id"]] = floats
        return out


def check_recipe_syntax(sound_id: str) -> str | None:
    """`node --check` the recipe; returns an error message or None."""
    p = recipe_path(sound_id)
    if not p.exists():
        return f"{SOUNDS_DIR.relative_to(REPO_ROOT)}/{sound_id}/recipe.mjs: missing"
    r = subprocess.run([NODE_BIN, "--check", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        return f"{p.relative_to(REPO_ROOT)}: node --check failed: {(r.stderr or r.stdout).strip()[:300]}"
    return None


if __name__ == "__main__":
    # ad-hoc single-sound render for debugging: python tone_render.py <sound> [seed]
    sound = sys.argv[1]
    seed = sys.argv[2] if len(sys.argv) > 2 else "debug"
    res = render_tone_cues([{"id": "probe", "sound": sound, "params": {},
                             "seed_str": seed}])
    floats = res["probe"]
    peak = max((abs(v) for v in floats), default=0.0)
    print(f"{sound}: {len(floats) / 44100:.3f}s peak {20 * math.log10(peak or 1e-9):.1f} dB")