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
# Step pipeline metadata (single source of truth for scripts + orchestrator)
# ---------------------------------------------------------------------------

STEP_KEYS = [
    "1_topic_selection", "2_research", "3_script_writing",
    "4_voiceover_writing", "5_voiceover_generation",
    "6_duration_measurement", "7_style_definition",
    "8_remotion_coding", "9_scene_rendering", "10_stitching",
    "11_metadata_generation", "12_thumbnail_generation",
    "13_thumbnail_rendering",
]

STEP_NAMES = {
    "1_topic_selection": "Topic Selection",
    "2_research": "Research",
    "3_script_writing": "Script Writing",
    "4_voiceover_writing": "Voiceover Writing",
    "5_voiceover_generation": "Voiceover Generation",
    "6_duration_measurement": "Duration Measurement",
    "7_style_definition": "Style Definition",
    "8_remotion_coding": "Remotion Code Writing",
    "9_scene_rendering": "Scene Rendering",
    "10_stitching": "Stitching",
    "11_metadata_generation": "Metadata Generation",
    "12_thumbnail_generation": "Thumbnail Generation",
    "13_thumbnail_rendering": "Thumbnail Rendering",
}

AUTOMATED_STEPS = {
    "5_voiceover_generation", "6_duration_measurement",
    "9_scene_rendering", "10_stitching", "13_thumbnail_rendering",
}

CREATIVE_STEPS = set(STEP_KEYS) - AUTOMATED_STEPS

# Steps whose EXPECTED_ARTIFACTS is [] — they produce in-context decisions/notes,
# not files. `complete` for these runs only the schema gate, no artifact check.
# `continue` and `_print_creative_brief` use this to print instruction text instead
# of an artifact list.
UNVALIDATED_CREATIVE_STEPS = {"1_topic_selection", "2_research"}

# Canonical phase mapping — single source of truth.
# Used by emit_trailer, _print_creative_brief, cmd_run, and SKILL.md anchors.
# Anchor strings MUST match the lowercase-hyphenated form of the H2 headings in SKILL.md:
#   "## Phase 1: Research & Script"     -> #phase-1-research--script     (ampersand drops, leaving --)
#   "## Phase 2: Voiceover"             -> #phase-2-voiceover
#   "## Phase 3: Visuals & Render"      -> #phase-3-visuals--render       (ampersand drops, leaving --)
#   "## Phase 4: Metadata & Thumbnail" -> #phase-4-metadata--thumbnail
PHASES = {
    1: {"name": "Research & Script",
        "anchor": "#phase-1-research--script",
        "steps": (1, 2, 3)},
    2: {"name": "Voiceover",
        "anchor": "#phase-2-voiceover",
        "steps": (4, 5, 6)},
    3: {"name": "Visuals & Render",
        "anchor": "#phase-3-visuals--render",
        "steps": (7, 8, 9, 10)},
    4: {"name": "Metadata & Thumbnail",
        "anchor": "#phase-4-metadata--thumbnail",
        "steps": (11, 12, 13)},
}


def _phase_for_step(step_key: str):
    """Return (phase_num, anchor_string) for a step_key.

    Returns (0, "") for terminal/empty/unknown step_keys.
    """
    if not step_key:
        return 0, ""
    try:
        idx = STEP_KEYS.index(step_key) + 1
    except ValueError:
        return 0, ""
    for pnum, info in PHASES.items():
        if idx in info["steps"]:
            return pnum, info["anchor"]
    return 0, ""


# ---------------------------------------------------------------------------
# Skills-by-phase — derived from config (skills.sources[*].path + .phases)
# ---------------------------------------------------------------------------

# Default skill sources baked in for backward compatibility. Overridable via
# pipeline_config.json `skills.sources`. Each entry matches the schema:
#   {"name": str, "path": str (relative to repo root), "phases": {N: [relpaths]}}
# The `path` becomes `{skills_dir}` in SKILL.md "Follow these instructions:"
# blocks. The relative paths are joined onto `path` to form the full file path
# the agent is told to load.
_DEFAULT_SKILLS_SOURCES = [
    {
        "name": "claude-youtube",
        "path": "skills/claude-youtube/skills/claude-youtube",
        "phases": {
            "1": ["sub-skills/script.md", "references/retention-scripting-guide.md"],
            "4": ["sub-skills/metadata.md", "references/seo-playbook.md",
                   "sub-skills/thumbnail.md", "references/thumbnail-ctr-guide.md"],
        },
    },
    {
        "name": "remotion-best-practices",
        "path": "skills/remotion-best-practices/skills/remotion",
        "phases": {
            "3": ["SKILL.md",
                  "rules/video-layout.md", "rules/calculate-metadata.md",
                  "rules/transitions.md", "rules/sequencing.md",
                  "rules/compositions.md", "rules/effects.md",
                  "rules/voiceover.md"],
        },
    },
]


