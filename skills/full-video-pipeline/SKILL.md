---
name: full-video-pipeline
description: >
  End-to-end autonomous YouTube video production pipeline: researches a topic,
  writes a retention-optimized script, generates TTS voiceover, builds and
  renders a Remotion video composition, stitches the final MP4, writes YouTube
  title/description/tags, and renders a Remotion-only thumbnail (no AI image
  generation). Entirely driven by `pipeline.py run` / `continue` / `complete` —
  the agent follows an explicit execution protocol and never hand-rolls scenes,
  calls the render/voiceover/stitch scripts directly, or advances pipeline
  state itself. Use this skill whenever someone asks to make, script, voice,
  render, or publish a YouTube (or similar short-form) video, or mentions this
  pipeline, `pipeline.py`, Remotion scene rendering, retention scripting, or
  YouTube thumbnails/metadata — even if they don't say the word "pipeline."
  Linux only. The default `edge` voiceover engine is lightweight; the optional
  offline `pocket` engine needs meaningfully more RAM (see Prerequisites below).
triggers:
  - "make a video"
  - "create a youtube video"
  - "video pipeline"
  - "autonomous video"
  - "research and script"
  - "render video"
  - "youtube thumbnail"
  - "video metadata"
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

> 4 phases take a topic idea and produce a fully rendered YouTube video with
> voiceover, visuals, audio, title/description/tags, and a Remotion-generated
> thumbnail. Each phase has one creative block (you do the work) followed by
> automated steps (the orchestrator runs them).

This file covers what applies across every phase: the execution protocol, the
non-negotiable rules, and where to find each phase's detailed instructions.
Phase-specific templates, contracts, and validation checklists live in
`references/phase-N-*.md` — read the relevant one when you reach that phase,
not before. Directory layout is in `references/directory-structure.md` and
full voiceover-engine details are in `references/voiceover-engines.md`.

## Prerequisites

Before running the pipeline, verify system readiness:

```bash
bash scripts/check_system.sh
pip install -r scripts/requirements.txt   # edge-tts, jsonschema, psutil
```

If pre-flight fails, resolve issues before proceeding. Required:

- **Linux only.** The render guardrails in `render_scene.py` rely on
  Linux-specific process/RAM handling (`psutil`, `pkill -f chrome`) and
  rendering uses the `swangle` software GL backend. Don't tell a user this
  works on macOS/WSL or offer to run it there — it isn't supported, and
  guardrails may silently behave differently or not at all.
- `node` + `npm` (Node.js 18+, for Remotion)
- `python3` (3.9+) + `pip` (for edge-tts and helper scripts)
- `ffmpeg` + `ffprobe` (for audio/video processing)
- `git` (for cloning skill references)

Optional — `pocket` voiceover engine (see `references/voiceover-engines.md`
for the full picture):
- Python 3.10+ and `pip install -r scripts/requirements-pocket.txt` (adds
  PyTorch, ~1GB)
- **≥1 GB free RAM at Step 5, not 500MB.** The wrapper hard-refuses below
  534MB (234MB model + 300MB safety margin), but real headroom during
  generation can still drop to 50-200MB even when that pre-check passes.
  Treat 534MB as the wrapper's hard floor, not a safe target — a `t3.small`
  (2GB RAM) or better is the realistic minimum.

## Execution Protocol (READ FIRST — DO NOT SKIP)

The pipeline is driven by **one entry point** and **two commands**:

| Command | Use |
|---------|-----|
| `python3 pipeline.py run <title>` | **Recommended one-shot**: scaffold (if dir absent) and print Phase 1 brief. Safe to re-run — resumes an existing project. |
| `python3 pipeline.py continue <title>` | Print the next pending step's brief (creative) or run one automated step. |
| `python3 pipeline.py complete <title>` | After producing a creative phase's artifacts, validate them, advance state, and **auto-run all consecutive automated steps** in one invocation. |

### The inviolable loop

```text
1. Run: python3 pipeline.py run <title>                  # or `continue <title>` if resuming
2. READ the output. It prints a phase brief with phases like:
   (a) "All steps complete!"                            → STOP. You are done.
   (b) "Phase N: <n> — Step Nn: <n>" + rules      → Do the work (web search,
                                                          write files, write Remotion
                                                          code). Then run `complete`.
   (c) The orchestrator already auto-ran an automated   → Verify success, then GO TO 1.
       step after a creative `complete`.
   (d) "FAILED" / "VALIDATION FAILED"                   → READ the error, fix the named
                                                          file, then GO TO 1.
```

