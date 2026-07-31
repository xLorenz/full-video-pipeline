# Helper Scripts — CLI Reference

```bash
# Pipeline CLI
python3 pipeline.py --config custom.json run "my-video"        # Override config (any subcommand)
python3 pipeline.py run "my-video"                              # One-shot: scaffold (if absent) + advance (resume-safe)
python3 pipeline.py new "my-video"                               # Scaffold project only
python3 pipeline.py continue my-video                            # Run next step (creative brief or automated)
python3 pipeline.py complete my-video                             # Validate current creative phase + auto-run next automated steps
python3 pipeline.py complete my-video --step 7                    # Complete a specific step (refused if earlier steps pending)
python3 pipeline.py complete my-video --step 7 --force            # Out-of-order override (audit/doctor will flag)
python3 pipeline.py status my-video                                # Show specific project (with attempts column)
python3 pipeline.py status                                        # Show all projects
python3 pipeline.py validate my-video                              # Standalone schema validation
python3 pipeline.py validate my-video --step 6                     # Step-specific requirements
python3 pipeline.py preview my-video                                # Smoke-render scene 1
python3 pipeline.py captions my-video                               # Generate SRT + populate captions
python3 pipeline.py audit my-video                                  # Audit for violations
python3 pipeline.py doctor my-video                                 # System + project diagnostics
python3 pipeline.py clean my-video                                  # Free disk space (all safe-to-delete items)
```

## Individual scripts

**These are run by the orchestrator for you.** Per the Hard Rules in
`SKILL.md`, don't call them directly except for debugging — a manual run
bypasses idempotency checks, lint gates, atomic writes, and logging, and can
desync `scenes.json` from what's actually on disk.

```bash
python3 scripts/generate_voiceover.py videos/my-video/ --voice en-GB-RyanNeural
python3 scripts/measure_durations.py videos/my-video/
python3 scripts/render_scene.py videos/my-video/ 1
python3 scripts/assemble.py videos/my-video/
python3 scripts/generate_captions.py videos/my-video/
python3 scripts/render_thumbnail.py videos/my-video/
python3 scripts/validate.py videos/my-video/
bash scripts/check_system.sh
```