def _build_skills_by_phase(cfg=None):
    """Return {phase_num: [absolute_or_relative_paths]} from config.skills.sources.

    Falls back to _DEFAULT_SKILLS_SOURCES when cfg is None or lacks `skills.sources`.
    Each output path is `os.path.join(source["path"], relpath)` — a relative path
    from the repo root that the agent reads directly.
    """
    if cfg is None or not isinstance(cfg, dict):
        sources = _DEFAULT_SKILLS_SOURCES
    else:
        sources = cfg.get("skills", {}).get("sources", _DEFAULT_SKILLS_SOURCES)

    by_phase = {}
    for src in sources:
        base = src.get("path", "")
        for phase_str, relpaths in (src.get("phases", {}) or {}).items():
            try:
                phase_num = int(phase_str)
            except (ValueError, TypeError):
                continue
            by_phase.setdefault(phase_num, [])
            for rel in relpaths:
                # Use forward slashes regardless of OS for portability of trailers
                full = f"{base}/{rel}" if base else rel
                by_phase[phase_num].append(full)
    return by_phase


def _skill_paths_for_phase(phase_num, cfg=None):
    """Return the list of skill file paths an agent should read for a phase.

    Empty list for phases with no upstream skill dependency (Phase 2 — voiceover
    is a pipeline-specific contract, not from external skills).
    """
    # Always (re)derive from the supplied or default config so per-video
    # overrides can route skills elsewhere.
    if cfg is None:
        cfg = load_config()
    by_phase = _build_skills_by_phase(cfg)
    return list(by_phase.get(phase_num, []))


# ---------------------------------------------------------------------------
# Per-step command templates — plugin escape hatch via config
# ---------------------------------------------------------------------------

# Hardcoded default templates (current behavior). When pipeline_config.json
# provides `steps.{step_key}.command_template`, it overrides these.
_DEFAULT_STEP_COMMAND_TEMPLATES = {
    "5_voiceover_generation":
        "python3 scripts/generate_voiceover.py {video_dir} --voice {voiceover.voice}",
    "6_duration_measurement":
        "python3 scripts/measure_durations.py {video_dir}",
    "9_scene_rendering":
        "python3 scripts/render_scene.py {video_dir} {scene_id}",
    "10_stitching":
        "python3 scripts/assemble.py {video_dir}",
    "13_thumbnail_rendering":
        "python3 scripts/render_thumbnail.py {video_dir}",
}


def get_step_command_template(step_key, cfg=None):
    """Return the command template for an automated step.

    Reads `steps.{step_key}.command_template` from config if present,
    else falls back to _DEFAULT_STEP_COMMAND_TEMPLATES.
    Returns None for unknown step keys.
    """
    if cfg is None:
        cfg = load_config()
    steps_cfg = cfg.get("steps", {}) or {}
    entry = steps_cfg.get(step_key, {}) or {}
    tmpl = entry.get("command_template", None)
    if tmpl:
        return tmpl
    return _DEFAULT_STEP_COMMAND_TEMPLATES.get(step_key)


def render_step_command(template, video_dir, scene_id=None, cfg=None):
    """Substitute {variables} in a step command template.

    Available substitutions:
      {video_dir}        — the videos/<title> path (string)
      {scene_id}         — integer scene id (only for Step 9)
      {voiceover.voice}  — any dotted config path under the loaded config
      {voiceover.rate}, {voiceover.volume}, {voiceover.pitch}, {voiceover.concurrency}
      {video.fps}, {video.width}, {video.height}, etc.
      {render.crf}, {render.gl_backend}, etc.

    Unknown {dotted.path} markers resolve by walking the loaded config dict;
    missing leaves render as empty string (with a warning to stderr).
    """
    if cfg is None:
        cfg = load_config(video_dir=video_dir)
    # Always pass the most resolved video_dir string the orchestrator knows.
    # Convert Path -> str to keep f-string-friendly template values.
    vd_str = str(video_dir) if not isinstance(video_dir, str) else video_dir

    # Build a flat substitution map. We support {video_dir}, {scene_id}, and
    # arbitrary {section.key.key} references into the config dict.
    subs = {"video_dir": vd_str}
    if scene_id is not None:
        subs["scene_id"] = str(scene_id)

    # Walk the template — replace tokens of form {name.dotted.path} or {name}.
    def _resolve(match):
        token = match.group(1)
        if token in subs:
            return str(subs[token])
        # Try walking the config dict: e.g. "voiceover.voice" -> cfg["voiceover"]["voice"]
        parts = token.split(".")
        cur = cfg
        for p in parts:
            if isinstance(cur, dict) and p in cur:
                cur = cur[p]
            else:
                print(f"WARNING: render_step_command: unknown token {{{token}}}"
                      f" — substituting empty string", file=sys.stderr)
                return ""
        return str(cur)

    return re.sub(r"\{([a-zA-Z_][a-zA-Z0-9_.]*)\}", _resolve, template)