After you finish a creative phase's work, run `python3 pipeline.py complete <title>`.
`complete` validates your artifacts, advances state, then **auto-runs all consecutive
automated steps** (Steps 5-6 after Phase 2; Steps 9-10 after Phase 3; Step 13 after
Phase 4) in one invocation. You do NOT call `continue` between phases — `complete`
both validates AND drives the next automated steps, ending at the next creative phase
brief (or "All steps complete!").

### Hard rules (non-negotiable)

- **Never manually invoke** `render_scene.py`, `assemble.py`, `render_thumbnail.py`,
  `generate_voiceover.py`, `generate_voiceover_pocket.py`, or `measure_durations.py`
  yourself. The orchestrator runs them with idempotency checks, lint gates,
  atomic writes, and per-step logging that you would bypass.
- **Don't hand-edit `pipeline_state.json`'s step-tracking fields** — `current_step`,
  per-step `attempts`, `last_error`, `render_status`, and similar. Treat those as
  orchestrator-owned; inspect them with `python3 pipeline.py status <title>` instead
  of reading or editing the file directly. The one documented exception is the
  `animations_preview_requested` request flag described in
  `references/phase-3-visuals-render.md` — that field exists specifically for you
  to set before running `complete` on Step 8. Nothing else in this file is yours
  to write.
- **Always let the orchestrator validate.** After every creative phase your
  output is re-checked against the JSON schemas before the next automated step
  is allowed to run. If validation fails, fix the offending file (SCRIPT.md,
  scenes.json, etc.) and re-run `complete`.
- **One phase at a time.** Do not pre-load references or start writing code for
  Phase 3 while still on Phase 1. Run `continue`/`complete`, see what phase is
  requested, do only that phase's work, then proceed.
- **`complete --step N` is refused if earlier steps are still pending**, unless
  you pass `--force` — the contracts between phases matter, so don't skip ahead
  casually. If you do use `--force`, run `python3 pipeline.py audit <title>`
  immediately after, so the gap it creates gets flagged instead of silently
  carried forward.

### Skill file loading

Each creative phase prints a "Follow these instructions:" block listing the skill files you
must read for that phase's rules. These files live under `skills/` and contain the detailed
rules for script writing, Remotion coding, SEO metadata, and thumbnail design. The paths
are configured in `pipeline_config.json` under `skills.sources` and can be overridden per
video via `videos/<title>/pipeline_config.json`.

### The 4 phases

