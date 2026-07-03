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

REPO_ROOT = Path(__file__).resolve().parent
PIPELINE_CONFIG = REPO_ROOT / "pipeline_config.json"
FOUNDATION_DIR = REPO_ROOT / "remotion-foundation"
SCHEMA_PATH = REPO_ROOT / "schemas" / "pipeline_state.schema.json"


class CmdError(Exception):
    """Raised when a subprocess command fails."""
    def __init__(self, returncode, cmd):
        self.returncode = returncode
        self.cmd = cmd
        super().__init__(f"Command failed (exit {returncode}): {cmd}")

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
}

SKIP_STEPS = {"1_topic_selection", "2_research", "3_script_writing",
              "4_voiceover_writing", "7_style_definition", "8_remotion_coding"}

SKIP_INSTRUCTIONS = {
    "1_topic_selection": (
        "Select a specific, trending topic for the video.\n"
        "  1. Perform 3-5 web searches to identify trending topics.\n"
        "  2. Choose the most promising topic.\n"
        "  3. State the chosen topic clearly.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "2_research": (
        "Research the topic thoroughly.\n"
        "  1. Perform 5-10 targeted web searches.\n"
        "  2. Compile key facts, statistics, expert quotes, examples.\n"
        "  3. Verify critical claims with at least 2 sources.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "3_script_writing": (
        "Write the retention-optimized script.\n"
        "  1. Load skills/claude-youtube skill references.\n"
        "  2. Write SCRIPT.md in scene-based format (~10s per scene).\n"
        "  3. Write scenes.json with structured scene data.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "4_voiceover_writing": (
        "Extract voiceover text into parseable format.\n"
        "  1. Read SCRIPT.md.\n"
        "  2. Write VOICEOVER.md with ---SCENE:N--- delimiters.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "7_style_definition": (
        "Define visual style for the video.\n"
        "  1. Read the topic, script tone, and target audience.\n"
        "  2. Choose color palette, typography, background, animation style.\n"
        "  3. Write STYLES.md.\n"
        "  4. Update scenes.json with visual_notes for each scene.\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
    "8_remotion_coding": (
        "Implement the Remotion project code.\n"
        "  1. Load skills/remotion-best-practices skill references.\n"
        "  2. Write remotion/PLAN.md with implementation plan.\n"
        "  3. Copy voiceover files to remotion/public/voiceover/.\n"
        "  4. Write src/Root.tsx with single <Composition id=\"MainVideo\">.\n"
        "  5. Write src/lib/config.ts, src/lib/styles.ts.\n"
        "  6. Write shared components in src/components/.\n"
        "  7. Write each scene component in src/scenes/SceneXX.tsx.\n"
        "  8. Verify: cd remotion && npm run lint\n"
        "  Then run: ./pipeline.py continue <title>"
    ),
}


def load_pipeline_config():
    """Load global pipeline configuration."""
    if not PIPELINE_CONFIG.exists():
        print(f"WARNING: pipeline_config.json not found at {PIPELINE_CONFIG}")
        return {}
    with open(PIPELINE_CONFIG, "r") as f:
        return json.load(f)


def video_dir(title):
    return REPO_ROOT / "videos" / title


def state_path(title):
    return video_dir(title) / "pipeline_state.json"


def scenes_json_path(title):
    return video_dir(title) / "scenes.json"


def load_state(title):
    p = state_path(title)
    if not p.exists():
        print(f"ERROR: No pipeline_state.json found for '{title}'")
        print(f"  Expected at: {p}")
        sys.exit(1)
    with open(p, "r") as f:
        return json.load(f)


def save_state(title, state):
    p = state_path(title)
    with open(p, "w") as f:
        json.dump(state, f, indent=2)


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sanitize_title(title):
    """Convert title to safe directory name."""
    safe = title.lower()
    safe = re.sub(r"[^a-z0-9]+", "-", safe)
    safe = safe.strip("-")
    if not safe:
        raise ValueError(f"Title '{title}' produces empty directory name after sanitization")
    return safe


def run_cmd(cmd, cwd=None, check=True):
    """Run a shell command and stream output."""
    print(f"  $ {cmd}")
    result = subprocess.run(
        cmd, shell=True, cwd=cwd,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    if result.stdout:
        for line in result.stdout.rstrip().split("\n"):
            print(f"  | {line}")
    if check and result.returncode != 0:
        print(f"  ERROR: Command failed with exit code {result.returncode}")
        raise CmdError(result.returncode, cmd)
    return result


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
        rdir / "public" / "voiceover",
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

    # Create Root.tsx — single composition with calculateMetadata
    (rdir / "src" / "Root.tsx").write_text(
        'import React from "react";\n'
        'import { Composition } from "remotion";\n'
        'import type { VideoProps } from "remotion-foundation";\n'
        'import { FPS, WIDTH, HEIGHT } from "./lib/config";\n'
        'import { MainVideo } from "./components/MainVideo";\n'
        '\n'
        'export const RemotionRoot: React.FC = () => {\n'
        '  return (\n'
        '    <Composition\n'
        '      id="MainVideo"\n'
        '      component={MainVideo}\n'
        '      calculateMetadata={async ({ props }) => {\n'
        '        const totalFrames = props.scenes.reduce(\n'
        '          (sum, s) => sum + s.durationInFrames, 0\n'
        '        );\n'
        '        return {\n'
        '          durationInFrames: totalFrames,\n'
        '          fps: props.fps,\n'
        '          width: props.width,\n'
        '          height: props.height,\n'
        '        };\n'
        '      }}\n'
        '      defaultProps={{\n'
        '        scenes: [],\n'
        '        fps: FPS,\n'
        '        width: WIDTH,\n'
        '        height: HEIGHT,\n'
        '      } as VideoProps}\n'
        '    />\n'
        '  );\n'
        '};\n'
    )

    # Create placeholder MainVideo component
    (rdir / "src" / "components" / "MainVideo.tsx").write_text(
        'import React, { useMemo } from "react";\n'
        'import { AbsoluteFill, Sequence } from "remotion";\n'
        'import type { VideoProps } from "remotion-foundation";\n'
        '\n'
        'const SCENE_COMPONENTS: Record<number, React.LazyExoticComponent<React.FC>> = {};\n'
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
        'export const MainVideo: React.FC<VideoProps> = ({ scenes }) => {\n'
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
        '        return (\n'
        '          <Sequence\n'
        '            key={scene.id}\n'
        '            from={offsets[i]}\n'
        '            durationInFrames={scene.durationInFrames}\n'
        '          >\n'
        '            <React.Suspense fallback={null}>\n'
        '              <SceneComponent />\n'
        '            </React.Suspense>\n'
        '          </Sequence>\n'
        '        );\n'
        '      })}\n'
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
    """Voiceover generation."""
    print("--- Running Step 5: Voiceover Generation ---")
    config = load_pipeline_config()
    voice = config.get("voiceover", {}).get("voice", "en-GB-RyanNeural")
    run_cmd(f"python3 scripts/generate_voiceover.py videos/{title}/ --voice {voice}",
            cwd=REPO_ROOT)

    # Verify output
    scenes = load_scenes(title)
    for s in scenes:
        vf = vdir / (s.get("voiceover_file") or "")
        if not vf.exists():
            print(f"  WARNING: Voiceover file missing for scene {s['id']}: {vf}")
    return True


def run_step_6(title, vdir):
    """Duration measurement."""
    print("--- Running Step 6: Duration Measurement ---")
    run_cmd(f"python3 scripts/measure_durations.py videos/{title}/",
            cwd=REPO_ROOT)

    # Verify all durations are populated
    scenes = load_scenes(title)
    for s in scenes:
        if s.get("actual_duration_frames") is None:
            print(f"  ERROR: Scene {s['id']} missing actual_duration_frames")
            return False
    return True


def run_step_9(title, vdir):
    """Scene rendering — one scene at a time."""
    print("--- Running Step 9: Scene Rendering ---")
    scenes = load_scenes(title)
    for s in scenes:
        sid = s["id"]
        status = s.get("render_status", "pending")
        if status == "rendered":
            print(f"  Scene {sid}: already rendered, skipping")
            continue
        print(f"\n  Rendering scene {sid}/{len(scenes)}: {s.get('title', '')}")
        run_cmd(f"bash scripts/render_scene.sh videos/{title}/ {sid}",
                cwd=REPO_ROOT)
    return True


def run_step_10(title, vdir):
    """Stitching — new efficient path via assemble.py."""
    print("--- Running Step 10: Stitching (assemble.py) ---")
    run_cmd(f"python3 scripts/assemble.py videos/{title}/",
            cwd=REPO_ROOT)
    return True


def load_scenes(title):
    p = scenes_json_path(title)
    if not p.exists():
        return []
    with open(p, "r") as f:
        data = json.load(f)
    return data.get("scenes", [])


def cmd_continue(args):
    title = sanitize_title(args.title)
    vdir = video_dir(title)

    if not vdir.exists():
        print(f"ERROR: Video directory not found: {vdir}")
        sys.exit(1)

    state = load_state(title)
    step_num, step_key = find_next_step(state)

    if step_num is None:
        print(f"All steps complete for '{title}'!")
        return

    step_name = STEP_NAMES.get(step_key, step_key)
    print(f"=== Continuing pipeline: {title} ===")
    print(f"  Next step: {step_num}. {step_name}")

    if step_key in SKIP_STEPS:
        print(f"\nStep {step_num} ({step_name}) requires creative input.\n")
        print(SKIP_INSTRUCTIONS[step_key])
        return

    # Mark step as in-progress
    state["steps"][step_key]["status"] = "in_progress"
    save_state(title, state)

    # Run the step
    success = False
    try:
        if step_key == "5_voiceover_generation":
            success = run_step_5(title, vdir)
        elif step_key == "6_duration_measurement":
            success = run_step_6(title, vdir)
        elif step_key == "9_scene_rendering":
            success = run_step_9(title, vdir)
        elif step_key == "10_stitching":
            success = run_step_10(title, vdir)
    except CmdError as e:
        print(f"\n  ERROR: Command failed with exit code {e.returncode}")
        success = False
    except Exception as e:
        print(f"\n  ERROR: {type(e).__name__}: {e}")
        success = False

    if success:
        state["steps"][step_key]["status"] = "complete"
        state["steps"][step_key]["completed_at"] = now_iso()
        state["current_step"] = min(step_num + 1, 10)
        save_state(title, state)
        print(f"\n=== Step {step_num} ({step_name}) complete ===")

        # Check if there's a next step
        next_num, next_key = find_next_step(state)
        if next_num is None:
            print("\nAll steps complete! Final video is in versions/.")
        elif next_key in SKIP_STEPS:
            print(f"\nNext: Step {next_num} ({STEP_NAMES[next_key]}) — requires creative input.")
            print(f"Run: ./pipeline.py continue {title}")
        else:
            print(f"\nNext: Step {next_num} ({STEP_NAMES[next_key]}) — automated.")
            print(f"Run: ./pipeline.py continue {title}")
    else:
        state["steps"][step_key]["status"] = "failed"
        state["steps"][step_key]["error"] = "Step failed, check output above"
        save_state(title, state)
        print(f"\n=== Step {step_num} ({step_name}) FAILED ===")
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
        sys.exit(1)

    state = load_state(title)
    print(f"=== Pipeline Status: {title} ===")
    print(f"  Current step: {state.get('current_step', '?')}")
    print()
    print(f"  {'Step':<5} {'Name':<28} {'Status':<12} {'Completed'}")
    print(f"  {'-----':<5} {'----------------------------':<28} {'------------':<12} {'--------------------':<20}")
    for i, key in enumerate(STEP_KEYS, start=1):
        step = state["steps"].get(key, {})
        status = step.get("status", "pending")
        completed = step.get("completed_at", "")
        icon = {"complete": "[OK]", "in_progress": "[>>]", "failed": "[!!]", "pending": "[--]"}.get(status, "[??]")
        print(f"  {i:<5} {STEP_NAMES[key]:<28} {icon} {status:<10} {completed}")


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
                with open(sp, "r") as f:
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

    args = parser.parse_args()

    if args.command == "new":
        cmd_new(args)
    elif args.command == "continue":
        cmd_continue(args)
    elif args.command == "status":
        cmd_status(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
