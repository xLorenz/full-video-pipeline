#!/bin/bash
# stitch_scene.sh
#
# Stitches a rendered scene video with its voiceover audio file.
# Uses -c:v copy to avoid re-encoding the video (fast, low memory).
#
# Usage:
#     ./stitch_scene.sh <video_dir> <scene_id>
#
# Arguments:
#     video_dir    Path to the video project directory
#     scene_id     Scene number to stitch (e.g., 1, 2, 3)

set -euo pipefail

VIDEO_DIR="${1:?Usage: ./stitch_scene.sh <video_dir> <scene_id>}"
SCENE_ID="${2:?Usage: ./stitch_scene.sh <video_dir> <scene_id>}"
SCENE_ID_PADDED=$(printf "%02d" "$SCENE_ID")

VIDEO_DIR=$(cd "$VIDEO_DIR" && pwd)

SCENE_VIDEO="$VIDEO_DIR/scenes/scene-${SCENE_ID_PADDED}.mp4"
VOICEOVER_AUDIO="$VIDEO_DIR/voiceover/scene-${SCENE_ID_PADDED}.mp3"
OUTPUT_FILE="$VIDEO_DIR/scenes/scene-${SCENE_ID_PADDED}-stitched.mp4"
SCENES_JSON="$VIDEO_DIR/scenes.json"

echo "=== Stitching Scene $SCENE_ID ==="

# Validate inputs
if [ ! -f "$SCENE_VIDEO" ]; then
    echo "ERROR: Scene video not found at $SCENE_VIDEO"
    exit 1
fi

if [ ! -f "$VOICEOVER_AUDIO" ]; then
    echo "ERROR: Voiceover audio not found at $VOICEOVER_AUDIO"
    exit 1
fi

# Stitch: copy video stream, encode audio to AAC
# -shortest ensures output ends when the shorter stream ends
ffmpeg -y \
    -i "$SCENE_VIDEO" \
    -i "$VOICEOVER_AUDIO" \
    -c:v copy \
    -c:a aac \
    -b:a 128k \
    -shortest \
    "$OUTPUT_FILE" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "ERROR: ffmpeg stitching failed for scene $SCENE_ID"
    exit 1
fi

# Update scenes.json
python3 -c "
import json
scenes_path = '$SCENES_JSON'
with open(scenes_path, 'r') as f:
    data = json.load(f)
for s in data.get('scenes', []):
    if s['id'] == $SCENE_ID:
        s['render_status'] = 'stitched'
        s['stitched_file'] = 'scenes/scene-${SCENE_ID_PADDED}-stitched.mp4'
        break
with open(scenes_path, 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true

FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "Scene $SCENE_ID stitched: $OUTPUT_FILE ($FILE_SIZE)"