| Phase | Steps | You produce | Auto-runs after `complete` | Details |
|-------|-------|-------------|-----------------------------|---------|
| Phase 1: Research & Script | 1-3 | `SCRIPT.md`, `scenes.json` | (none — Step 4 is creative) | `references/phase-1-research-script.md` |
| Phase 2: Voiceover | 4-6 | `VOICEOVER.md` | Steps 5, 6 | `references/phase-2-voiceover.md` |
| Phase 3: Visuals & Render | 7-10 | `STYLES.md`, Remotion project (PLAN.md, Root.tsx, MainVideo.tsx, Thumbnail.tsx stub, lib/*, scenes/SceneXX.tsx) | Steps 9, 10 | `references/phase-3-visuals-render.md` |
| Phase 4: Metadata & Thumbnail | 11-13 | `TITLE.md`, `DESCRIPTION.md`, `TAGS.md`, `Thumbnail.tsx` | Step 13 | `references/phase-4-metadata-thumbnail.md` |

> Steps 1 and 2 produce in-context decisions/notes (no files). `complete` for
> those steps only runs the schema gate and advances state.

## Audio Path (IMPORTANT — overrides Remotion skill rules)

Voiceover is **NOT** baked into scene MP4s. Scene components render **silent**
video only — do NOT use `<Audio>` in `SceneXX.tsx` for the voiceover (background
music/SFX, if any, are still fine via `<Audio>`). At stitch time,
`scripts/assemble.py` concatenates the per-scene MP3s into one
`voiceover_aligned.mp3` and muxes it onto the concatenated scene MP4s in a
single ffmpeg pass. This is why it matters, not just a style rule:

- Avoids Chrome decoding/syncing audio once per scene (faster renders)
- Keeps exactly one audio encode pass total (fastest path for low-RAM boxes)
- Relies on `actual_duration_frames` matching voiceover durations exactly
  (enforced by Step 6) — a scene that bakes in its own audio can drift out of
  sync with the muxed track and nothing downstream will catch it

The `remotion-best-practices` submodule may document `<Audio>` / voiceover
patterns of its own. Those are **superseded for this pipeline** — render
silent, mux at stitch. This rule is restated (not duplicated in detail) in
the Phase 3 reference where you'll actually be writing scene code.

## Optional: Captions

After Phase 2 (`complete` auto-runs Steps 5-6), you can generate captions:

```bash
python3 pipeline.py captions <title>
```

This produces `videos/<title>/<title>.srt` (YouTube sidecar) and populates
per-scene `captions` cues in `scenes.json`. To burn captions into the video,
set `video.burn_captions: true` in `pipeline_config.json` — the scaffolded
`MainVideo.tsx` will then render a `<Captions>` component from
`remotion-foundation` when a scene has captions and `showCaptions` is true.
Off by default to preserve render performance.

## Configuration

Defaults are in `pipeline_config.json`. Override per-video as needed:

- `video.fps`, `video.width`, `video.height` — composition settings
- `video.burn_captions` — render `<Captions>` layer when scene has cues (default `false`)
- `voiceover.engine` — `edge` (default) or `pocket` (optional CPU neural TTS;
  see `references/voiceover-engines.md`)
- `voiceover.voice` — TTS voice name. For `edge`: Azure neural voice (`edge-tts --list-voices`). For `pocket`: a named preset voice (full catalog in the voiceover-engines reference)
- `voiceover.language` — pocket-tts language model (default `english`; non-English `*_24l` variants are heavier)
- `voiceover.no_quantize` — disables int8 quantization of the pocket model (default `false` — quantization has no measurable quality loss and halves runtime memory)
- `render.*` — rendering guardrails (concurrency, codec, memory limits)
- `system.*` — resource thresholds
- `retention.*` — disk cleanup flags (see "Disk Cleanup" below)
- `skills.sources` — skill file paths per phase (each entry has `name`, `path`, `phases` mapping)
- `steps.{step_key}.command_template` — plugin escape hatch for automated step commands
- `config_files.auto_discover_per_video` — enable/disable per-video config discovery (default `true`)

## Disk Cleanup

The pipeline accumulates files across runs. Retention is controlled by the
`retention` key in `pipeline_config.json` (all optional, sensible defaults):

| Flag | Default | Effect |
|------|---------|--------|
| `keep_versions` | `2` | Keep only the N most recent MP4 + thumbnail PNG versions |
| `clean_voiceover_aligned_after_stitch` | `true` | Delete `voiceover_aligned.mp3` after stitch succeeds |
| `clean_remotion_node_modules_after_step_13` | `true` | Delete `remotion/node_modules/` after the final step completes |
| `clean_preview_after_success` | `true` | Delete `.preview/` after a successful smoke preview |
| `reap_remotion_tmpdir_after_render` | `true` | Delete Remotion TMPDIR after each render (saves disk, forfeits bundle-cache speed) |
| `clean_scene_mp4s_after_stitch` | `false` | Delete `scenes/*.mp4` after stitch — **re-stitch requires re-render** |
| `max_log_size_mb` | `0` | Rotate logs when they exceed this size (0 = unlimited, no rotation) |
| `keep_last_n_log_runs` | `10` | Keep at most this many rotated log archives |

To force-clean a completed video (respects `keep_versions` and
`clean_scene_mp4s_after_stitch`; clears everything else unconditionally):

```bash
python3 pipeline.py clean <title>
```

## Error Recovery

| Error | Recovery |
|-------|----------|
| `edge-tts` network failure | Step 5 retries each scene once after 5s backoff. Re-run `complete` — unchanged scenes skipped (idempotent). |
| pocket-tts insufficient RAM at start | Wrapper refuses to load model and exits 2 with a diagnostic. Free RAM on the host (kill chrome, drop caches) or switch `voiceover.engine` back to `edge` in the per-video config. |
| pocket-tts mid-batch RAM pressure | Wrapper records a WARN and exits 1; scenes generated before the pressure point are on disk with valid hashes. Re-run `complete` — generated scenes skip, the rest resume. If persistent, reduce `voiceover.language` to the default `english` (avoid `*_24l`) and ensure `voiceover.no_quantize: false`. |
| pocket-tts model-download failure (first run) | One-time HuggingFace download of weights (~215 MB) failed. Re-run `complete`; HF resumes partial downloads. |
| pocket-tts ImportError | Run `pip install -r scripts/requirements-pocket.txt`. Base `requirements.txt` does NOT install pocket-tts (optional engine). |
| Remotion render OOM | Scene's `last_render_error` records the OOM. `render_attempts` incremented. Kill Chrome (`pkill -f chrome`), wait 60s, re-run `continue` to retry just that scene. If persistent, reduce `node_max_old_space_size_mb` or video resolution in `pipeline_config.json`. |
| Remotion render timeout | Increase `timeout_ms` in config, or simplify the scene's visual complexity. |
| ffmpeg stitch failure | `assemble.py` validates inputs first; on codec/resolution mismatch across scenes it falls back to re-encoding. Re-run `complete`. |
| Disk full | Run `rm -rf videos/{title}/remotion/node_modules` to free space, or `python3 pipeline.py clean <title>`. |
| Schema validation fails | `complete` refuses to advance. Run `python3 pipeline.py validate <title>` to see violations and fix the offending JSON. |
| Lint gate fails before render | Fix TypeScript/lint errors in the Remotion project (`cd videos/<title>/remotion && npm run lint`). `tsc --noEmit` errors must also be resolved. |
| Metadata step fails | `complete` re-runs the creative Step 11. Check `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` are present and valid. |
| Thumbnail composition fails lint | Fix `Thumbnail.tsx` TypeScript/lint errors. Remove any AI image references. |
| Thumbnail still render fails | Check logs in `videos/<title>/logs/step-13.log`. Ensure `Thumbnail` composition is registered in `Root.tsx` and passes `remotion compositions`. |
| `complete --step N` refused | Earlier steps incomplete — pass `--force` only if you understand the gap, and run `audit` right after (see Hard rules). |

State forensics: each step's `pipeline_state.json` entry carries `attempts`,
`last_error`, and `last_attempt_at` — read these via `pipeline.py status`,
don't parse the file yourself. Scene-level failures record `render_attempts`
and `last_render_error` per scene in `scenes.json`. The `__PIPELINE_NEXT__` JSON
trailer at the end of every command output is machine-readable — it includes
`step`, `kind`, `action`, `phase`, `next_cmd`, `skills_section`, `skills_files`,
`expected_artifacts`.

## Resuming Interrupted Pipelines

Both `python3 pipeline.py run <title>` and `python3 pipeline.py continue <title>`
are resume-safe: they validate `scenes.json` + `pipeline_state.json` against
schemas (refusing to run automated steps on invalid state), read
`pipeline_state.json` to find the next incomplete step, and either run the
next automated step (5, 6, 9, 10, or 13) or print the next creative phase's
brief. Per-step attempts and `last_error` are recorded for forensics. See
"The 4 phases" table above for which steps are automated vs. creative — that
mapping doesn't change on resume.

## Helper Scripts

```bash
# Pipeline CLI
python3 pipeline.py --config custom.json run "my-video"  # Override config (any subcommand)
python3 pipeline.py run "my-video"             # One-shot: scaffold (if absent) + advance
python3 pipeline.py new "my-video"             # Scaffold project only
python3 pipeline.py continue my-video          # Run next step (creative brief or automated)
python3 pipeline.py complete my-video          # Validate current creative phase + auto-run next automated steps
python3 pipeline.py status my-video            # Show specific project (with attempts column)
python3 pipeline.py status                     # Show all projects
python3 pipeline.py validate my-video          # Standalone schema validation
python3 pipeline.py validate my-video --step 6 # Step-specific requirements
python3 pipeline.py preview my-video           # Smoke-render scene 1
python3 pipeline.py captions my-video          # Generate SRT + populate captions
python3 pipeline.py audit my-video             # Audit for violations — always run after a --force
python3 pipeline.py doctor my-video            # System + project diagnostics
python3 pipeline.py clean my-video             # Free disk space (all safe-to-delete items)
python3 pipeline.py complete my-video --step 7 --force  # Out-of-order override (use with care, then audit)
```