EXPECTED_ARTIFACTS: dict = {
    "1_topic_selection": [],
    "2_research": [],
    "3_script_writing": ["SCRIPT.md"],
    "4_voiceover_writing": ["VOICEOVER.md"],
    "5_voiceover_generation": [],
    "6_duration_measurement": [],
    "7_style_definition": ["STYLES.md"],
    "8_remotion_coding": [
        "remotion/PLAN.md",
        "remotion/src/Root.tsx",
        "remotion/src/components/MainVideo.tsx",
        "remotion/src/components/Thumbnail.tsx",
        "remotion/src/lib/config.ts",
        "remotion/src/lib/styles.ts",
    ],
    "9_scene_rendering": [],
    "10_stitching": [],
    "11_metadata_generation": ["TITLE.md", "DESCRIPTION.md", "TAGS.md"],
    "12_thumbnail_generation": ["remotion/src/components/Thumbnail.tsx"],
    "13_thumbnail_rendering": [],
}

# ---------------------------------------------------------------------------
# Config — three-layer merge with per-video auto-discovery
# ---------------------------------------------------------------------------

# Optional module-level override path. Set by pipeline.py when `--config <path>`
# is passed on the CLI. Applied as layer 2 of the merge (after repo-root config,
# before per-video config).
_CONFIG_OVERRIDE_PATH: Path = None


