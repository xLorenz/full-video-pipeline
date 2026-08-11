# AGENTS.md

Agent-orchestrated autonomous YouTube video production pipeline. The orchestrator skill is the source of truth: **read `skills/full-video-pipeline/SKILL.md` first** before any video task. The root README is stale in places — notably, the root `SKILL.md` it references no longer exists (moved into `skills/full-video-pipeline/`). Per-phase rules live in `skills/full-video-pipeline/references/phase-N-*.md`; read only the current phase's file.

## Protocol (non-negotiable)

- Drive everything through `python3 pipeline.py run|continue|complete <title>`. `complete` validates your creative artifacts AND auto-runs the following automated steps (5-6, 9-10, 13) — it is the fast path; `continue` is the manual/debug path.
- Never manually run `scripts/{render_scene,assemble,render_thumbnail,generate_voiceover,generate_voiceover_pocket,measure_durations}.py` — the orchestrator adds idempotency, atomicity, and logging you would bypass.
- Never edit step-tracking fields in `videos/<title>/pipeline_state.json` (`current_step`, `attempts`, `last_error`, ...). Sole exception: set `"animations_preview_requested": true` to preview animation templates before `complete` on Step 8.
- `complete --step N --force` skips contracts — always run `python3 pipeline.py audit <title>` right after.
- The `__PIPELINE_NEXT__` JSON trailer on every command output tells you exactly what to do next (`next_cmd`, `skills_files`, `expected_artifacts`) — parse it instead of prose.

## Environment

- **Linux-only.** `pipeline.py` hard-exits unless `os.name == "posix"` or `PIPELINE_FORCE_NON_POSIX=1`; render guardrails (psutil, `pkill -f chrome`, swangle) assume Linux. This dev box is Windows — work in WSL.
- Setup: `pip install -r scripts/requirements.txt` (edge-tts, jsonschema, psutil), Node 18+, ffmpeg/ffprobe, `bash scripts/check_system.sh` pre-flight. `requirements-pocket.txt` is only for the optional `pocket` TTS engine.
- `skills/claude-youtube` and `skills/remotion-best-practices` are **git submodules** the phase briefs load skill files from — clone with `--recurse-submodules` or phases 1/3/4 lose their instructions.

## Structure quirks

- `videos/` is gitignored scratch (one dir per title). Per-video `videos/<title>/pipeline_config.json` is auto-discovered and overrides the repo-root `pipeline_config.json`, which `--config <path>` can also override (three-layer merge).
- **Audio contract**: scenes render *silent* video; the voiceover is muxed at stitch time by `assemble.py`. Never put the voiceover `<Audio>` in a `SceneXX.tsx` — the `remotion-best-practices` submodule's voiceover guidance is superseded by this rule.
- npm workspaces: `remotion-foundation` + `videos/*/remotion` (Remotion pinned to 4.0.484). Completed videos usually have `remotion/node_modules/` deleted by retention cleanup — run `npm install` there before re-rendering. Lint gate before render: `npm run lint` (and `tsc --noEmit`) inside the remotion project.
- `animations/` is a JSON-data-driven template catalog: customize via `config/` + each template's `animation.md`, **never edit `component.tsx`**. Per-video copies under `remotion/src/components/animations/` are re-published from `animations/` on every scaffold — per-video `.tsx` edits are silently overwritten. Configs are validated against `schemas/animations.schema.json` + the template's own `config/schema.json`.