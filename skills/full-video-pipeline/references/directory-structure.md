# Directory Structure

```
videos/{video-title}/
├── SCRIPT.md                  # Phase 1: full retention-optimized script
├── VOICEOVER.md               # Phase 2: parseable voiceover text per scene
├── STYLES.md                  # Phase 3: visual style guide
├── TITLE.md                   # Phase 4: 3 YouTube title variants
├── DESCRIPTION.md             # Phase 4: YouTube description with timestamps
├── TAGS.md                    # Phase 4: 10-15 YouTube tags
├── scenes.json                # Structured scene data (durations, status, files, hashes, visual_notes)
├── pipeline_state.json        # Pipeline progress (per-step attempts + last_error) — orchestrator-owned, read via `pipeline.py status`
├── voiceover_aligned.mp3      # Concatenated voiceover (created by assemble.py)
├── {title}.srt                # Optional caption sidecar (Phase 2 captions command)
├── remotion/                  # Remotion project (scaffolded per video)
│   ├── PLAN.md                # Rebuild plan before coding (Step 8)
│   ├── src/
│   │   ├── Root.tsx           # Compositions: MainVideo + Thumbnail
│   │   ├── components/
│   │   │   ├── MainVideo.tsx  # Sequence-based scene loader (imports SCENE_MAP)
│   │   │   └── Thumbnail.tsx  # Thumbnail composition (written in Phase 4)
│   │   ├── lib/
│   │   │   ├── types.ts
│   │   │   ├── config.ts
│   │   │   └── styles.ts
│   │   └── scenes/
│   │       ├── SceneMap.generated.ts   # auto-generated in Step 9 — do NOT edit
│   │       └── SceneXX.tsx
│   └── public/
├── voiceover/                 # Generated .mp3 files
├── scenes/                    # Rendered .mp4 scene files (silent video)
├── logs/                      # Per-step + per-scene append-only logs
└── versions/                  # Final stitched .mp4 + thumbnail .png
    ├── {title}-v1.mp4
    └── {title}-thumbnail-v1.png
```

Repo root (for context — you generally won't need to touch these directly):

```
full-video-pipeline/
├── SKILL.md                     # This skill, master orchestrator entry point
├── pipeline.py                  # CLI: run, new, continue, complete, status, validate, preview, captions, audit, doctor, clean
├── pipeline_config.json         # Default settings (voice, render, system limits)
├── scripts/                     # Orchestrator-invoked helper scripts — don't call these yourself (see Hard rules)
├── animations/                  # Animation template catalog (README.md, CATALOG.md, SCHEMA.md)
├── remotion-foundation/         # Template for new Remotion projects
├── schemas/                     # JSON schemas for scenes.json + pipeline_state.json
├── skills/                      # Script-writing / Remotion / SEO / thumbnail reference skills (submodules)
└── videos/                      # Auto-managed per-video projects (gitignored) — structure above
```
