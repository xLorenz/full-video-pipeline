#!/bin/bash
# check_system.sh
#
# Pre-flight system resource check for video pipeline.
# Verifies that the system has enough RAM, disk, and required tools.
#
# Usage:
#     ./check_system.sh [--config <path_to_config>]
#
# Exit codes:
#     0    All checks passed
#     1    One or more critical checks failed

set -euo pipefail

CONFIG_FILE=""
MIN_RAM_MB=200
MIN_DISK_MB=500

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Find config file
if [ -z "$CONFIG_FILE" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    CONFIG_FILE="$SCRIPT_DIR/../pipeline_config.json"
fi

if [ -f "$CONFIG_FILE" ]; then
    MIN_RAM_MB=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('system',{}).get('min_available_ram_mb',200))" 2>/dev/null || echo "$MIN_RAM_MB")
    MIN_DISK_MB=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('system',{}).get('min_available_disk_mb',500))" 2>/dev/null || echo "$MIN_DISK_MB")
fi

ERRORS=0

echo "=== System Check ==="
echo ""

# 1. Check RAM
echo "--- Memory ---"
if command -v free &> /dev/null; then
    free -m
    AVAILABLE_RAM=$(free -m | awk '/^Mem:/{print $7}')
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    SWAP_TOTAL=$(free -m | awk '/^Swap:/{print $2}')
    echo ""
    echo "Available RAM: ${AVAILABLE_RAM}MB / ${TOTAL_RAM}MB"
    echo "Swap: ${SWAP_TOTAL}MB"

    if [ "$AVAILABLE_RAM" -lt "$MIN_RAM_MB" ]; then
        echo "FAIL: Available RAM too low (${AVAILABLE_RAM}MB < ${MIN_RAM_MB}MB)"
        ERRORS=$((ERRORS + 1))
    else
        echo "OK: RAM sufficient"
    fi

    if [ "$SWAP_TOTAL" -lt 1024 ]; then
        echo "WARN: Swap is low (${SWAP_TOTAL}MB). Consider adding 2GB swap."
    fi
else
    echo "WARN: 'free' command not available, skipping RAM check"
fi

echo ""

# 2. Check disk
echo "--- Disk ---"
df -h . 2>/dev/null || true
DISK_AVAIL=$(df -m . | awk 'NR==2{print $4}')
echo ""
echo "Available disk: ${DISK_AVAIL}MB"

if [ "$DISK_AVAIL" -lt "$MIN_DISK_MB" ]; then
    echo "FAIL: Disk space too low (${DISK_AVAIL}MB < ${MIN_DISK_MB}MB)"
    ERRORS=$((ERRORS + 1))
else
    echo "OK: Disk sufficient"
fi

echo ""

# 3. Check required tools
echo "--- Required Tools ---"

check_tool() {
    local tool="$1"
    local required="$2"
    if command -v "$tool" &> /dev/null; then
        VERSION=$("$tool" --version 2>&1 | head -1 || echo "unknown")
        echo "OK: $tool ($VERSION)"
        return 0
    else
        if [ "$required" = "required" ]; then
            echo "FAIL: $tool not found (required)"
            ERRORS=$((ERRORS + 1))
        else
            echo "WARN: $tool not found (optional)"
        fi
        return 1
    fi
}

check_tool "node" "required"
check_tool "npm" "required"
check_tool "python3" "required"
check_tool "ffmpeg" "required"
check_tool "ffprobe" "required"
check_tool "git" "optional"

echo ""

# 4. Check edge-tts
echo "--- Python Packages ---"
if python3 -c "import edge_tts" 2>/dev/null; then
    echo "OK: edge-tts installed"
else
    echo "FAIL: edge-tts not installed (run: pip install edge-tts)"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 5. Check Chrome/Chromium (needed by Remotion)
echo "--- Browser ---"
if command -v chromium-browser &> /dev/null || command -v chromium &> /dev/null || command -v google-chrome &> /dev/null; then
    echo "OK: Chrome/Chromium found"
elif npx remotion browser ensure 2>/dev/null; then
    echo "OK: Remotion browser available"
else
    echo "WARN: No browser found. Remotion will download one on first render."
fi

echo ""

# Summary
echo "=== Summary ==="
if [ $ERRORS -gt 0 ]; then
    echo "FAILED: $ERRORS critical issue(s) found"
    exit 1
else
    echo "PASSED: System ready for video pipeline"
    exit 0
fi
