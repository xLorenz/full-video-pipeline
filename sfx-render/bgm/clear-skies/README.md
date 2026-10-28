# clear-skies — asset BGM bed build

Bakes `clear-skies.js` into the pipeline's default bed, `sfx/assets/bgm/clear_skies.wav`.

```bash
npm i --no-save playwright-core      # once, from the repo root (Chromium/Edge does the Web Audio)
node fetch-samples.mjs               # once — vendors the 26 Salamander piano samples (committed)
node render.mjs                      # → sfx/assets/bgm/clear_skies.wav + out/*.mp3
```

`render.mjs` needs `ffmpeg` on PATH and a Chromium-family browser: Playwright's own if
installed, else Chrome/Edge from the usual install paths (`CHROME_PATH` overrides).

> `playwright-core` is installed with `--no-save`, so a later `npm install` anywhere in the
> repo workspace prunes it — re-run the `npm i` line before a rebuild.

## What gets baked

`clear-skies.js` is 48 bars at 94.5 BPM — 1–16 intro, 17–32 lift, 33–48 a part written to
repeat. `Tone.Offline` is fed the same score the browser plays, and 94.5 BPM makes a bar
exactly **112,000 samples** @ 44.1 kHz, so every seam is on the sample:

| | bars | samples | seconds |
|---|---|---|---|
| head (intro + lift) | 1–32 | 3,584,000 | 81.269841 |
| loop (part 3) | 33–48 | 1,792,000 | 40.634921 |
| **asset** | | **5,376,000** | **121.904762** |

The asset is `head ++ part-3-pass-2`. Part 3 is rendered twice: pass 1 is pre-roll (it fills
pass 2's reverb), pass 2 is the shipped loop, so tiling it wraps without a gap — `render.mjs`
prints the wrap step next to the in-loop sample-step statistics, so a bad seam fails loudly
instead of shipping.

Assembly: one global gain so the bed peaks at −1 dBFS (same law as `neon_drop`), mono downmix,
16-bit PCM. `out/clear-skies-full.mp3` is the continuous head → lift → loop → loop timeline
(no seams at all — the listening reference); `out/clear-skies-loop.mp3` is the loop alone.

Measured on the shipped asset (v8): peak −1.0 dBFS, whole bed −19.4 LUFS, loop region
−19.7 LUFS / LRA 1.0 — about 2.3 LU quieter than `neon_drop`, which is why
`bgm.track_trim.clear_skies` is −2 dB instead of neon_drop's −5 dB. Wrap step 0.013 vs a
0.0075 mean in-loop sample step (max 0.28): no click at the loop point.

## After a re-render

The wav is hash-guarded, so a rebuild **must** update `sfx/assets/manifest.json`:

```bash
python -c "import hashlib,pathlib;print(hashlib.sha256(pathlib.Path('sfx/assets/bgm/clear_skies.wav').read_bytes()).hexdigest())"
```

then re-run `python scripts/export_sfx_preview.py --catalog` and `python -m pytest tests`.
`loop_start_seconds` / `loop_end_seconds` in `scripts/sfx_catalog.py` are derived from the
table above — only change them with the score.

`out/` and its `.cache-*.f32` staging files are gitignored; `--part=head|tail|encode` re-runs
one stage without re-rendering the rest.
