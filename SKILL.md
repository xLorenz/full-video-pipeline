---
name: full-video-pipeline
description: >
  End-to-end autonomous YouTube video production pipeline. Researches topics,
  writes retention-optimized scripts, generates voiceover audio, builds Remotion
  video compositions, renders scenes, and stitches the final video. Designed for
  resource-constrained environments (500MB RAM, no GPU).
triggers:
  - "make a video"
  - "create a youtube video"
  - "video pipeline"
  - "autonomous video"
  - "research and script"
  - "render video"
tools:
  - Read
  - Write
  - Edit
  - Bash
  - WebSearch
  - Glob
  - Grep
---

# Full Video Pipeline — Autonomous YouTube Video Production

> A 10-step pipeline that takes a topic idea and produces a fully rendered YouTube
> video with voiceover, visuals, and audio. Each step is self-contained with clear
> inputs, outputs, and validation.

## Prerequisites

Before running the pipeline, verify system readiness:

```bash
bash scripts/check_system.sh
```

If this fails, resolve the issues before proceeding. Required tools:
- `node` + `npm` (for Remotion)
- `python3` + `pip` (for edge-tts and helper scripts)
- `ffmpeg` + `ffprobe` (for audio/video processing)
- `git` (for cloning skill references)
- `edge-tts` Python package (`pip install edge-tts`)

## Configuration

Default settings are in `pipeline_config.json`. Override per-video as needed:
- `video.fps`, `video.width`, `video.height` — composition settings
- `voiceover.voice` — edge-tts voice name (list voices: `edge-tts --list-voices`)
- `render.*` — rendering guardrails (concurrency, codec, memory limits)
- `system.*` — resource thresholds

## Directory Structure

```
videos/{video-title}/
├── SCRIPT.md            # Full retention-optimized script
├── VOICEOVER.md         # Parseable voiceover text per scene
├── STYLES.md            # Visual style guide for Remotion
├── scenes.json          # Structured scene data (durations, status, files)
├── pipeline_state.json  # Pipeline progress tracker
├── voiceover_aligned.mp3  # Concatenated voiceover (created by assemble.py)
├── remotion/            # Remotion project (scaffolded per video)
│   ├── PLAN.md          # Implementation plan before coding
│   ├── src/
│   │   ├── Root.tsx     # Single <Composition id="MainVideo">
│   │   ├── components/
│   │   │   └── MainVideo.tsx  # Sequence-based scene loader
│   │   ├── lib/
│   │   │   ├── types.ts   # SceneTiming, VideoProps
│   │   │   ├── config.ts
│   │   │   └── styles.ts
│   │   └── scenes/
│   └── public/
├── voiceover/           # Generated .mp3 files
├── scenes/              # Rendered .mp4 scene files
└── versions/            # Final stitched .mp4 videos
```

## Pipeline Steps

Execute steps 1-10 in strict order. Each step must complete and validate before
moving to the next. Use `pipeline_state.json` to track progress.

---

### STEP 1: Topic Selection

**Goal**: Choose a specific, trending topic for the video.

**Action**:
1. Ask the user for a niche or category (if not provided).
2. Perform 3-5 web searches to identify trending topics in that niche.
3. Select the most promising topic based on: search volume signals, freshness,
   audience interest, and content depth potential.
4. State the chosen topic clearly.

**Output**: Topic decision (stored in context, written to `pipeline_state.json`).

**Validation**: Topic is specific enough to fill 3-10 minutes of content. Not too
broad ("technology"), not too narrow ("the 3rd screw on the iPhone 15 camera").

---

### STEP 2: Research

**Goal**: Compile comprehensive, accurate information on the chosen topic.

**Action**:
1. Perform 5-10 targeted web searches on the topic.
2. Visit and extract key information from the top results.
3. Compile: key facts, statistics, expert quotes, examples, counterarguments,
   timeline/history, current state, future outlook.
4. Verify critical claims with at least 2 sources.
5. Organize findings by subtopic.

**Output**: Research notes (kept in agent context, key facts transferred to script).

**Validation**:
- At least 3 verifiable facts or statistics gathered.
- Multiple perspectives covered.
- Information is current (within last 12 months for news/trends).

---

### STEP 3: Script Writing

**Goal**: Write a retention-optimized script with discrete ~10-second scenes.

**Action**:
1. Load the YouTube script sub-skill reference:
   `skills/claude-youtube/skills/claude-youtube/sub-skills/script.md`
2. Also load the retention scripting guide:
   `skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md`
