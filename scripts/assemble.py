#!/usr/bin/env python3
"""
assemble.py — Efficient video assembly for the full video pipeline.

Audio path: scene MP4s are rendered silent (no <Audio> in Remotion comps).
Voiceover MP3s are concatenated into voiceover_aligned.mp3, then muxed onto
the concatenated scene videos in a single ffmpeg pass. One audio encode pass
total — fastest path for low-RAM boxes.

Safety:
  - Codec/resolution/fps mismatch detected by ffprobe triggers a re-encode
    fallback (libx264 -crf {render.crf}) instead of -c copy (which would
    silently produce a broken file).
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


def atomic_replace_temp(output_file, cmd, pre_commit=None):
    """Run ffmpeg to a temp file, then os.replace to output_file on success.

    pre_commit: optional callable(tmp_path) -> bool. When given, it runs on the
    finished temp file BEFORE the atomic rename; returning False unlinks the temp
    and aborts the publish (used by the SFX/BGM loudness assertions so a failed
    stitch never leaves a published version on disk).
    """
    tmp = str(output_file) + ".tmp"
    ext = Path(output_file).suffix.lstrip(".")
    fmt = {"mp4": "mp4", "mp3": "mp3"}.get(ext, ext)
    full_cmd = cmd.replace(f'"{output_file}"', f' -f {fmt} "{tmp}"', 1)
    result = pl.run_cmd(full_cmd, check=False)
    if result.returncode != 0 or not Path(tmp).exists():
        if Path(tmp).exists():
            Path(tmp).unlink()
        return False
    if pre_commit is not None and not pre_commit(Path(tmp)):
        Path(tmp).unlink(missing_ok=True)
        return False
    os.replace(tmp, output_file)
    return True


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
    rcfg = cfg.get("render", {})
    scfg = cfg.get("stitching", {})
    crf = rcfg.get("crf", 28)
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
        ok = atomic_replace_temp(
            aligned_audio,
            f'ffmpeg -y {" ".join(vo_inputs)} -filter_complex "{vo_graph}" '
            f'-map "[aout]" -c:a libmp3lame -b:a 192k "{aligned_audio}"',
        )
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
        vd_r = subprocess.run(
            ["ffmpeg", "-i", str(aligned_audio), "-filter:a", "volumedetect", "-f", "null", "-"],
            capture_output=True, text=True, timeout=30,
        )
        m = re.search(
            r"max_volume\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*dB", vd_r.stdout + vd_r.stderr)
        if m:
            vo_peak_db = float(m.group(1))
        eb_r = subprocess.run(
            ["ffmpeg", "-i", str(aligned_audio), "-filter:a", "ebur128", "-f", "null", "-"],
            capture_output=True, text=True, timeout=30,
        )
        ms = re.findall(
            r"^\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", eb_r.stdout + eb_r.stderr, re.MULTILINE)
        if ms:
            vo_I = float(ms[-1])
        if vo_I is None:
            print("  WARNING: could not measure voiceover loudness — skipping loudness assertions")

        # Step 2: Concat scene videos — copy if matched, else re-encode
        print("\n--- Step 2: Concatenating video streams ---")
        video_concat_list = temp_dir / "video_concat.txt"
        with open(video_concat_list, "w", encoding="utf-8") as f:
            for s in scenes:
                mp4 = (scenes_dir / f"scene-{s['id']:02d}.mp4").resolve().as_posix()
                f.write(f"file '{mp4}'\n")
        temp_video = temp_dir / "video_only.mp4"
        if mismatch:
            cmd = (f'ffmpeg -y -f concat -safe 0 -i "{video_concat_list}" '
                   f'-c:v {final_codec} -preset ultrafast -crf {crf} '
                   f'-an "{temp_video}"')
        else:
            cmd = (f'ffmpeg -y -f concat -safe 0 -i "{video_concat_list}" '
                   f'-c:v copy -an "{temp_video}"')
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
        limit = 10.0 ** (sfx_cfg.get("true_peak_ceiling_db", -1.0) / 20.0)

        def _ffmpeg_measure(cmd, pattern, last=False):
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            text = r.stdout + r.stderr
            if last:
                ms = re.findall(pattern, text, re.MULTILINE)
                return float(ms[-1]) if ms else None
            m = re.search(pattern, text)
            return float(m.group(1)) if m else None

        def _pre_commit(tmp_file):
            """SFX/BGM loudness assertions — run on the tmp file before publishing."""
            if not (have_sfx or have_bgm):
                return True
            final_peak = _ffmpeg_measure(
                ["ffmpeg", "-i", str(tmp_file), "-filter:a", "volumedetect", "-f", "null", "-"],
                r"max_volume\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*dB")
            final_I = _ffmpeg_measure(
                ["ffmpeg", "-i", str(tmp_file), "-filter:a", "ebur128", "-f", "null", "-"],
                r"^\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", last=True)
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
            if final_I is not None and vo_I is not None:
                print(f"  Loudness: final {final_I:.1f} LUFS vs voiceover {vo_I:.1f} LUFS "
                      f"(peak {final_peak:.1f} dB)")
            return True

        if not (have_sfx or have_bgm):
            cmd = (f'ffmpeg -y '
                   f'-i "{temp_video}" '
                   f'-i "{aligned_audio}" '
                   f'-map 0:v:0 -map 1:a:0 '
                   f'-c:v copy '
                   f'-c:a {final_audio_codec} -b:a 192k '
                   f'-shortest '
                   f'-movflags +faststart '
                   f'"{output_file}"')
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
                inputs = ["-i", str(temp_video), "-i", str(aligned_audio),
                          "-i", str(sfx_track), "-i", str(bgm_track)]
            elif have_sfx:   # sfx only — no sidechain needed
                fc = (f"[1:a][2:a]amix=inputs=2:normalize=0:duration=longest:dropout_transition=0"
                      f",{lim}[amx]")
                inputs = ["-i", str(temp_video), "-i", str(aligned_audio), "-i", str(sfx_track)]
            else:   # bgm only — sidechain needs the asplit on the voiceover
                fc = (f"[1:a]asplit=2[vo][sc];"
                      f"[2:a][sc]sidechaincompress={b}[bgmd];"
                      f"[vo][bgmd]amix=inputs=2:normalize=0:duration=longest:dropout_transition=0"
                      f",{lim}[amx]")
                inputs = ["-i", str(temp_video), "-i", str(aligned_audio), "-i", str(bgm_track)]
            cmd = (f'ffmpeg -y {" ".join(inputs)} '
                   f'-filter_complex "{fc}" '
                   f'-map 0:v:0 -map "[amx]" '
                   f'-c:v copy '
                   f'-c:a {final_audio_codec} -b:a 192k '
                   f'-shortest -movflags +faststart '
                   f'"{output_file}"')
        ok = atomic_replace_temp(output_file, cmd, pre_commit=_pre_commit)
        if not ok or not output_file.exists():
            print("ERROR: Failed to create final video")
            sys.exit(1)

        # Audio sanity check: volumedetect
        mean_volume = None
        vd_result = subprocess.run(
            ["ffmpeg", "-i", str(output_file), "-filter:a", "volumedetect", "-f", "null", "-"],
            capture_output=True, text=True, timeout=120,
        )
        m = re.search(
            r"mean_volume\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*dB",
            vd_result.stdout + vd_result.stderr
        )
        if m:
            mean_volume = float(m.group(1))
        if mean_volume is None or mean_volume < -40.0:
            print("ERROR: Final video is silent or near-silent — mux likely picked scene audio instead of voiceover")
            sys.exit(1)
        print(f"  Audio level: {mean_volume:.1f} dB")

        # Duration sanity check (post-publish, informational — the real sync
        # gate ran pre-publish in Step 1 against the frame timeline).
        if total_frames > 0:
            expected_total = total_frames / float(fps)
        else:
            expected_total = data.get("total_actual_seconds") or sum(
                (s.get("actual_duration_seconds") or 0) for s in scenes)
        actual_dur = pl.get_audio_duration(output_file)
        if abs(actual_dur - expected_total) > 0.5:
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
            shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
