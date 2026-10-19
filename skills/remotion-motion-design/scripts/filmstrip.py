#!/usr/bin/env python3
"""
filmstrip.py: let Claude SEE a Remotion composition's timing.

A motion designer never judges animation from code; they scrub the timeline. This tool is
that scrub. It renders chosen frames into ONE labelled contact sheet you can open with an
image viewer, and (with --energy) appends a motion-energy graph: how much the picture
changes from moment to moment. That graph is a numeric pacing map:
  - flat valleys in the MIDDLE of a piece  = dead air (nothing is happening)
  - a valley at the END                    = a hold (good, if it follows a landing)
  - towering spikes                        = everything moving at once (too busy)

USAGE (run from anywhere; PROJECT is the Remotion project root):
  python filmstrip.py PROJECT CompositionId                     # 12 evenly spaced frames
  python filmstrip.py PROJECT CompositionId --count 16 --cols 4
  python filmstrip.py PROJECT CompositionId --frames 0,12,24,36,60,90
  python filmstrip.py PROJECT CompositionId --energy            # + pacing graph
  python filmstrip.py PROJECT CompositionId --range 90:150 --count 12   # zoom into one beat
  python filmstrip.py PROJECT CompositionId --props '{"palette":"ember"}'

Needs Pillow. Sandbox without Remotion's browser download? The tool falls back to a local
chrome-headless-shell automatically (or pass --browser-executable).
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat
except ImportError:
    sys.exit("Pillow is required: pip install pillow --break-system-packages")


# --------------------------------------------------------------------------- helpers
def find_fallback_browser():
    env = os.environ.get("REMOTION_BROWSER_EXECUTABLE")
    if env and os.path.exists(env):
        return env
    which = shutil.which("chrome-headless-shell")
    if which:
        return which
    patterns = [
        "/opt/pw-browsers/chromium_headless_shell-*/chrome-linux*/headless_shell",
        os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux*/headless_shell"),
    ]
    for pat in patterns:
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[-1]
    return None


_ACTIVE_BROWSER = None  # remembered once the fallback browser proved necessary


def run_remotion(project, args, browser=None):
    """Run `npx remotion ...` in the project; retry with a local browser if Remotion can't fetch its own."""
    global _ACTIVE_BROWSER
    browser = browser or _ACTIVE_BROWSER
    base = ["npx", "remotion"] + args
    cmd = base + (["--browser-executable", browser] if browser else [])
    proc = subprocess.run(cmd, cwd=project, capture_output=True, text=True)
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode == 0:
        return out
    fallback = None if browser else find_fallback_browser()
    if fallback and re.search(r"allowlist|browser|chrom", out, re.I):
        print(f"[filmstrip] Remotion's browser unavailable; using {fallback}", file=sys.stderr)
        cmd = base + ["--browser-executable", fallback]
        proc = subprocess.run(cmd, cwd=project, capture_output=True, text=True)
        out = (proc.stdout or "") + (proc.stderr or "")
        if proc.returncode == 0:
            _ACTIVE_BROWSER = fallback
            return out
    sys.exit(f"remotion failed:\n{' '.join(cmd)}\n\n{out[-2500:]}")


def composition_info(project, entry, comp, browser):
    out = run_remotion(project, ["compositions", entry], browser)
    for line in out.splitlines():
        m = re.match(r"^(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+)x(\d+)\s+(\d+)\s+\(", line.strip())
        if m and m.group(1) == comp:
            return {"fps": float(m.group(2)), "w": int(m.group(3)), "h": int(m.group(4)), "frames": int(m.group(5))}
    sys.exit(f"Composition '{comp}' not found. Output was:\n{out[-1200:]}")


def pick_frames(args, total):
    lo, hi = 0, total - 1
    if args.range:
        a, b = args.range.split(":")
        lo, hi = max(0, int(a)), min(total - 1, int(b))
    if args.frames:
        return sorted({min(max(0, int(x)), total - 1) for x in args.frames.split(",") if x.strip()})
    n = max(2, args.count)
    return sorted({round(lo + (hi - lo) * i / (n - 1)) for i in range(n)})


