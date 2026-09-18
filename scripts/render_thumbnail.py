#!/usr/bin/env python3
"""
render_thumbnail.py — Render a YouTube thumbnail PNG via Remotion still.

Invokes `npx remotion still src/Root.tsx Thumbnail <output.png>` with props
derived from the video's title, palette, and style context. Uses versioned
output (v1, v2, ...) like assemble.py.

Exit codes:
    0  thumbnail rendered successfully
    1  render failed
    2  invalid arguments / config problem
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl

try:
    import psutil
except ImportError:
    print("ERROR: psutil not installed. Run: pip install -r scripts/requirements.txt",
          file=sys.stderr)
    sys.exit(2)


def find_next_thumbnail_version(versions_dir, safe_title):
    max_version = 0
    pattern = re.compile(rf"^{re.escape(safe_title)}-thumbnail-v(\d+)\.png$")
    if versions_dir.exists():
        for f in versions_dir.iterdir():
            m = pattern.match(f.name)
            if m and int(m.group(1)) > max_version:
                max_version = int(m.group(1))
    return max_version + 1


def get_last_frame(remotion_dir):
    """Return the last frame index for the Thumbnail composition (durationInFrames-1)."""
    npx_path = shutil.which("npx") or "npx"
    try:
        result = subprocess.run(
            [npx_path, "remotion", "compositions", "src/Root.tsx", "--json"],
            capture_output=True, timeout=60, cwd=remotion_dir,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("WARNING: could not list compositions (npx unavailable/timeout) — using frame 0")
        return 0
    if result.returncode != 0:
        print("WARNING: `remotion compositions` failed — using frame 0")
        return 0
    try:
        raw = result.stdout.decode("utf-8", errors="replace").strip() \
            if isinstance(result.stdout, bytes) else (result.stdout or "").strip()
        comps = json.loads(raw)
    except (json.JSONDecodeError, TypeError, AttributeError):
        print("WARNING: could not parse compositions JSON — using frame 0")
        return 0
    for comp in comps if isinstance(comps, list) else []:
        if comp.get("id") == "Thumbnail":
            dur = comp.get("durationInFrames", 1)
            return max(0, dur - 1)
    return 0


def _block_text(text, heading):
    """Return the body of the ``## <heading>`` section (exclusive of the header
    and the next ``## `` heading), or '' if the heading is absent."""
    m = re.search(rf"^##\s*{re.escape(heading)}\s*$", text, re.IGNORECASE | re.MULTILINE)
    if not m:
        return ""
    after = text[m.end():]
    nxt = re.search(r"^##\s+", after, re.MULTILINE)
    return after[: nxt.start()] if nxt else after


def read_styles_md(video_dir):
    """Read STYLES.md and extract palette colors as a dict.

    Prefers an explicit ``## Palette (machine-readable)`` block (lines of the
    form ``Label: #RRGGBB``); falls back to scanning the whole document for the
    same ``Label: #HEX`` pattern. Recognised labels: primary, secondary, accent,
    background, text, plus the extended palette surface / alert / cool.
    """
    styles_md = Path(video_dir) / "STYLES.md"
    palette = {}
    if not styles_md.exists():
        return palette
    text = styles_md.read_text(encoding="utf-8")

    # Prefer the machine-readable block; fall back to the whole document so the
    # existing "## Color Palette" / ad-hoc label formats still work.
    block = _block_text(text, "Palette (machine-readable)")
    scan_text = block if block else text

    color_map = {
        "primary": ["Primary", "primary"],
        "secondary": ["Secondary", "secondary"],
        "accent": ["Accent", "accent"],
        "background": ["Background", "background"],
        "text": ["Text", "text"],
        "surface": ["Surface", "surface"],
        "alert": ["Alert", "alert"],
        "cool": ["Cool", "cool"],
    }
    for key, labels in color_map.items():
        for label in labels:
            m = re.search(rf"{re.escape(label)}:\s*#([0-9A-Fa-f]{{6}})", scan_text)
            if m:
                palette[key] = f"#{m.group(1)}"
                break
    return palette


