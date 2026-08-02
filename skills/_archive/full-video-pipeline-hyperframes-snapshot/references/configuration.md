# Configuration

Defaults are in `pipeline_config.json`. Override per-video as needed. The
config supports a three-layer merge:

1. **Repo-root** `pipeline_config.json` — defaults
2. **`--config <path>`** CLI flag — override any subset (passed before the subcommand)
3. **Per-video auto-discovery** — `videos/<title>/pipeline_config.json`
   (enable/disable via `config_files.auto_discover_per_video`)

Key sections:
- `video.fps`, `video.width`, `video.height` — composition settings
- `video.burn_captions` — render `<Captions>` layer when scene has cues (default `false`)
- `voiceover.voice` — edge-tts voice name (list voices: `edge-tts --list-voices`)
- `render.*` — rendering guardrails (concurrency, codec, memory limits)
- `system.*` — resource thresholds
- `retention.*` — disk cleanup flags (table below)
- `skills.sources` — skill file paths per phase (each entry has `name`, `path`, `phases` mapping)
- `steps.{step_key}.command_template` — plugin escape hatch for automated step commands
- `config_files.auto_discover_per_video` — enable/disable per-video config discovery (default `true`)

## Full example

```json
{
  "skills": {
    "sources": [
      {
        "name": "claude-youtube",
        "path": "skills/claude-youtube/skills/claude-youtube",
        "phases": {
          "1": ["sub-skills/script.md", "references/retention-scripting-guide.md"],
          "4": ["sub-skills/metadata.md", "references/seo-playbook.md",
                 "sub-skills/thumbnail.md", "references/thumbnail-ctr-guide.md"]
        }
      },
      {
        "name": "hyperframes",
        "path": "skills/hyperframes/skills",
        "phases": {
          "3": ["hyperframes-core/SKILL.md", "hyperframes-animation/SKILL.md",
                "hyperframes-keyframes/SKILL.md", "hyperframes-registry/SKILL.md"]
        }
      }
    ]
  },
  "steps": {
    "5_voiceover_generation": {
      "command_template": "python3 scripts/generate_voiceover.py {video_dir} --voice {voiceover.voice}"
    },
    "6_duration_measurement": {
      "command_template": "python3 scripts/measure_durations.py {video_dir}"
    },
    "9_scene_rendering": {
      "command_template": "python3 scripts/render_scene.py {video_dir} {scene_id}"
    },
    "10_stitching": {
      "command_template": "python3 scripts/assemble.py {video_dir}"
    },
    "13_thumbnail_rendering": {
      "command_template": "python3 scripts/render_thumbnail.py {video_dir}"
    }
  },
  "config_files": {
    "auto_discover_per_video": true
  },
  "video": {
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "target_scene_duration_seconds": 10,
    "burn_captions": false
  },
  "voiceover": {
    "voice": "en-GB-RyanNeural",
    "rate": "+0%",
    "volume": "+0%",
    "pitch": "+0Hz",
    "concurrency": 3
  },
  "hyperframes": {
    "cli_version": "0.7.61"
  },
  "render": {
    "concurrency": 1,
    "timeout_ms": 60000,
    "quality": "standard",
    "crf": 28,
    "workers": 1
  },
  "stitching": {
    "final_codec": "libx264",
    "final_audio_codec": "aac",
    "final_crf": 23
  },
  "system": {
    "min_available_ram_mb": 200,
    "min_available_disk_mb": 500,
    "chrome_kill_between_renders": true,
    "post_render_settle_seconds": 5,
    "temp_dir": "/tmp/hyperframes/{title}"
  },
  "retention": {
    "keep_versions": 2,
    "clean_voiceover_aligned_after_stitch": true,
    "clean_remotion_node_modules_after_step_13": true,
    "clean_preview_after_success": true,
    "reap_remotion_tmpdir_after_render": true,
    "max_log_size_mb": 0,
    "keep_last_n_log_runs": 10,
    "clean_scene_mp4s_after_stitch": false
  }
}
```

> **Note on `skills.sources` → `hyperframes`**: this entry points at
> `skills/hyperframes/skills/hyperframes-*/SKILL.md`. If that bundle hasn't
> been populated in your checkout, Phase 3 falls back per the rule in the
> main `SKILL.md`'s "Skill file loading" section — this isn't a config bug,
> just a bundle that's still pending.

> **Note on `hyperframes.cli_version`**: Phase 3's rendering constraints
> (e.g. no `--frames=N-M` flag) are tied to this exact pinned version. If you
> bump it, re-check `references/phase-3-visuals-render.md` for anything that
> assumed the old version's limitations.

The `steps.{key}.command_template` strings support `{variable}` substitution:
`{video_dir}`, `{scene_id}`, and any dotted config path (e.g., `{voiceover.voice}`,
`{render.crf}`, `{video.fps}`). Override a template per-video to swap in a different
binary or plugin without touching the orchestrator code.

List available voices: `edge-tts --list-voices`

## Disk Cleanup

The pipeline accumulates files across runs. Retention is controlled by the
`retention` key in `pipeline_config.json` (all optional, sensible defaults):

| Flag | Default | Effect |
|------|---------|--------|
| `keep_versions` | `2` | Keep only the N most recent MP4 + thumbnail PNG versions |
| `clean_voiceover_aligned_after_stitch` | `true` | Delete `voiceover_aligned.mp3` after stitch succeeds |
| `clean_remotion_node_modules_after_step_13` | `true` | Delete `hyperframes/node_modules/` (if present) after the final step completes. Key name retained for backward-compat. |
| `clean_preview_after_success` | `true` | Delete `.preview/` after a successful smoke preview |
| `reap_remotion_tmpdir_after_render` | `true` | Delete the per-video temp dir after each render (saves disk, forfeits bundle-cache speed). Key name retained for backward-compat. |
| `clean_scene_mp4s_after_stitch` | `false` | Delete `scenes/*.mp4` after stitch — **re-stitch requires re-render** |
| `max_log_size_mb` | `0` | Rotate logs when they exceed this size (0 = unlimited, no rotation) |
| `keep_last_n_log_runs` | `10` | Keep at most this many rotated log archives |

To force-clean a completed video (respects `keep_versions` and
`clean_scene_mp4s_after_stitch`; clears everything else unconditionally):

```bash
python3 pipeline.py clean <title>
```
