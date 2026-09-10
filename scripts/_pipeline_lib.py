"""Shared helpers for the full-video-pipeline scripts.

Single source of truth for config loading, paths, atomic JSON writes, ffprobe,
voiceover hashing, and log paths. All other scripts import from here.
"""

import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
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
        "name": "video-composer",
        "path": "skills/video-composer",
        "phases": {
            "1": ["SKILL.md",
                  "references/stage-1-ideation.md",
                  "references/stage-2-packaging-first.md",
                  "references/stage-3-scripting.md",
                  "references/stage-4-storytelling-loop.md",
                  "references/stage-5-voiceover-delivery.md"],
            "2": ["references/stage-5-voiceover-delivery.md"],
            "3": ["references/stage-6-visual-editing.md",
                  "references/stage-7-audio-music.md"],
            "4": ["SKILL.md",
                  "references/stage-2-packaging-first.md",
                  "references/stage-8-title-thumbnail.md",
                  "references/stage-9-qa-publish.md"],
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
        "{python} scripts/generate_voiceover.py {video_dir} --voice {voiceover.voice}",
    "6_duration_measurement":
        "{python} scripts/measure_durations.py {video_dir}",
    "9_scene_rendering":
        "{python} scripts/render_scene.py {video_dir} {scene_id} --quiet",
    "10_stitching":
        "{python} scripts/assemble.py {video_dir}",
    "13_thumbnail_rendering":
        "{python} scripts/render_thumbnail.py {video_dir}",
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
      {video_dir}        — the videos/<title> path (string, shell-quoted)
      {python}           — sys.executable of the current interpreter (shell-quoted)
      {scene_id}         — integer scene id (only for Step 9)
      {voiceover.voice}  — any dotted config path under the loaded config
      {voiceover.rate}, {voiceover.volume}, {voiceover.pitch}, {voiceover.concurrency}
      {video.fps}, {video.width}, {video.height}, etc.
      {render.crf}, {render.gl_backend}, etc.

    Unknown {dotted.path} markers resolve by walking the loaded config dict;
    missing leaves render as empty string (with a warning to stderr).

    Values are substituted with shell quoting (platform-aware: shlex.quote on
    POSIX, MSVC-style via subprocess.list2cmdline on Windows), so config values
    containing spaces or shell metacharacters stay one argument.
    Templates must NOT pre-quote the token themselves ("{token}" would bake
    literal quote characters into the argument).
    """
    if cfg is None:
        cfg = load_config(video_dir=video_dir)
    # Always pass the most resolved video_dir string the orchestrator knows.
    # Convert Path -> str to keep f-string-friendly template values.
    vd_str = str(video_dir) if not isinstance(video_dir, str) else video_dir

    # Build a flat substitution map. We support {video_dir}, {python},
    # {scene_id}, and arbitrary {section.key.key} references into the config dict.
    subs = {"video_dir": shell_quote_arg(vd_str), "python": shell_quote_arg(sys.executable)}
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
        return shell_quote_arg(cur)

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
    if _CONFIG_OVERRIDE_PATH is not None:
        if _CONFIG_OVERRIDE_PATH.exists():
            with open(_CONFIG_OVERRIDE_PATH, "r", encoding="utf-8") as f:
                override = json.load(f)
            cfg = _deep_merge(cfg, override)
        else:
            print(f"WARNING: --config override not found: {_CONFIG_OVERRIDE_PATH}",
                  file=sys.stderr)

    # Layer 3: per-video auto-discovery
    auto_discover = cfg.get("config_files", {}).get("auto_discover_per_video", True)
    if auto_discover and video_dir is not None:
        # Accept Path (video_dir) OR str (title). A str that is an existing
        # path (absolute or contains a separator) is used directly — otherwise
        # it is treated as a title under videos/.
        tvdir = None
        if isinstance(video_dir, Path):
            tvdir = video_dir
        elif isinstance(video_dir, str):
            p = Path(video_dir)
            if p.is_absolute() or (len(p.parts) > 1 and p.exists()):
                tvdir = p
            elif (REPO_ROOT / "videos" / video_dir).exists() or \
                    "/" not in video_dir and "\\" not in video_dir:
                tvdir = REPO_ROOT / "videos" / video_dir
            elif p.exists():
                tvdir = p
            else:
                tvdir = REPO_ROOT / "videos" / video_dir
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


def init_console():
    """Make stdout/stderr UTF-8 with replacement for legacy consoles (cp1252).

    Step scripts print em-dashes/arrows; when stdout is a pipe under a locale
    codec those prints raise UnicodeEncodeError and kill the child. Forcing
    UTF-8 also prevents mojibake when the orchestrator decodes child output as
    UTF-8. Idempotent and safe on every platform — called at import time below
    so every script that imports this library is covered automatically.
    """
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, AttributeError, OSError):
                pass


# Cover every importer at import time (scripts only need to import the lib).
init_console()


def shell_quote_arg(value) -> str:
    """Quote a single argument for the current platform's default shell.

    POSIX (/bin/sh via shell=True): shlex.quote. Windows (cmd.exe): the same
    algorithm subprocess.list2cmdline uses — double quotes only when needed,
    since cmd.exe treats single quotes as literal characters.
    """
    value = str(value)
    if os.name == "nt":
        return subprocess.list2cmdline([value])
    return shlex.quote(value)


def resolve_gl_backend(cfg=None) -> str:
    """GL backend for Remotion renders. Config may pin one explicitly;
    'auto' (or missing) picks swangle on Linux (software GL, no GPU needed)
    and angle elsewhere (native ANGLE, Remotion's default)."""
    cfg = cfg or {}
    backend = (cfg.get("render", {}) or {}).get("gl_backend", "auto")
    if backend in (None, "", "auto"):
        return "swangle" if sys.platform.startswith("linux") else "angle"
    return backend


def resolve_tmpdir(cfg=None, title="") -> Path:
    """Per-video Remotion temp dir, platform-appropriate.
    system.temp_dir supports {title}; missing/None/'' -> <OS tmp>/remotion/{title}."""
    cfg = cfg or {}
    raw = ((cfg.get("system", {}) or {}).get("temp_dir"))
    if not raw:
        base = Path(tempfile.gettempdir()) / "remotion"
        return base / (title or "")
    return Path(str(raw).replace("{title}", title or ""))


def apply_render_env(tmpdir):
    """Set temp-dir env vars for Remotion/Node children on any OS.

    Returns the previous values dict so callers can restore with
    restore_render_env() and avoid cross-video process-global leaks.
    """
    tmpdir = str(tmpdir)
    keys = ("TMPDIR", "TEMP", "TMP", "REMOTION_TMPDIR")
    prev = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ[k] = tmpdir
    return prev


def restore_render_env(prev):
    """Restore env vars saved by apply_render_env()."""
    if not isinstance(prev, dict):
        return
    for k, v in prev.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


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


def atomic_replace(src: Path, dst: Path, retries: int = 5):
    """os.replace with a small retry loop for Windows AV/file-lock races."""
    import time as _time

    last: Exception | None = None
    for attempt in range(retries):
        try:
            os.replace(src, dst)
            return
        except (PermissionError, FileNotFoundError, OSError) as e:
            last = e
            _time.sleep(0.05 * (attempt + 1))
    if last is not None:
        raise last


def _atomic_write_json(path: Path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Unique tmp per writer — fixed "*.tmp" names clobber under concurrency.
    fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        atomic_replace(Path(tmp_name), path)
    except BaseException:
        try:
            Path(tmp_name).unlink(missing_ok=True)
        except OSError:
            pass
        raise


class _FileLock:
    """Minimal cross-platform exclusive lock via O_CREAT|O_EXCL spin.

    Stdlib-only: creates <target>.lock atomically, waits up to timeout,
    removes on release. Stale locks older than timeout are broken.
    """

    def __init__(self, target: Path, timeout: float = 30.0):
        self.lock_path = Path(str(target) + ".lock")
        self.timeout = timeout

    def __enter__(self):
        import time as _time
        deadline = _time.time() + self.timeout
        while True:
            try:
                fd = os.open(str(self.lock_path),
                             os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode("utf-8"))
                os.close(fd)
                return self
            except FileExistsError:
                try:
                    age = _time.time() - self.lock_path.stat().st_mtime
                    if age > self.timeout:
                        self.lock_path.unlink(missing_ok=True)
                        continue
                except OSError:
                    pass
                if _time.time() >= deadline:
                    raise TimeoutError(
                        f"Timed out acquiring lock {self.lock_path}")
                _time.sleep(0.05)

    def __exit__(self, *exc):
        try:
            self.lock_path.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def pipeline_lock(target: Path, timeout: float = 30.0):
    """Return a context manager for exclusive access to target JSON file."""
    return _FileLock(Path(target), timeout=timeout)


def load_scenes(title):
    p = scenes_json_path(title)
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f).get("scenes", [])


def save_scenes_full(video_dir_path, data):
    """Atomic write of full scenes.json given a Path to the video directory."""
    p = Path(video_dir_path) / "scenes.json"
    with pipeline_lock(p):
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
    p = state_path(title)
    with pipeline_lock(p):
        _atomic_write_json(p, state)


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
# Frame-exact voiceover concatenation (shared by assemble.py + generate_sfx.py)
# ---------------------------------------------------------------------------


def scene_padded_duration(scene, fps) -> float:
    """Duration a scene's audio chunk must occupy: exactly its rendered frame
    count divided by fps (measure_durations stores frames = ceil(vo_s * fps)).

    Falls back to raw measured seconds, then target seconds, when frames are
    unavailable (pre-Step-6 callers) — those callers get a printed warning.
    """
    frames = scene.get("actual_duration_frames")
    if frames:
        return float(frames) / float(fps or 30)
    return float(scene.get("actual_duration_seconds")
                 or scene.get("target_duration_seconds") or 0.0)


def voiceover_pad_graph(voiceover_dir, scenes, fps):
    """Build inputs + filter graph for a frame-exact voiceover concatenation.

    Each per-scene MP3 is resampled to 44.1 kHz mono, padded with apad to
    EXACTLY ceil(vo_seconds*fps)/fps seconds, and all chunks are concatenated.
    This makes the audio timeline identical to the video frame timeline —
    without it, plain concat of raw-length chunks drifts ~0.5 frame per scene
    against the ceil'd video scenes, so late-scene narration slides off its
    visuals and beat-referenced SFX land progressively late.

    Returns (input_args, graph, missing_ids):
      input_args  — flat ["-i", "<abs posix path>", ...] list for ffmpeg
      graph       — filter_complex string ending in the [aout] label
      missing_ids — scene ids whose MP3 is absent (callers decide how to fail)
    """
    fps = float(fps or 30)
    input_args = []
    pads = []
    labels = []
    missing = []
    warned = set()
    # Skip malformed entries instead of KeyErroring the whole stitch.
    valid = [s for s in (scenes or []) if isinstance(s, dict)
             and isinstance(s.get("id"), int)]
    ordered = sorted(valid, key=lambda s: s["id"])
    for idx, s in enumerate(ordered):
        mp3 = Path(voiceover_dir) / f"scene-{s['id']:02d}.mp3"
        if not mp3.exists():
            missing.append(s["id"])
            continue
        dur = scene_padded_duration(s, fps)
        if not s.get("actual_duration_frames") and s["id"] not in warned:
            print(f"WARNING: scene {s.get('id', '?')} has no actual_duration_frames "
                  f"— using raw seconds for audio padding (run Step 6 first)", file=sys.stderr)
            warned.add(s["id"])
        input_args += ["-i", mp3.resolve().as_posix()]
        pads.append(
            f"[{idx}:a]aresample=44100,"
            f"aformat=sample_fmts=s16:channel_layouts=mono,"
            f"apad=whole_dur={dur:.6f}[a{idx}];"
        )
        labels.append(f"[a{idx}]")
    n = len(labels)
    if n == 0:
        # concat=n=0 is invalid ffmpeg — return an anullsrc graph so callers
        # fail with a clear missing-audio error instead of a filter error.
        return input_args, "anullsrc=r=44100:cl=mono[aout]", missing
    graph = "".join(pads) + "".join(labels) + f"concat=n={n}:v=0:a=1[aout]"
    return input_args, graph, missing


# ---------------------------------------------------------------------------
# Voiceover hashing (for idempotent generation)
# ---------------------------------------------------------------------------


def hash_voiceover(text, voice, rate, volume, pitch, engine="edge") -> str:
    """Return a stable SHA-256 hex of the inputs that affect audio output.

    ``engine`` participates so swapping edge<->pocket always invalidates cached
    MP3s even when voice/rate strings happen to coincide (pocket ignores
    rate/pitch but accepts them for hash compatibility).
    """
    payload = json.dumps(
        {"text": text, "voice": voice, "rate": rate, "volume": volume,
         "pitch": pitch, "engine": engine},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Speech duration estimates (truncation detection + script-time estimates)
# ---------------------------------------------------------------------------

# Approximate speech rates in characters/second per language family, measured
# from engine outputs (edge-tts + pocket-tts). Deliberately conservative
# (slightly slow) so `expected` is an upper-ish bound; the truncation gate
# only fires when actual audio is FAR shorter than expected.
SPEECH_CHARS_PER_SEC = {
    "english": 14.0,
    "spanish": 17.0,
    "french": 14.0,
    "german": 13.0,
    "italian": 15.0,
    "portuguese": 14.0,
}

# Actual < 70% of expected duration => almost certainly truncated audio.
TTS_TRUNCATION_RATIO = 0.7
# Skip the check for tiny scenes (per-scene rate variance is high there).
TTS_TRUNCATION_MIN_EXPECTED = 4.0


def speech_rate_for_language(language) -> float:
    """Chars/sec for a language tag like 'english' or 'spanish_24l'."""
    lang = (language or "english").strip().lower()
    base = re.split(r"[_\-\s]", lang)[0] if lang else "english"
    return SPEECH_CHARS_PER_SEC.get(base, SPEECH_CHARS_PER_SEC["english"])


def _resolve_speech_rate(language, rate_override) -> float:
    """Explicit chars/sec override wins; otherwise the language table."""
    try:
        rate = float(rate_override) if rate_override else 0.0
    except (TypeError, ValueError):
        rate = 0.0
    if rate <= 0:
        rate = speech_rate_for_language(language)
    return rate


def estimate_audio_seconds_for_chars(n_chars, language="english",
                                     rate_override=None) -> float:
    """Expected TTS seconds for a character count (script-time estimates)."""
    rate = _resolve_speech_rate(language, rate_override)
    return (max(int(n_chars or 0), 0)) / rate if rate > 0 else 0.0


def estimate_speech_duration(text, language="english", rate_override=None) -> float:
    """Expected TTS seconds for `text`. `rate_override` (chars/sec, from
    `voiceover.chars_per_sec`) wins over the language table."""
    return estimate_audio_seconds_for_chars(len((text or "").strip()),
                                            language, rate_override)


def check_audio_duration_plausible(text, actual_seconds, language="english",
                                  rate_override=None):
    """Return (ok, expected, ratio) for freshly synthesized audio.

    ok=False means the audio is far shorter than the text can explain —
    almost certainly truncated synthesis, not natural rate variance.
    """
    expected = estimate_speech_duration(text, language, rate_override)
    if expected < TTS_TRUNCATION_MIN_EXPECTED:
        return True, expected, 1.0
    ratio = (actual_seconds or 0.0) / expected
    return ratio >= TTS_TRUNCATION_RATIO, expected, ratio


# ---------------------------------------------------------------------------
# Cached-audio verification (stale-MP3 detection for idempotent skips)
# ---------------------------------------------------------------------------

# A cached MP3 whose measured duration drifts further than this from the
# registered actual_duration_seconds is stale (e.g. left behind by a scene
# renumber) and must be regenerated, never skipped.
AUDIO_STALE_TOLERANCE_SEC = 0.5
AUDIO_STALE_TOLERANCE_RATIO = 0.05


def check_cached_audio(mp3_path, voice_hash, stored_hash, stored_duration):
    """Classify a cached scene MP3. Returns (status, actual_seconds).

    Statuses: "missing" (no file/empty), "hash_mismatch" (text/voice
    changed), "unmeasurable" (ffprobe failed), "stale" (hash matches but
    audio bytes don't match the registered duration — e.g. renumber
    leftovers), "current" (safe to skip).
    """
    if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) == 0:
        return "missing", 0.0
    if (stored_hash or None) != voice_hash:
        return "hash_mismatch", 0.0
    actual = get_audio_duration(mp3_path)
    if actual <= 0:
        return "unmeasurable", 0.0
    if not stored_duration or stored_duration <= 0:
        return "stale", actual
    tol = max(AUDIO_STALE_TOLERANCE_SEC,
              float(stored_duration) * AUDIO_STALE_TOLERANCE_RATIO)
    if abs(actual - float(stored_duration)) <= tol:
        return "current", actual
    return "stale", actual


def hash_sfx(obj) -> str:
    """SHA-256 of a canonically-serialized object (dict/list/primitive)."""
    blob = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def split_render_hashes(video_dir) -> tuple:
    """(shared_digest_hex, {scene_id: combined_hash}) over Remotion inputs.

    Shared core of compute_scene_render_hashes, exposed separately so
    callers (Step 9) can tell a scene-file edit apart from a shared-source
    edit when explaining WHY a scene invalidated. `node_modules`,
    `package-lock.json`, and SceneMap.generated.ts never participate —
    reinstalling dependencies after retention cleanup cannot invalidate.
    """
    src = Path(video_dir) / "remotion" / "src"
    if not src.is_dir():
        return "", {}
    scene_re = re.compile(r"^Scene(\d+)\.tsx$")
    shared_h = hashlib.sha256()
    scene_bytes = {}
    shared_files = []
    for p in sorted(src.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(src).as_posix()
        # Auto-generated map churns every scaffold — excluding it prevents
        # invalidating all scenes on every run.
        if rel == "scenes/SceneMap.generated.ts":
            continue
        data = p.read_bytes()
        if rel.startswith("scenes/"):
            m = scene_re.match(Path(rel).name)
            if m:
                scene_bytes[int(m.group(1))] = data
                continue
            # scenes/*.ts helpers fall through to shared (invalidate all).
        shared_files.append((rel, data))
    for rel, data in sorted(shared_files):
        shared_h.update(rel.encode("utf-8"))
        shared_h.update(data)
    shared_digest = shared_h.hexdigest()
    out = {}
    shared_bytes = shared_digest.encode("utf-8")
    for sid, data in scene_bytes.items():
        sh = hashlib.sha256()
        sh.update(shared_bytes)
        sh.update(data)
        out[sid] = sh.hexdigest()
    return shared_digest, out


def describe_render_staleness(video_dir, scene_id, stored_hash, stored_shared) -> str:
    """Human-readable reason why a rendered scene's sources no longer match.

    Distinguishes "SceneXX.tsx changed" (re-render just that scene) from
    "shared sources changed" (all scenes invalidate — e.g. a scaffold
    republish overwrote src/components/animations/). A bare dependency
    reinstall can never be the reason: node_modules is not hashed.
    """
    shared, hashes = split_render_hashes(video_dir)
    current = hashes.get(scene_id)
    if current is None:
        return f"scenes/Scene{scene_id:02d}.tsx missing from remotion/src"
    if stored_hash and current == stored_hash:
        return "unchanged"
    if stored_shared and shared != stored_shared:
        return ("shared remotion sources changed (lib/components/styles/animations "
                "— invalidates all scenes; a scaffold republish overwrites "
                "src/components/animations/)")
    if stored_hash:
        return f"scenes/Scene{scene_id:02d}.tsx changed"
    return "no stored hash (legacy render — recording now)"


def compute_scene_render_hashes(video_dir) -> dict:
    """{scene_id: sha256} over each scene's Remotion render inputs.

    Per-scene hash = sha256(shared_project_digest + bytes(scenes/SceneXX.tsx)).
    The shared digest covers every file under remotion/src EXCEPT the
    per-scene TSX files (lib/, components/, Root.tsx, index.css,
    SceneMap.generated.ts ...), so editing one scene's TSX invalidates only
    that scene, while editing styles/config/shared components invalidates all.
    Returns {} before Step 8 exists (no remotion/src).
    """
    return split_render_hashes(video_dir)[1]


# ---------------------------------------------------------------------------
# subprocess helper with optional log tee
# ---------------------------------------------------------------------------


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


_PROGRESS_LINE_RES = (
    re.compile(r"Rendered \d+\s*/\s*\d+"),   # remotion render progress
    re.compile(r"Encoded \d+\s*/\s*\d+"),    # remotion encode progress
    re.compile(r"^Bundling\b"),              # remotion bundler progress bar
    re.compile(r"^Getting Headless Shell"),  # chrome download progress
    re.compile(r"\d+(\.\d+)?\s*Mb/\d"),      # chrome download "9.5 Mb/113.3 Mb"
    re.compile(r"^frame=\s*\d+"),            # ffmpeg progress
    re.compile(r"^size=\s*\d+\S*\s+time="),  # ffmpeg audio-only progress
    re.compile(r"^LOG \(VoskAPI"),           # vosk model-load chatter
)


def _is_progress_line(line: str) -> bool:
    """True for tool progress chatter that is safe to collapse on success.

    These lines repeat per frame/unit of work (thousands per run) and carry
    no diagnostic value once the command succeeds — the last one is still
    echoed as a summary. On failure run_cmd echoes everything, so errors
    never lose context.
    """
    return any(rx.search(line) for rx in _PROGRESS_LINE_RES)


# Console echo of the command itself is truncated past this length — the
# full argv is in the log file. (A 23-input ffmpeg filter graph is one
# ~4 KB "line"; it dominated Step 10 output.)
_CMD_ECHO_MAX = 600


def _short_cmd(printable: str) -> str:
    """Truncate a console-echoed command line past _CMD_ECHO_MAX chars."""
    if len(printable) > _CMD_ECHO_MAX:
        return printable[:_CMD_ECHO_MAX] + f"... [truncated, {len(printable)} chars total]"
    return printable


def _collapse_progress(lines: list) -> tuple:
    """Split captured lines into (echo_lines, collapsed_count, last_dropped).

    Progress chatter matching _PROGRESS_LINE_RES is dropped from the console
    echo, except the last dropped line, which is returned so the caller can
    echo it as a summary (e.g. "Encoded 339/339").
    """
    echo_lines = []
    collapsed = 0
    last_dropped = None
    for line in lines:
        if _is_progress_line(line):
            collapsed += 1
            last_dropped = line
        else:
            echo_lines.append(line)
    return echo_lines, collapsed, last_dropped


def run_cmd(cmd, cwd=None, check=True, logpath: Path = None, quiet_progress: bool = True):
    """Run a command, capture output, echo it indented, optionally tee to a log.

    ``cmd`` may be a string (executed via the shell) or an argv list.
    Lists run with shell=False on POSIX (no shell parsing, safe for paths
    with spaces). On Windows they run with shell=True via list2cmdline:
    CreateProcess cannot launch .cmd shims (npx.cmd) directly, so bare
    shell=False fails with WinError 2 — the shell resolves PATHEXT.

    Output handling: per-frame progress lines (Remotion, ffmpeg, Chrome
    downloads, vosk) are collapsed on success — only the last one is echoed
    plus a "[N progress lines collapsed]" note — while the COMPLETE output
    is always teed to ``logpath`` when given. On failure everything is
    echoed: collapsed output must never hide an error.
    """
    use_shell = True
    if isinstance(cmd, (list, tuple)):
        parts = [str(p) for p in cmd]
        if os.name == "nt":
            # Windows: join with list2cmdline quoting, run through the shell
            # so npx.cmd / npm.cmd / node shims resolve via PATHEXT.
            printable = subprocess.list2cmdline(parts)
            print(f"  $ {_short_cmd(printable)}")
            parts = printable
            use_shell = True
        else:
            printable = " ".join(shlex.quote(p) for p in parts)
            print(f"  $ {_short_cmd(printable)}")
            use_shell = False
    else:
        print(f"  $ {_short_cmd(cmd)}")
        parts = cmd
    log_f = open(logpath, "a", encoding="utf-8") if logpath else None
    try:
        # The full command line always lands in the log file (the console
        # echo above may be truncated for very long argv lists).
        if log_f:
            log_f.write(f"$ {parts if isinstance(parts, str) else subprocess.list2cmdline(parts)}\n")
        # Force UTF-8 I/O in child Python processes: step scripts print
        # em-dashes/arrows that crash under a legacy locale codec (cp1252)
        # when their stdout is a pipe. Harmless no-op for non-Python children.
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        result = subprocess.run(
            parts, shell=use_shell, cwd=cwd, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        stdout_text = result.stdout.decode("utf-8", errors="replace")
        failed = check and result.returncode != 0
        if stdout_text:
            enc = getattr(sys.stdout, "encoding", None) or "utf-8"
            lines = stdout_text.rstrip().split("\n")
            if log_f:
                # The log file always keeps 100% of the output — only the
                # console echo below is filtered.
                for line in lines:
                    log_f.write(line + "\n")
            if failed or not quiet_progress:
                # Failure (or explicit opt-out): echo everything. A collapsed
                # error is a lost error.
                echo_lines, collapsed, last_dropped = lines, 0, None
            else:
                echo_lines, collapsed, last_dropped = _collapse_progress(lines)
            for line in echo_lines:
                safe_line = line.encode(enc, errors="replace").decode(enc)
                print(f"  | {safe_line}")
            if collapsed:
                if last_dropped is not None:
                    print(f"  | {last_dropped.strip()}")
                where = f"full output in {logpath}" if logpath else "no log file for this command"
                print(f"  | ... [{collapsed} progress lines collapsed — {where}]")
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