def build_thumbnail_props(video_dir, scenes_json):
    """Build props JSON for the Thumbnail composition."""
    with open(scenes_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Thumbnail text is hand-coded in Thumbnail.tsx; the title prop is only a
    # fallback to satisfy ThumbnailProps.
    title = data.get("video_title", "Video Title")

    # Try STYLES.md for palette, merged per-key over defaults so a
    # STYLES.md missing one label (e.g. no Accent:) can't leave that
    # slot undefined downstream.
    palette = {
        "primary": "#0F1B2D",
        "secondary": "#00BFA6",
        "accent": "#FFB300",
        "background": "#0A1220",
        "text": "#FFFFFF",
        **read_styles_md(video_dir),
    }

    props = {
        "title": title,
        "subtitle": "",
        "palette": palette,
    }
    return props


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/render_thumbnail.py <video_dir>", file=sys.stderr)
        sys.exit(2)

    video_dir = Path(sys.argv[1]).resolve()
    scenes_json = video_dir / "scenes.json"
    remotion_dir = video_dir / "remotion"
    versions_dir = video_dir / "versions"

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

    gl_backend = pl.resolve_gl_backend(cfg)
    timeout_ms = r.get("timeout_ms", 60000)
    node_max_old = r.get("node_max_old_space_size_mb", 384)
    min_ram_mb = s.get("min_available_ram_mb", 200)
    min_disk_mb = s.get("min_available_disk_mb", 500)
    tmpdir = str(pl.resolve_tmpdir(cfg, video_dir.name))
    post_settle = s.get("post_render_settle_seconds", 5)

    log_file = pl.log_path(video_dir.name, 13)
    safe_title = pl.sanitize_title(video_dir.name)

    print(f"=== Rendering Thumbnail ===")
    print(f"Video dir: {video_dir}")
    print(f"Log: {log_file}")

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== render_thumbnail.py run {pl.now_iso()} ===\n")

    # Pre-flight checks
    avail = psutil.virtual_memory().available / (1024 * 1024)
    print(f"Available RAM: {int(avail)}MB")
    if avail < min_ram_mb:
        print(f"WARNING: Low RAM ({int(avail)}MB < {min_ram_mb}MB). Waiting 30s...")
        time.sleep(30)
        avail = psutil.virtual_memory().available / (1024 * 1024)
        if avail < min_ram_mb:
            print(f"ERROR: Still low RAM after waiting ({int(avail)}MB). Aborting.")
            sys.exit(1)

    free = psutil.disk_usage(str(video_dir)).free / (1024 * 1024)
    if free < min_disk_mb:
        print(f"ERROR: Low disk space ({int(free)}MB < {min_disk_mb}MB). Aborting.")
        sys.exit(1)

    # TMPDIR setup (platform-appropriate) — thumbnail-scoped subdir.
    tmpdir = str(Path(tmpdir) / "thumbnail")
    Path(tmpdir).mkdir(parents=True, exist_ok=True)
    _prev_env = pl.apply_render_env(tmpdir)
    _prev_node = os.environ.get("NODE_OPTIONS")
    os.environ["NODE_OPTIONS"] = f"--max-old-space-size={node_max_old}"

    # Build props
    import tempfile
    props = build_thumbnail_props(video_dir, scenes_json)
    props_fd, props_path = tempfile.mkstemp(suffix=".json", prefix="remotion-thumb-props-")
    os.close(props_fd)
    try:
        with open(props_path, "w", encoding="utf-8") as f:
            json.dump(props, f)
    except OSError as e:
        pl.restore_render_env(_prev_env)
        print(f"ERROR: could not write thumbnail props ({e})")
        sys.exit(1)

    # Determine output path (versioned)
    versions_dir.mkdir(exist_ok=True)
    next_version = find_next_thumbnail_version(versions_dir, safe_title)
    output_file = versions_dir / f"{safe_title}-thumbnail-v{next_version}.png"

    frame = get_last_frame(remotion_dir)
    print(f"\n--- Starting Remotion still render ---")
    print(f"Output: {output_file}")
    print(f"Props: {props_path}")
    print(f"Title: {props.get('title', '')[:60]}...")
    print(f"Frame: {frame}")

    cmd = ["npx", "remotion", "still", "src/Root.tsx", "Thumbnail", str(output_file),
           f"--props={props_path}",
           f"--frame={frame}",
           "--overwrite",
           "--log=warn",
           f"--gl={gl_backend}",
           "--timeout", str(timeout_ms),
           "--quality=100"]

    start_time = time.time()
    try:
        result = pl.run_cmd(cmd, cwd=remotion_dir, check=False, logpath=log_file)
    finally:
        Path(props_path).unlink(missing_ok=True)
        pl.restore_render_env(_prev_env)
        if _prev_node is None:
            os.environ.pop("NODE_OPTIONS", None)
        else:
            os.environ["NODE_OPTIONS"] = _prev_node
    elapsed = int(time.time() - start_time)

    if result.returncode != 0 or not output_file.exists():
        msg = f"Thumbnail still render failed (exit {result.returncode}) after {elapsed}s"
        print(f"\nERROR: {msg}")
        sys.exit(1)

    # Wait for file to settle
    time.sleep(post_settle)

    size = output_file.stat().st_size / (1024 * 1024)
    print(f"\n=== Thumbnail rendered in {elapsed}s ===")
    print(f"Output: {output_file}")
    print(f"Size: {size:.1f} MB")

    # Post-render cleanup
    ren = cfg.get("retention", {})
    # Prune old thumbnail versions
    keep_v = ren.get("keep_versions", 2)
    to_prune = pl.find_versions_to_prune(
        versions_dir, safe_title,
        r'{title}-thumbnail-v(\d+)\.png', keep_v)
    for old in to_prune:
        old.unlink(missing_ok=True)
        print(f"  Pruned old thumbnail version: {old.name}")

    # Reap TMPDIR
    if ren.get("reap_remotion_tmpdir_after_render", True):
        tdir = Path(tmpdir)
        if tdir.exists():
            shutil.rmtree(tdir, ignore_errors=True)
            print(f"  Reaped Remotion TMPDIR: {tmpdir}")

    sys.exit(0)


if __name__ == "__main__":
    main()