def set_config_override(path):
    """Set the `--config` CLI override path (called once by pipeline.py main())."""
    global _CONFIG_OVERRIDE_PATH
    _CONFIG_OVERRIDE_PATH = Path(path).resolve() if path else None


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Recursively merge overlay onto base. Overlay wins key collisions.
    Both dicts may contain nested dicts; non-dict values are overwritten.
    Lists are replaced wholesale (not extended)."""
    if not isinstance(base, dict):
        return overlay
    if not isinstance(overlay, dict):
        return overlay
    out = dict(base)
    for k, v in overlay.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(video_dir=None):
    """Load pipeline config with three-layer merge.

    Merge order (each layer wins over the previous):
      1. Repo-root `pipeline_config.json` (defaults)
      2. `--config <path>` CLI override (if set via set_config_override())
      3. Per-video `pipeline_config.json` (if `video_dir` is passed and exists)

    `video_dir` may be:
      - None          — only layers 1-2 (used by scripts/* and pipeline.py pre-step)
      - Path          — the per-video directory; probes `<video_dir>/pipeline_config.json`
      - str (title)   — converted via `video_dir(title)`

    Auto-discovery of per-video config (layer 3) is on by default. Disable via
    `config_files.auto_discover_per_video: false` in the repo-root config.
    """
    # Layer 1: repo-root config
    cfg = {}
    if PIPELINE_CONFIG.exists():
        with open(PIPELINE_CONFIG, "r", encoding="utf-8") as f:
            cfg = json.load(f)

    # Layer 2: --config CLI override
    if _CONFIG_OVERRIDE_PATH is not None and _CONFIG_OVERRIDE_PATH.exists():
        with open(_CONFIG_OVERRIDE_PATH, "r", encoding="utf-8") as f:
            override = json.load(f)
        cfg = _deep_merge(cfg, override)

    # Layer 3: per-video auto-discovery
    auto_discover = cfg.get("config_files", {}).get("auto_discover_per_video", True)
    if auto_discover and video_dir is not None:
        # Accept str (title) OR Path (video_dir).
        tvdir = None
        if isinstance(video_dir, str):
            tvdir = REPO_ROOT / "videos" / video_dir
        elif isinstance(video_dir, Path):
            tvdir = video_dir
        if tvdir is not None and tvdir.exists():
            per_video_cfg = tvdir / "pipeline_config.json"
            if per_video_cfg.exists():
                with open(per_video_cfg, "r", encoding="utf-8") as f:
                    overlay = json.load(f)
                cfg = _deep_merge(cfg, overlay)

    return cfg


# Alias for legacy callers — same semantics, but load_config is the new name.
load_pipeline_config = load_config


# ---------------------------------------------------------------------------
# Paths & sanitization
# ---------------------------------------------------------------------------


def video_dir_path(title):
    """Return the absolute Path to a video project directory (alias of video_dir)."""
    return REPO_ROOT / "videos" / title


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
        state = json.load(f)
    # Backfill missing step keys for schema compatibility
    if "steps" in state:
        for key in STEP_KEYS:
            if key not in state["steps"]:
                state["steps"][key] = {"status": "pending"}
    return state


def save_state(title, state):
    _atomic_write_json(state_path(title), state)


# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def emit_trailer(step_num: int, step_key: str, action: str, exit_code: int,
                 next_cmd: str = "", expected_artifacts=None):
    """Print a machine-readable __PIPELINE_NEXT__ trailer line for the agent.

    JSON fields:
      step              — 1-13 (0 for terminal "all done")
      name              — human step name (Step 0 name is "")
      kind              — "creative" | "automated" | "done"
                          ("done" replaces the misleading "automated" that the
                          CREATIVE_STEPS membership check returned for empty step_key)
      action            — "await_complete" | "run_continue" | "fix_and_continue"
                          | "use_continue" | "noop" | "done"
      exit              — process exit code (mirrors sys.exit if you act on it)
      phase             — 1-4 (0 for terminal)
      next_cmd          — exact command for the agent to run next ("" if terminal)
      skills_section    — SKILL.md anchor for the current phase (e.g. "#phase-2-voiceover")
      expected_artifacts — list of files the agent must produce (empty for Steps 1-2
                          and for terminal; populated for Steps 3,4,7,8,11,12)

    Backward compatible: the new params default to "" / None so existing callers
    that pass only (step_num, step_key, action, exit_code) still work.
    """
    import json
    name = STEP_NAMES.get(step_key, step_key)
    if step_key == "":
        kind = "done"
    else:
        kind = "creative" if step_key in CREATIVE_STEPS else "automated"
    phase, anchor = _phase_for_step(step_key)
    skills_files = _skill_paths_for_phase(phase) if phase > 0 else []
    trailer = json.dumps({
        "step": step_num,
        "name": name,
        "kind": kind,
        "action": action,
        "exit": exit_code,
        "phase": phase,
        "next_cmd": next_cmd,
        "skills_section": anchor,
        "skills_files": skills_files,
        "expected_artifacts": expected_artifacts or [],
    })
    print(f"__PIPELINE_NEXT__ {trailer}")


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


def rotate_log_if_needed(logpath: Path, max_size_mb: int = 0, keep_last_n: int = 10):
    """Rotate a log file if it exceeds max_size_mb (no-op when max_size_mb == 0)."""
    if max_size_mb <= 0:
        return
    if not logpath.exists():
        return
    size_mb = logpath.stat().st_size / (1024 * 1024)
    if size_mb <= max_size_mb:
        return
    # Remove the oldest archive beyond keep limit
    oldest = logpath.with_suffix(f"{logpath.suffix}.{keep_last_n}")
    oldest.unlink(missing_ok=True)
    # Shift archives .N -> .N+1
    for i in range(keep_last_n - 1, 0, -1):
        src = logpath.with_suffix(f"{logpath.suffix}.{i}")
        if src.exists():
            dst = logpath.with_suffix(f"{logpath.suffix}.{i + 1}")
            src.rename(dst)
    # Rename current to .1
    logpath.rename(logpath.with_suffix(f"{logpath.suffix}.1"))
    # Start fresh — open_log will re-create the file


def find_versions_to_prune(versions_dir: Path, safe_title: str, pattern_str: str, keep: int) -> list:
    """Return a list of versioned files that exceed the keep count (oldest first).
    
    pattern_str e.g. r'{title}-v(\d+)\.mp4' — must have one capture group for version number.
    """
    if keep < 1:
        keep = 1
    full_pattern = re.compile(pattern_str.replace("{title}", re.escape(safe_title)))
    versions = []
    if versions_dir.exists():
        for f in versions_dir.iterdir():
            m = full_pattern.match(f.name)
            if m:
                versions.append((int(m.group(1)), f))
    versions.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in versions[keep:]]


def run_cmd(cmd, cwd=None, check=True, logpath: Path = None):
    """Run a shell command, stream to stdout, optionally tee to a log file."""
    print(f"  $ {cmd}")
    log_f = open(logpath, "a", encoding="utf-8") if logpath else None
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        stdout_text = result.stdout.decode("utf-8", errors="replace")
        if stdout_text:
            for line in stdout_text.rstrip().split("\n"):
                safe_line = line.encode(sys.stdout.encoding, errors="replace").decode(sys.stdout.encoding)
                print(f"  | {safe_line}")
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


