"""Smoke test orchestrator: runs the pocket-tts wrapper AS A CHILD
PROCESS and samples the child's resident memory + system VM every 500ms
from the PARENT (this script). Sampling from the parent is robust to
shell sandboxing that kills independent background processes — we own
the child via subprocess and poll its status synchronously.

This is a smoke-test harness, not production code. It writes:
  - The wrapper's stdout/stderr (live, passthrough)
  - samples-{ts}.tsv  : per-sample RAM/RSS table
  - prints a peak summary at the end

The wrapper itself is unchanged: this script just wraps it with a
measurement loop.
"""
import os
import sys
import time
import csv
import threading
import subprocess
from pathlib import Path

import psutil

REPO = Path(__file__).resolve().parent.parent
VIDEO_DIR = REPO / "videos" / "smoke-pocket-test"
LOG_DIR = VIDEO_DIR / "logs"
SAMPLES_TSV = LOG_DIR / "samples.tsv"

INTERVAL_S = 0.5


def sample_once(child: psutil.Process):
    """One snapshot of system RAM + child RSS."""
    try:
        vm = psutil.virtual_memory()
    except Exception:
        return None
    row = {
        "ts_rel_s": f"{time.time():.3f}",
        "vm_available_mb": f"{vm.available / (1024**2):.1f}",
        "vm_used_pct": f"{vm.percent:.1f}",
        "vm_total_mb": f"{vm.total / (1024**2):.1f}",
    }
    try:
        rss = child.memory_info().rss / (1024 ** 2)
        row["child_rss_mb"] = f"{rss:.1f}"
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        row["child_rss_mb"] = "-1"
    # Disk free on the video's drive
    try:
        row["disk_free_gb"] = f"{psutil.disk_usage(str(VIDEO_DIR)).free / (1024**3):.2f}"
    except Exception:
        row["disk_free_gb"] = "-1"
    return row


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if SAMPLES_TSV.exists():
        SAMPLES_TSV.unlink()

    print(f"=== Smoke test starting at {time.strftime('%H:%M:%S')} ===")
    print(f"Video dir: {VIDEO_DIR}")

    wrapper_cmd = [
        sys.executable, "-u", str(REPO / "scripts" / "generate_voiceover_pocket.py"),
        str(VIDEO_DIR), "--voice", "alba",
    ]
    print(f"Wrapper command: {' '.join(wrapper_cmd)}")
    print("--- wrapper stdout ---")

    START = time.time()
    proc = subprocess.Popen(wrapper_cmd, stdout=None, stderr=None, text=True)
    child = psutil.Process(proc.pid)

    # Open samples TSV and poll until child exits
    fieldnames = ["ts_rel_s", "vm_available_mb", "vm_used_pct",
                  "vm_total_mb", "child_rss_mb", "disk_free_gb"]
    samples = []
    with open(SAMPLES_TSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        while proc.poll() is None:
            row = sample_once(child)
            if row is not None:
                samples.append(row)
                writer.writerow(row)
                f.flush()
            time.sleep(INTERVAL_S)

    rc = proc.wait()
    elapsed = time.time() - START
    print(f"--- wrapper exit code: {rc} ---")
    print(f"\n=== Smoke test complete in {elapsed:.1f}s ===")

    # Enumerate output
    vo_dir = VIDEO_DIR / "voiceover"
    print("\n=== voiceover/ directory ===")
    if vo_dir.exists():
        for f in sorted(vo_dir.iterdir()):
            sz = f.stat().st_size
            print(f"  {f.name}: {sz:,} bytes  (mtime {time.ctime(f.stat().st_mtime)})")
    else:
        print(f"  MISSING: {vo_dir}")

    # Show scenes.json voiceover fields
    scenes_path = VIDEO_DIR / "scenes.json"
    if scenes_path.exists():
        import json
        with open(scenes_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print("\n=== scenes.json voiceover fields ===")
        for s in data.get("scenes", []):
            print(f"  Scene {s['id']}: file={s.get('voiceover_file')} "
                  f"hash={s.get('voiceover_hash','')[:8]}.. "
                  f"dur={s.get('actual_duration_seconds')}s")

    # Read samples TSV and report peaks
    print("\n=== monitor peaks ===")
    if SAMPLES_TSV.exists() and SAMPLES_TSV.stat().st_size > 0:
        with open(SAMPLES_TSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            rows = list(reader)
        if rows:
            keys = ["vm_available_mb", "vm_used_pct", "vm_total_mb",
                    "child_rss_mb", "disk_free_gb"]
            for k in keys:
                vals = [float(r[k]) for r in rows if r.get(k) and r[k] != "-1"]
                if not vals:
                    continue
                if k in ("vm_available_mb", "disk_free_gb", "child_rss_mb"):
                    mn = min(vals); mx = max(vals)
                    print(f"  {k}: min={mn:.1f}  max={mx:.1f}")
                elif k == "vm_total_mb":
                    print(f"  {k}: {vals[0]:.1f} (constant)")
                else:
                    print(f"  {k}: max={max(vals):.1f}")
            print(f"  samples: {len(rows)} (interval {INTERVAL_S}s)")
            # total elapsed wall clock & per-scene approx
            if len(rows) > 1:
                t0 = float(rows[0]["ts_rel_s"])
                t1 = float(rows[-1]["ts_rel_s"])
                print(f"  wall: {t1 - t0:.1f}s")
        else:
            print("  samples TSV empty")
    else:
        print(f"  samples TSV missing: {SAMPLES_TSV}")

if __name__ == "__main__":
    main()
