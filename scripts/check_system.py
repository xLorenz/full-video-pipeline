#!/usr/bin/env python3
"""
check_system.py — Cross-platform pre-flight system resource check.

Replaces check_system.sh (kept as a thin shim) so the same checks work on
Linux, macOS, and Windows without bash. Uses psutil for RAM/disk metrics.

Usage:
    python scripts/check_system.py [--config <path>]

Exit codes:
    0  All checks passed
    1  One or more critical checks failed
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

try:
    sys.stdout.reconfigure(errors="replace")
    sys.stderr.reconfigure(errors="replace")
except (AttributeError, ValueError, OSError):
    pass

# Optional deps — degrade gracefully when missing.
try:
    import psutil
except ImportError:
    psutil = None


def _load_thresholds(config_path: Path | None):
    min_ram = 200
    min_disk = 500
    cfg_path = config_path or (REPO_ROOT / "pipeline_config.json")
    if cfg_path.is_file():
        try:
            data = json.loads(cfg_path.read_bytes().decode("utf-8"))
            min_ram = int(data.get("system", {}).get("min_available_ram_mb", min_ram))
            min_disk = int(data.get("system", {}).get("min_available_disk_mb", min_disk))
        except Exception:
            pass
    return min_ram, min_disk


def _run_version(cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        line = (r.stdout or r.stderr or "").strip().splitlines()
        return line[0].strip() if line else "unknown"
    except Exception:
        return "unknown"


def _check_tool(name: str, required: bool, errors: list):
    # On Windows the canonical binary is `python`/`npm` (plus .cmd shims);
    # `python3` is a Microsoft Store stub that fails when real Python is
    # installed from python.org — treat it as an alias for `python` there.
    probe_name = name
    if sys.platform == "win32" and name == "python3":
        probe_name = "python"
    path = shutil.which(probe_name) or shutil.which(name)
    if path:
        ver = _run_version([path, "--version"])
        # Stub `python3` on Windows prints a Store error and exits non-zero;
        # treat that as "not found" rather than OK.
        looks_broken = ("Microsoft Store" in ver or "no se encontr" in ver.lower())
        if looks_broken:
            path = None
        else:
            print(f"OK: {name} ({ver})")
            return True
    # Fallback alias check (already handled above for python3->python, but keep
    # for any other alias that might appear)
    if name == "python3" and sys.platform == "win32":
        alt = shutil.which("python")
        if alt and alt != path:
            ver = _run_version([alt, "--version"])
            if "Microsoft Store" not in ver and "no se encontr" not in ver.lower():
                print(f"OK: python ({ver}) via 'python' shim")
                return True
    if required:
        print(f"FAIL: {name} not found (required)")
        errors.append(name)
    else:
        print(f"WARN: {name} not found (optional)")
    return False


def _check_long_paths():
    if sys.platform != "win32":
        return
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\FileSystem",
        ) as k:
            val, _ = winreg.QueryValueEx(k, "LongPathsEnabled")
            if val == 1:
                print("OK: Windows long paths enabled (LongPathsEnabled=1)")
            else:
                print("WARN: Windows long paths are DISABLED (LongPathsEnabled=0).")
                print("      Deep node_modules trees may hit MAX_PATH (260 chars).")
                print("      Fix (admin PowerShell):")
                print("        Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name LongPathsEnabled -Value 1")
                print("      Also run: git config --system core.longpaths true")
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"WARN: could not read LongPathsEnabled: {e}")


def main():
    ap = argparse.ArgumentParser(description="Pre-flight system check")
    ap.add_argument("--config", dest="config", help="path to pipeline_config.json")
    args = ap.parse_args()

    cfg_path = Path(args.config).resolve() if args.config else None
    min_ram, min_disk = _load_thresholds(cfg_path)

    errors: list[str] = []

    print("=== System Check ===")
    print()

    # 1. Memory
    print("--- Memory ---")
    if psutil:
        vm = psutil.virtual_memory()
        avail = int(vm.available / (1024 * 1024))
        total = int(vm.total / (1024 * 1024))
        try:
            swap_total = int(psutil.swap_memory().total / (1024 * 1024))
        except Exception:
            swap_total = 0
        print(f"Available RAM: {avail} MB / {total} MB")
        print(f"Swap: {swap_total} MB")
        print()
        if avail < min_ram:
            print(f"FAIL: Available RAM too low ({avail} MB < {min_ram} MB)")
            errors.append("ram")
        else:
            print("OK: RAM sufficient")
        if swap_total < 1024:
            print(f"WARN: Swap is low ({swap_total} MB). Consider adding 2 GB swap/pagefile.")
    else:
        print("WARN: psutil not installed — skipping RAM check (pip install psutil)")
    print()

    # 2. Disk
    print("--- Disk ---")
    try:
        # psutil handles Windows drives correctly; fall back to shutil
        if psutil:
            du = psutil.disk_usage(str(REPO_ROOT))
            avail_disk = int(du.free / (1024 * 1024))
        else:
            import shutil as _sh

            total_b, used_b, free_b = _sh.disk_usage(REPO_ROOT)
            avail_disk = int(free_b / (1024 * 1024))
        print(f"Available disk: {avail_disk} MB")
        print()
        if avail_disk < min_disk:
            print(f"FAIL: Disk space too low ({avail_disk} MB < {min_disk} MB)")
            errors.append("disk")
        else:
            print("OK: Disk sufficient")
    except Exception as e:
        print(f"WARN: could not measure disk: {e}")
    print()

    # 3. Required tools
    print("--- Required Tools ---")
    _check_tool("node", True, errors)
    _check_tool("npm", True, errors)
    _check_tool("python3", True, errors)
    # ffmpeg/ffprobe appear as ffmpeg.exe / ffprobe.exe on Windows via which
    _check_tool("ffmpeg", True, errors)
    _check_tool("ffprobe", True, errors)
    _check_tool("git", False, errors)
    print()

    # 4. Python packages
    print("--- Python Packages ---")
    for pkg, hint in [
        ("edge_tts", "pip install edge-tts"),
        ("psutil", "pip install psutil"),
        ("jsonschema", "pip install jsonschema"),
    ]:
        try:
            __import__(pkg)
            print(f"OK: {pkg} installed")
        except ImportError:
            # edge_tts is required; others degrade
            if pkg == "edge_tts":
                print(f"FAIL: {pkg} not installed (run: {hint})")
                errors.append(pkg)
            else:
                print(f"WARN: {pkg} not installed (run: {hint})")
    print()

    # 5. Browser (Remotion)
    print("--- Browser ---")
    # Look for any known chrome binary via which, then try remotion helper.
    has_browser = any(
        shutil.which(b)
        for b in ("chromium-browser", "chromium", "google-chrome", "chrome")
    )
    if has_browser:
        print("OK: Chrome/Chromium found on PATH")
    else:
        # Try remotion browser helper — lightweight check without downloading.
        try:
            r = subprocess.run(
                ["npx", "remotion", "browser", "ensure", "--help"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            # The command itself existing means remotion is installed; actual
            # browser download happens on first render if missing.
            print("OK: Remotion browser helper available (npx remotion browser ensure)")
            print("    (browser will be downloaded on first render if not present)")
        except Exception:
            print("WARN: No browser found. Remotion will download one on first render.")
            print("      Ensure Node + npm are installed and network is reachable.")
    print()

    # 6. Windows long paths
    _check_long_paths()
    if sys.platform == "win32":
        print()

    # Summary
    print("=== Summary ===")
    if errors:
        print(f"FAILED: {len(errors)} critical issue(s) found: {', '.join(errors)}")
        sys.exit(1)
    print("PASSED: System ready for video pipeline")
    sys.exit(0)


if __name__ == "__main__":
    main()
