#!/usr/bin/env python3
"""
assemble.py — Efficient video assembly for the full video pipeline.

Audio path: scene MP4s are rendered silent (no <Audio> in Remotion comps).
Voiceover MP3s are concatenated into voiceover_aligned.mp3, then muxed onto
the concatenated scene videos in a single ffmpeg pass. One audio encode pass
total — fastest path for low-RAM boxes.

Safety:
  - Codec/resolution/fps mismatch detected by ffprobe triggers a re-encode
    fallback (-c:v {stitching.final_codec} -crf {stitching.final_crf}) instead of
    -c copy (which would silently produce a broken file).
  - Final MP4 is written atomically (temp + os.replace) so a crash doesn't
    leave a half-written "version".
  - Duration assertion: |final_duration - total_actual_seconds| <= 0.5s,
    otherwise exits non-zero.

Usage:
    python3 assemble.py <video_dir>

Output:
    versions/<title>-v<N>.mp4  (auto-incremented version)
    voiceover_aligned.mp3      (concatenated audio track)
    sfx_aligned.mp3            (sound-effects track, only when cues exist)
    bgm_aligned.mp3            (music-bed track, only when BGM is active)
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _pipeline_lib as pl  # noqa: E402


def find_next_version(versions_dir, safe_title):
    max_version = 0
    pattern = re.compile(rf"^{re.escape(safe_title)}-v(\d+)\.mp4$")
    if versions_dir.exists():
        for f in versions_dir.iterdir():
            m = pattern.match(f.name)
            if m and int(m.group(1)) > max_version:
                max_version = int(m.group(1))
    return max_version + 1


def probe_scene(scenes_dir, scene_id):
    """Return dict of codec_name, width, height, r_frame_rate for the scene's MP4."""
    fpath = scenes_dir / f"scene-{scene_id:02d}.mp4"
    streams = pl.ffprobe_streams(fpath)
    if not streams:
        return None
    s = streams[0]
    return {
        "codec": s.get("codec_name"),
        "width": s.get("width"),
        "height": s.get("height"),
        "fps": s.get("r_frame_rate"),
    }


def detect_mismatch(scenes_dir, scenes):
    """Return (mismatch: bool, reason: str)."""
    first = probe_scene(scenes_dir, scenes[0]["id"])
    if first is None:
        return False, "first scene unprobeable — assuming match"
    for s in scenes[1:]:
        info = probe_scene(scenes_dir, s["id"])
        if info is None:
            continue
        if info["codec"] != first["codec"]:
            return True, f"codec mismatch (scene {s['id']}: {info['codec']} vs {first['codec']})"
        if info["width"] != first["width"] or info["height"] != first["height"]:
            return True, (f"resolution mismatch (scene {s['id']}: "
                          f"{info['width']}x{info['height']} vs "
                          f"{first['width']}x{first['height']})")
        if info["fps"] != first["fps"]:
            return True, f"fps mismatch (scene {s['id']}: {info['fps']} vs {first['fps']})"
    return False, "all scenes consistent"