3. Adapt the script structure into **scene-based format** (~10 seconds per scene).
4. Write the full script to `SCRIPT.md`.
5. Write the structured scene data to `scenes.json`.

**Script structure** (adapted from the YouTube skill):

```
HOOK (0:00-0:30): 3 scenes — Grab, Promise, Stakes
INTRO (0:30-1:30): 6 scenes — Context, credibility, viewer outcome
CONTENT BLOCKS: 6-10 scenes each — Pattern interrupt, value, micro-summary, forward hook
MID-CTA (~25%): 1 scene — Soft call to action
RETENTION RE-HOOK (~60%): 1 scene — Re-engage dropping viewers
OUTRO (final 60s): 6 scenes — Hard CTA, end screen, next video tease
```

**SCRIPT.md format**:

```markdown
# Script: {Video Title}

## Scene 1: [Title] (~10s)
**Script:** [What appears on screen / narration context]
**Voiceover:** [Exact words to be spoken]
**Transition:** [fade/cut/wipe/slide]

## Scene 2: [Title] (~10s)
...
```

**scenes.json**: Must follow the schema in `schemas/scenes.schema.json`. Initialize
with `actual_duration_seconds: null` and `render_status: "pending"`.

**Output**: `SCRIPT.md` and `scenes.json` in the video directory.

**Validation**:
- All scenes have: id, title, script_text, voiceover_text, target_duration_seconds.
- Total estimated duration matches target video length (within 10%).
- Hook has all 3 elements (grab, promise, stakes).
- Pattern interrupts appear every 3-5 scenes (every 60-90s).
- Mid-CTA present around 25% mark.
- Retention re-hook present around 60% mark.
- Script reads as natural spoken language, not written prose.

---

### STEP 4: Voiceover Writing

**Goal**: Extract voiceover text into a parseable format for TTS generation.

**Action**:
1. Read `SCRIPT.md`.
2. Extract the "Voiceover:" line from each scene.
3. Write `VOICEOVER.md` in the standardized format:

```markdown
# VOICEOVER
---SCENE:1---
[Exact voiceover text for scene 1 — what TTS will speak]
---END---
---SCENE:2---
[Exact voiceover text for scene 2]
---END---
```

**Output**: `VOICEOVER.md` in the video directory.

**Validation**:
- Every scene from `scenes.json` has a corresponding `---SCENE:N---` block.
- No empty voiceover blocks.
- Text is clean — no stage directions, no markdown formatting, just spoken words.
- Scene count in VOICEOVER.md matches scenes.json scene count.

---

### STEP 5: Voiceover Generation

**Goal**: Generate MP3 audio files for each scene using edge-tts.

**Action**:
1. Run the voiceover generation script:

```bash
python3 scripts/generate_voiceover.py videos/{video-title}/ --voice {voice_name}
```

The voice name comes from `pipeline_config.json` (default: `en-GB-RyanNeural`).
User can override with `--voice en-GB-SoniaNeural` or similar.

2. The script will:
   - Parse `VOICEOVER.md` for scene delimiters
   - Generate one MP3 per scene sequentially (low memory)
   - Measure each file's duration
   - Update `scenes.json` with file paths and durations

**Output**: `voiceover/scene-XX.mp3` files + updated `scenes.json`.

**Validation**:
- All MP3 files exist in `voiceover/` directory.
- File sizes are non-zero.
- `scenes.json` has `voiceover_file` populated for every scene.
- If any scene failed, retry it individually before proceeding.

---

### STEP 6: Duration Measurement

**Goal**: Verify and finalize the real durations of all voiceover audio files.

**Action**:
1. Run the duration measurement script:

```bash
python3 scripts/measure_durations.py videos/{video-title}/
```

2. The script will:
   - Use ffprobe to measure each MP3
   - Calculate `actual_duration_frames = ceil(duration * fps)`
   - Update `scenes.json` with real values
   - Print total video duration

**Output**: Updated `scenes.json` with `actual_duration_seconds` and `actual_duration_frames`.

**Validation**:
- Every scene has non-null `actual_duration_seconds` and `actual_duration_frames`.
- No scene duration is 0.
- Total duration is reasonable for the target length.
- **CRITICAL**: Do NOT proceed to Step 7 until ALL scene durations are measured.
  The Remotion compositions depend on exact frame counts.

---

### STEP 7: Style Definition

**Goal**: Define a consistent visual style for the entire video.

**Action**:
1. Read the video topic, script tone, and target audience.
2. Decide on a visual style that fits the content:
   - Color palette (3-5 hex colors)
   - Typography (1-2 font families, sizes)
   - Background treatment (gradients, solid, patterns)
   - Animation character (smooth, snappy, minimal, bold)
   - Element positioning rules