def render_frames(project, entry, comp, frames, scale, props, browser, outdir):
    os.makedirs(outdir, exist_ok=True)
    cmd = [entry, comp, outdir, f"--frames={','.join(map(str, frames))}", "--image-format=png", f"--scale={scale}"]
    if props:
        cmd.append(f"--props={props}")
    # NOTE: invoked as `remotion render <entry> <comp> <outdir>`
    run_remotion(project, ["render"] + cmd, browser)
    found = {}
    for path in glob.glob(os.path.join(outdir, "element-*.png")):
        m = re.search(r"element-(\d+)\.png$", path)
        if m:
            found[int(m.group(1))] = path
    return found


def load_font(size):
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# --------------------------------------------------------------------------- sheet
def build_sheet(images, frames, fps, cols, title):
    tile_w, tile_h = images[frames[0]].size
    pad, label_h, head_h = 10, 26, 34
    rows = (len(frames) + cols - 1) // cols
    W = cols * tile_w + (cols + 1) * pad
    H = head_h + rows * (tile_h + label_h) + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (18, 18, 22))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 8), title, fill=(235, 235, 240), font=load_font(15))
    f = load_font(13)
    for i, fr in enumerate(frames):
        r, c = divmod(i, cols)
        x = pad + c * (tile_w + pad)
        y = head_h + pad + r * (tile_h + label_h + pad)
        sheet.paste(images[fr].convert("RGB"), (x, y))
        d.rectangle([x - 1, y - 1, x + tile_w, y + tile_h], outline=(60, 60, 70))
        d.text((x + 2, y + tile_h + 5), f"f{fr:<4d} {fr / fps:5.2f}s", fill=(170, 175, 190), font=f)
    return sheet


# --------------------------------------------------------------------------- energy
def motion_energy(imgs_by_frame):
    """Mean absolute difference between consecutive sampled frames (0-255 scale)."""
    keys = sorted(imgs_by_frame)
    series = []
    prev = None
    for k in keys:
        cur = imgs_by_frame[k].convert("L")
        if prev is not None:
            diff = ImageChops.difference(cur, prev)
            series.append((k, ImageStat.Stat(diff).mean[0]))
        prev = cur
    return series


