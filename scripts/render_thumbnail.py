#!/usr/bin/env python3
"""
render_thumbnail.py — Render a YouTube thumbnail PNG via HyperFrames render + ffmpeg.

HyperFrames v0.7.61 has no equivalent of `npx remotion still`.  The `snapshot`
command captures a full-resolution PNG but requires the composition to be mounted
in `index.html`.  We therefore render a single-frame MP4 of the thumbnail
composition at `--fps 1` then extract the first PNG via ffmpeg.

The Remotion equivalent (`npx remotion still src/Root.tsx Thumbnail --frame=N`)
is replaced by:
    npx --yes hyperframes@X render
        --composition compositions/thumbnail.html
        --output thumb.mp4 --fps 1 --gif-loop 1
        --variables '{"title":"...","palette":{...}}'
    ffmpeg -i thumb.mp4 -frames:v 1 thumb.png

Because HyperFrames requires that any --composition file be mounted from
`index.html` via `data-composition-src`, `run_step_9` already injected a
`thumbnail` composition mount into `index.html` at scaffold time.  This script
reads the title from TITLE.md + palette from STYLES.md, passes them as
render-time variables, and then uses ffmpeg to extract one PNG from the
1-frame MP4.

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
import tempfile
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


def _hf_version(cfg):
    """Read the pinned HyperFrames CLI version from config (or default)."""
    return (cfg.get("hyperframes", {}) or {}).get(
        "cli_version", "0.7.61"
    )


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
    for line in text.split("\n"):
        if "Hybrid" in line and "|" in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 2:
                return parts[1]
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


def build_thumbnail_variables(video_dir, scenes_json):
    """Build variables dict for `--variables` passed to render.

    The thumbnail composition reads these at runtime via
    `window.__hyperframes.getVariables()`. Variables come from the same
    TITLE.md + STYLES.md + scenes.json sources the Remotion version used.
    """
    with open(scenes_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    title = read_title_md(video_dir)
    if not title:
        title = data.get("video_title", "Video Title")

    palette = read_styles_md(video_dir)
    if not palette:
        palette = {
            "primary": "#0F1B2D",
            "secondary": "#00BFA6",
            "accent": "#FFB300",
            "background": "#0A1220",
            "text": "#FFFFFF",
        }

    return {
        "title": title,
        "subtitle": "",
        "palette": palette,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/render_thumbnail.py <video_dir>", file=sys.stderr)
        sys.exit(2)

    video_dir = Path(sys.argv[1]).resolve()
    scenes_json = video_dir / "scenes.json"
    hyperframes_dir = video_dir / "hyperframes"
    thumbnail_composition = hyperframes_dir / "compositions" / "thumbnail.html"
    versions_dir = video_dir / "versions"

    if not video_dir.is_dir():
        print(f"ERROR: video directory not found: {video_dir}", file=sys.stderr)
        sys.exit(2)
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found: {scenes_json}", file=sys.stderr)
        sys.exit(2)
    if not hyperframes_dir.is_dir():
        print(f"ERROR: hyperframes directory not found: {hyperframes_dir}", file=sys.stderr)
        sys.exit(2)
    if not thumbnail_composition.exists():
        print(f"ERROR: thumbnail composition not found: {thumbnail_composition}\n"
              f"       The agent must customize hyperframes/compositions/thumbnail.html "
              f"at Phase 4 (Step 12) before this step can render.", file=sys.stderr)
        sys.exit(2)

    cfg = pl.load_config()
    r = cfg.get("render", {})
    s = cfg.get("system", {})

    timeout_ms = r.get("timeout_ms", 60000)
    min_ram_mb = s.get("min_available_ram_mb", 200)
    min_disk_mb = s.get("min_available_disk_mb", 500)
    tmpdir = s.get("temp_dir", "/tmp/hyperframes/{title}").replace("{title}", video_dir.name)
    post_settle = s.get("post_render_settle_seconds", 5)

    hf_version = _hf_version(cfg)
    log_file = pl.log_path(video_dir.name, 13)
    safe_title = pl.sanitize_title(video_dir.name)

    print(f"=== Rendering Thumbnail ===")
    print(f"Video title: {video_dir.name}")
    print(f"HyperFrames CLI: {hf_version}")
    print(f"Log: {log_file}")

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== render_thumbnail.py run {pl.now_iso()} ===\n")

    # Pre-flight
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
        print(f"ERROR: low disk space ({int(free)}MB < {min_disk_mb}MB). Aborting.")
        sys.exit(1)

    # TEMPDIR setup — HyperFrames reads HYPERFRAMES_EXTRACT_CACHE_DIR
    Path(tmpdir).mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = tmpdir
    os.environ["HYPERFRAMES_EXTRACT_CACHE_DIR"] = tmpdir
    os.environ.setdefault("HYPERFRAMES_NO_UPDATE_CHECK", "1")
    os.environ.setdefault("HYPERFRAMES_SKIP_SKILLS", "1")

    # Build variable context for the render
    variables = build_thumbnail_variables(video_dir, scenes_json)
    vars_fd, vars_path = tempfile.mkstemp(
        suffix=".json", prefix="hyperframes-thumb-vars-"
    )
    os.close(vars_fd)
    with open(vars_path, "w", encoding="utf-8") as f:
        json.dump(variables, f)

    # Versioned output
    versions_dir.mkdir(exist_ok=True)
    next_version = find_next_thumbnail_version(versions_dir, safe_title)
    tmp_mp4 = versions_dir / f".thumb-{next_version}.mp4"
    output_file = versions_dir / f"{safe_title}-thumbnail-v{next_version}.png"

    title = variables.get("title", "")[:60]
    print(f"\n--- Starting HyperFrames render (thumbnail) ---")
    print(f"Output: {output_file}")
    print(f"Title: {title}...")
    print(f"FPS: 1 (single-frame MP4)")

    # Render a single-frame MP4 for the thumbnail composition.
    # HyperFrames requires sub-compositions to be mounted in index.html
    # via data-composition-src.  The scaffold's index.html always mounts
    # the thumbnail composition at `data-track-index="0"`.
    # We render the root and the 1-frame render isolates the thumb comp.
    render_cmd = (
        f"npx --yes hyperframes@{hf_version} render"
        " --composition index.html"
        f" --output \"{tmp_mp4}\""
        f" --variables-file \"{vars_path}\""
        " --fps 1"
        " --quality standard"
    )

    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"$ {render_cmd}\n")

    start_time = time.time()
    result = pl.run_cmd(render_cmd, cwd=hyperframes_dir, check=False, logpath=log_file)
    elapsed = int(time.time() - start_time)

    os.unlink(vars_path)

    if result.returncode != 0 or not tmp_mp4.exists():
        msg = f"Thumbnail render failed (exit {result.returncode}) after {elapsed}s"
        print(f"\nERROR: {msg}")
        sys.exit(1)

    # Extract the first frame as a PNG via ffmpeg
    extract_cmd = f"ffmpeg -i \"{tmp_mp4}\" -frames:v 1 \"{output_file}\""
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"$ {extract_cmd}\n")

    extract_result = pl.run_cmd(extract_cmd, check=False, logpath=log_file)
    # Clean up the temp MP4
    tmp_mp4.unlink(missing_ok=True)

    if extract_result.returncode != 0 or not output_file.exists():
        print(f"\nERROR: ffmpeg frame extraction failed (exit {extract_result.returncode})")
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
    if ren.get("reap_hyperframes_tmpdir_after_render",
               ren.get("reap_remotion_tmpdir_after_render", True)):
        tdir = Path(tmpdir)
        if tdir.exists():
            shutil.rmtree(tdir, ignore_errors=True)
            print(f"  Reaped temp dir: {tmpdir}")

    sys.exit(0)


if __name__ == "__main__":
    main()