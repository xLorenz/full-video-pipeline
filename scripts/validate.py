#!/usr/bin/env python3
"""
validate.py — Validate scenes.json and pipeline_state.json against the schemas.

Usage:
    python3 scripts/validate.py <video_dir>              # Schema validation only
    python3 scripts/validate.py <video_dir> --step 3     # Schema + step requirements
    python3 scripts/validate.py <video_dir> --step 3 --strict   # Promote Phase-1 warnings to errors

Exit codes:
    0  All checks pass
    1  JSON Schema validation failure
    2  Usage error / missing file / jsonschema import error
    3  Step-requirement failure (e.g. empty scenes at step 3)
    4  Artifact-not-found (expected file missing or empty on disk)
    5  Caption integrity violation (start > end, end > scene_duration)
    6  Phase-1 hard failure (SCRIPT.md or pattern-interrupt log missing)
    7  Phase-1 warning promoted to error by --strict
    8  SFX/BGM check hard failure (unknown sound/beat/bed)
    9  SFX/BGM warning promoted to error by --strict
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install -r scripts/requirements.txt",
          file=sys.stderr)
    sys.exit(2)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402
import sfx_catalog as sfx  # noqa: E402

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "schemas"


def validate_file(data_path: Path, schema_path: Path) -> list:
    if not data_path.exists():
        return [f"{data_path}: file not found"]
    if not schema_path.exists():
        return [f"{schema_path}: schema not found"]
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"{data_path}: invalid JSON: {e}"]
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    return [f"{data_path}: {err.message} at /{'/'.join(str(p) for p in err.absolute_path) or '(root)'}"
            for err in errors]


def check_step_requirements(video_dir: Path, data: dict, step: int) -> list:
    """Step-specific checks beyond JSON schema. Returns list of error strings."""
    errors = []
    scenes = data.get("scenes", [])

    if step >= 3:
        if not scenes:
            errors.append(f"At step {step}: scenes.json must have at least 1 scene")
        for s in scenes:
            for field in ("id", "title", "script_text", "voiceover_text"):
                if not s.get(field):
                    errors.append(f"Scene {s.get('id', '?')}: missing required field '{field}' for step {step}")

    if step >= 5:
        for s in scenes:
            if not s.get("voiceover_file"):
                errors.append(f"Scene {s['id']}: missing voiceover_file for step {step}")
            if not s.get("voiceover_hash"):
                errors.append(f"Scene {s['id']}: missing voiceover_hash for step {step}")

    if step >= 6:
        for s in scenes:
            dur = s.get("actual_duration_frames")
            if dur is None or dur <= 0:
                errors.append(f"Scene {s['id']}: missing or invalid actual_duration_frames for step {step}")
            dur_s = s.get("actual_duration_seconds")
            if dur_s is None or dur_s <= 0:
                errors.append(f"Scene {s['id']}: missing or invalid actual_duration_seconds for step {step}")

    if step >= 9:
        for s in scenes:
            if s.get("render_status") != "rendered":
                errors.append(f"Scene {s['id']}: render_status must be 'rendered' for step {step}")
            scene_file = s.get("scene_file")
            if scene_file:
                fpath = video_dir / scene_file
                if not fpath.exists():
                    errors.append(f"Scene {s['id']}: scene_file {scene_file} not found on disk for step {step}")

    if step >= 10:
        versions_dir = video_dir / "versions"
        if not versions_dir.exists() or not list(versions_dir.glob("*.mp4")):
            errors.append(f"At step {step}: no MP4 found in versions/")

    if step >= 13:
        versions_dir = video_dir / "versions"
        if not versions_dir.exists() or not list(versions_dir.glob("*thumbnail*.png")):
            errors.append(f"At step {step}: no thumbnail PNG found in versions/")

    return errors


def check_captions(data: dict) -> list:
    errors = []
    for s in data.get("scenes", []):
        scene_dur = s.get("actual_duration_seconds") or 0
        for i, cue in enumerate(s.get("captions") or []):
            if cue.get("start", 0) < 0:
                errors.append(f"Scene {s['id']} cue {i}: start < 0")
            if cue.get("end", 0) < 0:
                errors.append(f"Scene {s['id']} cue {i}: end < 0")
            if cue.get("start", 0) > cue.get("end", 0):
                errors.append(f"Scene {s['id']} cue {i}: start ({cue['start']}) > end ({cue['end']})")
            if scene_dur > 0 and cue.get("end", 0) > scene_dur:
                errors.append(f"Scene {s['id']} cue {i}: end ({cue['end']}) > scene duration ({scene_dur})")
    return errors


# ---------------------------------------------------------------------------
# Phase-1 (Research & Script) content checks.
#
# Sources: PLAN.md ("Retention scripting rules, hook 3-part structure
# (Grab/Promise/Stakes), pattern interrupt frequency, CTA placement") and
# skills/.../retention-scripting-guide.md ("verify by checking the interrupt
# log timestamps"). These run alongside check_step_requirements when
# --step >= 3 (scenes.json authored, SCRIPT.md expected to exist).
#
# Returns (errors, warnings). Errors fail the run regardless; warnings only
# fail under --strict.
# ---------------------------------------------------------------------------

# Per-scene duration drift (actual vs target voiceover length) above which we
# warn. 25% catches scene 3 of the wood-wide-web fixture (+40%) while letting
# the +20% / -16% scenes pass.
DURATION_DRIFT_WARN = 0.25

_TS_RE = re.compile(r"(\d+):(\d{2})(?::(\d{2}))?")


def _parse_ts(s):
    """Parse 'M:SS' or 'H:MM:SS' into seconds (float). None if no match."""
    m = _TS_RE.search(s)
    if not m:
        return None
    if m.group(3) is not None:  # H:MM:SS
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    return int(m.group(1)) * 60 + int(m.group(2))


def check_phase1_aiisms(video_dir, data):
    """Scan per-scene ``voiceover_text`` for AI-isms / banned phrases.

    Returns ``(errors, warnings)``. ``errors`` is always empty in v1 — strict
    promotion is handled by the existing ``--strict`` (exit 7) channel at the
    call site, mirroring how ``check_phase1_content``'s warnings flow.

    Only ``voiceover_text`` per scene is scanned (the exact spoken words TTS
    will say). ``SCRIPT.md`` markdown (visual descriptions, Pattern Interrupt
    Log, Retention Risk Map) is intentionally skipped — those sections aren't
    spoken and would generate false positives.

    Rules live in ``scripts/_ai_isms.py`` (banned phrases, openers, em-dash
    threshold). Each finding carries a category + rewrite suggestion so the
    agent sees what to fix, not just what failed.
    """
    import _ai_isms

    scenes = data.get("scenes", [])
    warnings = []

    for s in scenes:
        sid = s.get("id", "?")
        vo = s.get("voiceover_text") or ""
        if not vo:
            continue  # schema/step-requirements already flags missing vo
        low = vo.lower()

        # Banned substring phrases (anywhere in the scene's voiceover).
        for phrase, cat, suggestion in _ai_isms.BANNED_PHRASES:
            if phrase in low:
                warnings.append(
                    f"Scene {sid}: {cat} phrase \"{phrase}\" "
                    f"-> {suggestion}"
                )

        # Banned openers (start of the first non-whitespace line only).
        first_line = vo.lstrip().split("\n", 1)[0].strip()[:80].lower()
        for opener, cat in _ai_isms.OPENERS_TO_AVOID:
            if first_line.startswith(opener):
                warnings.append(
                    f"Scene {sid}: opener \"{opener}\" ({cat}) "
                    f"-> rewrite the opening"
                )

        # Em-dash overuse (only in scenes with enough spoken words to plausibly
        # contain a real aside — very short scenes are exempt).
        n_em = len(_ai_isms.EM_DASH_RE.findall(vo))
        n_words = len(_ai_isms.WORD_RE.findall(vo))
        if (n_words >= _ai_isms.EM_DASH_MIN_WORDS
                and n_em >= _ai_isms.EM_DASH_THRESHOLD):
            warnings.append(
                f"Scene {sid}: {n_em} em-dashes in {n_words} words "
                f"(threshold {_ai_isms.EM_DASH_THRESHOLD} em-dashes "
                f"in >= {_ai_isms.EM_DASH_MIN_WORDS} words) "
                f"-> too many for spoken language; rewrite as short sentences"
            )

    return [], warnings


def check_phase1_content(video_dir, data):
    """Phase-1 script/structure checks. Returns (errors, warnings)."""
    errors, warnings = [], []
    scenes = data.get("scenes", [])

    script_path = video_dir / "SCRIPT.md"
    if not script_path.exists():
        errors.append("SCRIPT.md not found (Phase-1 research/script artifact missing)")
        return errors, warnings
    text = script_path.read_text(encoding="utf-8")

    # Hard: pattern-interrupt log block must exist (guide-mandated verification).
    log_match = re.search(r"^##\s*Pattern Interrupt Log\s*$", text, re.IGNORECASE | re.MULTILINE)
    if not log_match:
        errors.append("SCRIPT.md: missing '## Pattern Interrupt Log' block (retention-scripting-guide requires it for verification)")
        log_body = ""
    else:
        after = text[log_match.end():]
        next_h = re.search(r"^##\s+", after, re.MULTILINE)
        log_body = after[: next_h.start()] if next_h else after

    # Warnings: hook + promise + CTA scene presence.
    titles_blob = " ".join((s.get("title", "") + " " + s.get("script_text", "")).lower()
                           for s in scenes)
    if scenes and "hook" not in (scenes[0].get("title", "") + scenes[0].get("script_text", "")).lower():
        warnings.append("Scene 1 does not look like a hook (no 'hook' in title/script_text)")
    if "promise" not in titles_blob and "promise" not in text.lower():
        warnings.append("No 'Promise' scene/section found (hook 3-part: Grab/Promise/Stakes)")
    last_vo = (scenes[-1].get("voiceover_text", "") if scenes else "").lower()
    if scenes and not re.search(r"subscribe|follow|comment|like|next video|check out", last_vo):
        warnings.append("Final scene has no CTA marker (subscribe/follow/comment/like/next video)")

    # Warnings: pattern-interrupt log density + average spacing.
    if log_body:
        ts_entries = [_parse_ts(line) for line in log_body.splitlines()]
        ts_entries = [t for t in ts_entries if t is not None]
        if len(ts_entries) < 3:
            warnings.append(f"Pattern-interrupt log has only {len(ts_entries)} timestamped entries (want >= 3)")
        if len(ts_entries) >= 2:
            ts_sorted = sorted(ts_entries)
            intervals = [b - a for a, b in zip(ts_sorted, ts_sorted[1:])]
            avg = sum(intervals) / len(intervals)
            total_dur = sum(s.get("actual_duration_seconds") or 0 for s in scenes) or sum(
                s.get("target_duration_seconds") or 0 for s in scenes)
            threshold = 15.0 if total_dur < 120 else 90.0
            if avg > threshold:
                warnings.append(f"Pattern-interrupt average interval {avg:.1f}s exceeds {threshold:.0f}s target")

    # Warning: per-scene duration drift (actual vs target).
    for s in scenes:
        tgt = s.get("target_duration_seconds")
        act = s.get("actual_duration_seconds")
        if tgt and act and tgt > 0:
            drift = abs(act - tgt) / tgt
            if drift > DURATION_DRIFT_WARN:
                warnings.append(
                    f"Scene {s['id']} duration drift {drift*100:.0f}% "
                    f"(target {tgt}s, actual {act:.1f}s) > {DURATION_DRIFT_WARN*100:.0f}%")

    return errors, warnings


def check_sfx(data: dict) -> tuple[list, list]:
    """SFX/BGM cue checks against the sfx/ catalog. Returns (errors, warnings).

    Errors (block): unknown sound id (with did-you-mean), unresolved beat reference,
    duplicate beat names, unknown bgm track.
    Warnings (judgment): mood conflict vs video/scene mood, cue past scene end,
    final-scene cue at/after video end.
    """
    errors, warnings = [], []
    scenes = data.get("scenes", [])
    if not scenes:
        return errors, warnings

    # Catalog load with degraded fallback: a broken catalog must never crash
    # validation. Prefer real defs (config.json files) — fall back to the
    # recipe/bed registries only when the defs themselves cannot load. (The
    # plan's literal trigger is `validate_catalog()` failing, but manifest-only
    # breakage would then flag valid sounds like `tick` as unknown — a false
    # positive; catalog integrity has its own channel, `--validate-sfx`.)
    try:
        defs = sfx.load_sound_defs()
    except Exception:
        defs = {}
    if not defs:
        defs = {"__degraded__": _MinimalSound("__degraded__")}
        warnings.append("sfx catalog invalid — running degraded checks (see 'validate --validate-sfx')")

    style = data.get("style") or {}
    video_mood = style.get("mood")
    n_cues = sum(len(s.get("sfx") or []) for s in scenes)
    n_beds = sum(1 for s in scenes if isinstance(s.get("bgm"), dict))
    mood_warnings_armed = bool(video_mood)  # scene mood overrides per scene
    if not video_mood and not any(s.get("mood") for s in scenes):
        if n_cues or n_beds:
            warnings.append("no style.mood set (scenes.json top-level) — mood-conformance warnings are disabled; "
                            'add "style": {"mood": "..."} at Step 7')
        mood_warnings_armed = False

    def scene_mood(s):
        return s.get("mood") or video_mood

    def mood_conflict(sound_moods, mood):
        return bool(mood) and not (set(sound_moods) & {mood})

    def scene_duration_s(s):
        return s.get("actual_duration_seconds") or s.get("target_duration_seconds") or 0.0

    for s in scenes:
        sid = s.get("id", "?")
        beats = {b.get("name"): b for b in s.get("beats", [])}
        seen = set()
        for b in s.get("beats", []):
            name = b.get("name")
            if not name:
                continue
            if name in seen:
                errors.append(f"Scene {sid}: duplicate beat name '{name}'")
            seen.add(name)

        dur = scene_duration_s(s)
        mood = scene_mood(s)
        for i, cue in enumerate(s.get("sfx") or []):
            name = cue.get("sound", "")
            sound = defs.get(name) or sfx.resolve_sound(name, defs)
            if sound is None:
                cands = sfx.fuzzy_candidates(name)
                msg = f"Scene {sid} cue {i}: unknown sound '{name}'"
                if cands:
                    msg += f"\n  did you mean: {', '.join(cands)}?"
                else:
                    msg += "\n  no close matches in the catalog (sfx/CATALOG.md)"
                errors.append(msg)
                continue
            if mood_warnings_armed and mood_conflict(sound.moods, mood):
                cands = _same_mood_candidates(defs, mood, sound.tags)
                warnings.append(
                    f"Scene {sid} cue {i}: sound '{name}' (moods: {', '.join(sound.moods)}) "
                    f"conflicts with scene mood '{mood}' — consider {', '.join(cands) or '(none match)'}")
            when = cue.get("when")
            if isinstance(when, (int, float)) and not isinstance(when, bool):
                if dur > 0 and when > dur:
                    warnings.append(
                        f"Scene {sid} cue {i}: when={when}s exceeds scene duration {dur:.2f}s "
                        f"— cue will continue into the next scene")
                if s is scenes[-1] and dur > 0 and when >= dur:
                    warnings.append(
                        f"Scene {sid} cue {i}: when={when}s is at/after the final scene's end ({dur:.2f}s) "
                        f"— will start at/after video end (inaudible)")
            elif isinstance(when, str) and when.startswith("beat:"):
                bname = when[len("beat:"):]
                if bname not in beats:
                    errors.append(f"Scene {sid} cue {i}: beat '{bname}' not defined in this scene's beats")

        bgm = s.get("bgm")
        if isinstance(bgm, dict):
            track = bgm.get("track")
            if track not in sfx.BGM_TRACKS:
                known = ", ".join(sfx.BGM_TRACKS)
                errors.append(f"Scene {sid}: bgm.track '{track}' is not a catalogued bed ({known})")
            elif mood_warnings_armed and mood_conflict(sfx.BGM_TRACKS[track]["moods"], mood):
                warnings.append(
                    f"Scene {sid}: bed '{track}' (moods: {', '.join(sfx.BGM_TRACKS[track]['moods'])}) "
                    f"conflicts with scene mood '{mood}'")

    return errors, warnings


def _same_mood_candidates(defs, mood, tags, limit=3):
    """Up to `limit` catalog sounds whose moods intersect `mood`, sorted by tag
    overlap with the cue sound's tags (most-shared first)."""
    cands = [d for d in defs.values() if set(d.moods) & {mood}]
    cands.sort(key=lambda d: len(set(d.tags) & set(tags)), reverse=True)
    return [d.sound for d in cands[:limit]]