def energy_panel(series, fps, width, total_frames, step):
    if not series:
        return None, []
    vals = [v for _, v in series]
    srt = sorted(vals)
    p95 = srt[int(0.95 * (len(srt) - 1))] or 1e-6
    dead_thr = 0.12 * p95
    busy_thr = 1.0 * p95
    h, pad, base = 150, 10, 150 - 28
    panel = Image.new("RGB", (width, h + 24), (18, 18, 22))
    d = ImageDraw.Draw(panel)
    f = load_font(12)
    d.text((pad, 4), "MOTION ENERGY  (bar = how much changed vs previous sample; red = near-still)", fill=(235, 235, 240), font=f)
    usable = width - 2 * pad
    bw = max(1.0, usable / max(1, total_frames / step))
    stretches, run_start = [], None
    for idx, (k, v) in enumerate(series):
        x = pad + (k / total_frames) * usable
        bar_h = min(base - 22, (v / (1.25 * p95)) * (base - 22))
        dead = v < dead_thr
        col = (220, 70, 70) if dead else ((255, 190, 70) if v > busy_thr else (110, 190, 255))
        d.rectangle([x, base - bar_h, x + bw - 1, base], fill=col)
        if dead and run_start is None:
            run_start = k - step
        if (not dead or idx == len(series) - 1) and run_start is not None:
            end = k if not dead else k
            stretches.append((run_start, end))
            run_start = None
    # seconds ruler
    secs = int(total_frames / fps)
    for s in range(0, secs + 1):
        x = pad + (s * fps / total_frames) * usable
        d.line([x, base, x, base + 5], fill=(110, 110, 120))
        if s % max(1, secs // 14 or 1) == 0:
            d.text((x - 4, base + 7), f"{s}s", fill=(150, 150, 165), font=f)
    return panel, [(a, b) for a, b in stretches if (b - a) / fps >= 0.5]


# --------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Render a contact sheet (and pacing graph) for a Remotion composition.")
    ap.add_argument("project", help="Remotion project root")
    ap.add_argument("composition", help="Composition id")
    ap.add_argument("--entry", default="src/index.ts")
    ap.add_argument("--count", type=int, default=12, help="number of evenly spaced frames (default 12)")
    ap.add_argument("--frames", help="explicit comma-separated frame numbers")
    ap.add_argument("--range", help="restrict evenly spaced frames to START:END (frames)")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--scale", type=float, default=0.3, help="render scale (default 0.3)")
    ap.add_argument("--energy", action="store_true", help="append the motion-energy pacing graph")
    ap.add_argument("--energy-per-sec", type=float, default=10.0, help="samples per second for --energy (default 10)")
    ap.add_argument("--props", help="JSON props string passed to the composition")
    ap.add_argument("--browser-executable", dest="browser")
    ap.add_argument("--out", help="output PNG (default PROJECT/out/filmstrip-<comp>.png)")
    args = ap.parse_args()

    project = os.path.abspath(args.project)
    info = composition_info(project, args.entry, args.composition, args.browser)
    fps, total = info["fps"], info["frames"]
    frames = pick_frames(args, total)
    print(f"[filmstrip] {args.composition}: {info['w']}x{info['h']} @ {fps:g}fps, {total} frames ({total / fps:.2f}s); sampling {len(frames)} frames")

    tmp = tempfile.mkdtemp(prefix="filmstrip-")
    try:
        imgs_paths = render_frames(project, args.entry, args.composition, frames, args.scale, args.props, args.browser, os.path.join(tmp, "sheet"))
        missing = [f for f in frames if f not in imgs_paths]
        if missing:
            sys.exit(f"frames missing from render output: {missing}")
        imgs = {f: Image.open(imgs_paths[f]) for f in frames}
        sheet = build_sheet(imgs, frames, fps, args.cols, f"{args.composition}  {info['w']}x{info['h']}  {fps:g}fps  {total}f / {total / fps:.2f}s")

        stretches = []
        if args.energy:
            step = max(1, round(fps / args.energy_per_sec))
            e_frames = list(range(0, total, step))
            e_scale = 0.12 if info["w"] >= 1000 else 0.2
            e_paths = render_frames(project, args.entry, args.composition, e_frames, e_scale, args.props, args.browser, os.path.join(tmp, "energy"))
            e_imgs = {f: Image.open(p) for f, p in e_paths.items()}
            series = motion_energy(e_imgs)
            panel, stretches = energy_panel(series, fps, sheet.size[0], total, step)
            if panel is not None:
                combined = Image.new("RGB", (sheet.size[0], sheet.size[1] + panel.size[1]), (18, 18, 22))
                combined.paste(sheet, (0, 0))
                combined.paste(panel, (0, sheet.size[1]))
                sheet = combined

        out = args.out or os.path.join(project, "out", f"filmstrip-{args.composition}.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sheet.save(out)
        print(f"[filmstrip] wrote {out}  ({sheet.size[0]}x{sheet.size[1]})")
        if args.energy:
            if stretches:
                print("[filmstrip] near-still stretches >= 0.5s (intentional holds are fine; mid-piece ones are dead air):")
                for a, b in stretches:
                    print(f"    frames {a}-{b}  =  {a / fps:.2f}s to {b / fps:.2f}s  ({(b - a) / fps:.2f}s)")
            else:
                print("[filmstrip] no near-still stretch >= 0.5s: the piece never rests (check there is at least one real hold).")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
