#!/usr/bin/env python3
"""export_sfx_preview.py — audition artifacts for the SFX/BGM path.

Per-video mode (default): builds `sfx_preview.mp3` (voiceover + sfx + bgm, no
video) and `sfx_preview.png` (waveform + scene boundaries + cue markers) so the
agent can SEE the cue placement it cannot hear. Non-fatal by design when called
from the Step-10 hook.

--catalog mode: exports a self-contained HTML dial-in preview (one play button
per catalogued sound AND per BGM bed, audio embedded as base64 mp3 data URIs)
for the human authoring loop.

Usage: python3 export_sfx_preview.py [<video_dir>] | --catalog
"""

import base64
import json
import math
import os
import random
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl          # noqa: E402
import generate_sfx as g            # noqa: E402  (single source of truth for DSP + timeline)
import sfx_catalog as sfx           # noqa: E402
import tone_render                  # noqa: E402  (Tone.js/WebAudio engine bridge)


def _run(cmd, timeout=120, **kw):
    kw.setdefault("encoding", "utf-8")
    kw.setdefault("errors", "replace")
    try:
        return subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout, **kw)
    except FileNotFoundError:
        print(f"WARNING: binary not found: {cmd[0]}")
        return subprocess.CompletedProcess(cmd, 127, "", "binary not found")
    except subprocess.TimeoutExpired:
        print(f"WARNING: command timed out after {timeout}s: {cmd[0]}")
        return subprocess.CompletedProcess(cmd, 124, "", "timeout")


def _decode_mp3_to_wav(mp3, wav):
    r = _run(["ffmpeg", "-y", "-i", str(mp3), "-ar", "44100", "-ac", "1", str(wav)])
    return r.returncode == 0 and Path(wav).exists()


def _limit_from(cfg):
    ceiling = cfg.get("sfx", {}).get("true_peak_ceiling_db", -1.0)
    return 10.0 ** (float(ceiling) / 20.0)


