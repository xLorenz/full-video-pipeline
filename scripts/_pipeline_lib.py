"""Shared helpers for the full-video-pipeline scripts.

Single source of truth for config loading, paths, atomic JSON writes, ffprobe,
voiceover hashing, and log paths. All other scripts import from here.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PIPELINE_CONFIG = REPO_ROOT / "pipeline_config.json"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def load_config():
    """Load pipeline_config.json from the repo root."""
    if not PIPELINE_CONFIG.exists():
        return {}
    with open(PIPELINE_CONFIG, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Paths & sanitization
# ---------------------------------------------------------------------------


def sanitize_title(title):
    """Convert a display title into a safe directory/filename slug."""
    safe = title.lower()
    safe = re.sub(r"[^a-z0-9]+", "-", safe)
    safe = safe.strip("-")
    if not safe:
        raise ValueError(
            f"Title {title!r} produces empty directory name after sanitization"
        )
    return safe


def video_dir(title):
    return REPO_ROOT / "videos" / title


def state_path(title):
    return video_dir(title) / "pipeline_state.json"


def scenes_json_path(title):
    return video_dir(title) / "scenes.json"


def logs_dir(title):
    d = video_dir(title) / "logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_path(title, step, scene_id=None):
    name = f"step-{step}"
    if scene_id is not None:
        name += f"-scene-{scene_id}"
    return logs_dir(title) / f"{name}.log"


# ---------------------------------------------------------------------------
# Atomic JSON I/O
# ---------------------------------------------------------------------------


def _atomic_write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def load_scenes(title):
    p = scenes_json_path(title)
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f).get("scenes", [])


def save_scenes(title, data):
    """Atomic write (preserves full scenes.json structure, not just the scenes array)."""
    p = scenes_json_path(title)
    with open(p, "r", encoding="utf-8") as f:
        full = json.load(f)
    if "scenes" in data:
        full = data
    else:
        full["scenes"] = data
    _atomic_write_json(p, full)


def save_scenes_full(video_dir_path, data):
    """Atomic write of full scenes.json given a Path to the video directory."""
    p = Path(video_dir_path) / "scenes.json"
    _atomic_write_json(p, data)


def load_state(title):
    p = state_path(title)
    if not p.exists():
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(title, state):
    _atomic_write_json(state_path(title), state)


# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# ffprobe
# ---------------------------------------------------------------------------


def get_audio_duration(filepath) -> float:
    """Return duration in seconds, or 0.0 on failure."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(filepath)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        pass
    return 0.0


def ffprobe_streams(filepath):
    """Return ffprobe stream list (json), or None on failure."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries",
             "stream=codec_name,width,height,r_frame_rate,duration",
             "-of", "json", str(filepath)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout).get("streams")
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        pass
    return None


# ---------------------------------------------------------------------------
# Voiceover hashing (for idempotent generation)
# ---------------------------------------------------------------------------


def hash_voiceover(text, voice, rate, volume, pitch) -> str:
    """Return a stable SHA-256 hex of the inputs that affect audio output."""
    payload = json.dumps(
        {"text": text, "voice": voice, "rate": rate, "volume": volume, "pitch": pitch},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# subprocess helper with optional log tee
# ---------------------------------------------------------------------------


@contextmanager
def open_log(logpath: Path):
    """Yield a file handle for appending; caller writes through run_cmd."""
    logpath.parent.mkdir(parents=True, exist_ok=True)
    f = open(logpath, "a", encoding="utf-8")
    try:
        yield f
    finally:
        f.close()


def run_cmd(cmd, cwd=None, check=True, logpath: Path = None):
    """Run a shell command, stream to stdout, optionally tee to a log file."""
    print(f"  $ {cmd}")
    log_f = open(logpath, "a", encoding="utf-8") if logpath else None
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        if result.stdout:
            for line in result.stdout.rstrip().split("\n"):
                print(f"  | {line}")
                if log_f:
                    log_f.write(line + "\n")
        if check and result.returncode != 0:
            print(f"  ERROR: Command failed with exit code {result.returncode}")
            if log_f:
                log_f.write(f"ERROR: exit {result.returncode}\n")
            raise CmdError(result.returncode, cmd)
        return result
    finally:
        if log_f:
            log_f.close()


class CmdError(Exception):
    def __init__(self, returncode, cmd):
        self.returncode = returncode
        self.cmd = cmd
        super().__init__(f"Command failed (exit {returncode}): {cmd}")


# ---------------------------------------------------------------------------
# Step keys (kept here so scripts and orchestrator stay aligned)
# ---------------------------------------------------------------------------

STEP_KEYS = [
    "1_topic_selection", "2_research", "3_script_writing",
    "4_voiceover_writing", "5_voiceover_generation",
    "6_duration_measurement", "7_style_definition",
    "8_remotion_coding", "9_scene_rendering", "10_stitching",
]

AUTOMATED_STEPS = {
    "5_voiceover_generation", "6_duration_measurement",
    "9_scene_rendering", "10_stitching",
}
