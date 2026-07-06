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


def read_title_md(video_dir):
    """Read TITLE.md and extract the recommended/hybrid title."""
    title_md = Path(video_dir) / "TITLE.md"
    if not title_md.exists():
        return None
    text = title_md.read_text(encoding="utf-8")
    # Try to find the hybrid/recommended title first
    for line in text.split("\n"):
        if "Hybrid" in line and "|" in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 2:
                return parts[1]
    # Fallback: any non-empty line that looks like a title
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped and not stripped.startswith("|") and not stripped.startswith("#") and len(stripped) > 10:
            return stripped
    return None


def read_styles_md(video_dir):
    """Read STYLES.md and extract palette colors as a dict."""
    styles_md = Path(video_dir) / "STYLES.md"
    palette = {}
    if not styles_md.exists():
        return palette
    text = styles_md.read_text(encoding="utf-8")
    color_map = {
        "primary": ["Primary", "primary"],
        "secondary": ["Secondary", "secondary"],
        "accent": ["Accent", "accent"],
        "background": ["Background", "background"],
        "text": ["Text", "text"],
    }
    for key, labels in color_map.items():
        for label in labels:
            m = re.search(rf"{re.escape(label)}:\s*#([0-9A-Fa-f]{{6}})", text)
            if m:
                palette[key] = f"#{m.group(1)}"
                break
    return palette


def build_thumbnail_props(video_dir, scenes_json):
    """Build props JSON for the Thumbnail composition."""
    with open(scenes_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Try TITLE.md for the title, fallback to video_title from scenes.json
    title = read_title_md(video_dir)
    if not title:
        title = data.get("video_title", "Video Title")

    # Try STYLES.md for palette, fallback to defaults
    palette = read_styles_md(video_dir)
    if not palette:
        palette = {
            "primary": "#0F1B2D",
            "secondary": "#00BFA6",
            "accent": "#FFB300",
            "background": "#0A1220",
            "text": "#FFFFFF",
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

    cfg = pl.load_config()
    r = cfg.get("render", {})
    s = cfg.get("system", {})

    gl_backend = r.get("gl_backend", "swangle")
    timeout_ms = r.get("timeout_ms", 60000)
    node_max_old = r.get("node_max_old_space_size_mb", 384)
    min_ram_mb = s.get("min_available_ram_mb", 200)
    min_disk_mb = s.get("min_available_disk_mb", 500)
    tmpdir = s.get("temp_dir", "/tmp/remotion")
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

    # TMPDIR setup
    Path(tmpdir).mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = tmpdir
    os.environ["REMOTION_TMPDIR"] = tmpdir
    os.environ["NODE_OPTIONS"] = f"--max-old-space-size={node_max_old}"

    # Build props
    import tempfile
    props = build_thumbnail_props(video_dir, scenes_json)
    props_fd, props_path = tempfile.mkstemp(suffix=".json", prefix="remotion-thumb-props-")
    os.close(props_fd)
    with open(props_path, "w", encoding="utf-8") as f:
        json.dump(props, f)

    # Determine output path (versioned)
    versions_dir.mkdir(exist_ok=True)
    next_version = find_next_thumbnail_version(versions_dir, safe_title)
    output_file = versions_dir / f"{safe_title}-thumbnail-v{next_version}.png"

    print(f"\n--- Starting Remotion still render ---")
    print(f"Output: {output_file}")
    print(f"Props: {props_path}")
    print(f"Title: {props.get('title', '')[:60]}...")

    cmd = (
        f"npx remotion still src/Root.tsx Thumbnail \"{output_file}\" "
        f"--props=\"{props_path}\" "
        f"--frame=0 "
        f"--overwrite "
        f"--log=warn "
        f"--gl={gl_backend} "
        f"--timeout {timeout_ms} "
        f"--quality=100"
    )

    start_time = time.time()
    result = pl.run_cmd(cmd, cwd=remotion_dir, check=False, logpath=log_file)
    elapsed = int(time.time() - start_time)

    os.unlink(props_path)

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
    sys.exit(0)


if __name__ == "__main__":
    main()
