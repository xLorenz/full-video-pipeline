#!/usr/bin/env python3
"""
render_scene.py — Renders a single HyperFrames scene with hardware guardrails.

Linux-first. Uses psutil for RAM/disk checks. Same resumable + non-fatal
contract as the prior Remotion version: on per-scene failure, records
render_status="failed", render_attempts += 1, last_render_error=<msg>, then
continues (does NOT abort the whole batch — the orchestrator run_step_9
catches this).

Architecture change vs Remotion version:
- The Remotion codepath rendered `src/Root.tsx MainVideo` with
  `--frames=<start>-<end>` to slice a single composition per scene.
- HyperFrames has no per-frame-range render flag — every composition is
  rendered whole. So each scene has its own composition HTML file
  (`compositions/scene-NN.html`) and is rendered independently:
    npx --yes hyperframes@X render \
        -c compositions/scene-NN.html \
        --output scenes/scene-NN.mp4 \
        --fps <fps> --crf <crf> --workers <concurrency> \
        --protocol-timeout <ms>
- Per-scene variables (title, subtitle, palette, captions, showCaptions,
  durationInFrames) are passed via `--variables-file` and read inside the
  composition via `window.__hyperframes.getVariables()`.
- Voiceover is NOT baked into the rendered scene MP4. Compositions must not
  include `<audio src=".../voiceover/...">` for the voiceover track —
  `scripts/assemble.py` muxes `voiceover_aligned.mp3` onto the concatenated
  scene MP4s in a single ffmpeg pass (unchanged audio path).

Usage:
    python3 scripts/render_scene.py <video_dir> <scene_id>

Exit codes:
    0  scene rendered successfully
    1  scene failed (see scenes.json last_render_error)
    2  invalid arguments / config problem
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402

try:
    import psutil
except ImportError:
    print("ERROR: psutil not installed. Run: pip install -r scripts/requirements.txt",
          file=sys.stderr)
    sys.exit(2)


# HyperFrames CLI version. Defaults to the pipeline's pinned version; can be
# overridden via pipeline_config.json -> `hyperframes.cli_version`.
def _hf_version(cfg):
    return (cfg.get("hyperframes", {}) or {}).get(
        "cli_version", "0.7.61"
    )


def kill_orphaned_chrome():
    """Kill chrome-headless-shell / chrome processes whose parent is no longer
    alive, regardless of which renderer (Remotion or HyperFrames or anything
    else) spawned them.

    Mirrors the smart orphan logic from the previous render_scene.sh / .py:
    avoids killing Chrome whose parent node process is still running.
    """
    orphans = []
    for proc in psutil.process_iter(["pid", "ppid", "name", "cmdline"]):
        try:
            info = proc.info
            cmdline = " ".join(info.get("cmdline") or [])
            # HyperFrames uses the same chrome-headless-shell binary as Remotion
            # did (both bundle Puppeteer's recommended headless build). We also
            # catch a generic "headless" name to be safe across versions.
            if "chrome-headless-shell" not in cmdline and "headless" not in (info.get("name") or ""):
                continue
            ppid = info.get("ppid")
            parent_alive = False
            if ppid:
                try:
                    parent = psutil.Process(ppid)
                    parent_cmd = " ".join(parent.cmdline() or [])
                    # Parent of an active render is typically node (npx) or
                    # bun (HyperFrames can run under either). Don't kill if
                    # the parent looks like a live renderer host.
                    parent_alive = "node" in parent_cmd or "bun" in parent_cmd or "hyperframes" in parent_cmd
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    parent_alive = False
            if not parent_alive:
                orphans.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    for proc in orphans:
        try:
            proc.kill()
            print(f"  Killed orphaned chrome-headless-shell (PID {proc.pid})")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    if not orphans:
        print("  No orphaned processes found.")
    return len(orphans)


def check_resources(min_ram_mb):
    """Pre-flight check on RAM."""
    avail = psutil.virtual_memory().available / (1024 * 1024)
    print(f"Available RAM: {int(avail)}MB")
    if avail < min_ram_mb:
        print(f"WARNING: Low RAM ({int(avail)}MB < {min_ram_mb}MB). Waiting 30s...")
        time.sleep(30)
        avail = psutil.virtual_memory().available / (1024 * 1024)
        if avail < min_ram_mb:
            print(f"ERROR: Still low RAM after waiting ({int(avail)}MB). Aborting.")
            return False
    return True


def check_disk(path, min_mb=500):
    free = psutil.disk_usage(str(path)).free / (1024 * 1024)
    print(f"Available disk: {int(free)}MB")
    if free < min_mb:
        print(f"ERROR: Low disk space ({int(free)}MB < {min_mb}MB). Aborting.")
        return False
    return True


def build_variables_file(scenes_json_path: Path, target_id: int,
                          props_path: Path, burn_captions: bool,
                          palette: dict):
    """Write a JSON variables file for `hyperframes render --variables-file`.

    The composition reads these via `window.__hyperframes.getVariables()`.
    Returns the scene's actual_duration_seconds — used to override
    `data-duration` on the composition root automatically (we don't write
    the duration back to the HTML, but the renderer uses it as a fallback if
    the body's `data-duration` placeholder hasn't been updated by the agent).
    """
    with open(scenes_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data.get("scenes", [])

    matches = [s for s in scenes if s["id"] == target_id]
    if not matches:
        print(f"ERROR: Scene {target_id} not found in scenes.json", file=sys.stderr)
        sys.exit(2)

    target = matches[0]
    # Use seconds (HyperFrames data-duration is in seconds — float OK).
    # The Remotion version required actual_duration_frames; we keep that as
    # an optional fallback but prefer actual_duration_seconds if present.
    duration_sec = target.get("actual_duration_seconds")
    if duration_sec is None:
        duration_frames = target.get("actual_duration_frames")
        if duration_frames is None:
            print(f"ERROR: Scene {target_id} missing actual_duration_seconds "
                  f"and actual_duration_frames (run step 6 first)",
                  file=sys.stderr)
            sys.exit(2)
        fps = data.get("fps", 30)
        duration_sec = duration_frames / fps

    captions = target.get("captions") or []

    variables = {
        # Identity
        "title": target.get("title", ""),
        "subtitle": target.get("subtitle", ""),
        # Timing override (float seconds). The composition's data-duration
        # placeholder is updated by the agent at Phase 3 — but if they forget,
        # the variable is the authoritative source.
        "duration": float(duration_sec),
        # Per-scene captions layer
        "captions": captions,
        "showCaptions": bool(burn_captions and captions),
        # Palette + fps pass-through (compositions read via getVariables())
        "fps": data.get("fps", 30),
        "width": data.get("width", 1920),
        "height": data.get("height", 1080),
        "palette": palette,
        # The whole scene's neighbour ids/etc could be added here if a future
        # composition needs cross-scene context (transitions, durations,
        # overlap detection). For now, scope is just this scene.
    }
    with open(props_path, "w", encoding="utf-8") as f:
        json.dump(variables, f)
    return float(duration_sec)


def update_scene_status(video_dir_path: Path, scene_id: int,
                        status: str, error: str = None):
    """Atomically update one scene's render fields in scenes.json."""
    scenes_path = Path(video_dir_path) / "scenes.json"
    with open(scenes_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for s in data.get("scenes", []):
        if s["id"] == scene_id:
            s["render_status"] = status
            if status == "rendered":
                s["scene_file"] = f"scenes/scene-{scene_id:02d}.mp4"
                s["last_render_error"] = None
            else:
                s["render_attempts"] = s.get("render_attempts", 0) + 1
                if error:
                    s["last_render_error"] = error[:1000]
            break
    pl.save_scenes_full(video_dir_path, data)


def _reap_tmpdir(cfg, tmpdir):
    """Remove the HyperFrames temp dir if retention config allows."""
    ren = cfg.get("retention", {})
    # Backward-compat key name; new config uses reap_hyperframes_tmpdir_after_render.
    if ren.get("reap_hyperframes_tmpdir_after_render",
               ren.get("reap_remotion_tmpdir_after_render", True)):
        tdir = Path(tmpdir)
        if tdir.exists():
            shutil.rmtree(tdir, ignore_errors=True)
            print(f"  Reaped temp dir: {tmpdir}")


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/render_scene.py <video_dir> <scene_id>",
              file=sys.stderr)
        sys.exit(2)
    video_dir = Path(sys.argv[1]).resolve()
    scene_id = int(sys.argv[2])
    scene_padded = f"{scene_id:02d}"
    scenes_json = video_dir / "scenes.json"
    hyperframes_dir = video_dir / "hyperframes"
    scene_composition = hyperframes_dir / "compositions" / f"scene-{scene_padded}.html"
    scene_composition_rel = Path("compositions") / f"scene-{scene_padded}.html"
    output_file = video_dir / "scenes" / f"scene-{scene_padded}.mp4"
    output_rel = Path("scenes") / f"scene-{scene_padded}.mp4"

    if not video_dir.is_dir():
        print(f"ERROR: video directory not found: {video_dir}", file=sys.stderr)
        sys.exit(2)
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found: {scenes_json}", file=sys.stderr)
        sys.exit(2)
    if not hyperframes_dir.is_dir():
        print(f"ERROR: hyperframes directory not found: {hyperframes_dir}",
              file=sys.stderr)
        sys.exit(2)
    if not scene_composition.exists():
        print(f"ERROR: scene composition not found: {scene_composition}\n"
              f"       The agent must author compositions/scene-{scene_padded}.html "
              f"at Step 8 before this step can render.", file=sys.stderr)
        update_scene_status(video_dir, scene_id, "failed",
                            f"Missing scene composition: {scene_composition.name}")
        sys.exit(2)

    cfg = pl.load_config(video_dir=str(video_dir))
    r = cfg.get("render", {})
    s = cfg.get("system", {})
    v = cfg.get("video", {})
    pal = v.get("palette", {}) or {}

    concurrency       = r.get("concurrency", 1)
    crf               = r.get("crf", 28)
    timeout_ms        = r.get("timeout_ms", 60000)
    # Low-memory mode helps on the constrained box HyperFrames auto-detects
    # RAM via host memory, not cgroup — on container/cloud boxes we explicitly
    # pass --low-memory-mode if render.low_memory_mode is true (default auto).
    low_memory        = r.get("low_memory_mode")  # None = auto-detect
    # An optional quality preset (draft|standard|high) — kept from the
    # Remotion codepath: render_scene uses standard by default; `preview`
    # uses draft. The CLI auto-picks CRF from quality if --crf is omitted;
    # if both are set, --crf wins.
    quality_preset    = r.get("quality", "standard")

    min_ram_mb      = s.get("min_available_ram_mb", 200)
    min_disk_mb     = s.get("min_available_disk_mb", 500)
    # Default temp_dir is per-platform; old config uses /tmp/remotion/{title},
    # new recommended is /tmp/hyperframes/{title} — either is accepted.
    tmpdir          = s.get("temp_dir", "/tmp/hyperframes/{title}").replace("{title}", video_dir.name)
    post_settle     = s.get("post_render_settle_seconds", 5)
    burn_captions   = v.get("burn_captions", False)

    hf_version = _hf_version(cfg)

    log_file = pl.log_path(video_dir.name, 9, scene_id)

    print(f"=== Rendering Scene {scene_id} ===")
    print(f"Video dir: {video_dir}")
    print(f"Composition: {scene_composition_rel}")
    print(f"Output: {output_file}")
    print(f"Temp dir: {tmpdir}")
    print(f"HyperFrames CLI: {hf_version}")
    print(f"Log: {log_file}")

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== render_scene.py run {pl.now_iso()} ===\n")

    # Pre-flight
    print("\n--- Pre-flight check ---")
    if not check_resources(min_ram_mb):
        update_scene_status(video_dir, scene_id, "failed", "Pre-flight RAM check failed")
        sys.exit(1)
    if not check_disk(video_dir, min_disk_mb):
        update_scene_status(video_dir, scene_id, "failed", "Pre-flight disk check failed")
        sys.exit(1)

    # Temp dir setup — HyperFrames reads HYPERFRAMES_EXTRACT_CACHE_DIR for
    # its content-addressed frame extraction cache (long renders can grow to
    # multi-GB). TMPDIR is also nice to have so any sub-Chrome processes use
    # it. We point both at the same per-video scratch directory.
    Path(tmpdir).mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = tmpdir
    os.environ["HYPERFRAMES_EXTRACT_CACHE_DIR"] = tmpdir
    # Disable passive update checks during render — keep logs clean & avoid
    # network calls during a long batch render.
    os.environ.setdefault("HYPERFRAMES_NO_UPDATE_CHECK", "1")
    os.environ.setdefault("HYPERFRAMES_SKIP_SKILLS", "1")

    # Orphan cleanup
    print("\n--- Cleaning up orphaned Chrome processes ---")
    kill_orphaned_chrome()
    time.sleep(2)

    # Build variables file
    props_fd, props_path = tempfile.mkstemp(
        suffix=".json", prefix=f"hyperframes-scene{scene_padded}-vars-"
    )
    os.close(props_fd)
    try:
        duration_sec = build_variables_file(
            scenes_json, scene_id, Path(props_path), burn_captions, pal
        )
    except SystemExit:
        update_scene_status(video_dir, scene_id, "failed", "Variables build failed")
        raise

    print(f"\n--- Starting HyperFrames render ---")
    print(f"Flags: workers={concurrency} crf={crf} quality={quality_preset} "
          f"protocol_timeout={timeout_ms}ms")
    print(f"Scene duration: {duration_sec:.3f}s")

    # Honors the failing-on-warning mode of HyperFrames lint: the orchestrator
    # has already run lint_gate before invoking render_scene.py, so compositions
    # that reach this point are structurally clean.
    # HyperFrames v0.7.61 has no --overwrite flag — the CLI overwrites the
    # output file implicitly if it exists at the destination path. The
    # --composition value is resolved by the CLI relative to the project dist,
    # so we pass a relative composition path. --output accepts absolute paths.
    cmd = (
        f"npx --yes hyperframes@{hf_version} render"
        f" --composition \"{scene_composition_rel}\""
        f" --output \"{output_file}\""
        f" --variables-file \"{props_path}\""
        f" --crf {crf}"
        f" --quality {quality_preset}"
        f" --workers {concurrency}"
        f" --protocol-timeout {timeout_ms}"
    )
    if low_memory is True:
        cmd += " --low-memory-mode"
    elif low_memory is False:
        cmd += " --no-low-memory-mode"

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"$ {cmd}\n")

    start_time = time.time()
    # subprocess.run captures stderr+stdout to the log file via pl.run_cmd's
    # logpath argument — same pattern as the Remotion version.
    result = pl.run_cmd(cmd, cwd=hyperframes_dir, check=False, logpath=log_file)
    elapsed = int(time.time() - start_time)

    if props_path and os.path.exists(props_path):
        os.unlink(props_path)

    if result.returncode != 0:
        msg = (f"HyperFrames render failed with exit code {result.returncode} "
               f"after {elapsed}s")
        print(f"\nERROR: {msg}")
        update_scene_status(video_dir, scene_id, "failed", msg)
        # Post-render cleanup even on failure
        print("\n--- Post-render cleanup (failure path) ---")
        kill_orphaned_chrome()
        time.sleep(post_settle)
        _reap_tmpdir(cfg, tmpdir)
        sys.exit(1)

    update_scene_status(video_dir, scene_id, "rendered")

    # Post-render cleanup
    print("\n--- Post-render cleanup ---")
    kill_orphaned_chrome()
    time.sleep(post_settle)
    _reap_tmpdir(cfg, tmpdir)

    print(f"\n=== Scene {scene_id} rendered in {elapsed}s ===")
    print(f"Output: {output_file}")
    if output_file.exists():
        size = output_file.stat().st_size / (1024 * 1024)
        print(f"File size: {size:.1f} MB")
    else:
        print("WARNING: Output file not found!")
    sys.exit(0)


if __name__ == "__main__":
    main()
