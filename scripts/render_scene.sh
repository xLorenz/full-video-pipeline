#!/bin/bash
# render_scene.sh
#
# Renders a single Remotion scene with hardware guardrails for low-memory systems.
#
# Usage:
#     ./render_scene.sh <video_dir> <scene_id>
#
# Arguments:
#     video_dir    Path to the video project directory
#     scene_id     Scene number to render (e.g., 1, 2, 3)

set -euo pipefail

VIDEO_DIR="${1:?Usage: ./render_scene.sh <video_dir> <scene_id>}"
SCENE_ID="${2:?Usage: ./render_scene.sh <video_dir> <scene_id>}"
SCENE_ID_PADDED=$(printf "%02d" "$SCENE_ID")

# Resolve to absolute path
VIDEO_DIR=$(cd "$VIDEO_DIR" && pwd)

# Load config
CONFIG_FILE="$(dirname "$VIDEO_DIR")/../pipeline_config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    CONFIG_FILE="$(dirname "$(dirname "$VIDEO_DIR")")/pipeline_config.json"
fi

# Defaults (override from config if available)
CONCURRENCY=1
GL_BACKEND="swangle"
IMAGE_FORMAT="jpeg"
JPEG_QUALITY=80
CODEC="h264"
X264_PRESET="ultrafast"
CRF=28
TIMEOUT_MS=60000
NODE_MAX_OLD_SPACE=384
MIN_RAM_MB=200
POST_SETTLE_SECONDS=5

# Try to read config values
if [ -f "$CONFIG_FILE" ]; then
    CONCURRENCY=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('concurrency',1))" 2>/dev/null || echo "$CONCURRENCY")
    GL_BACKEND=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('gl_backend','swangle'))" 2>/dev/null || echo "$GL_BACKEND")
    IMAGE_FORMAT=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('image_format','jpeg'))" 2>/dev/null || echo "$IMAGE_FORMAT")
    JPEG_QUALITY=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('jpeg_quality',80))" 2>/dev/null || echo "$JPEG_QUALITY")
    CODEC=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('codec','h264'))" 2>/dev/null || echo "$CODEC")
    X264_PRESET=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('x264_preset','ultrafast'))" 2>/dev/null || echo "$X264_PRESET")
    CRF=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('crf',28))" 2>/dev/null || echo "$CRF")
    TIMEOUT_MS=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('timeout_ms',60000))" 2>/dev/null || echo "$TIMEOUT_MS")
    NODE_MAX_OLD_SPACE=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('render',{}).get('node_max_old_space_size_mb',384))" 2>/dev/null || echo "$NODE_MAX_OLD_SPACE")
    MIN_RAM_MB=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('system',{}).get('min_available_ram_mb',200))" 2>/dev/null || echo "$MIN_RAM_MB")
    POST_SETTLE_SECONDS=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('system',{}).get('post_render_settle_seconds',5))" 2>/dev/null || echo "$POST_SETTLE_SECONDS")
fi

REMOTION_DIR="$VIDEO_DIR/remotion"
SCENE_COMPONENT="Scene${SCENE_ID_PADDED}"
OUTPUT_FILE="$VIDEO_DIR/scenes/scene-${SCENE_ID_PADDED}.mp4"
SCENES_JSON="$VIDEO_DIR/scenes.json"

echo "=== Rendering Scene $SCENE_ID ==="
echo "Video dir: $VIDEO_DIR"
echo "Component: $SCENE_COMPONENT"
echo "Output: $OUTPUT_FILE"

# Pre-flight: Check system resources
echo ""
echo "--- Pre-flight check ---"

# Check available RAM
if command -v free &> /dev/null; then
    AVAILABLE_RAM=$(free -m | awk '/^Mem:/{print $7}')
    echo "Available RAM: ${AVAILABLE_RAM}MB"
    if [ "$AVAILABLE_RAM" -lt "$MIN_RAM_MB" ]; then
        echo "WARNING: Low RAM (${AVAILABLE_RAM}MB < ${MIN_RAM_MB}MB). Waiting 30s..."
        sleep 30
        AVAILABLE_RAM=$(free -m | awk '/^Mem:/{print $7}')
        if [ "$AVAILABLE_RAM" -lt "$MIN_RAM_MB" ]; then
            echo "ERROR: Still low RAM after waiting. Aborting scene $SCENE_ID."
            exit 1
        fi
    fi
fi