def atomic_replace_temp(output_file, cmd_argv, pre_commit=None):
    """Run ffmpeg to a temp file, then os.replace to output_file on success.

    cmd_argv: argv list whose LAST element must be the output path (str/Path).
    The output is swapped for <stem>.tmp<suffix> (cleaned on start, legacy
    <output>.tmp also cleaned); on success the tmp is atomically renamed.
    Accepts legacy string cmds (shell) for backward-compat but argv lists
    are preferred (safe for spaces).

    pre_commit: optional callable(tmp_path) -> bool. When given, it runs on the
    finished temp file BEFORE the atomic rename; returning False unlinks the temp
    and aborts the publish (used by the SFX/BGM loudness assertions so a failed
    stitch never leaves a published version on disk).
    """
    output_file = Path(output_file)
    # Preserve the extension (voiceover_aligned.tmp.mp3, not .mp3.tmp) so
    # ffmpeg infers the muxer from the filename. Belt-and-braces: also pass
    # an explicit -f before the output (input `-f concat` is unaffected —
    # the last -f wins for the output).
    ext = output_file.suffix.lstrip(".")
    fmt = {"mp4": "mp4", "mp3": "mp3"}.get(ext, ext)
    tmp = output_file.parent / (output_file.stem + ".tmp" + output_file.suffix)
    # Clean both new-style and legacy (<output>.tmp) stale tmps.
    tmp.unlink(missing_ok=True)
    Path(str(output_file) + ".tmp").unlink(missing_ok=True)
    if isinstance(cmd_argv, (list, tuple)):
        argv = [str(a) for a in cmd_argv]
        if argv and argv[0] == "ffmpeg":
            # Quiet ffmpeg's banner + per-frame progress: warnings/errors
            # still surface, and run_cmd dumps everything on failure. The
            # banner alone was ~100 lines × 3 stitch invocations.
            argv = ["ffmpeg", "-hide_banner", "-loglevel", "warning"] + argv[1:]
        # Last element must be the output — swap for tmp with explicit -f.
        if argv and Path(argv[-1]) == output_file:
            argv = argv[:-1] + (["-f", fmt] if fmt else []) + [str(tmp)]
        else:
            argv = argv + ((["-f", fmt] if fmt else []) + [str(tmp)])
        result = pl.run_cmd(argv, check=False)
    else:
        full_cmd = cmd_argv.replace(f'"{output_file}"', f' -f {fmt} "{tmp}"', 1)
        if full_cmd.startswith("ffmpeg "):
            full_cmd = "ffmpeg -hide_banner -loglevel warning " + full_cmd[len("ffmpeg "):]
        result = pl.run_cmd(full_cmd, check=False)
    if result.returncode != 0 or not tmp.exists():
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        return False
    if pre_commit is not None and not pre_commit(tmp):
        tmp.unlink(missing_ok=True)
        return False
    pl.atomic_replace(tmp, output_file)
    return True


