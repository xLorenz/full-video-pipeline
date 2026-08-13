#!/usr/bin/env python3
"""sfx_catalog.py — the SFX sound registry.

Single source of truth for the sfx/ catalog: sound discovery, config validation,
id/alias resolution, fuzzy candidates, and the synth recipe registry. No other
module hard-codes sound ids, moods, or tags — import from here.

Pipeline rule served: "character certainty by metadata" (moods conformance) and
"100% local / 100% free" (curated catalog, no network).
"""

import difflib
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SFX_DIR = REPO_ROOT / "sfx"
SOUNDS_DIR = SFX_DIR / "sounds"
ASSETS_DIR = SFX_DIR / "assets"
MANIFEST_PATH = ASSETS_DIR / "manifest.json"
SFX_SCHEMA_PATH = REPO_ROOT / "schemas" / "sfx.schema.json"

CATALOG_VERSION = 1   # BUMP whenever any sound def, recipe, or alias changes

MOODS = ("serious", "tense", "calm", "neutral", "playful", "humorous", "upbeat", "glitch")
TAGS = ("transition", "emphasis", "impact", "ui", "organic", "riser", "glitch",
        "ambient", "accent")

# Canonical mood list. scenes.schema.json mood / style.mood enum == MOODS − {"glitch"}
# (see PHASE-01 §1.2). `glitch` is a visual-treatment mood reserved for catalog sounds,
# not a video or scene mood. Keep this note and the schema enum in lockstep.

# Recipe ids implemented in generate_sfx.py (PHASE-04) — the registry of truth.
RECIPES = (
    "noise_sweep_up", "noise_sweep_down", "tone_noise_riser", "low_impact",
    "soft_thud", "sub_boom", "mid_punch", "short_tick", "click", "pop",
    "zap", "laser", "bell_ding", "soft_chime", "shimmer", "scan_sweep",
    "glitch_burst", "sparkles", "error_ding", "ambient_swell",
)

# BGM beds implemented in generate_sfx.py — metadata lives here, recipes there.
BGM_TRACKS = {
    "pulse_light":     {"bpm": 112, "moods": ("neutral", "calm", "upbeat"), "energy": "low"},
    "pulse_dark":      {"bpm": 95,  "moods": ("serious", "tense"),          "energy": "mid"},
    "ambient_calm":    {"bpm": None, "moods": ("calm", "serious", "neutral"), "energy": "none"},
    "tension_riser":   {"bpm": None, "moods": ("tense", "serious"),         "energy": "rising"},
}


@dataclass
class ParamDef:
    type: str                    # number | boolean | string
    minimum: float | None = None
    maximum: float | None = None
    default: object = None
    description: str = ""


@dataclass
class SoundDef:
    sound: str
    aliases: tuple
    backend: str                 # "synth" | "sample"
    recipe: str | None = None    # synth only
    asset: str | None = None     # sample only
    tags: tuple = ()
    moods: tuple = ()
    default_volume: float = 0.5
    max_tail_seconds: float = 2.0
    params: dict = field(default_factory=dict)   # {param_name: ParamDef}
    description: str = ""
    path: Path | None = None     # sounds/<id>/


def _load_manifest() -> dict:
    """manifest.json contents; {} when missing, invalid, or not a JSON object."""
    if not MANIFEST_PATH.exists():
        return {}
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def hash_manifest_file(rel_name: str) -> str | None:
    """SHA-256 hex of ASSETS_DIR / rel_name, None on missing file."""
    p = ASSETS_DIR / rel_name
    if not p.exists():
        return None
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_catalog() -> list[str]:
    """Validate every sfx/sounds/<id>/config.json against schema + registry.

    Returns a sorted list of error strings; empty list == catalog OK.
    """
    import jsonschema

    errors = []
    with open(SFX_SCHEMA_PATH, encoding="utf-8") as f:
        schema = json.load(f)
    manifest_hashes = {e["file"]: e["sha256"] for e in _load_manifest().get("files", [])}

    if not SOUNDS_DIR.is_dir():
        return [f"{SOUNDS_DIR}: missing catalog directory"]

    for cfg_path in sorted(SOUNDS_DIR.glob("*/config.json")):
        rel = str(cfg_path.relative_to(REPO_ROOT)).replace("\\", "/")
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f"{rel}: invalid JSON — {e}")
            continue
        try:
            jsonschema.validate(cfg, schema)
        except jsonschema.ValidationError as e:
            errors.append(f"{rel}: schema error — {e.message}")
            continue
        if cfg.get("backend") == "synth":
            recipe = cfg.get("recipe")
            if recipe not in RECIPES:
                errors.append(f"{rel}: unknown recipe '{recipe}' (registry: {', '.join(RECIPES)})")
        elif cfg.get("backend") == "sample":
            asset = cfg.get("asset")
            actual = hash_manifest_file(asset) if asset else None
            expected = manifest_hashes.get(asset)
            if actual is None or expected is None or actual != expected:
                errors.append(f"{rel}: asset '{asset}' missing or SHA-256 mismatch vs manifest.json")
        for name, pdef in (cfg.get("params") or {}).items():
            if pdef.get("type") == "number":
                lo = pdef.get("minimum")
                hi = pdef.get("maximum")
                if lo is not None and hi is not None and lo > hi:
                    errors.append(f"{rel}: param '{name}' minimum {lo} > maximum {hi}")
            if "default" not in pdef:
                errors.append(f"{rel}: param '{name}' missing default")
    return sorted(errors)


