#!/bin/bash
# stitch_final.sh
#
# Concatenates all stitched scene files into the final video output.
#
# Usage:
#     ./stitch_final.sh <video_dir> [version_label]
#
# Arguments:
#     video_dir       Path to the video project directory
#     version_label   Optional version label (default: v1)

set -euo pipefail

VIDEO_DIR="${1:?Usage: ./stitch_final.sh <video_dir> [version_label]}"
VERSION_LABEL="${2:-v1}"

VIDEO_DIR=$(cd "$VIDEO_DIR" && pwd)
SCENES_JSON="$VIDEO_DIR/scenes.json"
VERSIONS_DIR="$VIDEO_DIR/versions"

# Get video title from scenes.json
VIDEO_TITLE=$(python3 -c "
import json
with open('$SCENES_JSON', 'r') as f:
    data = json.load(f)
print(data.get('video_title', 'video'))
" 2>/dev/null || echo "video")

# Sanitize title for filename
SAFE_TITLE=$(echo "$VIDEO_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')

OUTPUT_FILE="$VERSIONS_DIR/${SAFE_TITLE}-${VERSION_LABEL}.mp4"
CONCAT_FILE="$VIDEO_DIR/.concat_list.txt"

echo "=== Final Stitch ==="
echo "Title: $VIDEO_TITLE"
echo "Output: $OUTPUT_FILE"

# Create versions directory
mkdir -p "$VERSIONS_DIR"

# Find all stitched scene files in order
STITCHED_FILES=()
while IFS= read -r line; do
    scene_id=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['id'])" 2>/dev/null)
    if [ -n "$scene_id" ]; then
        padded=$(printf "%02d" "$scene_id")
        f="$VIDEO_DIR/scenes/scene-${padded}-stitched.mp4"
        if [ -f "$f" ]; then
            STITCHED_FILES+=("$f")
        else
            # Fall back to non-stitched scene
            f="$VIDEO_DIR/scenes/scene-${padded}.mp4"
            if [ -f "$f" ]; then
                STITCHED_FILES+=("$f")
            fi
        fi
    fi
done < <(python3 -c "
import json
with open('$SCENES_JSON', 'r') as f:
    data = json.load(f)
for s in data.get('scenes', []):
    print(json.dumps({'id': s['id']}))
" 2>/dev/null)

if [ ${#STITCHED_FILES[@]} -eq 0 ]; then
    echo "ERROR: No stitched scene files found"
    exit 1
fi

echo "Found ${#STITCHED_FILES[@]} scenes to concatenate"

# Create concat list
> "$CONCAT_FILE"
for f in "${STITCHED_FILES[@]}"; do
    echo "file '$f'" >> "$CONCAT_FILE"
done

echo "Concat list:"
cat "$CONCAT_FILE"

# Load stitch config
FINAL_CODEC="libx264"
FINAL_AUDIO="aac"
FINAL_CRF=23

CONFIG_FILE="$(dirname "$VIDEO_DIR")/../pipeline_config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    CONFIG_FILE="$(dirname "$(dirname "$VIDEO_DIR")")/pipeline_config.json"
fi

if [ -f "$CONFIG_FILE" ]; then
    FINAL_CRF=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('stitching',{}).get('final_crf',23))" 2>/dev/null || echo "$FINAL_CRF")
fi

# Concatenate with final encoding
echo ""
echo "--- Encoding final video ---"
ffmpeg -y \
    -f concat \
    -safe 0 \
    -i "$CONCAT_FILE" \
    -c:v "$FINAL_CODEC" \
    -crf "$FINAL_CRF" \
    -preset medium \
    -c:a "$FINAL_AUDIO" \
    -strict -2 \
    -b:a 192k \
    -movflags +faststart \
    "$OUTPUT_FILE" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "ERROR: Final ffmpeg concatenation failed"
    rm -f "$CONCAT_FILE"
    exit 1
fi

# Cleanup concat list
rm -f "$CONCAT_FILE"

# Report
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
DURATION=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_FILE" 2>/dev/null || echo "unknown")

echo ""
echo "=== Final video created ==="
echo "Output: $OUTPUT_FILE"
echo "Size: $FILE_SIZE"
echo "Duration: ${DURATION}s"