class _MinimalSound:
    """Degraded-catalog stand-in: known id, no moods/tags/aliases to compare against."""
    def __init__(self, sound):
        self.sound = sound
        self.aliases = ()
        self.moods = ()
        self.tags = ()


def validate_animations(video_dir: Path) -> list:
    """Validate every animations/ template's defaults.json against its schema.

    Pulled in from scripts/publish_animations.py — reuses the referencing
    Registry wiring so local $id URIs resolve without network fetches.
    Returns list of error strings (empty == all OK).
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import publish_animations as pa  # noqa: E402
    errors = []
    templates = pa.collect_templates()
    if not templates:
        return []  # no animations/ present — silently OK
    for t in templates:
        defaults_path = t / "config" / "defaults.json"
        schema_path = t / "config" / "schema.json"
        errors += pa.validate_defaults(defaults_path, schema_path)
    return errors


def main():
    parser = argparse.ArgumentParser(description="Validate scenes.json and pipeline_state.json")
    parser.add_argument("video_dir", help="Path to the video project directory")
    parser.add_argument("--step", type=int, default=0,
                        help="Step number for step-specific requirements (default: 0 = no step checks)")
    parser.add_argument("--validate-animations", action="store_true",
                        help="Also validate every template's defaults.json against its schema + the global animations schema")
    parser.add_argument("--validate-sfx", action="store_true",
                        help="Also validate the sfx/ catalog (every sound config against sfx.schema.json + manifest hashes)")
    parser.add_argument("--strict", action="store_true",
                        help="Promote Phase-1 content warnings to errors (exit 7)")
    args = parser.parse_args()

    video_dir = Path(args.video_dir).resolve()
    step = args.step

    if not video_dir.is_dir():
        print(f"ERROR: not a directory: {video_dir}", file=sys.stderr)
        sys.exit(2)

    all_errors = []
    all_errors += validate_file(video_dir / "scenes.json", SCHEMAS_DIR / "scenes.schema.json")
    all_errors += validate_file(video_dir / "pipeline_state.json",
                                SCHEMAS_DIR / "pipeline_state.schema.json")

    # Opt-in animation schema check (mirrors what publish_animations.py runs
    # during the scaffold step). Useful for catching broken template defaults
    # before creating a new video.
    if args.validate_animations:
        anim_errors = validate_animations(video_dir)
        for e in anim_errors:
            all_errors.append(f"(animations) {e}")

    if args.validate_sfx:
        for e in sfx.validate_catalog():
            all_errors.append(f"(sfx) {e}")

    exit_code = 1 if all_errors else 0

    warnings = []
    if exit_code == 0 and step > 0:
        scenes_path = video_dir / "scenes.json"
        if scenes_path.exists():
            with open(scenes_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            step_errors = check_step_requirements(video_dir, data, step)
            if step_errors:
                all_errors.extend(step_errors)
                exit_code = 3

            caption_errors = check_captions(data)
            if caption_errors:
                all_errors.extend(caption_errors)
                if exit_code == 0:
                    exit_code = 5

            # Phase-1 content checks (script structure, pattern interrupts, CTA,
            # duration drift) + AI-ism lint (banned phrases / openers / em-dash
            # overuse on scenes.json voiceover_text). Hard failures add to
            # all_errors (exit 6); warnings print separately and only fail under
            # --strict (exit 7) — shared by both phase-1 checkers.
            if step >= 3:
                p1_errors, p1_warnings = check_phase1_content(video_dir, data)
                ai_errors, ai_warnings = check_phase1_aiisms(video_dir, data)
                p1_errors += ai_errors
                p1_warnings += ai_warnings
                if p1_errors:
                    all_errors.extend(f"(phase-1) {e}" for e in p1_errors)
                    if exit_code == 0:
                        exit_code = 6
                if p1_warnings:
                    if args.strict:
                        all_errors.extend(f"(phase-1, --strict) {e}" for e in p1_warnings)
                        if exit_code == 0:
                            exit_code = 7
                    else:
                        warnings.extend(p1_warnings)

            # SFX/BGM checks — errors exit 8, warnings exit 9 under --strict.
            # Step 8 is where beats/sfx are authored; steps >= 8 re-run it
            # through complete/post-step validation.
            if step >= 8:
                sfx_errors, sfx_warnings = check_sfx(data)
                if sfx_errors:
                    all_errors.extend(f"(sfx) {e}" for e in sfx_errors)
                    if exit_code == 0:
                        exit_code = 8
                if sfx_warnings:
                    if args.strict:
                        all_errors.extend(f"(sfx, --strict) {e}" for e in sfx_warnings)
                        if exit_code == 0:
                            exit_code = 9
                    else:
                        warnings.extend(sfx_warnings)

    if warnings:
        print(f"Phase-1 warnings ({len(warnings)}):")
        for w in warnings:
            print(f"  WARNING: {w}")

    if all_errors:
        print(f"VALIDATION FAILED ({len(all_errors)} errors):")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(exit_code)
    print("VALIDATION OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