# Check disk space
DISK_AVAIL=$(df -m "$VIDEO_DIR" | awk 'NR==2{print $4}')
echo "Available disk: ${DISK_AVAIL}MB"
if [ "$DISK_AVAIL" -lt 500 ]; then
    echo "ERROR: Low disk space (${DISK_AVAIL}MB < 500MB). Aborting."
    exit 1
fi

# Ensure output directory exists
mkdir -p "$VIDEO_DIR/scenes"

# Kill only orphaned Remotion headless processes (cleanup from crashed/completed renders)
# Skips Chrome processes whose parent node/remotion is still alive
echo ""
echo "--- Cleaning up orphaned Chrome processes ---"
ORPHAN_KILLED=0
for PID in $(pgrep -f "chrome-headless-shell" 2>/dev/null); do
    PPID_OF_CHROME=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
    if [ -n "$PPID_OF_CHROME" ]; then
        PARENT_COMM=$(ps -o comm= -p "$PPID_OF_CHROME" 2>/dev/null || true)
        if ! echo "$PARENT_COMM" | grep -q "node"; then
            kill "$PID" 2>/dev/null && echo "  Killed orphaned chrome-headless-shell (PID $PID, parent=$PPID_OF_CHROME '$PARENT_COMM')" && ORPHAN_KILLED=$((ORPHAN_KILLED + 1))
        fi
    else
        kill "$PID" 2>/dev/null && echo "  Killed orphaned chrome-headless-shell (PID $PID, no parent)" && ORPHAN_KILLED=$((ORPHAN_KILLED + 1))
    fi
done
if [ "$ORPHAN_KILLED" -eq 0 ]; then
    echo "  No orphaned processes found."
fi
sleep 2

# Set Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE}"

# Render the scene
echo ""
echo "--- Starting Remotion render ---"
echo "Flags: concurrency=$CONCURRENCY gl=$GL_BACKEND codec=$CODEC crf=$CRF preset=$X264_PRESET"

cd "$REMOTION_DIR"

START_TIME=$(date +%s)

npx remotion render "src/Root.tsx" "$SCENE_COMPONENT" "$OUTPUT_FILE" \
    --concurrency "$CONCURRENCY" \
    --gl="$GL_BACKEND" \
    --image-format "$IMAGE_FORMAT" \
    --jpeg-quality "$JPEG_QUALITY" \
    --codec "$CODEC" \
    --x264-preset "$X264_PRESET" \
    --crf "$CRF" \
    --disallow-parallel-encoding \
    --timeout "$TIMEOUT_MS" \
    --overwrite \
    --log=warn

RENDER_EXIT=$?

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

if [ $RENDER_EXIT -ne 0 ]; then
    echo ""
    echo "ERROR: Remotion render failed with exit code $RENDER_EXIT"
    # Update scenes.json with failed status
    python3 -c "
import json, sys
scenes_path = '$SCENES_JSON'
with open(scenes_path, 'r') as f:
    data = json.load(f)
for s in data.get('scenes', []):
    if s['id'] == $SCENE_ID:
        s['render_status'] = 'failed'
        break
with open(scenes_path, 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
    exit $RENDER_EXIT
fi

# Update scenes.json with rendered status
python3 -c "
import json
scenes_path = '$SCENES_JSON'
with open(scenes_path, 'r') as f:
    data = json.load(f)
for s in data.get('scenes', []):
    if s['id'] == $SCENE_ID:
        s['render_status'] = 'rendered'
        s['scene_file'] = 'scenes/scene-${SCENE_ID_PADDED}.mp4'
        break
with open(scenes_path, 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true

# Post-render: kill any leftover Remotion Chrome (render is done, so safe to kill all)
echo ""
echo "--- Post-render cleanup ---"
pkill -f "chrome-headless-shell" 2>/dev/null || true
sleep 1
ORPHANED=$(pgrep -c -f "chrome-headless-shell" 2>/dev/null || echo "0")
if [ "$ORPHANED" -gt 0 ]; then
    echo "WARNING: $ORPHANED orphaned chrome-headless-shell process(es) still running."
else
    echo "Chrome cleanup verified — no orphaned processes."
fi
echo "Waiting ${POST_SETTLE_SECONDS}s for system to settle..."
sleep "$POST_SETTLE_SECONDS"

# Report
echo ""
echo "=== Scene $SCENE_ID rendered in ${ELAPSED}s ==="
echo "Output: $OUTPUT_FILE"

if [ -f "$OUTPUT_FILE" ]; then
    FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "File size: $FILE_SIZE"
else
    echo "WARNING: Output file not found!"
fi