3. Write `STYLES.md` in the video directory.
4. Update `scenes.json` with `visual_notes` for each scene based on the style guide.
   - Each scene gets a specific visual treatment: colors, animations, layout, elements
   - `visual_notes` should be detailed enough for Step 8 to implement directly
   - Reference specific colors from the palette, animation types, and element positions

**STYLES.md format**:

```markdown
# Visual Style Guide

## Color Palette
- Primary: #HEXCODE — [usage]
- Secondary: #HEXCODE — [usage]
- Accent: #HEXCODE — [usage]
- Background: #HEXCODE — [usage]
- Text: #HEXCODE — [usage]

## Typography
- Headlines: [Font Name], [size]px, [weight]
- Body: [Font Name], [size]px, [weight]
- Captions: [Font Name], [size]px, [weight]

## Background
[Description of background treatment]

## Animation Style
[Description: e.g., "Smooth 0.5s ease-out transitions, subtle scale effects"]

## Layout Rules
- Safe margins: [X]px sides, [Y]px top/bottom
- Text alignment: [center/left/right]
- Element spacing: [X]px

## Scene Visual Template
[Description of the default visual structure for a scene]
```

**Output**: `STYLES.md` in the video directory.

**Validation**:
- Colors are valid hex codes.
- Font choices are available via Google Fonts or are web-safe.
- Style is consistent and reproducible across all scenes.
- Every scene in `scenes.json` has non-empty `visual_notes`.
- `visual_notes` reference specific colors from the palette defined in `STYLES.md`.
- `visual_notes` specify animation types consistent with the style guide.

---

### STEP 8: Remotion Code Writing

**Goal**: Write the Remotion project code for all scenes.

**This is the most complex step. Take it slow and methodical.**

**Action**:

#### 8a. Scaffold the project

```bash
python3 pipeline.py new "{video-title}"
```

This creates the directory structure, copies foundation config, generates starter
files (Root.tsx with single composition, config.ts, styles.ts), and installs
npm dependencies.

If the `videos/{video-title}/remotion/` directory already has files, skip scaffolding.

#### 8b. Load the Remotion best practices skill

Read `skills/remotion-best-practices/skills/remotion/SKILL.md` and its referenced
rule files. Key rules to load:
- `rules/video-layout.md` — layout and text sizing
- `rules/voiceover.md` — audio integration patterns
- `rules/calculate-metadata.md` — dynamic duration
- `rules/transitions.md` — scene transitions
- `rules/sequencing.md` — timing with `<Sequence>`
- `rules/compositions.md` — composition structure
- `rules/effects.md` — visual effects patterns

#### 8c. Write PLAN.md

Before writing any code, create `remotion/PLAN.md`:

```markdown
# Implementation Plan

## Configuration
- FPS: {from scenes.json}
- Resolution: {width}x{height}
- Total duration: {total_actual_seconds}s = {total_frames} frames

## Shared Components
- [List reusable components to create]

## Scenes
### Scene 1: {title}
- Duration: {actual_duration_frames} frames
- Visual: {visual_notes from scenes.json — set by Step 7}
- Audio: voiceover/scene-01.mp3
- Key elements: [what needs to animate]
- Transition in: {transition_in}
- Transition out: {transition_out}

### Scene 2: {title}
...

## Style Reference
{Key points from STYLES.md}
```

#### 8d. Write the code

1. Copy/symlink voiceover files into `remotion/public/voiceover/`:
   ```bash
   cp -r ../voiceover/ public/voiceover/
   ```

2. Write `src/Root.tsx` — define a single `<Composition id="MainVideo">` with
   `calculateMetadata` that reads scene durations from `props`. Use `--props`
   JSON at render time to pass scene data, not hard-coded config.

3. Write `src/lib/config.ts` — export scene data (durations, paths, fps).

4. Write shared components in `src/components/` — reusable visual elements
   defined in STYLES.md.

5. Write each scene component in `src/scenes/SceneXX.tsx`:
   - Use `useCurrentFrame()` + `interpolate()` for animations
   - Use `<Audio>` from `@remotion/media` for voiceover
   - Use `<Sequence>` for sub-timing within the scene
   - NO CSS transitions/animations
   - NO Tailwind animation classes
   - Use `staticFile()` for assets
   - Use individual CSS transform properties (scale, translate, rotate)
     instead of composing a `transform` string

