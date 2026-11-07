#!/usr/bin/env python3
"""render.py — turn a motion-design page into an MP4.

  python render.py piece.html --out piece.mp4                    # 1080 px wide (1080x1920 for 9:16), 30 fps, page sound + score, -16 LUFS
  python render.py piece.html --out draft.mp4 --width 540        # fast half-size draft
  python render.py piece.html --out clip.mp4 --from 8 --to 12    # just a section
  python render.py story.html --out story.mp4 --vo vo/vo.wav     # mix a voiceover under/over the page's own sound
  python render.py piece.html --out piece.mp4 --bgm song.mp3     # your own music instead of the page's score (looped, faded, ducked under --vo)

The page must expose window.__comp (see assets/template.html):
  dur, w, h                       loop length (s) and world size
  capture(t, pixelWidth)          draw frame t at that pixel width, return a PNG data URL
  audio(sampleRate, {music}) -> base64 WAV of the page's synthesised sound, or null.
                                  music:false leaves the page's score out (used with --bgm).

Audio is mixed to a WAV first, loudness-normalised in two passes (--lufs, default -16), then muxed.
The page is served over a local HTTP server (Google Fonts load, long Windows paths don't matter).
Needs: python with playwright (chromium) and ffmpeg on PATH.
"""
import argparse, base64, functools, http.server, json, re, subprocess, sys, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(root):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def ff(args, cwd):
    # ffmpeg refuses to start from a very long Windows working directory, so always run it from the temp folder
    return subprocess.run(["ffmpeg", "-hide_banner", "-y"] + args, cwd=cwd, capture_output=True, text=True)


