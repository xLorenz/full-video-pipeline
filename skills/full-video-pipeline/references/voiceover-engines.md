# Voiceover Engines

The pipeline ships two TTS engines, selected via `voiceover.engine` in
`pipeline_config.json`: `edge` (default) and `pocket` (optional).

| Engine | Footprint | Offline | Voice count | SSML/rate/pitch | When to use |
|--------|-----------|---------|-------------|-----------------|-------------|
| `edge` (default) | <1 MB | no | ~400+ | yes | default, broad language/SSML needs |
| `pocket` | ~1 GB (PyTorch) | yes | 21 EN + 5 non-EN | no | offline, deterministic, MIT-licensed voices |

`edge` is the zero-config default: network-dependent (reverse-engineered
Azure endpoint, less-polished legal posture) but fast and light.

## Opting into pocket-tts

Override these keys per video (auto-discovery is on by default):

```jsonc
// videos/<title>/pipeline_config.json
{
  "voiceover": {
    "engine": "pocket",
    "voice": "alba",        // named preset voice (catalog below)
    "language": "english",  // default 12-layer distilled model
    "no_quantize": false,   // quantization on by default (~895 MB peak RSS)
    "concurrency": 1        // pocket wrapper forces 1 regardless
  },
  "system": {
    "min_available_ram_mb": 534  // wrapper's hard floor: 234 MB model + 300 MB
                                  // safety margin. This clears the pre-check but
                                  // is NOT a comfortable target — see "How much
                                  // RAM you actually need" below. Prefer 1024+
                                  // if the host can spare it.
  },
  "steps": {
    "5_voiceover_generation": {
      "command_template": "python3 scripts/generate_voiceover_pocket.py {video_dir} --voice {voiceover.voice}"
    }
  }
}
```

The pocket wrapper quantizes by default (~895 MB peak RSS during model load),
streams WAV chunks to disk (no full-audio tensor in RAM), forces sequential
execution, and **skips model load entirely on unchanged re-runs** (0.3s no-op
re-run vs ~30s when the model loads).

## How much RAM you actually need

Don't set `min_available_ram_mb` to the wrapper's bare refusal floor (534 MB)
and assume you're safe — that number only guarantees the model is *allowed*
to start loading, not that generation will stay comfortably inside available
memory:

- Smoke-tested on Windows / Python 3.10 / PyTorch 2.13 CPU / 8 GB RAM with
  the `english` quantized model.
- Peak child RSS at model load: **~895 MB** (process peak — Python + PyTorch
  runtime + quantized weights + scipy + chunk buffer). Measured across 82
  samples over 42s.
- Minimum VM available observed during generation: **~452 MB** on the 8 GB
  box (model load is the squeeze point, not synthesis).
- Per-scene MP3: ~52-57 KB / ~6s @ 24 kHz mono / 65 Kbps.
- Re-run idempotency check: 0.3s wall when every scene is unchanged (model
  NOT loaded; PyTorch not imported).
- Wall time per `complete`: ~42s for 2 scenes (model load dominates, ~30s on
  a warm HuggingFace cache); scales as load + ~1s per scene synth.

On a 1 GB RAM box this is tight in practice: the OS already uses ~150 MB, so
~600 MB free at the start of Step 5 would clear the 534 MB pre-check but the
generation pass will leave only ~50-200 MB free at peak. **A safer minimum is
a `t3.small` (2 GB RAM) or any box with ≥1 GB free at Step 5.** Steps run
sequentially within a phase, so Step 5 finishes before any Remotion renders
fire — no concurrent memory pressure from the rest of the pipeline.

## English named-voice catalog

HF repo: <https://huggingface.co/kyutai/tts-voices>

`alba`, `anna`, `azelma`, `bill_boerst`, `caro_davy`, `charles`, `cosette`,
`eponine`, `eve`, `fantine`, `george`, `jane`, `jean`, `javert`, `marius`,
`mary`, `michael`, `paul`, `peter_yearsley`, `stuart_bell`, `vera`.
Non-English presets: `giovanni` (it), `lola` (es), `juergen` (de),
`rafael` (pt), `estelle` (fr).

## Pocket-tts OOM defenses

1. **Deferred model load** — pre-flight idempotency check skips the whole
   model load when every scene is unchanged (0.3s no-op re-run vs ~30s).
2. **Stream-to-disk generation** via `generate_audio_stream()` — the full
   scene's PCM never lives in RAM.
3. `quantize=True` by default — halves runtime memory with no measurable
   quality loss (WER delta indistinguishable from noise).
4. Voice state loaded once and reused across all scenes.
5. Forced `concurrency=1` (CPU-bound model — parallelism risks OOM).
6. RAM floor pre-check (refuses to load the model if it won't fit) + mid-run
   pulse check (stops cleanly, leaving already-generated scenes resumable via
   the same idempotent-skip mechanism as edge-tts).

## Unsupported in v1

Voice cloning (the wrapper accepts only named preset voices; cloning via
`--voice ./my-voice.wav` is deferred), SSML, and per-scene rate/volume/pitch
(the flags are accepted for `voiceover_hash` compatibility but ignored at
synthesis — logged as a warning). If you need these, use the `edge` engine or
call `pocket_tts` directly.