6. Each scene must:
   - Match its `actual_duration_frames` exactly
   - Include the voiceover audio
   - Implement the visual treatment from `visual_notes` in `scenes.json`
   - Follow the style system from STYLES.md
   - Have proper text sizing per video-layout.md rules

**Output**: Complete Remotion project in `remotion/` + `PLAN.md`.

**Validation**:
- `src/Root.tsx` exists and exports `RemotionRoot` with single `<Composition id="MainVideo">`.
- `src/components/MainVideo.tsx` exists with Sequence-based scene loading.
- Each scene has a corresponding `SceneXX.tsx` file.
- Scene count matches `scenes.json` scene count.
- Frame durations match `actual_duration_frames` from `scenes.json`.
- No CSS transitions or animations used.
- All animations use `interpolate()` or `spring()`.
- Voiceover files are in `public/voiceover/`.

---

### STEP 9: Scene Rendering

**Goal**: Render each scene as a separate MP4 file.

**CRITICAL**: Render one scene at a time. Do NOT attempt parallel rendering.

**Action**:

For each scene (1 through N), sequentially:

```bash
bash scripts/render_scene.sh videos/{video-title}/ {scene_id}
```

The script:
- Builds a props JSON from scenes.json with all scene durations
- Calculates the frame range for the specific scene (`--frames`)
- Renders only that scene's portion of the single `MainVideo` composition
- Handles all guardrails (RAM/disk/Chrome cleanup, TMPDIR configuration)

**Between scenes**: Wait for the script to complete before starting the next.
Monitor output for errors.

**Output**: `scenes/scene-XX.mp4` files.

**Validation** (after ALL scenes are rendered):
- All MP4 files exist in `scenes/` directory.
- File sizes are non-zero.
- `scenes.json` has `render_status: "rendered"` for every scene.
- Total disk usage is within system limits.

**If a scene fails**:
1. Check the error output.
2. Run `pkill -f chrome` to clean up.
3. Wait 30 seconds.
4. Retry once.
5. If still failing, check `scripts/check_system.sh` and consider reducing
   quality settings in `pipeline_config.json`.

---

### STEP 10: Stitching

**Goal**: Combine all scene videos with voiceover audio into the final output.

**Action**:

```bash
python3 scripts/assemble.py videos/{video-title}/
```

The script:
1. Concatenates all voiceover MP3 files in scene order -> `voiceover_aligned.mp3`
2. Concatenates all scene MP4 video streams (copy, no re-encode)
3. Overlays audio on video with `-c:v copy -c:a aac` (no video re-encode)
4. Auto-increments version number: `versions/{title}-v1.mp4`, `v2`, etc.
5. Cleans up intermediate files

**Output**: `versions/{video-title}-v{N}.mp4` — the final deliverable.

**Validation**:
- Final MP4 exists and is playable.
- Duration matches expected total (within 1 second).
- Audio is present and synced.
- File size is reasonable for the duration.
- `voiceover_aligned.mp3` exists with correct total duration.

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| `edge-tts` network failure | Retry the generation script. It processes scenes sequentially, so only failed scenes need retry. |
| Remotion render OOM | Kill Chrome (`pkill -f chrome`), wait 60s, retry. If persistent, reduce `node_max_old_space_size_mb` or video resolution. |
| Remotion render timeout | Increase `timeout_ms` in config, or simplify the scene's visual complexity. |
| ffmpeg stitch failure | Ensure all scene videos exist. Check codec consistency. Try `assemble.py` again — it validates inputs first. |
| Disk full | Run `rm -rf videos/{title}/remotion/node_modules` to free space, or clean up previous video projects. |

## Progress Tracking

Use `pipeline_state.json` to track which steps are complete. Before starting
any step, check if it's already marked complete (for resuming interrupted runs).

Update the file after each step completes:
```json
{
  "video_title": "...",
  "current_step": 5,
  "steps": {
    "1_topic_selection": {"status": "complete", "completed_at": "2025-01-15T10:30:00Z"},
    "2_research": {"status": "complete", "completed_at": "2025-01-15T10:45:00Z"},
    ...
  }
}
```

## Resuming Interrupted Pipelines

Use `python3 pipeline.py continue {title}` to resume. The pipeline:
1. Reads `pipeline_state.json` to find the last completed step.
2. Runs the next automated step (5, 6, 9, or 10), or
3. Prints instructions for creative steps (1-4, 7, 8).
4. Steps 5-6 involve file generation — verify files exist before skipping.
5. Steps 7-8 involve code — verify project builds before skipping.
6. Steps 9-10 involve rendering — always re-do from where render_status != "rendered".
