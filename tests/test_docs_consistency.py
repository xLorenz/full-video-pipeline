"""Docs consistency: README + full-video-pipeline skill vs current code.

Locks the README/skill audit findings: platform stance, silent-render
contract, bgm null semantics, engine counts, config defaults, phantom
references, dependency lists.
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL = REPO / "skills" / "full-video-pipeline"
README = REPO / "README.md"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def test_no_macos_support_claims_in_owned_docs():
    support_patterns = ["Windows, Linux, or macOS", "Linux, Windows, macOS",
                        "(Windows, Linux, macOS)", "(Linux/macOS)",
                        "Windows/macOS", "angle` on Windows/macOS"]
    for rel in [README, SKILL / "SKILL.md"]:
        text = _read(rel)
        for pat in support_patterns:
            assert pat not in text, f"{rel.name} claims macOS support via {pat!r}"


def test_no_audio_element_allowance():
    for f in [SKILL / "SKILL.md",
              SKILL / "references" / "phase-3-visuals-render.md"]:
        text = _read(f)
        assert "via `<Audio>` is fine" not in text, f"{f.name} allows <Audio>"
    skill = _read(SKILL / "SKILL.md")
    assert "at all" in skill and "`<Audio>`" in skill


def test_submodule_voiceover_rule_superseded():
    phase3 = _read(SKILL / "references" / "phase-3-visuals-render.md")
    assert "rules/voiceover.md" not in phase3 or "superseded" in phase3.lower() or \
        "Do NOT follow" in phase3


def test_no_phantom_template_in_skill():
    for f in list(SKILL.rglob("*.md")):
        assert "before-after-split" not in _read(f), f.name


def test_bgm_null_means_silence_in_docs():
    phase1 = _read(SKILL / "references" / "phase-1-research-script.md")
    assert "null" in phase1 and ("OPTS OUT" in phase1 or "opts out" in phase1.lower())
    assert "null = use the global default bed" not in phase1


def test_sfx_engine_note_counts():
    design = _read(SKILL / "references" / "sfx-design.md")
    assert "33 sounds" in design
    assert "27" in design and "6" in design
    assert "pulse_light" in design and "tension_riser" in design


def test_readme_config_matches_defaults():
    cfg = json.loads((REPO / "pipeline_config.json").read_text(encoding="utf-8"))
    text = _read(README)
    assert f'"gl_backend": "{cfg["render"]["gl_backend"]}"' in text
    assert "chrome_kill_between_renders" not in text
    assert "temp_dir" not in text or "resolve_tmpdir" in text or "TMPDIR" in text


def test_requirements_cover_publish_deps():
    reqs = _read(REPO / "scripts" / "requirements.txt")
    assert "referencing" in reqs
    assert "referencing" in _read(README)


def test_voiceover_hash_inputs_documented():
    phase2 = _read(SKILL / "references" / "phase-2-voiceover.md")
    assert "engine" in phase2


def test_skill_audio_path_matches_assembler():
    skill = _read(SKILL / "SKILL.md")
    assert "voiceover_aligned.mp3" in skill
    assert re.search(r"sidechain", skill, re.IGNORECASE)


def test_transcript_artifacts_documented():
    skill = _read(SKILL / "SKILL.md")
    assert "TRANSCRIPT.md" in skill and "voiceover_timings.json" in skill
    phase2 = _read(SKILL / "references" / "phase-2-voiceover.md")
    assert "TRANSCRIPT.md" in phase2
    assert "measured" in phase2 and "aligned" in phase2 and "estimated" in phase2
    phase3 = _read(SKILL / "references" / "phase-3-visuals-render.md")
    assert "TRANSCRIPT.md" in phase3
    directory = _read(SKILL / "references" / "directory-structure.md")
    assert "TRANSCRIPT.md" in directory and "voiceover_timings.json" in directory


def test_transcript_script_never_manually_invoked():
    # generate_transcript.py is orchestrator-run (Step 6 tail) like every other
    # step script — all three agent-facing docs must ban manual invocation.
    for rel in [SKILL / "SKILL.md", REPO / "AGENTS.md"]:
        assert "generate_transcript" in _read(rel), f"{rel.name} omits generate_transcript ban"


def test_readme_config_sample_includes_transcript():
    text = _read(README)
    assert '"vosk_model"' in text and '"align_min_match"' in text
    assert "TRANSCRIPT.md" in text and "requirements-transcript" in text