def export_video_preview(video_dir):
    video_dir = Path(video_dir).resolve()
    scenes_json = video_dir / "scenes.json"
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found at {scenes_json}")
        sys.exit(2)

    # 1. Regenerate tracks exactly like assemble.py would (current scenes.json wins)
    gen = _run([sys.executable, str(Path(__file__).resolve().parent / "generate_sfx.py"),
                str(video_dir), "--force"])
    if gen.returncode != 0:
        print(gen.stdout)
        sys.exit(1)

    cfg = pl.load_config(video_dir=video_dir)
    aligned = video_dir / "voiceover_aligned.mp3"
    if not aligned.exists():
        with open(scenes_json, "r", encoding="utf-8") as f:
            _data = json.load(f)
        _fps = float(_data.get("fps") or 30)
        g.ensure_voiceover_aligned(video_dir, _data.get("scenes", []), fps=_fps)
    sfx_track = video_dir / "sfx_aligned.mp3"
    bgm_track = video_dir / "bgm_aligned.mp3"
    have_sfx = sfx_track.exists()
    have_bgm = bgm_track.exists()

    # 2. Mix (same peak policy as assemble.py §5.3: limit + level=false)
    limit = _limit_from(cfg)
    out = video_dir / "sfx_preview.mp3"
    tmp = str(out) + ".tmp"
    log_file = pl.log_path(video_dir.name, 10)
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== export_sfx_preview.py run {pl.now_iso()} ===\n")
    if not (have_sfx or have_bgm):
        print("--- No SFX/BGM configured — previewing voiceover only ---")
        r = _run(["ffmpeg", "-y", "-i", str(aligned),
                  "-codec:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", tmp])
        if r.returncode != 0 or not Path(tmp).exists():
            print("ERROR: failed to export voiceover-only preview mp3")
            sys.exit(1)
    else:
        # NOTE: preview mix intentionally omits assemble.py's sidechain ducking
        # (voiceover-ducked BGM) — the preview runs ~2-3 dB hotter on beds than
        # the delivered mix. Listen for balance, not absolute BGM level.
        inputs = ["-i", str(aligned)]
        if have_sfx:
            inputs += ["-i", str(sfx_track)]
        if have_bgm:
            inputs += ["-i", str(bgm_track)]
        n_in = 1 + int(have_sfx) + int(have_bgm)
        fc = (f"[0:a][1:a][2:a]amix=inputs={n_in}:normalize=0:duration=longest:"
              f"dropout_transition=0,alimiter=limit={limit:.4f}:level=false[a]"
              if n_in == 3 else
              f"[0:a][1:a]amix=inputs=2:normalize=0:duration=longest:"
              f"dropout_transition=0,alimiter=limit={limit:.4f}:level=false[a]")
        r = _run(["ffmpeg", "-y"] + inputs + ["-filter_complex", fc, "-map", "[a]",
                  "-codec:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", tmp])
        if r.returncode != 0 or not Path(tmp).exists():
            print("ERROR: failed to export preview mix mp3")
            sys.exit(1)
    pl.atomic_replace(Path(tmp), Path(out))
    print(f"  Created {out.name} ({out.stat().st_size / 1024 / 1024:.1f} MB)")

    # 3. Waveform PNG with scene boundaries + cue markers
    with open(scenes_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data.get("scenes", [])
    fps = data.get("fps") or 30
    offsets, total_sec = g.cumulative_offsets(scenes, fps)
    defs = sfx.load_sound_defs()
    cue_times = []
    for s in sorted(scenes, key=lambda x: x["id"]):
        beats = {b["name"]: b for b in s.get("beats", [])}
        dur = g.scene_duration(s, fps)
        for cue in s.get("sfx", []):
            try:
                rel = g.resolve_when(cue.get("when"), dur, beats)
            except ValueError:
                continue
            cue_times.append(offsets[s["id"]] + rel)
    png = build_png(out, [s["id"] for s in scenes], offsets, cue_times, total_sec,
                    video_dir / "sfx_preview.png")
    if png:
        print(f"  Created sfx_preview.png (1920x360)")
    else:
        print("  WARNING: could not render sfx_preview.png (see ffmpeg error above)")
        sys.exit(0)   # non-fatal from the Step-10 hook


def build_png(sfx_preview_mp3, scene_ids, offsets, cue_times, total_sec, out_png):
    W, H = 1920, 360
    with tempfile.TemporaryDirectory(prefix=".sfx_preview_", dir=str(out_png.parent)) as td:
        tmp = Path(td)
        wav = tmp / "mix.wav"
        if not _decode_mp3_to_wav(sfx_preview_mp3, wav):
            return False
        parts = [f"[0:a]showwavespic=s={W}x{H}:colors=#86efac[img0]"]
        n = 0
        for sid in scene_ids:
            x = int(offsets[sid] / total_sec * W) if total_sec else 0
            if x <= 0 or x >= W - 2:
                continue
            n += 1
            parts.append(
                f"[img{n - 1}]drawbox=x={x}:y=0:w=2:h={H}:color=white@0.6:t=fill[img{n}]")
        for t in cue_times:
            x = int(t / total_sec * W) if total_sec else 0
            if x <= 0 or x >= W - 2:
                continue
            n += 1
            parts.append(
                f"[img{n - 1}]drawbox=x={x}:y=0:w=2:h={H}:color=#ef4444@0.9:t=fill[img{n}]")
        # Scene labels (optional — headless boxes may lack fonts): try with labels,
        # retry once without them.
        labels = []
        for i, sid in enumerate(scene_ids):
            x = int(offsets[sid] / total_sec * W) if total_sec else 0
            if x <= 0 or x >= W - 2:
                continue
            labels.append(
                f"[img{n}]drawtext=text='S{sid}':x={x + 4}:y=8:fontsize=24:"
                f"fontcolor=white:box=1:boxcolor=black@0.5[img{n + 1}]")
            n += 1

        def run_png(with_labels):
            segs = parts + (labels if with_labels else [])
            graph = ";".join(segs)
            tmp_png = tmp / "preview.png"
            r = _run(["ffmpeg", "-y", "-i", str(wav), "-filter_complex", graph,
                      "-map", f"[img{len(segs) - 1}]", "-frames:v", "1", str(tmp_png)])
            if r.returncode != 0 or not tmp_png.exists():
                return False
            pl.atomic_replace(Path(tmp_png), Path(out_png))
            return True

        if run_png(True):
            return True
        return run_png(False)


def export_catalog_preview():
    """Self-contained HTML dial-in preview: every sound rendered through the
    engine's own recipes at default params / default_volume, base64 mp3."""
    out_dir = Path(__file__).resolve().parent.parent / "sfx" / "preview"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "catalog-preview.html"
    defs = sfx.load_sound_defs()
    cfg_sfx = {"sample_rate": 44100, "full_scale_db": -10.0}
    sr = cfg_sfx["sample_rate"]

    items = []
    tone_jobs = []
    for sound in sorted(defs.values(), key=lambda d: d.sound):
        params = sfx.param_defaults(sound)
        if sound.backend == "tone":
            tone_jobs.append({
                "id": f"tone-{sound.sound}",
                "sound": sound.sound,
                "params": params,
                "seed_str": g.per_cue_seed(sound.sound, params, 0.0),
            })
    tone_rendered = tone_render.render_tone_cues(tone_jobs)

    import html as _html
    import tempfile as _tf
    for sound in sorted(defs.values(), key=lambda d: d.sound):
        params = sfx.param_defaults(sound)
        if sound.backend == "tone":
            raw = tone_rendered[f"tone-{sound.sound}"]
        else:
            raw = g._normalize(g.decode_to_floats(sfx.ASSETS_DIR / sound.asset), 0.9)
        db = g.cue_gain_db(sound.default_volume, cfg_sfx["full_scale_db"])
        raw = g.apply_gain_db(raw, db)
        # Isolated tmp dir — crash-safe, no repo dotfile litter, no cross-run collision.
        with _tf.TemporaryDirectory(prefix=f"sfxprev-{sound.sound}-") as _td:
            wav = Path(_td) / f"{sound.sound}.wav"
            mp3 = Path(_td) / f"{sound.sound}.mp3"
            g.write_wav(wav, raw, sr)
            g.encode_mp3(wav, mp3)
            b64 = base64.b64encode(mp3.read_bytes()).decode()
        moods = _html.escape(", ".join(sound.moods))
        tags = _html.escape(", ".join(sound.tags))
        desc = _html.escape(sound.description or "")
        params_html = "".join(
            f"<tr><td><code>{_html.escape(str(k))}</code></td>"
            f"<td>{_html.escape(str(p.default))}</td>"
            f"<td>{_html.escape(str(p.description))}</td></tr>"
            for k, p in sound.params.items()
        )
        items.append(f"""
    <div class="sound">
      <button class="play" data-src="data:audio/mpeg;base64,{b64}">&#9654; {_html.escape(sound.sound)}</button>
      <div class="meta">
        <p class="desc">{desc}</p>
        <p><b>moods:</b> {moods} &nbsp; <b>tags:</b> {tags}</p>
        <table>{params_html}</table>
      </div>
    </div>""")

    # BGM beds: one loop each, rendered at the mix-level bed gain (bed_db −12 dB
    # rel. voiceover peak, default volume 0.6 — same law as render_bgm_track).
    bgm_meta = {
        "pulse_light": "Light kick + airy pad — default safe choice",
        "pulse_dark": "Deep kick + minor pad — serious/tech content",
        "ambient_calm": "Drifting chord pad, no percussion — narration-forward",
        "tension_riser": "Rising tone + accelerating ticks — countdowns, climaxes",
    }
    bgm_items = []
    for track, meta in sorted(sfx.BGM_TRACKS.items()):
        rng = random.Random(int(g.per_cue_seed(track, {"volume": 0.6}, 0.0))
                            & 0xFFFFFFFF)
        loop = g._loop_pad(g.BGM_FUNCS[track](rng, sr, 0.0))
        raw = g.apply_gain_db(loop, g.bed_gain_db(0.6, -12.0))
        with _tf.TemporaryDirectory(prefix=f"bgmprev-{track}-") as _td:
            wav = Path(_td) / f"{track}.wav"
            mp3 = Path(_td) / f"{track}.mp3"
            g.write_wav(wav, raw, sr)
            g.encode_mp3(wav, mp3)
            b64 = base64.b64encode(mp3.read_bytes()).decode()
        moods = _html.escape(", ".join(meta.get("moods", [])))
        bpm = f"{meta.get('bpm')} bpm" if meta.get("bpm") else "—"
        desc = _html.escape(bgm_meta.get(track, meta.get("description", track)))
        energy = _html.escape(str(meta.get("energy", "")))
        bgm_items.append(f"""
    <div class="sound">
      <button class="play" data-src="data:audio/mpeg;base64,{b64}">&#9654; {_html.escape(track)}</button>
      <div class="meta">
        <p class="desc">{desc}</p>
        <p><b>moods:</b> {moods} &nbsp; <b>tempo:</b> {_html.escape(str(bpm))} &nbsp; <b>energy:</b> {energy}</p>
      </div>
    </div>""")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SFX + BGM catalog dial-in preview</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 2rem; background: #0f172a; color: #e2e8f0; }}
  h1 {{ font-size: 1.4rem; }}
  .sound {{ border: 1px solid #334155; border-radius: 8px; padding: .8rem; margin: .6rem 0; background: #1e293b; }}
  button.play {{ font-size: 1rem; padding: .4rem .8rem; border-radius: 6px; border: none; cursor: pointer; background: #86efac; color: #052e16; }}
  button.stop {{ font-size: .9rem; padding: .4rem .6rem; border-radius: 6px; border: none; cursor: pointer; background: #fca5a5; color: #450a0a; }}
  .desc {{ margin: .4rem 0; }}
  table {{ border-collapse: collapse; margin-top: .4rem; }}
  td {{ border: 1px solid #334155; padding: .2rem .5rem; font-size: .85rem; }}
  code {{ background: #0f172a; padding: 0 .3rem; }}
</style>
</head>
<body>
<h1>SFX + BGM catalog dial-in preview (engine-rendered, default params)</h1>
<button class="stop" id="stopAll">Stop all</button>
{''.join(items)}
<h2 style="margin-top:2rem;">BGM beds (mix level, default settings — one loop)</h2>
{''.join(bgm_items)}
<script>
  const audio = new Audio();
  document.querySelectorAll('button.play').forEach(b => {{
    b.addEventListener('click', () => {{
      audio.src = b.dataset.src;
      audio.currentTime = 0;
      audio.play();
    }});
  }});
  document.getElementById('stopAll').addEventListener('click', () => {{ audio.pause(); audio.currentTime = 0; }});
</script>
</body>
</html>"""

    tmp = str(out) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(html)
    pl.atomic_replace(Path(tmp), Path(out))
    print(f"  Created {out.relative_to(Path(__file__).resolve().parent.parent)} "
          f"({len(defs)} sounds + {len(bgm_items)} beds, self-contained)")


def main():
    args = [a for a in sys.argv[1:] if a != "--force"]
    has_dir = any(not a.startswith("-") for a in args)
    has_catalog = "--catalog" in args
    if has_catalog and has_dir or (not has_catalog and not has_dir):
        print("Usage: python3 export_sfx_preview.py [<video_dir>] | --catalog "
              "(exactly one of the two)")
        sys.exit(2)
    if has_catalog:
        export_catalog_preview()
        sys.exit(0)
    export_video_preview(Path([a for a in args if not a.startswith("-")][0]))
    sys.exit(0)


if __name__ == "__main__":
    main()