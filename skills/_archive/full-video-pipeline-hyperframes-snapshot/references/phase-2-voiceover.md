# Phase 2: Voiceover (Steps 4-6)

**Goal**: Extract TTS-ready text into `VOICEOVER.md`. Steps 5-6 (audio generation
and duration measurement) auto-run after `complete`.

## Action

1. Read `SCRIPT.md`.
2. Extract the "Voiceover:" line from each scene.
3. Write `VOICEOVER.md` per the format below.

## Use these rules

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

- **Step 5 (Voiceover Generation)**: Runs `generate_voiceover.py` — parses
  VOICEOVER.md delimiters, computes a SHA-256 `voiceover_hash` per scene from
  `(text, voice, rate, volume, pitch)`, **skips** any scene whose MP3 exists AND
  matches the stored hash (idempotent — editing VOICEOVER.md only regenerates
  changed scenes), generates MP3s concurrently (config: `voiceover.concurrency`),
  retries failed scenes once after 5s backoff, updates `scenes.json`.
- **Step 6 (Duration Measurement)**: Runs `measure_durations.py` — uses ffprobe
  on each MP3, computes `actual_duration_frames = ceil(duration * fps)`, updates
  `scenes.json` with real values. **Do NOT proceed to Phase 3 until Step 6
  succeeds — all HyperFrames compositions depend on exact durations.**

The chain stops at the Phase 3 brief (Step 7 is creative). If Step 5 or 6 fails,
`complete` emits `fix_and_continue` and exits 1 — fix the issue and re-run
`complete` (idempotent — unchanged scenes are skipped).

---

## Optional: Captions

Once Steps 5-6 have run (voiceover generated, durations measured), you can
generate captions:

```bash
python3 pipeline.py captions <title>
```

This produces `videos/<title>/<title>.srt` (YouTube sidecar) and populates
per-scene `captions` cues in `scenes.json`. To burn captions into the video,
set `video.burn_captions: true` in `pipeline_config.json` — the scaffolded
`compositions/scene-NN.html.example` ships a gated `#scene-captions` layer
that you wire up per scene in Phase 3 when `showCaptions` is true. Off by
default to preserve render performance.

**Wiring cues into a scene (Phase 3, if captions are enabled)**: render the
`#scene-captions` div only when `scene.showCaptions: true` in `scenes.json`
AND `video.burn_captions: true` in `pipeline_config.json`. Feed it cues from
the scene's `captions` array via GSAP — one `tl.add()` per cue, hiding/showing
`#caption-text` and setting its `textContent`.