def _run_ffmpeg(argv, timeout=120):
    """subprocess.run wrapper with timeout + missing-binary guard. Returns CompletedProcess or None."""
    import subprocess as _sp
    try:
        return _sp.run(argv, capture_output=True, text=True, timeout=timeout,
                       encoding="utf-8", errors="replace")
    except (FileNotFoundError, _sp.TimeoutExpired) as e:
        print(f"  WARNING: ffmpeg call failed ({type(e).__name__}: {e})")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 assemble.py <video_dir>")
        sys.exit(2)
    video_dir = Path(sys.argv[1]).resolve()
    if not video_dir.exists():
        print(f"ERROR: Video directory not found: {video_dir}")
        sys.exit(2)
    scenes_json = video_dir / "scenes.json"
    if not scenes_json.exists():
        print(f"ERROR: scenes.json not found at {scenes_json}")
        sys.exit(2)

    with open(scenes_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data.get("scenes", [])
    if not scenes:
        print("ERROR: No scenes found in scenes.json")
        sys.exit(2)
    scenes = sorted(scenes, key=lambda s: s["id"])

    video_title = data.get("video_title", video_dir.name)
    safe_title = pl.sanitize_title(video_title)
    scenes_dir = video_dir / "scenes"
    voiceover_dir = video_dir / "voiceover"
    versions_dir = video_dir / "versions"

    log_file = pl.log_path(video_dir.name, 10)
    with open(log_file, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== assemble.py run {pl.now_iso()} ===\n")

    print(f"=== Assembling: {video_title} ===")
    print(f"  Scenes: {len(scenes)}")

    cfg = pl.load_config(video_dir=video_dir)
    scfg = cfg.get("stitching", {})
    final_codec = scfg.get("final_codec", "libx264")
    final_audio_codec = scfg.get("final_audio_codec", "aac")
    final_crf = scfg.get("final_crf", 23)

    # Verify scene videos exist
    print("\n--- Verifying scene videos ---")
    errors = []
    for s in scenes:
        fpath = scenes_dir / f"scene-{s['id']:02d}.mp4"
        if not fpath.exists():
            errors.append(f"Scene {s['id']}: video not found at {fpath}")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit(1)
    print("  All scene video files present.")

    # Detect codec/size/fps mismatch → decide copy vs re-encode
    mismatch, reason = detect_mismatch(scenes_dir, scenes)
    if mismatch:
        print(f"  WARNING: {reason}")
        print("  Falling back to re-encoding video stream for concat safety.")
    else:
        print(f"  Codec check: {reason}")

    temp_dir = video_dir / ".assemble_tmp"
    temp_dir.mkdir(exist_ok=True)

    try:
        # Step 1: Concat voiceover MP3s — frame-padded so the audio timeline is
        # identical to the video timeline (each chunk occupies exactly its
        # ceil'd frame count / fps). Plain -c copy concat drifts ~0.5 frame per
        # scene against the ceil'd video scenes; late narration slides off its
        # scene and beat-referenced SFX land progressively late.
        print("\n--- Step 1: Concatenating voiceover audio (frame-padded) ---")
        fps = data.get("fps", 30)
        total_frames = sum((s.get("actual_duration_frames") or 0) for s in scenes)
        vo_inputs, vo_graph, missing_vo = pl.voiceover_pad_graph(voiceover_dir, scenes, fps)
        if missing_vo:
            print(f"  ERROR: Voiceover MP3 missing for scenes: {missing_vo}")
            sys.exit(1)
        aligned_audio = video_dir / "voiceover_aligned.mp3"
        single_pass = ["ffmpeg", "-y", *vo_inputs, "-filter_complex", vo_graph,
             "-map", "[aout]", "-c:a", "libmp3lame", "-b:a", "192k",
             str(aligned_audio)]
        # Windows cmd.exe caps command lines at 8191 chars — big casts
        # (58 absolute -i paths + the pad graph) blow past it ("La línea
        # de comandos es demasiado larga"). Hierarchical concat then:
        # pad+concat in small batches, then concat the parts.
        est_len = sum(len(str(a)) + 3 for a in single_pass)
        if est_len < 7000:
            ok = atomic_replace_temp(aligned_audio, single_pass)
        else:
            print(f"  Large cast ({len(scenes)} scenes, ~{est_len} chars cmd) — "
                  f"hierarchical voiceover concat")
            for stale in temp_dir.glob("vo_part_*.mp3"):
                stale.unlink(missing_ok=True)
            BATCH = 12
            parts, ok = [], True
            for bi in range(0, len(scenes), BATCH):
                chunk = scenes[bi:bi + BATCH]
                ci, cg, cmiss = pl.voiceover_pad_graph(voiceover_dir, chunk, fps)
                if cmiss:
                    print(f"  ERROR: Voiceover MP3 missing for scenes: {cmiss}")
                    ok = False
                    break
                part = temp_dir / f"vo_part_{bi // BATCH:02d}.mp3"
                ok = atomic_replace_temp(
                    part,
                    ["ffmpeg", "-y", *ci, "-filter_complex", cg,
                     "-map", "[aout]", "-c:a", "libmp3lame", "-b:a", "192k",
                     str(part)])
                if not ok:
                    print(f"  ERROR: voiceover batch {bi // BATCH} failed")
                    break
                parts.append(part)
            if ok:
                fin_inputs, flabels = [], []
                for i, p in enumerate(parts):
                    fin_inputs += ["-i", str(p)]
                    flabels.append(f"[{i}:a]")
                fgraph = "".join(flabels) + f"concat=n={len(parts)}:v=0:a=1[aout]"
                ok = atomic_replace_temp(
                    aligned_audio,
                    ["ffmpeg", "-y", *fin_inputs, "-filter_complex", fgraph,
                     "-map", "[aout]", "-c:a", "libmp3lame", "-b:a", "192k",
                     str(aligned_audio)])
        if not ok or not aligned_audio.exists():
            print("ERROR: Failed to create voiceover_aligned.mp3")
            sys.exit(1)

        # Pre-publish sync gate: padded audio must match the video timeline
        # before anything gets muxed/published (fails BEFORE a version lands).
        if total_frames > 0:
            target_dur = total_frames / float(fps)
            vo_dur = pl.get_audio_duration(aligned_audio)
            if abs(vo_dur - target_dur) > 0.15:
                print(f"  ERROR: padded voiceover duration {vo_dur:.2f}s differs from "
                      f"video timeline {target_dur:.2f}s by more than 0.15s — "
                      f"padding failed; refusing to stitch")
                sys.exit(1)
            print(f"  Sync gate: audio {vo_dur:.2f}s == video timeline {target_dur:.2f}s")
        audio_size = aligned_audio.stat().st_size / (1024 * 1024)
        print(f"  Created voiceover_aligned.mp3 ({audio_size:.1f} MB)")

        # Step 1.5: Build SFX/BGM tracks (no-op fast path when no cues/BGM configured)
        print("\n--- Step 1.5: Generating SFX/BGM tracks ---")
        sfx_gen = [sys.executable, str(Path(__file__).resolve().parent / "generate_sfx.py"),
                   str(video_dir)]
        sfx_res = pl.run_cmd(sfx_gen, check=False)
        if sfx_res.returncode != 0:
            print("ERROR: SFX/BGM generation failed (see messages above)")
            sys.exit(1)
        sfx_track = video_dir / "sfx_aligned.mp3"
        bgm_track = video_dir / "bgm_aligned.mp3"
        have_sfx = sfx_track.exists()
        have_bgm = bgm_track.exists()
        if have_sfx:
            print(f"  SFX track present ({sfx_track.stat().st_size / 1024 / 1024:.1f} MB)")
        if have_bgm:
            print(f"  BGM track present ({bgm_track.stat().st_size / 1024 / 1024:.1f} MB)")

        # Voiceover loudness anchor (measured once here, reused by the assertions)
        vo_peak_db, vo_I = None, None
        vd_r = _run_ffmpeg(
            ["ffmpeg", "-i", str(aligned_audio), "-filter:a", "volumedetect", "-f", "null", "-"],
            timeout=120)
        if vd_r is not None:
            m = re.search(
                r"max_volume\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*dB", vd_r.stdout + vd_r.stderr)
            if m:
                try:
                    vo_peak_db = float(m.group(1))
                except ValueError:
                    vo_peak_db = None
            # volumedetect reports n/a/-inf when silent — treat as unmeasurable.
            if m and m.group(1).lower() in ("n/a", "-inf", "inf"):
                vo_peak_db = None
        eb_r = _run_ffmpeg(
            ["ffmpeg", "-i", str(aligned_audio), "-filter:a", "ebur128", "-f", "null", "-"],
            timeout=300)
        if eb_r is not None:
            ms = re.findall(
                r"^\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", eb_r.stdout + eb_r.stderr, re.MULTILINE)
            if ms:
                try:
                    vo_I = float(ms[-1])
                except ValueError:
                    vo_I = None
        if vo_I is None:
            print("  WARNING: could not measure voiceover loudness — skipping loudness assertions")

        # Step 2: Concat scene videos — copy if matched, else re-encode
        print("\n--- Step 2: Concatenating video streams ---")
        video_concat_list = temp_dir / "video_concat.txt"
        with open(video_concat_list, "w", encoding="utf-8") as f:
            for s in scenes:
                mp4 = (scenes_dir / f"scene-{s['id']:02d}.mp4").resolve().as_posix()
                # Escape single quotes for ffmpeg concat demuxer.
                mp4_esc = mp4.replace("'", "'\\''")
                f.write(f"file '{mp4_esc}'\n")
        temp_video = temp_dir / "video_only.mp4"
        if mismatch:
            # Re-encode at the FINAL delivery CRF (not the per-scene render crf):
            # this pass produces the delivered file, so it should match the
            # quality target of the stream-copy path rather than render scratch.
            cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                   "-i", str(video_concat_list),
                   "-c:v", str(final_codec), "-preset", "ultrafast",
                   "-crf", str(final_crf), "-an", str(temp_video)]
        else:
            cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                   "-i", str(video_concat_list),
                   "-c:v", "copy", "-an", str(temp_video)]
        ok = atomic_replace_temp(temp_video, cmd)
        if not ok or not temp_video.exists():
            print("ERROR: Failed to create temp video")
            sys.exit(1)
        vid_size = temp_video.stat().st_size / (1024 * 1024)
        print(f"  Created temp video ({vid_size:.1f} MB) "
              f"[{'re-encoded' if mismatch else 'stream copy'}]")

        # Step 3: Mux audio on video (video stream untouched, audio encoded to aac)
        print("\n--- Step 3: Merging video and audio ---")
        versions_dir.mkdir(exist_ok=True)
        next_version = find_next_version(versions_dir, safe_title)
        output_file = versions_dir / f"{safe_title}-v{next_version}.mp4"
        sfx_cfg = cfg.get("sfx", {})
        bcfg = cfg.get("bgm", {})
        # Limiter aims 0.5 dB BELOW the published ceiling: the final mix is
        # lossy-encoded (AAC) after limiting, and lossy reconstruction peaks
        # routinely read ~0.1-0.3 dB hotter than the limited PCM. Without this
        # headroom, compliant mixes trip the ceiling assertion by ~0.1 dB.
        limit = 10.0 ** ((sfx_cfg.get("true_peak_ceiling_db", -1.0) - 0.5) / 20.0)

        def _ffmpeg_measure(cmd, pattern, last=False, timeout=300):
            for attempt in (1, 2):
                r = _run_ffmpeg(cmd, timeout=timeout)
                if r is None:
                    print(f"  WARNING: loudness probe timed out "
                          f"({timeout}s, attempt {attempt}/2) — "
                          f"{'retrying' if attempt == 1 else 'giving up'}")
                    continue
                text = r.stdout + r.stderr
                try:
                    if last:
                        ms = re.findall(pattern, text, re.MULTILINE)
                        return float(ms[-1]) if ms else None
                    m = re.search(pattern, text)
                    return float(m.group(1)) if m else None
                except ValueError:
                    return None
            return None

        def _pre_commit(tmp_file):
            """SFX/BGM loudness assertions — run on the tmp file before publishing."""
            if not (have_sfx or have_bgm):
                return True
            final_peak = _ffmpeg_measure(
                ["ffmpeg", "-i", str(tmp_file), "-map", "0:a",
                 "-filter:a", "volumedetect", "-f", "null", "-"],
                r"max_volume\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*dB", timeout=300)
            final_I = _ffmpeg_measure(
                ["ffmpeg", "-i", str(tmp_file), "-map", "0:a",
                 "-filter:a", "ebur128", "-f", "null", "-"],
                r"^\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", last=True, timeout=600)
            if final_peak is None or final_I is None:
                print("  ERROR: loudness probes failed twice — refusing to publish "
                      "an unverified mix (free RAM/CPU and re-run continue)")
                return False
            problems = []
            if final_peak is not None and final_peak > sfx_cfg.get("true_peak_ceiling_db", -1.0):
                problems.append(
                    f"final true peak {final_peak:.1f} dB exceeds ceiling "
                    f"{sfx_cfg['true_peak_ceiling_db']} dB — reduce sfx/bgm cue volumes")
            if final_I is not None and vo_I is not None \
                    and final_I > vo_I + sfx_cfg.get("integrated_max_offset_db", 1.5):
                problems.append(
                    f"final integrated loudness {final_I:.1f} LUFS is more than "
                    f"{sfx_cfg['integrated_max_offset_db']} dB above voiceover alone ({vo_I:.1f} LUFS) "
                    f"— too many overlapping cues or loud beds; reduce volumes")
            for p in problems:
                print(f"  ERROR: {p}")
            if problems:
                return False
            if final_I is not None and vo_I is not None and final_peak is not None:
                print(f"  Loudness: final {final_I:.1f} LUFS vs voiceover {vo_I:.1f} LUFS "
                      f"(peak {final_peak:.1f} dB)")
            return True

        if not (have_sfx or have_bgm):
            cmd = ["ffmpeg", "-y",
                   "-i", str(temp_video),
                   "-i", str(aligned_audio),
                   "-map", "0:v:0", "-map", "1:a:0",
                   "-c:v", "copy",
                   "-c:a", str(final_audio_codec), "-b:a", "192k",
                   "-shortest",
                   "-movflags", "+faststart",
                   str(output_file)]
        else:
            b = (f"threshold={bcfg.get('duck_threshold_db', -25.0)}dB"
                 f":ratio={bcfg.get('duck_ratio', 8.0)}"
                 f":attack={bcfg.get('duck_attack_ms', 5.0)}"
                 f":release={bcfg.get('duck_release_ms', 250.0)}")
            # dropout_transition=0 is required with normalize=0 on modern ffmpeg.
            # level=false: this ffmpeg build defaults alimiter to auto-level (level=true),
            # which pushes quiet mixes up toward full scale instead of merely capping.
            lim = f"alimiter=limit={limit:.4f}:level=false"
            if have_sfx and have_bgm:
                fc = (f"[1:a]asplit=2[vo][sc];"
                      f"[3:a][sc]sidechaincompress={b}[bgmd];"
                      f"[vo][2:a][bgmd]amix=inputs=3:normalize=0:duration=longest:dropout_transition=0"
                      f",{lim}[amx]")
                inputs = [str(temp_video), str(aligned_audio),
                          str(sfx_track), str(bgm_track)]
            elif have_sfx:   # sfx only — no sidechain needed
                fc = (f"[1:a][2:a]amix=inputs=2:normalize=0:duration=longest:dropout_transition=0"
                      f",{lim}[amx]")
                inputs = [str(temp_video), str(aligned_audio), str(sfx_track)]
            else:   # bgm only — sidechain needs the asplit on the voiceover
                fc = (f"[1:a]asplit=2[vo][sc];"
                      f"[2:a][sc]sidechaincompress={b}[bgmd];"
                      f"[vo][bgmd]amix=inputs=2:normalize=0:duration=longest:dropout_transition=0"
                      f",{lim}[amx]")
                inputs = [str(temp_video), str(aligned_audio), str(bgm_track)]
            argv = ["ffmpeg", "-y"]
            for inp in inputs:
                argv += ["-i", inp]
            cmd = argv + ["-filter_complex", fc,
                          "-map", "0:v:0", "-map", "[amx]",
                          "-c:v", "copy",
                          "-c:a", str(final_audio_codec), "-b:a", "192k",
                          "-shortest", "-movflags", "+faststart",
                          str(output_file)]
        ok = atomic_replace_temp(output_file, cmd, pre_commit=_pre_commit)
        if not ok or not output_file.exists():
            print("ERROR: Failed to create final video")
            sys.exit(1)

        # Audio sanity check: volumedetect
        mean_volume = None
        vd_result = _run_ffmpeg(
            ["ffmpeg", "-i", str(output_file), "-map", "0:a",
             "-filter:a", "volumedetect", "-f", "null", "-"],
            timeout=300)
        if vd_result is None:
            print("  WARNING: could not verify final audio level (ffmpeg unavailable) — publishing anyway")
        else:
            m = re.search(
                r"mean_volume\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*dB",
                vd_result.stdout + vd_result.stderr
            )
            if m:
                try:
                    mean_volume = float(m.group(1))
                except ValueError:
                    mean_volume = None
            if mean_volume is None:
                print("  WARNING: could not measure final audio level — publishing anyway")
            elif mean_volume < -40.0:
                print("ERROR: Final video is silent or near-silent — mux likely picked scene audio instead of voiceover")
                sys.exit(1)
        if mean_volume is None:
            print("  Audio level: unknown (probe failed) — mux verified by filter graph, publishing")
        else:
            print(f"  Audio level: {mean_volume:.1f} dB")

        # Duration sanity check (post-publish, informational — the real sync
        # gate ran pre-publish in Step 1 against the frame timeline).
        if total_frames > 0:
            expected_total = total_frames / float(fps)
        else:
            expected_total = data.get("total_actual_seconds") or sum(
                (s.get("actual_duration_seconds") or 0) for s in scenes)
        actual_dur = pl.get_audio_duration(output_file)
        if actual_dur == 0.0:
            print("  WARNING: could not measure final duration (ffprobe unavailable)")
        elif abs(actual_dur - expected_total) > 0.5:
            print(f"  WARNING: final duration {actual_dur:.2f}s vs expected "
                  f"{expected_total:.2f}s (drift {abs(actual_dur-expected_total):.2f}s)")
        else:
            print(f"  Duration: {actual_dur:.2f}s (expected {expected_total:.2f}s — OK)")

        final_size = output_file.stat().st_size / (1024 * 1024)
        print(f"\n=== Final video created ===")
        print(f"  Output: {output_file}")
        print(f"  Size: {final_size:.1f} MB")
        print(f"  Version: v{next_version}")

        # Post-stitch cleanup (retention config)
        ren = cfg.get("retention", {})
        if ren.get("clean_voiceover_aligned_after_stitch", True):
            if aligned_audio.exists():
                aligned_audio.unlink(missing_ok=True)
                print(f"  Cleaned: {aligned_audio.name}")
        # Prune old versions
        keep_v = ren.get("keep_versions", 2)
        to_prune = pl.find_versions_to_prune(
            versions_dir, safe_title,
            r'{title}-v(\d+)\.mp4', keep_v)
        for old in to_prune:
            old.unlink(missing_ok=True)
            print(f"  Pruned old version: {old.name}")

    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
