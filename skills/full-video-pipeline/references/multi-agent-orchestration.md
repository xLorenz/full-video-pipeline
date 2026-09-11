# Multi-Agent Orchestration — quality-first video production

When a video is long (roughly 30+ scenes) or quality matters more than speed,
do the creative work with scoped subagents instead of doing everything in one
context. One context cannot hold 58 scenes of research, script, style, code,
and audio at full quality — attention thins out and later scenes get worse.
Small agents with small briefs stay sharp to the end.

Proven on a 58-scene, ~706s video (`how-windows-os-works`): 8 workers, all
gates green, audit clean.

## The one principle

**The orchestrator (main session) owns state; workers own bounded files.**

- Only the orchestrator runs `pipeline.py run | continue | complete`. Workers
  never advance state, never call render/voiceover/stitch scripts, never touch
  `pipeline_state.json` or `pipeline_config.json`. Two writers on state is how
  pipelines corrupt — this rule is what makes multi-agent safe.
- Each worker writes an explicitly listed set of files and nothing else. File
  sets are disjoint by construction, so parallel workers cannot conflict.
- Workers return concise summaries (counts, decisions, risks) — never full
  code or prose dumps. The orchestrator verifies with tools, not by reading
  everything (see "Verify, don't trust").

## Topology (what worked)

| Role | Scope | Reads | Writes | Returns |
|------|-------|-------|--------|---------|
| Script (Ph 1) | Steps 1-3 | video-composer stages 1-5 | `SCRIPT.md`, `scenes.json` skeleton | scene count, total estimate, hook/CTA positions, risks |
| Voiceover (Ph 2) | Step 4 | stage-5 delivery | `VOICEOVER.md` only | block count, match confirmation |
| Expansion (conditional) | fix duration drift | stage-5 delivery | the 3 script files, in sync | new char total, new projection |
| Style (Ph 3a) | Step 7 | phase-3 ref (3a-c), stage-6, design skill, layout rules | `STYLES.md`, `visual_notes`, `PLAN.md`, `lib/*`, shared comps | palette, fonts, component APIs, template nominations |
| Builders ×N (Ph 3d) | disjoint scene ranges | phase-3 ref (3d), remotion rules, PLAN.md, styles | only their `SceneXX.tsx` + beats sidecar | files written, beats/scene, deviations, last completed scene |
| Audio (Ph 3 step 8b) | beats verify + cues | sfx-design, catalog | `beats/sfx/bgm/mood` in scenes.json | mood, cue count, strict-validation result |
| Packaging (Ph 4) | Steps 11-12 | stage-2/8/9, phase-4 ref | `TITLE/DESCRIPTION/TAGS.md`, `Thumbnail.tsx` body | title, counts, spotlight, gate results |

Phases 1, 2, and 4 take exactly one agent each. Only Phase 3 fans out —
it is the only phase whose work scales with scene count × craft. Three
builders × ~20 scenes keeps each context manageable; more builders drift in
style faster, fewer risk context loss mid-range.

## The shared-file problem (and the sidecar pattern)

`scenes.json` is minified single-line — parallel edits to it will clobber
each other. So nobody but the orchestrator (sequentially: style, then beats
merge, then audio) edits it. Workers that produce per-scene data write
**sidecar files** instead: builders wrote
`remotion/src/scene-assets/beats-AA-BB.json`, the orchestrator merged all
three into `scenes.json` in one pass and re-ran `validate`. Use this pattern
for any data that lands in a shared file.

Same logic for reads: workers must never whole-read `scenes.json`
(~60KB, one line) or `voiceover_timings.json` (100+ KB). Per-scene data comes
from `python -c` slices and `pipeline.py transcript <title> --scene N`;
logs via `pipeline.py logs <title> --step S [--scene I]`.

## The subagent prompt recipe

Every worker prompt needs the same five parts (copy this shape):

1. **Identity + paths** — role name, working directory, video dir, exact scene
   range. Fresh contexts know nothing; paths must be absolute and exact.
