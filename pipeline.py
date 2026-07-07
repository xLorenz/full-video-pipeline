#!/usr/bin/env python3
"""
pipeline.py — CLI orchestrator for the full video pipeline.

Usage:
    ./pipeline.py new <title>            Scaffold a new video project
    ./pipeline.py continue <title>      Run the next incomplete pipeline step
    ./pipeline.py status [title]        Show pipeline state
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make scripts/ importable so we can use the shared lib + validate.py
sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))
import _pipeline_lib as pl  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent
PIPELINE_CONFIG = REPO_ROOT / "pipeline_config.json"
FOUNDATION_DIR = REPO_ROOT / "remotion-foundation"
SCHEMA_PATH = REPO_ROOT / "schemas" / "pipeline_state.schema.json"

# Re-export commonly used helpers from the shared lib so existing code reads cleanly
video_dir = pl.video_dir
state_path = pl.state_path
scenes_json_path = pl.scenes_json_path
load_state = pl.load_state
save_state = pl.save_state
load_scenes = pl.load_scenes
load_pipeline_config = pl.load_config
now_iso = pl.now_iso
sanitize_title = pl.sanitize_title
CmdError = pl.CmdError


def run_cmd(cmd, cwd=None, check=True, logpath=None):
    return pl.run_cmd(cmd, cwd=cwd, check=check, logpath=logpath)

STEP_KEYS = [
    "1_topic_selection",
    "2_research",
    "3_script_writing",
    "4_voiceover_writing",
    "5_voiceover_generation",
    "6_duration_measurement",
    "7_style_definition",
    "8_remotion_coding",
    "9_scene_rendering",
    "10_stitching",
    "11_metadata_generation",
    "12_thumbnail_generation",
    "13_thumbnail_rendering",
]

STEP_NAMES = {
    "1_topic_selection": "Topic Selection",
    "2_research": "Research",
    "3_script_writing": "Script Writing",
    "4_voiceover_writing": "Voiceover Writing",
    "5_voiceover_generation": "Voiceover Generation",
    "6_duration_measurement": "Duration Measurement",
    "7_style_definition": "Style Definition",
    "8_remotion_coding": "Remotion Code Writing",
    "9_scene_rendering": "Scene Rendering",
    "10_stitching": "Stitching",
    "11_metadata_generation": "Metadata Generation",
    "12_thumbnail_generation": "Thumbnail Generation",
    "13_thumbnail_rendering": "Thumbnail Rendering",
}

SKIP_STEPS = {"1_topic_selection", "2_research", "3_script_writing",
              "4_voiceover_writing", "7_style_definition", "8_remotion_coding",
              "11_metadata_generation", "12_thumbnail_generation"}

SKIP_INSTRUCTIONS = {
    "1_topic_selection": (
        "Required skill files:\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/ideate.md\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/strategy.md\n"
        "Select a specific, trending topic for the video.\n"
        "  1. Perform 3-5 web searches to identify trending topics.\n"
        "  2. Choose the most promising topic.\n"
        "  3. State the chosen topic clearly.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "2_research": (
        "Required skill files:\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/competitor.md\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/analyze.md\n"
        "Research the topic thoroughly.\n"
        "  1. Perform 5-10 targeted web searches.\n"
        "  2. Compile key facts, statistics, expert quotes, examples.\n"
        "  3. Verify critical claims with at least 2 sources.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "3_script_writing": (
        "Required skill files:\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/script.md\n"
        "  skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md\n"
        "Write the retention-optimized script.\n"
        "  1. Write SCRIPT.md in scene-based format (~10s per scene).\n"
        "  2. Write scenes.json with structured scene data.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "4_voiceover_writing": (
        "Required skill files:\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/hook.md\n"
        "  skills/remotion-best-practices/skills/remotion/rules/voiceover.md\n"
        "Extract voiceover text into parseable format.\n"
        "  1. Read SCRIPT.md.\n"
        "  2. Write VOICEOVER.md with ---SCENE:N--- delimiters.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "7_style_definition": (
        "Required skill files:\n"
        "  skills/remotion-best-practices/skills/remotion/rules/compositions.md\n"
        "  skills/remotion-best-practices/skills/remotion/rules/video-layout.md\n"
        "Define visual style for the video.\n"
        "  1. Read the topic, script tone, and target audience.\n"
        "  2. Choose color palette, typography, background, animation style.\n"
        "  3. Write STYLES.md.\n"
        "  4. Update scenes.json with visual_notes for each scene.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "8_remotion_coding": (
        "Required skill files:\n"
        "  skills/remotion-best-practices/skills/remotion/SKILL.md\n"
        "  skills/remotion-best-practices/skills/remotion/rules/sequencing.md\n"
        "  skills/remotion-best-practices/skills/remotion/rules/compositions.md\n"
        "  skills/remotion-best-practices/skills/remotion/rules/voiceover.md\n"
        "Implement the Remotion project code.\n"
        "  1. Write remotion/PLAN.md with implementation plan.\n"
        "  2. Copy voiceover files to remotion/public/voiceover/ (reference only).\n"
        "  3. Write src/Root.tsx with single <Composition id=\"MainVideo\">.\n"
        "  4. Write src/lib/config.ts, src/lib/styles.ts.\n"
        "  5. Write shared components in src/components/.\n"
        "  6. Write each scene component in src/scenes/SceneXX.tsx.\n"
        "  IMPORTANT: scenes render SILENT video. Do NOT use <Audio> —\n"
        "  voiceover is muxed at stitch time by scripts/assemble.py.\n"
        "  Optional burned-in captions: render <Captions> from scene.captions\n"
        "  when scene.showCaptions is true (set per-video via video.burn_captions).\n"
        "  7. Verify: cd remotion && npm run lint && npx tsc --noEmit\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "11_metadata_generation": (
        "Required skill files:\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/metadata.md\n"
        "  skills/claude-youtube/skills/claude-youtube/references/seo-playbook.md\n"
        "Generate YouTube title, description, and tags for the stitched video.\n"
        "  1. Read SKILL.md Step 11 section for full guidance.\n"
        "  2. Read the final stitched video info from versions/ directory.\n"
        "  3. Write TITLE.md (3 title variants), DESCRIPTION.md (<5000 chars\n"
        "     with timestamps matching scenes.json durations), TAGS.md (10-15\n"
        "     tags, <500 chars).\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "12_thumbnail_generation": (
        "Required skill files:\n"
        "  skills/claude-youtube/skills/claude-youtube/sub-skills/thumbnail.md\n"
        "  skills/claude-youtube/skills/claude-youtube/references/thumbnail-ctr-guide.md\n"
        "Write the Thumbnail.tsx Remotion component (no AI images).\n"
        "  1. Read SKILL.md Step 12 section for full guidance.\n"
        "  2. Read TITLE.md, DESCRIPTION.md, STYLES.md, and scenes.json for context.\n"
        "  3. Write src/components/Thumbnail.tsx using ONLY Remotion primitives\n"
        "     (<Img> may only reference local staticFile() assets — no external\n"
        "     URLs, no AI-generated images). Use shapes, text, gradients.\n"
        "  4. Verify: cd remotion && npm run lint && npx tsc --noEmit\n"
        "  DO NOT use any AI image generation. Thumbnail must be pure Remotion.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
}

# ---------------------------------------------------------------------------
# NEW subcommand
# ---------------------------------------------------------------------------

def cmd_new(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    rdir = vdir / "remotion"

    if vdir.exists():
        print(f"ERROR: Video directory already exists: {vdir}")
        sys.exit(1)

    config = load_pipeline_config()
    fps = config.get("video", {}).get("fps", 30)
    width = config.get("video", {}).get("width", 1920)
    height = config.get("video", {}).get("height", 1080)

    print(f"=== Scaffolding video project: {title} ===")
    print(f"  Directory: {vdir}")

    # Create directory structure
    for d in [
        rdir / "src" / "lib",
        rdir / "src" / "scenes",
        rdir / "src" / "components",
        rdir / "public" / "thumbnails",
        vdir / "voiceover",
        vdir / "scenes",
        vdir / "versions",
    ]:
        d.mkdir(parents=True, exist_ok=True)

    # Copy foundation config files
    for fname in ["tsconfig.json", "remotion.config.ts", "eslint.config.mjs",
                   ".prettierrc", ".gitignore"]:
        src = FOUNDATION_DIR / fname
        if src.exists():
            shutil.copy2(src, rdir / fname)

    # Create package.json
    pkg = {
        "name": f"remotion-{title}",
        "version": "1.0.0",
        "private": True,
        "dependencies": {"remotion-foundation": "*"},
        "scripts": {
            "dev": "remotion studio",
            "build": "remotion bundle",
            "lint": "eslint src && tsc",
        },
        "sideEffects": ["*.css"],
    }
    with open(rdir / "package.json", "w") as f:
        json.dump(pkg, f, indent=2)

    # Create index.ts
    (rdir / "src" / "index.ts").write_text(
        'import { registerRoot } from "remotion";\n'
        'import { RemotionRoot } from "./Root";\n'
        '\n'
        'registerRoot(RemotionRoot);\n'
    )

    # Create index.css
    (rdir / "src" / "index.css").write_text('@import "tailwindcss";\n')

    # Create lib/styles.ts
    (rdir / "src" / "lib" / "styles.ts").write_text(
        'export const COLORS = {\n'
        '  primary: "#0F1B2D",\n'
        '  secondary: "#00BFA6",\n'
        '  accent: "#FFB300",\n'
        '  background: "#0A1220",\n'
        '  text: "#FFFFFF",\n'
        '  muted: "#4A5568",\n'
        '  danger: "#EF4444",\n'
        '  success: "#10B981",\n'
        '  gridLine: "#1A2744",\n'
        '} as const;\n'
        '\n'
        'export const FONTS = {\n'
        '  heading: "Inter",\n'
        '  body: "Poppins",\n'
        '} as const;\n'
    )

    # Create lib/config.ts
    (rdir / "src" / "lib" / "config.ts").write_text(
        f'export const FPS = {fps};\n'
        f'export const WIDTH = {width};\n'
        f'export const HEIGHT = {height};\n'
    )

    # Create Root.tsx — MainVideo composition + Thumbnail still composition
    (rdir / "src" / "Root.tsx").write_text(
        'import React from "react";\n'
        'import { Composition } from "remotion";\n'
        'import type { VideoProps, ThumbnailProps } from "remotion-foundation";\n'
        'import { FPS, WIDTH, HEIGHT } from "./lib/config";\n'
        'import { MainVideo } from "./components/MainVideo";\n'
        'import { Thumbnail } from "./components/Thumbnail";\n'
        '\n'
        'export const RemotionRoot: React.FC = () => {\n'
        '  return (\n'
        '    <>\n'
        '      <Composition\n'
        '        id="MainVideo"\n'
        '        component={MainVideo}\n'
        '        calculateMetadata={async ({ props }) => {\n'
        '          const totalFrames = props.scenes.reduce(\n'
        '            (sum, s) => sum + s.durationInFrames, 0\n'
        '          );\n'
        '          return {\n'
        '            durationInFrames: totalFrames,\n'
        '            fps: props.fps,\n'
        '            width: props.width,\n'
        '            height: props.height,\n'
        '          };\n'
        '        }}\n'
        '        defaultProps={{\n'
        '          scenes: [],\n'
        '          fps: FPS,\n'
        '          width: WIDTH,\n'
        '          height: HEIGHT,\n'
        '          burnCaptions: false,\n'
        '        } as VideoProps}\n'
        '      />\n'
        '      <Composition\n'
        '        id="Thumbnail"\n'
        '        component={Thumbnail}\n'
        '        durationInFrames={1}\n'
        '        fps={30}\n'
        '        width={WIDTH}\n'
        '        height={HEIGHT}\n'
        '        defaultProps={{\n'
        '          title: "Video Title",\n'
        '          subtitle: "",\n'
        '          palette: {\n'
        '            primary: "#0F1B2D",\n'
        '            secondary: "#00BFA6",\n'
        '            accent: "#FFB300",\n'
        '            background: "#0A1220",\n'
        '            text: "#FFFFFF",\n'
        '          },\n'
        '        } as ThumbnailProps}\n'
        '      />\n'
        '    </>\n'
        '  );\n'
        '};\n'
    )

    # Create MainVideo component.
    # NOTE: scenes render SILENT video. Voiceover is muxed at stitch time
    # by scripts/assemble.py. The Captions layer is rendered only when
    # burnCaptions=true (set via props from pipeline_config.json).
    (rdir / "src" / "components" / "MainVideo.tsx").write_text(
        'import React, { useMemo } from "react";\n'
        'import { AbsoluteFill, Sequence } from "remotion";\n'
        'import { Captions } from "remotion-foundation";\n'
        'import type { SceneTiming, VideoProps } from "remotion-foundation";\n'
        '\n'
        'const SCENE_COMPONENTS: Record<number, React.LazyExoticComponent<React.FC<{ scene: SceneTiming }>>> = {};\n'
        '\n'
        'function getSceneComponent(id: number) {\n'
        '  if (!SCENE_COMPONENTS[id]) {\n'
        '    const padded = String(id).padStart(2, "0");\n'
        '    SCENE_COMPONENTS[id] = React.lazy(\n'
        '      () => import(`../scenes/Scene${padded}`)\n'
        '    );\n'
        '  }\n'
        '  return SCENE_COMPONENTS[id];\n'
        '}\n'
        '\n'
        'export const MainVideo: React.FC<VideoProps> = ({ scenes, fps, burnCaptions }) => {\n'
        '  const offsets = useMemo(() => {\n'
        '    const result: number[] = [];\n'
        '    let offset = 0;\n'
        '    for (const scene of scenes) {\n'
        '      result.push(offset);\n'
        '      offset += scene.durationInFrames;\n'
        '    }\n'
        '    return result;\n'
        '  }, [scenes]);\n'
        '\n'
        '  return (\n'
        '    <AbsoluteFill>\n'
        '      {scenes.map((scene, i) => {\n'
        '        const SceneComponent = getSceneComponent(scene.id);\n'
        '        const showCaptions = (scene.showCaptions ?? burnCaptions) && !!scene.captions?.length;\n'
        '        return (\n'
        '          <Sequence\n'
        '            key={scene.id}\n'
        '            from={offsets[i]}\n'
        '            durationInFrames={scene.durationInFrames}\n'
        '          >\n'
        '            <React.Suspense fallback={null}>\n'
        '              <SceneComponent scene={scene} />\n'
        '            </React.Suspense>\n'
        '            {showCaptions && (\n'
        '              <Captions cues={scene.captions!} fps={fps} />\n'
        '            )}\n'
        '          </Sequence>\n'
        '        );\n'
        '      })}\n'
        '    </AbsoluteFill>\n'
        '  );\n'
        '};\n'
    )

    # Create Thumbnail.tsx stub — the agent fills this in during Step 12
    (rdir / "src" / "components" / "Thumbnail.tsx").write_text(
        'import React from "react";\n'
        'import { AbsoluteFill } from "remotion";\n'
        'import type { ThumbnailProps } from "remotion-foundation";\n'
        '\n'
        'export const Thumbnail: React.FC<ThumbnailProps> = ({ title, subtitle, palette }) => {\n'
        '  return (\n'
        '    <AbsoluteFill\n'
        '      style={{\n'
        '        backgroundColor: palette.background,\n'
        '        justifyContent: "center",\n'
        '        alignItems: "center",\n'
        '        fontFamily: "Inter, sans-serif",\n'
        '      }}\n'
        '    >\n'
        '      <h1\n'
        '        style={{\n'
        '          color: palette.text,\n'
        '          fontSize: 80,\n'
        '          fontWeight: 700,\n'
        '          textAlign: "center",\n'
        '          margin: "0 80px",\n'
        '          lineHeight: 1.1,\n'
        '        }}\n'
        '      >\n'
        '        {title}\n'
        '      </h1>\n'
        '      {subtitle && (\n'
        '        <p\n'
        '          style={{\n'
        '            color: palette.accent,\n'
        '            fontSize: 36,\n'
        '            fontWeight: 600,\n'
        '            marginTop: 20,\n'
        '          }}\n'
        '        >\n'
        '          {subtitle}\n'
        '        </p>\n'
        '      )}\n'
        '    </AbsoluteFill>\n'
        '  );\n'
        '};\n'
    )

    # Create pipeline_state.json
    state = {
        "video_title": title,
        "current_step": 1,
        "steps": {},
    }
    for key in STEP_KEYS:
        state["steps"][key] = {"status": "pending"}
    with open(vdir / "pipeline_state.json", "w") as f:
        json.dump(state, f, indent=2)

    # Create empty scenes.json stub
    scenes_stub = {
        "video_title": title,
        "fps": fps,
        "width": width,
        "height": height,
        "created_at": now_iso(),
        "scenes": [],
        "total_estimated_seconds": 0,
        "total_actual_seconds": 0,
    }
    with open(vdir / "scenes.json", "w") as f:
        json.dump(scenes_stub, f, indent=2)

    # Install npm dependencies
    print("\n--- Installing npm dependencies ---")
    run_cmd("npm install", cwd=REPO_ROOT)

    print(f"\n=== Video project scaffolded: {vdir} ===")
    print("\nNext steps:")
    print("  1. Select a topic: ./pipeline.py continue " + title)
    print("  2. The pipeline will guide you through each step.")


# ---------------------------------------------------------------------------
# CONTINUE subcommand
# ---------------------------------------------------------------------------

def find_next_step(state):
    """Find the first pending, failed, or in-progress step at or after current_step."""
    current = state.get("current_step", 1)
    for i, key in enumerate(STEP_KEYS, start=1):
        if i < current:
            continue
        step = state["steps"].get(key, {})
        if step.get("status") in ("pending", "failed", "in_progress"):
            return i, key
    return None, None


def run_step_5(title, vdir):
    """Voiceover generation. Idempotent — unchanged scenes are skipped."""
    print("--- Running Step 5: Voiceover Generation ---")
    cfg = load_pipeline_config()
    voice = cfg.get("voiceover", {}).get("voice", "en-GB-RyanNeural")
    log_file = pl.log_path(title, 5)
    run_cmd(f"python3 scripts/generate_voiceover.py videos/{title}/ --voice {voice}",
            cwd=REPO_ROOT, logpath=log_file)

    # Verify output
    scenes = load_scenes(title)
    missing = []
    for s in scenes:
        vf = vdir / (s.get("voiceover_file") or "")
        if not vf.exists():
            missing.append(s["id"])
    if missing:
        print(f"  WARNING: Voiceover file missing for scenes: {missing}")
        return False
    return True


def run_step_6(title, vdir):
    """Duration measurement."""
    print("--- Running Step 6: Duration Measurement ---")
    log_file = pl.log_path(title, 6)
    run_cmd(f"python3 scripts/measure_durations.py videos/{title}/",
            cwd=REPO_ROOT, logpath=log_file)

    scenes = load_scenes(title)
    for s in scenes:
        if s.get("actual_duration_frames") is None:
            print(f"  ERROR: Scene {s['id']} missing actual_duration_frames")
            return False
    return True


def lint_gate(title, vdir):
    """Run Remotion lint + typecheck before rendering. Returns (ok, error)."""
    rdir = vdir / "remotion"
    if not (rdir / "package.json").exists():
        return False, "remotion/package.json not found"
    print("--- Pre-render lint/typecheck gate ---")
    r1 = run_cmd("npm run lint", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    if r1.returncode != 0:
        return False, "npm run lint failed"
    r2 = run_cmd("npx tsc --noEmit", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    if r2.returncode != 0:
        return False, "tsc --noEmit failed"
    # Confirm compositions are registered
    r3 = run_cmd("npx remotion compositions src/Root.tsx", cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id=0))
    compositions_out = r3.stdout or ""
    if r3.returncode != 0 or "MainVideo" not in compositions_out:
        return False, "MainVideo composition not found via `remotion compositions`"
    if "Thumbnail" not in compositions_out:
        return False, "Thumbnail composition not found via `remotion compositions`"
    return True, "lint/typecheck/compositions OK"


def run_step_9(title, vdir):
    """Scene rendering — one scene at a time. Resumable, non-fatal per-scene.

    Lint/typecheck gate runs once before the loop. If a scene render fails,
    record render_attempts += 1 and last_render_error, then CONTINUE to the
    next scene. Returns True only if every scene's render_status == "rendered"
    by the end of the loop.
    """
    print("--- Running Step 9: Scene Rendering ---")

    # Lint gate (fail fast before any render work)
    ok, msg = lint_gate(title, vdir)
    if not ok:
        print(f"  LINT GATE FAILED: {msg}")
        return False
    print(f"  Lint gate: {msg}")

    scenes = load_scenes(title)
    failed_scenes = []
    for s in scenes:
        sid = s["id"]
        if s.get("render_status") == "rendered":
            print(f"  Scene {sid}: already rendered, skipping")
            continue
        print(f"\n  Rendering scene {sid}/{len(scenes)}: {s.get('title', '')}")
        # render_scene.py never raises for render failures; it returns exit 1.
        # Wrap anyway in case of unexpected exception.
        try:
            r = run_cmd(f"python3 scripts/render_scene.py videos/{title}/ {sid}",
                        cwd=REPO_ROOT, check=False,
                        logpath=pl.log_path(title, 9, scene_id=sid))
            if r.returncode != 0:
                failed_scenes.append(sid)
        except Exception as e:
            print(f"  ERROR rendering scene {sid}: {type(e).__name__}: {e}")
            failed_scenes.append(sid)

    # Re-load to inspect statuses
    scenes = load_scenes(title)
    still_failed = [s["id"] for s in scenes if s.get("render_status") != "rendered"]
    if still_failed:
        print(f"\n  Scenes not rendered: {still_failed}")
        print(f"  Re-run `./pipeline.py continue {title}` to retry failed scenes.")
        return False
    return True


def run_step_10(title, vdir):
    """Stitching — single ffmpeg pass via assemble.py."""
    print("--- Running Step 10: Stitching (assemble.py) ---")
    run_cmd(f"python3 scripts/assemble.py videos/{title}/",
            cwd=REPO_ROOT, logpath=pl.log_path(title, 10))

    final_dir = vdir / "versions"
    if not final_dir.exists() or not list(final_dir.glob("*.mp4")):
        print("  ERROR: No final MP4 in versions/")
        return False
    return True


def run_step_13(title, vdir):
    """Thumbnail rendering via render_thumbnail.py. Idempotent — skips if already rendered."""
    print("--- Running Step 13: Thumbnail Rendering ---")

    # Run lint gate to ensure Thumbnail.tsx compiles + composition is registered
    ok, msg = lint_gate(title, vdir)
    if not ok:
        print(f"  LINT GATE FAILED: {msg}")
        return False
    print(f"  Lint gate: {msg}")

    log_file = pl.log_path(title, 13)
    run_cmd(f"python3 scripts/render_thumbnail.py videos/{title}/",
            cwd=REPO_ROOT, check=False, logpath=log_file)

    final_dir = vdir / "versions"
    if not final_dir.exists() or not list(final_dir.glob("*thumbnail*.png")):
        print("  ERROR: No thumbnail PNG in versions/")
        return False
    return True


def load_scenes(title):
    return pl.load_scenes(title)


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def validate_project(title):
    """Run scripts/validate.py on this video's scenes/state. Returns (ok, errors)."""
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
         str(video_dir(title))],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    return p.returncode == 0, (p.stdout + p.stderr).strip()


