# Phase 2: Voiceover (Steps 4-6)

**Goal**: Extract TTS-ready text into `VOICEOVER.md`. Steps 5-6 (audio generation
and duration measurement) auto-run after `complete`.

## Action

1. Read `SCRIPT.md`.
2. Extract the "Voiceover:" line from each scene.
3. Write `VOICEOVER.md` per the format below.

## Rules

- Every scene from `scenes.json` has a corresponding `---SCENE:N---` block.
- No empty voiceover blocks.
- Text is clean — no stage directions, no markdown formatting, just spoken words.
- Scene count in VOICEOVER.md matches scenes.json scene count.
- SFX/BGM cues are NOT part of this phase — they are authored at Step 8 where animation
  timings exist (see the Audio Path section in SKILL.md).

## VOICEOVER.md format

```markdown
# VOICEOVER
---SCENE:1---
[Exact voiceover text for scene 1 — what TTS will speak]
---END---
---SCENE:2---
[Exact voiceover text for scene 2]
---END---
```

## Validation (Phase 2)

- Scene count in VOICEOVER.md == `scenes.json` scene count.
- Every block has non-empty text.

## When done

```bash
python3 pipeline.py complete <title>
```

`complete` validates `VOICEOVER.md` exists, marks Step 4 done, then **auto-runs**:

- **Step 5 (Voiceover Generation)**: Runs `generate_voiceover.py` (edge) or
  `generate_voiceover_pocket.py` (when `voiceover.engine == "pocket"` via the
   per-video `steps.5_voiceover_generation.command_template` override). Both
   parse VOICEOVER.md delimiters, compute a SHA-256 `voiceover_hash` per scene
   from `(text, voice, rate, volume, pitch, engine)`, **skip** any scene whose
   MP3 exists AND matches the stored hash AND still measures the registered
   duration (idempotent — editing VOICEOVER.md only regenerates changed
   scenes; a renumber leftover with a valid hash but wrong audio is detected
   by the duration check and regenerated, never skipped). Fresh audio far
   shorter than the chars/sec estimate for `voiceover.language` is discarded,
   retried once, then failed — truncated synthesis is never marked complete.
   Engine-specifics:
  - **edge**: generates MP3s concurrently (config: `voiceover.concurrency`),
    retries failed scenes once after 5s backoff (Azure endpoint is flaky).
  - **pocket**: CPU-bound (PyTorch); forced `concurrency=1` regardless of
    config. Quantized by default (~895 MB peak RSS). OOM defenses: deferred
    model load (skips entirely if every scene is unchanged), streaming
    WAV-to-disk (no full-audio tensor in RAM), RAM floor pre-check + mid-run
    pulse check. `rate`/`volume`/`pitch` flags accepted but ignored (kept
    for hash-compat only). Full detail: `references/voiceover-engines.md`.
- **Step 6 (Duration Measurement + Transcript)**: Runs `measure_durations.py` — uses ffprobe
  on each MP3, computes `actual_duration_frames = ceil(duration * fps)`, updates
  `scenes.json` with real values — then runs `generate_transcript.py`, which merges
  per-scene word timings into `voiceover_timings.json` + `TRANSCRIPT.md` (see below).
  **Do NOT proceed to Phase 3 until Step 6 succeeds — all Remotion compositions
  depend on exact frame counts, and all A/V sync depends on the transcript.**

## Voiceover transcript (auto-built, always — no opt-out)

Step 6 always emits two files at the video root (validated before Step 6 completes):

- `voiceover_timings.json` — machine-readable source of truth: per scene
  `{id, text, audio_file, duration, padded_duration, global_start, source, words[]}`,
  where each word is `{w, start, end, global_start, global_end, start_frame, end_frame}`
  (seconds from scene start, ms-rounded; `frame = round(t * fps)`).
- `TRANSCRIPT.md` — the same data as a readable word table per scene. **Open this
  at Step 8 whenever you need to sync visuals to narration** (beats, captions,
  word highlights). You decide which words form a sentence, cue, or highlight —
  the transcript is word-level only and never groups words for you.

Per-scene `source` tells you whether ms-sync is safe:

| source | meaning | trust |
|--------|---------|-------|
| `measured` | edge-tts word boundaries captured during synthesis | ms-accurate — sync freely |
| `aligned` | vosk fallback alignment of the MP3 against the known text (pocket engine, or legacy audio) | word-accurate (~100ms) — fine for captions/highlights, avoid sub-frame choreography |
| `estimated` | no timings (`words` is empty — never faked) | scene totals only — do not attempt word sync for this scene |

If recognition runs but the words don't match the script (ratio <
`transcript.align_min_match`, default 0.5), Step 6 **fails** instead of
emitting an estimate — the audio is almost certainly wrong. Re-run
`complete`: Step 5's stale-audio check heals bad files, then Step 6
re-runs clean.

> New voice or language? Run `python3 pipeline.py voice-test <title>
> [--scene N]` BEFORE `complete`: it synthesizes one line, reports the
> measured chars/sec, and projects the full script total from the measured
> rate — so a mistargeted script is caught before Step 5, not at Step 6.

Timing math (same as the stitcher — use it or drift):

- Scene-local word times are seconds from scene start. Global time =
  `global_start[scene] + local` (precomputed per word as `global_start/global_end`).
- `global_start[N]` = sum of prior scenes' **padded** durations
  (`ceil(duration * fps) / fps` — the exact padding `assemble.py` muxes by).
  Never use raw TTS durations for cue math; the ~0.5-frame/scene padding
  accumulates into visible drift on late scenes.
- The transcript's `source` and frame fields already encode all of this —
  prefer reading them over recomputing.

The chain stops at the Phase 3 brief (Step 7 is creative). If Step 5 or 6 fails,
`complete` emits `fix_and_continue` and exits 1 — fix the issue and re-run
`complete` (idempotent — unchanged scenes are skipped).
