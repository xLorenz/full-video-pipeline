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
  from `(text, voice, rate, volume, pitch)`, **skip** any scene whose MP3
  exists AND matches the stored hash (idempotent — editing VOICEOVER.md
  only regenerates changed scenes), update `scenes.json`. Engine-specifics:
  - **edge**: generates MP3s concurrently (config: `voiceover.concurrency`),
    retries failed scenes once after 5s backoff (Azure endpoint is flaky).
  - **pocket**: CPU-bound (PyTorch); forced `concurrency=1` regardless of
    config. Quantized by default (~895 MB peak RSS). OOM defenses: deferred
    model load (skips entirely if every scene is unchanged), streaming
    WAV-to-disk (no full-audio tensor in RAM), RAM floor pre-check + mid-run
    pulse check. `rate`/`volume`/`pitch` flags accepted but ignored (kept
    for hash-compat only). Full detail: `references/voiceover-engines.md`.
- **Step 6 (Duration Measurement)**: Runs `measure_durations.py` — uses ffprobe
  on each MP3, computes `actual_duration_frames = ceil(duration * fps)`, updates
  `scenes.json` with real values. **Do NOT proceed to Phase 3 until Step 6
  succeeds — all Remotion compositions depend on exact frame counts.**

The chain stops at the Phase 3 brief (Step 7 is creative). If Step 5 or 6 fails,
`complete` emits `fix_and_continue` and exits 1 — fix the issue and re-run
`complete` (idempotent — unchanged scenes are skipped).
