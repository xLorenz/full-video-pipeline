#!/usr/bin/env python3
"""
render_thumbnail.py — Renders the thumbnail composition (HyperFrames).

Architecture:
- HyperFrames v0.7+ renders a composition directly to MP4.
- The thumbnail is its own standalone composition at compositions/thumbnail.html
  (agent-authored at Phase 4 Step 12).
- We render it at 1fps for 1 frame (duration=1s), then extract the first frame as PNG.

Usage:
    python3 scripts/render_thumbnail.py <video_dir>

Exit codes:
    0  thumbnail rendered successfully
    1  render failed
    2  invalid arguments / config problem
"""

import json
import os
import re
import shutil
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


def build_thumbnail_variables(video_dir, scenes_json):
    """Build the variable context for the thumbnail composition.

    Reads TITLE.md (recommended title) and STYLES.md (palette) and returns a
    dict that's serialized to JSON and passed to HyperFrames via
    --variables-file.  The composition reads it at runtime via
    window.__hyperframes.getVariables().
    """
    title_text = ""
    title_md = video_dir / "TITLE.md"
    if title_md.exists():
        content = title_md.read_text(encoding="utf-8")
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("1.") or line.startswith("2.") or line.startswith("3."):
                m = re.search(r"\*\*(.+?)\*\*", line)
                if m:
                    title_text = m.group(1).strip()
                    break
                stripped = line.lstrip("0123456789. ").strip()
                if stripped:
                    title_text = stripped
                    break
            else:
                title_text = line
                break
    if not title_text:
        with open(scenes_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        title_text = data.get("video_title", "Untitled Video")

    # Read palette via regex so we don't raise IndexError on missing '#'.
    palette = {}
    styles_md = video_dir / "STYLES.md"
    if styles_md.exists():
        content = styles_md.read_text(encoding="utf-8")
        for key in ("primary", "secondary", "accent", "background", "text"):
            m = re.search(
                rf"{key}:\s*#?([0-9A-Fa-f]{{6}})\b",
                content,
                flags=re.IGNORECASE,
            )
            if m:
                palette[key] = f"#{m.group(1)}"

    return {
        "title": title_text[:60],
        "subtitle": "",
        "palette": palette,
    }


def find_next_thumbnail_version(versions_dir, safe_title):
    """Find the next version number for thumbnail output."""
    existing = list(versions_dir.glob(f"{safe_title}-thumbnail-v*.png"))
    if not existing:
        return 1
    max_v = 0
    for f in existing:
        try:
            v = int(f.stem.split("-v")[-1])
            if v > max_v:
                max_v = v
        except ValueError:
            pass
    return max_v + 1


def main():
    if len(sys.argv) != 2:
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

    # Render the THUMBNAIL COMPOSITION directly (not index.html).
    # This avoids rendering the full 131s video just to grab frame 0.
    render_cmd = (
        f"npx --yes hyperframes@{hf_version} render"
        f" --composition \"{thumbnail_composition.relative_to(hyperframes_dir)}\""
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
    extract_cmd = f"ffmpeg -i \"{tmp_mp4}\" -frames:v 1 -update 1 \"{output_file}\""
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"$ {extract_cmd}\n")

    extract_result = pl.run_cmd(extract_cmd, check=False, logpath=log_file)
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
        rf'{safe_title}-thumbnail-v(\d+)\.png', keep_v)
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