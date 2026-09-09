#!/usr/bin/env python3
"""
render_scene.py — Renders a single Remotion scene with hardware guardrails.

Cross-platform (Linux + Windows). Uses psutil for RAM/disk checks.

Resumable & non-fatal: on per-scene failure, records render_status="failed",
render_attempts += 1, last_render_error=<msg>, then continues (does NOT abort
the whole batch — the orchestrator run_step_9 catches this).

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


def kill_orphaned_chrome():
    """Kill chrome-headless-shell processes whose parent is no longer alive.

    Mirrors the smart orphan logic from the previous render_scene.sh — avoids
    killing Chrome whose parent node/remotion process is still running.
    """
    orphans = []
    for proc in psutil.process_iter(["pid", "ppid", "name", "cmdline"]):
        try:
            info = proc.info
            cmdline = " ".join(info.get("cmdline") or [])
            if "chrome-headless-shell" not in cmdline:
                continue
            ppid = info.get("ppid")
            parent_alive = False
            if ppid:
                try:
                    parent = psutil.Process(ppid)
                    # NOTE: Process.cmdline() takes no kwargs on any psutil
                    # version — never pass timeout= here (raises TypeError).
                    parent_cmd = " ".join(parent.cmdline() or [])
                    parent_alive = "node" in parent_cmd or "remotion" in parent_cmd
                except (psutil.NoSuchProcess, psutil.AccessDenied,
                        psutil.TimeoutExpired, psutil.ZombieProcess,
                        TypeError):
                    parent_alive = False
            if not parent_alive:
                orphans.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, TypeError):
            continue
    for proc in orphans:
        try:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
                pass
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


def build_props_json(scenes_json_path: Path, target_id: int, props_path: Path,
                     burn_captions: bool):
    """Build the props JSON for Remotion and return (frame_start, frame_end)."""
    with open(scenes_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data.get("scenes", [])

    matches = [s for s in scenes
               if isinstance(s, dict) and s.get("id") == target_id]
    if not matches:
        print(f"ERROR: Scene {target_id} not found in scenes.json", file=sys.stderr)
        sys.exit(2)

    missing = [s.get("id", "?") for s in scenes
               if not isinstance(s, dict) or s.get("actual_duration_frames") is None]
    if missing:
        print(f"ERROR: Scenes {missing} missing actual_duration_frames (run step 6 first)",
              file=sys.stderr)
        sys.exit(2)

    props_scenes = []
    for s in scenes:
        captions = s.get("captions") or []
        props_scenes.append({
            "id": s["id"],
            "title": s.get("title", ""),
            "durationInFrames": s["actual_duration_frames"],
            # NOTE: audioFile intentionally NOT used by Remotion for playback.
            # Audio is muxed at stitch time. Strip the file reference here to
            # discourage scene components from using it; keep an empty string
            # for backward compatibility with old SceneXX.tsx that reads props.
            "audioFile": "",
            "captions": captions,
            "showCaptions": burn_captions and bool(captions),
        })
    props = {
        "scenes": props_scenes,
        "fps": data.get("fps", 30),
        "width": data.get("width", 1920),
        "height": data.get("height", 1080),
        "burnCaptions": burn_captions,
    }
    with open(props_path, "w", encoding="utf-8") as f:
        json.dump(props, f)

    offset = sum(s["actual_duration_frames"]
                for s in scenes if s["id"] < target_id)
    duration = matches[0]["actual_duration_frames"]
    return offset, offset + duration - 1


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
                # Record the source hashes this render was produced from so
                # Step 9 can detect stale scenes when SceneXX.tsx / shared
                # sources change (render_shared lets it name WHICH changed).
                shared, hashes = pl.split_render_hashes(video_dir_path)
                if hashes.get(scene_id):
                    s["render_hash"] = hashes[scene_id]
                    s["render_shared"] = shared
            else:
                s["render_attempts"] = s.get("render_attempts", 0) + 1
                if error:
                    s["last_render_error"] = error[:1000]
            break
    pl.save_scenes_full(video_dir_path, data)


def _reap_tmpdir(cfg, tmpdir):
    """Remove the Remotion TMPDIR if retention config allows."""
    ren = cfg.get("retention", {})
    if ren.get("reap_remotion_tmpdir_after_render", True):
        tdir = Path(tmpdir)
        if tdir.exists():
            shutil.rmtree(tdir, ignore_errors=True)
            print(f"  Reaped Remotion TMPDIR: {tmpdir}")


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/render_scene.py <video_dir> <scene_id>",
              file=sys.stderr)
        sys.exit(2)
    video_dir = Path(sys.argv[1]).resolve()
    scene_id = int(sys.argv[2])
    scene_padded = f"{scene_id:02d}"
    scenes_json = video_dir / "scenes.json"
    remotion_dir = video_dir / "remotion"
    output_file = video_dir / "scenes" / f"scene-{scene_padded}.mp4"

    if not video_dir.is_dir():
        print(f"ERROR: video directory not found: {video_dir}", file=sys.stderr)
        sys.exit(2)
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found: {scenes_json}", file=sys.stderr)
        sys.exit(2)
    if not remotion_dir.is_dir():
        print(f"ERROR: remotion directory not found: {remotion_dir}", file=sys.stderr)
        sys.exit(2)

    cfg = pl.load_config(video_dir=video_dir)
    r = cfg.get("render", {})
    s = cfg.get("system", {})
    v = cfg.get("video", {})

    try:
        concurrency = int(r.get("concurrency", 1))
        jpeg_quality = int(r.get("jpeg_quality", 80))
        crf = int(r.get("crf", 28))
        timeout_ms = int(r.get("timeout_ms", 60000))
        node_max_old = int(r.get("node_max_old_space_size_mb", 384))
        min_ram_mb = int(s.get("min_available_ram_mb", 200))
        min_disk_mb = int(s.get("min_available_disk_mb", 500))
        post_settle = int(s.get("post_render_settle_seconds", 5))
    except (TypeError, ValueError):
        print("ERROR: render/system numeric config must be integers", file=sys.stderr)
        sys.exit(2)
    gl_backend = pl.resolve_gl_backend(cfg)
    if gl_backend not in ("angle", "swangle", "egl", "swiftshader"):
        print(f"ERROR: invalid render.gl_backend: {gl_backend!r}", file=sys.stderr)
        sys.exit(2)
    image_format = r.get("image_format", "jpeg")
    codec = r.get("codec", "h264")
    x264_preset = r.get("x264_preset", "ultrafast")
    # Per-scene TMPDIR — shared TMPDIR lets parallel scenes reap each other.
    tmpdir = str(pl.resolve_tmpdir(cfg, video_dir.name) / f"scene-{scene_id:02d}")
    burn_captions = v.get("burn_captions", False)

    log_file = pl.log_path(video_dir.name, 9, scene_id)

    print(f"=== Rendering Scene {scene_id} ===")
    print(f"Video dir: {video_dir}")
    print(f"Output: {output_file}")
    print(f"Temp dir: {tmpdir}")
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

    # TMPDIR setup (platform-appropriate, covers both POSIX and Windows temp vars)
    Path(tmpdir).mkdir(parents=True, exist_ok=True)
    _prev_env = pl.apply_render_env(tmpdir)
    _prev_node = os.environ.get("NODE_OPTIONS")
    os.environ["NODE_OPTIONS"] = f"--max-old-space-size={node_max_old}"

    # Orphan cleanup
    print("\n--- Cleaning up orphaned Chrome processes ---")
    kill_orphaned_chrome()
    time.sleep(2)

    # Build props
    import tempfile
    props_fd, props_path = tempfile.mkstemp(suffix=".json", prefix="remotion-props-")
    os.close(props_fd)
    try:
        frame_start, frame_end = build_props_json(scenes_json, scene_id,
                                                  Path(props_path), burn_captions)
    except SystemExit:
        Path(props_path).unlink(missing_ok=True)
        pl.restore_render_env(_prev_env)
        update_scene_status(video_dir, scene_id, "failed", "Props build failed")
        raise
    except (AttributeError, TypeError) as e:
        Path(props_path).unlink(missing_ok=True)
        pl.restore_render_env(_prev_env)
        update_scene_status(video_dir, scene_id, "failed", f"Props build failed: {e}")
        sys.exit(1)

    print(f"\n--- Starting Remotion render ---")
    print(f"Flags: concurrency={concurrency} gl={gl_backend} codec={codec} "
          f"crf={crf} preset={x264_preset}")
    print(f"Frames: {frame_start}-{frame_end}")

    cmd = ["npx", "remotion", "render", "src/Root.tsx", "MainVideo", str(output_file),
           f"--props={props_path}",
           f"--frames={frame_start}-{frame_end}",
           "--concurrency", str(concurrency),
           f"--gl={gl_backend}",
           "--image-format", str(image_format),
           "--jpeg-quality", str(jpeg_quality),
           "--codec", str(codec),
           "--x264-preset", str(x264_preset),
           "--crf", str(crf),
           "--disallow-parallel-encoding",
           "--timeout", str(timeout_ms),
           "--overwrite",
           "--bundle-cache",
           "--log=warn"]

    start_time = time.time()
    try:
        result = pl.run_cmd(cmd, cwd=remotion_dir, check=False, logpath=log_file)
    finally:
        Path(props_path).unlink(missing_ok=True)
    elapsed = int(time.time() - start_time)

    pl.restore_render_env(_prev_env)
    if _prev_node is None:
        os.environ.pop("NODE_OPTIONS", None)
    else:
        os.environ["NODE_OPTIONS"] = _prev_node

    if result.returncode != 0:
        msg = f"Remotion render failed with exit code {result.returncode} after {elapsed}s"
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