2. **Skills to read first** — the phase reference plus the stage/remotion
   rules for that job, named explicitly. Also name what is *superseded*
   (e.g. remotion's `voiceover.md` `<Audio>` rule — silent-render wins).
3. **Exact outputs** — filenames, formats, and the fixed decisions they must
   not revisit (palette hexes, fonts, component APIs from PLAN.md).
4. **Hard rules** — no pipeline commands, no state/config edits, no files
   outside their set, no whole-file reads. For builders: silent scenes, exact
   frame counts, hand-coded fades, `interpolate`/`spring` only.
5. **Partial-completion protocol** — "if running long, finish a prefix
   completely and report the exact last completed scene." A clean handoff
   beats a truncated range every time; the orchestrator resumes precisely.

## Long runs: chunks, not heroes

The Task tool has no timeout parameter — a stalled subagent stalls its
caller. So workers only ever do bounded creative work. Every long automated
step (pocket TTS, scene renders, stitching) runs in the **main session** in
~20-25 minute foreground chunks, resumed with `continue`/`complete`:

- Idempotency is what makes kills cheap: `voiceover_hash` skips finished
  scenes, `render_hash` skips unchanged renders. A timeout kill wastes at most
  one in-flight scene (writes are atomic).
- Log chunk output to a **file** (`> chunk9b.log 2>&1`), then tail the file.
  Piping a killed command through `Select-Object -Last` emits nothing — the
  progress evidence dies with the process.
- Expect transient failures at scale and retry rather than redesign: isolated
  mid-render Chrome crashes (exit 1, no error text) passed on retry; pocket
  TTS RAM-stops resume scene-by-scene. Only persistent, same-scene failures
  deserve simplification.
- RAM discipline on an 8GB box: free memory before pocket Step 5 (needs
  ~1GB free, not the 534MB floor), and don't run lint/tsc in builders in
  parallel with renders — one global QA gate at the end.

## Quality levers (in order)

1. **Style first, as a single source of truth.** The style agent finishes
   before any builder starts; `lib/styles.ts` is canonical and builders
   import from it. Cross-builder drift is the top quality risk and this is
   the fix.
2. **Calibrate before committing.** `voice-test` before Step 5 caught a 16%
   duration shortfall; expanding narration pre-TTS cost one agent pass,
   versus re-TTS plus re-render later. Same class of move: confirm the vosk
   model exists before Phase 2 (otherwise all scenes degrade to `estimated`
   and word-sync is off the table), and set measured `chars_per_sec`.
3. **Hand-made default, templates by nomination.** Builders hand-code scenes;
   the style agent nominates at most a handful where a template genuinely
   fits — and builders may still decline with a reason (two nominations were
   correctly hand-coded instead in the reference run).
4. **Audio last, cued to reality.** Beats mirror finished animation code
   (never guesses), 1-3 cues per scene from the neutral family unless the
   mood justifies more, `beat:` references over raw seconds.
5. **Verify, don't trust.** Worker summaries are claims: re-run `validate`
   (plus `--strict` for step 8), the lint/typecheck/compositions gate, and
   spot-reads. The reference run's gates caught 6 real defects workers missed
   or introduced (2 strict script findings, a JSX parser quirk needing
   subcomponent extraction, 3 template-config type casts, a missing exit
   fade). `audit` closes the pipeline.

## Scale math (budget before you start)

- Scenes ≈ target seconds ÷ 10. A 600s video is ~55-60 scenes.
- Render precedent: ~1.5 min/scene sequential (≈35 min per 21 scenes, ≈100+
  min per 58). Budget wall-clock from this, in chunks.
- Stitch fragility grows with cast size: past ~40 scenes on Windows, expect
  command-length and probe-timeout pressure in `assemble.py` (hierarchical
  voiceover concat and audio-mapped loudness probes exist for exactly this).
- Pocket TTS rate varies ±15% run-to-run on identical text — projections are
  estimates, so "10 minutes, give or take" means accepting ~9-11.5 min rather
  than cutting good content to chase exactly 600s.

## Anti-patterns

- Workers running `complete`/`continue` or any step script (bypasses gates,
  races state, hides long runs where nobody can chunk them).
- Two agents editing `scenes.json` (or any one-line file) concurrently.
- Whole-file reads of timings/logs/scenes for one scene's data.
- Trusting "all N match" without running `validate` and counting.
- Skipping `voice-test` with a new voice ("we'll fix it at Step 6" means
  re-recording, not tweaking).
- Starting builders before style/PLAN is done, or authoring SFX before the
  animation timings exist.
- Template-per-scene assembly when the brief demands hand-made motion
  graphics — templates are the exception, nominated sparingly.
