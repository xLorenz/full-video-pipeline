# Troubleshooting

## Error Recovery

| Error | Recovery |
|-------|----------|
| `edge-tts` network failure | Step 5 retries each scene once after 5s backoff. Re-run `complete` — unchanged scenes skipped (idempotent). |
| HyperFrames render OOM | Scene's `last_render_error` records the OOM. `render_attempts` incremented. Kill Chrome (`pkill -f chrome`), wait 60s, re-run `continue` to retry just that scene. If persistent, reduce `render.workers` or video resolution in `pipeline_config.json`. |
| HyperFrames render timeout | Increase `render.timeout_ms` in config, or simplify the scene's visual complexity. |
| ffmpeg stitch failure | `assemble.py` validates inputs first; on codec/resolution mismatch across scenes it falls back to re-encoding. Re-run `complete`. |
| Disk full | Run `rm -rf videos/{title}/hyperframes/node_modules` to free space, or `python3 pipeline.py clean <title>`. |
| Schema validation fails | `complete` refuses to advance. Run `python3 pipeline.py validate <title>` to see violations and fix the offending JSON. |
| Lint gate fails before render | Fix HTML/lint errors in the HyperFrames project (`cd videos/<title>/hyperframes && npm run lint`). The `npx hyperframes compositions --json` gate must also pass — every `scene-NN.html` must appear in its output. |
| Metadata step fails | `complete` re-runs the creative Step 11. Check `TITLE.md`, `DESCRIPTION.md`, `TAGS.md` are present and valid. |
| Thumbnail composition fails lint | Fix `compositions/thumbnail.html`. Remove any AI image references and external URL fetches. Verify `data-composition-id="thumbnail"`. |
| Thumbnail render fails | Check logs in `videos/<title>/logs/step-13.log`. Ensure `compositions/thumbnail.html` exists and passes `npx hyperframes compositions --json`. |
| `complete --step N` refused | Earlier steps incomplete — pass `--force` only if you understand the gap will be flagged by `audit`/`doctor`. |
| A `skills/...` file listed in a "Follow these instructions" block doesn't exist | Not a pipeline bug — that skill bundle isn't populated yet in this checkout. Fall back per the "Skill file loading" rule in `SKILL.md`; don't stall or fabricate the missing file's contents. |

State forensics: each step's `pipeline_state.json` entry carries `attempts`,
`last_error`, and `last_attempt_at`. Scene-level failures record `render_attempts`
and `last_render_error` per scene in `scenes.json`. The `__PIPELINE_NEXT__` JSON
trailer at the end of every command output is machine-readable — it includes
`step`, `kind`, `action`, `phase`, `next_cmd`, `skills_section`, `skills_files`,
`expected_artifacts`.

```json
__PIPELINE_NEXT__ {"step":3,"name":"Script Writing","kind":"creative","action":"await_complete","exit":0,"phase":1,"next_cmd":"python3 pipeline.py complete my-video","skills_section":"#phase-1-research--script","skills_files":["skills/claude-youtube/skills/claude-youtube/sub-skills/script.md","skills/claude-youtube/skills/claude-youtube/references/retention-scripting-guide.md"],"expected_artifacts":["SCRIPT.md"]}
```

Fields: `step` (0 for terminal), `kind` (`creative`/`automated`/`done`),
`action` (`await_complete`/`run_continue`/`fix_and_continue`/`use_continue`/`noop`/`done`),
`phase` (1-4, 0 for terminal), `next_cmd` (exact command to run next),
`skills_section` (SKILL.md anchor), `skills_files` (skill file paths for the phase),
`expected_artifacts` (files to produce).

## Resuming Interrupted Pipelines

Use `python3 pipeline.py run <title>` (resume-safe: detects existing project and
calls `continue`) or `python3 pipeline.py continue <title>` to resume:

1. Validates `scenes.json` + `pipeline_state.json` against schemas (`validate.py`).
   Refuses to run automated steps on invalid state.
2. Reads `pipeline_state.json` to find the next incomplete step.
3. Runs the next automated step (5, 6, 9, 10, or 13), or
4. Prints the next creative phase's brief (Steps 1-4, 7, 8, 11, 12).
5. Per-step attempts and `last_error` recorded for forensics.

Each video tracks progress in `pipeline_state.json`:
- Steps 1-4: creative input required (topic, research, script, voiceover text)
- Steps 5-6: automated (TTS generation [idempotent], duration measurement)
- Steps 7-8: creative input required (style definition, HyperFrames composition authoring)
- Steps 9-10: automated (resumable scene rendering, atomic stitching)
- Steps 11-12: creative input required (metadata, thumbnail composition)
- Step 13: automated (thumbnail render, idempotent via versioning)