def mix_audio(inputs, dur, a, tmp):
    """inputs: [(kind, path)] with kind in sfx|vo|bgm. Returns the path of a 48 kHz stereo WAV, `dur` seconds long."""
    cmd, parts = ["-v", "error"], []
    for kind, f in inputs:
        if kind == "bgm":
            cmd += ["-stream_loop", "-1"]                        # loop a short track to cover the piece
        cmd += ["-ss", f"{a.t0:.3f}", "-i", str(f)]
    kinds = [k for k, _ in inputs]
    for i, kind in enumerate(kinds):
        gain = {"sfx": a.sfx_gain, "vo": 1.0, "bgm": a.bgm_gain}[kind]
        chain = f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{dur:.3f},volume={gain}"
        if kind == "bgm":
            chain += f",afade=t=in:d=0.4,afade=t=out:st={max(0.0, dur - 1.2):.3f}:d=1.2"
        parts.append(chain + f"[{kind}]")
    labels = [f"[{k}]" for k in kinds]
    if "vo" in kinds and "bgm" in kinds:                         # duck the music while someone is talking
        parts.append("[vo]asplit=2[vomix][vokey]")
        parts.append("[bgm][vokey]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[bgmd]")
        labels = ["[vomix]" if l == "[vo]" else "[bgmd]" if l == "[bgm]" else l for l in labels]
    parts.append("".join(labels) + (f"amix=inputs={len(labels)}:duration=longest:normalize=0[mix]" if len(labels) > 1 else "anull[mix]"))
    out = tmp / "mix.wav"
    r = ff(cmd + ["-filter_complex", ";".join(parts), "-map", "[mix]", "-t", f"{dur:.3f}", "-c:a", "pcm_s16le", str(out)], tmp)
    if r.returncode:
        sys.exit("audio mix failed: " + r.stderr[-800:])
    if not a.lufs:
        return out
    # two-pass loudnorm: measure, then apply linearly so the dynamics of the piece survive
    target = f"I={a.lufs}:TP=-1.5:LRA=11"
    r = ff(["-i", str(out), "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"], tmp)
    m = json.loads(re.findall(r"\{[^{}]*\}", r.stderr)[-1])
    if float(m["input_i"]) < -70:                                # silence: nothing to normalise
        return out
    norm = tmp / "mix_norm.wav"
    af = (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000")
    r = ff(["-v", "error", "-i", str(out), "-af", af, "-c:a", "pcm_s16le", str(norm)], tmp)
    if r.returncode:
        sys.exit("loudnorm failed: " + r.stderr[-800:])
    print(f"loudness {float(m['input_i']):.1f} -> {a.lufs} LUFS")
    return norm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("page")
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=0, help="output pixel width (default 1080 for portrait, 1920 for landscape)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    ap.add_argument("--vo", help="voiceover WAV/MP3 that starts at t=0 of the piece")
    ap.add_argument("--bgm", help="your own music track: replaces the page's score, loops/trims to fit, fades in/out, ducks under --vo")
    ap.add_argument("--bgm-gain", type=float, default=0.5, help="level of --bgm before loudness normalisation")
    ap.add_argument("--sfx-gain", type=float, default=1.0, help="page sound level (0.6 sits well under a voiceover)")
    ap.add_argument("--lufs", type=float, default=-16.0, help="loudness target of the final mix (reels sit at -14 to -16); 0 = leave levels alone")
    ap.add_argument("--mute", action="store_true", help="skip the page's own sound")
    a = ap.parse_args()

    page = Path(a.page).resolve()
    out = Path(a.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="mdo-"))
    srv = serve(page.parent)
    url = f"http://127.0.0.1:{srv.server_address[1]}/{page.name}?t=0"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 600, "height": 1000})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(url, wait_until="networkidle")
        if errors:
            sys.exit("page error: " + errors[0])
        pg.wait_for_function("window.__comp !== undefined", timeout=15000)
        pg.evaluate("document.fonts.ready.then(() => true)")
        meta = pg.evaluate("({dur: __comp.dur, w: __comp.w, h: __comp.h})")
        width = a.width or (1080 if meta["w"] <= meta["h"] else 1920)
        width -= width % 2
        t1 = meta["dur"] if a.t1 is None else min(a.t1, meta["dur"])
        dur = t1 - a.t0
        n = max(1, round(dur * a.fps))

        inputs = []
        if not a.mute:
            b64 = pg.evaluate("o => __comp.audio ? __comp.audio(48000, o) : null", {"music": not a.bgm})
            if b64:
                sfx = tmp / "sfx.wav"
                sfx.write_bytes(base64.b64decode(b64))
                inputs.append(("sfx", sfx))
        if a.vo:
            inputs.append(("vo", Path(a.vo).resolve()))
        if a.bgm:
            inputs.append(("bgm", Path(a.bgm).resolve()))
        audio = mix_audio(inputs, dur, a, tmp) if inputs else None

        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(a.fps), "-c:v", "png", "-i", "-"]
        if audio:
            cmd += ["-i", str(audio)]
        cmd += ["-map", "0:v", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"]
        if audio:
            cmd += ["-map", "1:a", "-c:a", "aac", "-b:a", "192k"]
        cmd += ["-t", f"{dur:.3f}", str(out)]

        enc = subprocess.Popen(cmd, stdin=subprocess.PIPE, cwd=tmp)
        start = time.time()
        for i in range(n):
            t = a.t0 + i / a.fps
            data_url = pg.evaluate(f"__comp.capture({t:.6f}, {width})")
            enc.stdin.write(base64.b64decode(data_url.split(",", 1)[1]))
            if i % 60 == 0 or i == n - 1:
                print(f"\rframe {i + 1}/{n}  {time.time() - start:5.1f}s", end="", flush=True)
        enc.stdin.close()
        code = enc.wait()
        browser.close()
    srv.shutdown()
    print()
    if code:
        sys.exit(f"ffmpeg failed with exit code {code}")
    names = {"sfx": "page sfx" + ("" if a.bgm else " + score"), "vo": "vo", "bgm": "bgm"}
    print(f"wrote {out}  ({width}px wide, {a.fps} fps, {dur:.2f}s, audio: {', '.join(names[k] for k, _ in inputs) or 'none'})")


if __name__ == "__main__":
    main()