def _clean_after_step_13(vdir):
    """Remove remotion/node_modules after final step completes."""
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_remotion_node_modules_after_step_13", True):
        nm_dir = vdir / "remotion" / "node_modules"
        if nm_dir.exists():
            shutil.rmtree(nm_dir, ignore_errors=True)
            print(f"  Cleaned: remotion/node_modules/")


def _clean_after_assemble(vdir):
    """Optional: remove scene MP4s after a successful stitch."""
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_scene_mp4s_after_stitch", False):
        scenes_dir = vdir / "scenes"
        if scenes_dir.exists():
            for f in scenes_dir.glob("*.mp4"):
                f.unlink(missing_ok=True)
            print(f"  Cleaned: scenes/*.mp4 (clean_scene_mp4s_after_stitch=True)")


def cmd_continue(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = load_state(title)

    # Schema validation gate: refuse to run automated steps on invalid state.
    ok, errs = validate_project(title)
    if not ok:
        print("VALIDATION FAILED — refusing to continue:")
        print(errs)
        sys.exit(1)
    print("Validation OK.")

    step_num, step_key = find_next_step(state)
    if step_num is None:
        print(f"All steps complete for '{title}'!")
        # Still validate post-completion so a hand-edit is caught.
        return

    step_name = STEP_NAMES.get(step_key, step_key)
    print(f"=== Continuing pipeline: {title} ===")
    print(f"  Next step: {step_num}. {step_name}")

    if step_key in SKIP_STEPS:
        # Precondition: skills must be confirmed loaded
        step_state = state["steps"][step_key]
        if not step_state.get("skills_loaded"):
            print(f"\nStep {step_num} ({step_name}) requires skill files to be loaded first.\n")
            print("  Required skill files are listed at the top of the instructions below.\n")
            print(SKIP_INSTRUCTIONS[step_key])
            print("\n  After loading all skill files, set skills_loaded: true in")
            print(f"  pipeline_state.json under steps.{step_key}, then re-run.")
            print(f"  Example: python -c \"import json; s=json.load(open('videos/{title}/pipeline_state.json')); s['steps']['{step_key}']['skills_loaded']=True; json.dump(s, open('videos/{title}/pipeline_state.json','w'), indent=2)\"")
            return
        print(f"\nStep {step_num} ({step_name}) requires creative input.\n")
        print(SKIP_INSTRUCTIONS[step_key])
        return

    # Record attempt BEFORE the run
    step_state = state["steps"][step_key]
    step_state["status"] = "in_progress"
    step_state["attempts"] = (step_state.get("attempts", 0) or 0) + 1
    step_state["last_attempt_at"] = now_iso()
    save_state(title, state)

    # Run the step
    success = False
    error_msg = None
    try:
        if step_key == "5_voiceover_generation":
            success = run_step_5(title, vdir)
        elif step_key == "6_duration_measurement":
            success = run_step_6(title, vdir)
        elif step_key == "9_scene_rendering":
            success = run_step_9(title, vdir)
        elif step_key == "10_stitching":
            success = run_step_10(title, vdir)
        elif step_key == "13_thumbnail_rendering":
            success = run_step_13(title, vdir)
    except CmdError as e:
        error_msg = f"CmdError: {e}"
        print(f"\n  ERROR: Command failed with exit code {e.returncode}")
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        print(f"\n  ERROR: {error_msg}")

    # Re-validate after write (catches malformed writes immediately)
    post_ok, post_errs = validate_project(title)
    if success and not post_ok:
        success = False
        error_msg = f"post-step validation failed: {post_errs}"
        print(f"\n  ERROR: {error_msg}")

    if success:
        state["steps"][step_key]["status"] = "complete"
        state["steps"][step_key]["completed_at"] = now_iso()
        state["steps"][step_key]["last_error"] = None
        state["current_step"] = min(step_num + 1, len(STEP_KEYS))
        save_state(title, state)
        print(f"\n=== Step {step_num} ({step_name}) complete ===")

        # Post-step cleanup
        if step_key == "13_thumbnail_rendering":
            _clean_after_step_13(vdir)
        elif step_key == "10_stitching":
            _clean_after_assemble(vdir)

        next_num, next_key = find_next_step(state)
        if next_num is None:
            print("\nAll steps complete! Final video is in versions/ and thumbnail is in versions/<title>-thumbnail-vN.png.")
        elif next_key in SKIP_STEPS:
            print(f"\nNext: Step {next_num} ({STEP_NAMES[next_key]}) — requires creative input.")
            print(f"Run: ./pipeline.py continue {title}")
        else:
            print(f"\nNext: Step {next_num} ({STEP_NAMES[next_key]}) — automated.")
            print(f"Run: ./pipeline.py continue {title}")
    else:
        state["steps"][step_key]["status"] = "failed"
        state["steps"][step_key]["last_error"] = (error_msg or "Step failed, see logs")
        # Keep legacy `error` field in sync for older readers
        state["steps"][step_key]["error"] = state["steps"][step_key]["last_error"]
        save_state(title, state)
        print(f"\n=== Step {step_num} ({step_name}) FAILED ===")
        print(f"  Last error: {state['steps'][step_key]['last_error']}")
        print(f"  Logs in: videos/{title}/logs/")
        sys.exit(1)


# ---------------------------------------------------------------------------
# STATUS subcommand
# ---------------------------------------------------------------------------

def cmd_status(args):
    if args.title:
        title = sanitize_title(args.title)
        show_status_for_title(title)
    else:
        show_all_statuses()


def show_status_for_title(title):
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    state = load_state(title)
    print(f"=== Pipeline Status: {title} ===")
    print(f"  Current step: {state.get('current_step', '?')}")
    print()
    print(f"  {'Step':<5} {'Name':<28} {'Status':<12} {'Attempts':<10} {'Completed/LastErr'}")
    print(f"  {'-----':<5} {'----------------------------':<28} {'------------':<12} {'----------':<10} {'--------------------'}")
    for i, key in enumerate(STEP_KEYS, start=1):
        step = state["steps"].get(key, {})
        status = step.get("status", "pending")
        attempts = step.get("attempts", 0)
        col = step.get("completed_at") or (step.get("last_error") or "")[:50]
        icon = {"complete": "[OK]", "in_progress": "[>>]", "failed": "[!!]", "pending": "[--]"}.get(status, "[??]")
        print(f"  {i:<5} {STEP_NAMES[key]:<28} {icon} {status:<10} {attempts:<10} {col}")


def show_all_statuses():
    videos_dir = REPO_ROOT / "videos"
    if not videos_dir.exists():
        print("No videos directory found.")
        return

    entries = []
    for d in sorted(videos_dir.iterdir()):
        if d.is_dir():
            sp = d / "pipeline_state.json"
            if sp.exists():
                with open(sp, "r", encoding="utf-8") as f:
                    state = json.load(f)
                step = state.get("current_step", "?")
                entries.append((d.name, step))

    if not entries:
        print("No video projects found.")
        return

    print("=== All Video Projects ===")
    print(f"  {'Title':<50} {'Step'}")
    print(f"  {'-'*50} {'-'*5}")
    for name, step in entries:
        print(f"  {name:<50} {step}")


# ---------------------------------------------------------------------------
# VALIDATE subcommand
# ---------------------------------------------------------------------------

def cmd_audit(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    violations = []
    state = load_state(title)

    # 1. Pipeline state summary
    print(f"=== Audit: {title} ===")
    print(f"  Current step: {state.get('current_step', '?')}")
    print()
    for i, key in enumerate(STEP_KEYS, start=1):
        step = state["steps"].get(key, {})
        status = step.get("status", "pending")
        icon = {"complete": "[OK]", "in_progress": "[>>]", "failed": "[!!]", "pending": "[--]"}.get(status, "[??]")
        print(f"  {i:<5} {STEP_NAMES[key]:<28} {icon} {status}")

    # 2. Log tail (last 50 lines per step log)
    log_dir = vdir / "logs"
    print(f"\n--- Log tails ---")
    if log_dir.exists():
        for lf in sorted(log_dir.glob("step-*.log")):
            lines = lf.read_text(encoding="utf-8").rstrip().split("\n")
            tail = lines[-50:] if len(lines) > 50 else lines
            print(f"\n  {lf.name} ({len(lines)} lines, last {len(tail)}):")
            for line in tail:
                print(f"    {line}")
    else:
        print("  (no logs directory)")

    # 3. Versioned MP4 ffprobe
    versions_dir = vdir / "versions"
    print(f"\n--- Version files ---")
    mp4_files = sorted(versions_dir.glob("*.mp4")) if versions_dir.exists() else []
    if mp4_files:
        for fp in mp4_files:
            duration = pl.get_audio_duration(fp)
            streams = pl.ffprobe_streams(fp) or []
            vcodec = ""
            acodec = ""
            for s in streams:
                if s.get("codec_type") == "video":
                    vcodec = s.get("codec_name", "")
                elif s.get("codec_type") == "audio":
                    acodec = s.get("codec_name", "")
            dur_str = f"{duration:.2f}s" if duration else "?"
            # mean_volume via volumedetect
            mean_volume = "?"
            try:
                r = subprocess.run(
                    ["ffmpeg", "-i", str(fp), "-filter:a", "volumedetect", "-f", "null", "-"],
                    capture_output=True, text=True, timeout=30,
                )
                m = re.search(r"mean_volume\s*=\s*(-?\d+(?:\.\d+)?)\s*dB", r.stderr)
                if m:
                    mean_volume = m.group(1)
            except Exception:
                pass
            print(f"  {fp.name}: dur={dur_str} vcodec={vcodec or '?'} acodec={acodec or '?'} mean_volume={mean_volume}dB")

            # Violation: audio too low
            try:
                if mean_volume != "?" and float(mean_volume) < -40.0:
                    violations.append(f"AUDIO_TOO_LOW: {fp.name} mean_volume={mean_volume}dB < -40dB")
            except ValueError:
                pass
    else:
        print("  (no version MP4s)")

    # 4. Cross-reference log errors against step status
    print(f"\n--- Consistency checks ---")
    if log_dir.exists():
        for lf in sorted(log_dir.glob("step-*.log")):
            text = lf.read_text(encoding="utf-8")
            # Extract step number from filename step-N.log
            m_step = re.match(r"step-(\d+)", lf.stem)
            step_num = int(m_step.group(1)) if m_step else None
            if step_num is not None and step_num <= len(STEP_KEYS):
                key = STEP_KEYS[step_num - 1]
                status = state["steps"].get(key, {}).get("status", "")
                has_error = "ERROR" in text or re.search(r"exit code [1-9]", text)
                if status == "complete" and has_error:
                    violations.append(f"LOG_ERROR: {lf.name} marked complete but log contains errors")
                elif status == "complete":
                    pass  # all good
        if not any("LOG_ERROR" in v for v in violations):
            print("  No log/state mismatches detected.")
    else:
        print("  (no logs directory)")

    # 5. Missing scene MP4s
    scenes = load_scenes(title)
    scenes_dir = vdir / "scenes"
    if scenes:
        missing = [s["id"] for s in scenes if not (scenes_dir / f"scene-{s['id']:02d}.mp4").exists()]
        if missing:
            violations.append(f"MISSING_SCENES: scenes {missing} missing MP4 in {scenes_dir}/")
        else:
            print("  All scene MP4s present.")
    else:
        print("  (no scenes data)")

    # Summary
    print(f"\n=== Audit summary ===")
    if violations:
        print(f"  VIOLATIONS ({len(violations)}):")
        for v in violations:
            print(f"    - {v}")
        sys.exit(1)
    else:
        print("  All checks passed.")
        sys.exit(0)


def cmd_validate(args):
    title = sanitize_title(args.title)
    if not video_dir(title).exists():
        print(f"ERROR: Video directory not found: {video_dir(title)}")
        sys.exit(2)
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py"),
         str(video_dir(title))],
        cwd=REPO_ROOT,
    )
    sys.exit(p.returncode)