def _param_def_from_config(pdef: dict) -> ParamDef:
    return ParamDef(
        type=pdef.get("type", "number"),
        minimum=pdef.get("minimum"),
        maximum=pdef.get("maximum"),
        default=pdef.get("default"),
        description=pdef.get("description", ""),
    )


def load_sound_defs() -> dict[str, SoundDef]:
    """Return {sound_id: SoundDef}. Skips (WARN to stderr) any invalid entry."""
    defs = {}
    if not SOUNDS_DIR.is_dir():
        return defs
    for cfg_path in sorted(SOUNDS_DIR.glob("*/config.json")):
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"WARN: {cfg_path.name}: invalid JSON — {e}", file=sys.stderr)
            continue
        sound = cfg.get("sound")
        if not sound:
            print(f"WARN: {cfg_path.name}: missing 'sound' id", file=sys.stderr)
            continue
        params = {name: _param_def_from_config(p) for name, p in (cfg.get("params") or {}).items()}
        defs[sound] = SoundDef(
            sound=sound,
            aliases=tuple(cfg.get("aliases") or ()),
            backend=cfg.get("backend", "synth"),
            recipe=cfg.get("recipe"),
            asset=cfg.get("asset"),
            tags=tuple(cfg.get("tags") or ()),
            moods=tuple(cfg.get("moods") or ()),
            default_volume=float(cfg.get("default_volume", 0.5)),
            max_tail_seconds=float(cfg.get("max_tail_seconds", 2.0)),
            params=params,
            description=cfg.get("description", ""),
            path=cfg_path.parent,
        )
    return defs


def resolve_sound(name: str, defs: dict[str, SoundDef] | None = None) -> SoundDef | None:
    """Resolve a cue's `sound` field: exact id, then case-insensitive alias. None if unknown."""
    if defs is None:
        defs = load_sound_defs()
    key = name.strip()
    if key in defs:
        return defs[key]
    lowered = key.lower()
    for sound, d in defs.items():
        if sound.lower() == lowered:
            return d
    for sound, d in defs.items():
        for alias in d.aliases:
            if alias.lower() == lowered:
                return d
    return None


def fuzzy_candidates(name: str, limit: int = 3) -> list[str]:
    """Close matches against ids + aliases (difflib); returns canonical ids only."""
    defs = load_sound_defs()
    ids = list(defs)
    names = ids + [a for d in defs.values() for a in d.aliases]
    matches = difflib.get_close_matches(name.lower(), names, n=limit, cutoff=0.5)
    out, seen = [], set()
    for m in matches:
        for sound, d in defs.items():
            if sound == m or m in d.aliases:
                if sound not in seen:
                    seen.add(sound)
                    out.append(sound)
                break
    return out


def resolve_bgm_track(track: str) -> bool:
    """True if track is a known BGM bed id (exact, lowercase)."""
    return track in BGM_TRACKS


def param_defaults(sound: SoundDef) -> dict:
    """{param_name: default} for every param of the sound."""
    return {name: p.default for name, p in sound.params.items()}


def validate_cue_params(sound: SoundDef, params: dict | None) -> list[str]:
    """Validate cue params against the sound's ParamDefs. Returns error strings."""
    errors = []
    params = params or {}
    known = set(sound.params)
    for k in params:
        if k not in known:
            errors.append(
                f"unknown param '{k}' for sound '{sound.sound}' (known: {', '.join(sorted(known)) or 'none'})"
            )
            continue
        pdef = sound.params[k]
        v = params[k]
        if pdef.type == "number":
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                errors.append(f"param '{k}' = {v!r} is not a number")
                continue
            if pdef.minimum is not None and v < pdef.minimum:
                errors.append(f"param '{k}' = {v} out of bounds ({pdef.minimum}..{pdef.maximum})")
            if pdef.maximum is not None and v > pdef.maximum:
                errors.append(f"param '{k}' = {v} out of bounds ({pdef.minimum}..{pdef.maximum})")
        elif pdef.type == "boolean" and not isinstance(v, bool):
            errors.append(f"param '{k}' = {v!r} is not a boolean")
        elif pdef.type == "string" and not isinstance(v, str):
            errors.append(f"param '{k}' = {v!r} is not a string")
    return errors


def catalog_version() -> int:
    return CATALOG_VERSION


if __name__ == "__main__":
    errs = validate_catalog()
    if errs:
        for e in errs:
            print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
    print(f"catalog OK: {len(load_sound_defs())} sounds, {len(RECIPES)} recipes, v{CATALOG_VERSION}")