# ---------------------------------------------------------------------------
# CLEAN subcommand — manual disk recovery for a single video
# ---------------------------------------------------------------------------

def cmd_clean(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)

    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    keep_v = ren.get("keep_versions", 2)
    safe_title = pl.sanitize_title(title)
    freed = 0

    print(f"=== Cleaning up: {title} ===")

    # 1. voiceover_aligned.mp3
    aligned = vdir / "voiceover_aligned.mp3"
    if aligned.exists():
        sz = aligned.stat().st_size
        aligned.unlink(missing_ok=True)
        freed += sz
        print(f"  Removed: voiceover_aligned.mp3 ({sz/1024/1024:.1f} MB)")

    # 2. dup remotion/public/voiceover/
    dup_dir = vdir / "remotion" / "public" / "voiceover"
    if dup_dir.exists():
        sz = sum(f.stat().st_size for f in dup_dir.rglob("*") if f.is_file())
        shutil.rmtree(dup_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: remotion/public/voiceover/ ({sz/1024/1024:.1f} MB)")

    # 3. Prune old MP4 versions (keep last N)
    to_prune = pl.find_versions_to_prune(
        vdir / "versions", safe_title, r'{title}-v(\d+)\.mp4', keep_v)
    for old in to_prune:
        sz = old.stat().st_size
        old.unlink(missing_ok=True)
        freed += sz
        print(f"  Pruned: {old.name} ({sz/1024/1024:.1f} MB)")

    # 4. Prune old thumbnail PNG versions
    to_prune = pl.find_versions_to_prune(
        vdir / "versions", safe_title, r'{title}-thumbnail-v(\d+)\.png', keep_v)
    for old in to_prune:
        sz = old.stat().st_size
        old.unlink(missing_ok=True)
        freed += sz
        print(f"  Pruned: {old.name} ({sz/1024/1024:.1f} MB)")

    # 5. remotion/node_modules/
    nm_dir = vdir / "remotion" / "node_modules"
    if nm_dir.exists():
        sz = sum(f.stat().st_size for f in nm_dir.rglob("*") if f.is_file())
        shutil.rmtree(nm_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: remotion/node_modules/ ({sz/1024/1024:.1f} MB)")

    # 6. .preview/
    preview_dir = vdir / ".preview"
    if preview_dir.exists():
        sz = sum(f.stat().st_size for f in preview_dir.rglob("*") if f.is_file())
        shutil.rmtree(preview_dir, ignore_errors=True)
        freed += sz
        print(f"  Removed: .preview/ ({sz/1024/1024:.1f} MB)")

    # 7. Scene MP4s (only if configured, default off)
    if ren.get("clean_scene_mp4s_after_stitch", False):
        scenes_dir = vdir / "scenes"
        if scenes_dir.exists():
            for f in scenes_dir.glob("*.mp4"):
                sz = f.stat().st_size
                f.unlink(missing_ok=True)
                freed += sz
                print(f"  Removed: scenes/{f.name} ({sz/1024/1024:.1f} MB)")

    # 8. Reap Remotion TMPDIR
    tmpdir = cfg.get("system", {}).get("temp_dir", "/tmp/remotion")
    tdir = Path(tmpdir)
    if tdir.exists():
        sz = sum(f.stat().st_size for f in tdir.rglob("*") if f.is_file())
        shutil.rmtree(tdir, ignore_errors=True)
        freed += sz
        print(f"  Reaped: Remotion TMPDIR ({sz/1024/1024:.1f} MB)")

    # 9. Rotate logs
    log_dir = vdir / "logs"
    if log_dir.exists():
        for lf in sorted(log_dir.glob("*.log")):
            pl.rotate_log_if_needed(
                lf,
                max_size_mb=ren.get("max_log_size_mb", 0),
                keep_last_n=ren.get("keep_last_n_log_runs", 10),
            )
        print(f"  Rotated logs in: {log_dir}")

    print(f"\nTotal freed: {freed/1024/1024:.1f} MB")


# ---------------------------------------------------------------------------
# PREVIEW subcommand — quick low-res render of scene 1 as a smoke test
# ---------------------------------------------------------------------------

def cmd_preview(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    rdir = vdir / "remotion"
    if not (rdir / "package.json").exists():
        print(f"ERROR: {rdir}/package.json not found (run step 8 first)")
        sys.exit(2)

    # Lint gate before previewing
    ok, msg = lint_gate(title, vdir)
    if not ok:
        print(f"LINT GATE FAILED: {msg}")
        sys.exit(1)

    cfg = load_pipeline_config()
    r = cfg.get("render", {})
    node_max_old = r.get("node_max_old_space_size_mb", 384)
    gl_backend = r.get("gl_backend", "swangle")
    timeout_ms = r.get("timeout_ms", 60000)

    import os as _os
    _os.environ["NODE_OPTIONS"] = f"--max-old-space-size={node_max_old}"

    out_dir = vdir / ".preview"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / "preview-scene-01.mp4"

    # Render only the first 20 frames (≤ ~0.7s) at low quality as a smoke render.
    scenes = load_scenes(title)
    if not scenes:
        print("ERROR: no scenes in scenes.json")
        sys.exit(2)
    first = scenes[0]
    if not first.get("actual_duration_frames"):
        print("ERROR: scene 1 missing actual_duration_frames (run step 6 first)")
        sys.exit(2)
    frame_end = min(20, first["actual_duration_frames"])

    print(f"Previewing scene 1, frames 0-{frame_end} -> {out_file}")
    cmd = (
        f"npx remotion render src/Root.tsx MainVideo \"{out_file}\" "
        f"--frames=0-{frame_end} "
        f"--concurrency 1 "
        f"--gl={gl_backend} "
        f"--image-format jpeg --jpeg-quality 60 "
        f"--codec h264 --x264-preset ultrafast --crf 35 "
        f"--disallow-parallel-encoding "
        f"--timeout {timeout_ms} "
        f"--overwrite --log=warn"
    )
    r1 = run_cmd(cmd, cwd=rdir, check=False,
                 logpath=pl.log_path(title, 9, scene_id="preview"))
    if r1.returncode != 0 or not out_file.exists():
        print("PREVIEW FAILED")
        sys.exit(1)
    print(f"\nPreview rendered: {out_file}")
    print("  Copy/SCP out and play locally to verify visual correctness.")

    # Clean preview dir after successful render
    cfg = load_pipeline_config()
    ren = cfg.get("retention", {})
    if ren.get("clean_preview_after_success", True):
        shutil.rmtree(out_dir, ignore_errors=True)
        print(f"  Cleaned: .preview/")


# ---------------------------------------------------------------------------
# CAPTIONS subcommand — generate SRT sidecar + populate scene caption cues
# ---------------------------------------------------------------------------

def cmd_captions(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)
    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(2)
    if not (vdir / "scenes.json").exists():
        print(f"ERROR: scenes.json not found at {vdir / 'scenes.json'}")
        sys.exit(2)
    p = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "generate_captions.py"),
         str(vdir)],
        cwd=REPO_ROOT,
    )
    sys.exit(p.returncode)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Full video pipeline orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    new_p = sub.add_parser("new", help="Scaffold a new video project")
    new_p.add_argument("title", help="Video title (will be sanitized for directory name)")

    cont_p = sub.add_parser("continue", help="Run the next incomplete pipeline step")
    cont_p.add_argument("title", help="Video title")

    status_p = sub.add_parser("status", help="Show pipeline state")
    status_p.add_argument("title", nargs="?", help="Video title (omit to show all)")

    validate_p = sub.add_parser("validate", help="Validate scenes.json + pipeline_state.json against schemas")
    validate_p.add_argument("title", help="Video title")

    preview_p = sub.add_parser("preview", help="Quick low-res smoke render of scene 1")
    preview_p.add_argument("title", help="Video title")

    captions_p = sub.add_parser("captions", help="Generate SRT sidecar + populate scene captions")
    captions_p.add_argument("title", help="Video title")

    audit_p = sub.add_parser("audit", help="Audit a video project for violations")
    audit_p.add_argument("title", help="Video title")

    clean_p = sub.add_parser("clean", help="Free disk space for a completed video")
    clean_p.add_argument("title", help="Video title")

    args = parser.parse_args()

    if args.command == "new":
        cmd_new(args)
    elif args.command == "continue":
        cmd_continue(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "validate":
        cmd_validate(args)
    elif args.command == "preview":
        cmd_preview(args)
    elif args.command == "captions":
        cmd_captions(args)
    elif args.command == "clean":
        cmd_clean(args)
    elif args.command == "audit":
        cmd_audit(args)
    else:
        parser.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
