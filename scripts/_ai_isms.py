"""AI-ism rules for the script linter.

Single source of truth for banned phrases, banned openers/outros, and
em-dash-overuse thresholds. Consumed by ``check_phase1_aiisms`` in
``scripts/validate.py`` and reachable via ``pipeline.py lint-script``.

The rules codify (a) the explicit banned-openers/outros already documented in
``skills/claude-youtube/.../retention-scripting-guide.md`` and
``sub-skills/script.md`` ("Hey guys welcome back", "thanks for watching",
"don't forget to", "Let me tell you about a time when") plus (b) the broader
family of common generative-AI tics ("Let's dive in", "delve into", "In the
realm of", etc.) whose presence in voiceover text reliably signals
written-prose-not-spoken-language narration.

v1 scope: exact substring matching on banned phrases, start-of-line matching
on openers, integer-threshold em-dash counts. Contraction-ratio /
sentence-length-variance heuristics are deliberately deferred to keep
false positives near zero and to avoid adding any NLP dependency.

To extend: append tuples to ``BANNED_PHRASES`` / ``OPENERS_TO_AVOID`` /
``OUTROS_TO_AVOID`` or adjust ``EM_DASH_THRESHOLD``. Each tuple carries a
human-readable ``category`` and ``suggestion`` printed to the agent at
warning time so the rewrite is self-documenting.
"""

import re

# Substring matches (case-insensitive) anywhere in voiceover_text.
# Tuple shape: (phrase, category, suggestion)
BANNED_PHRASES = [
    # Phrases the claude-youtube skill already bans explicitly.
    ("hey guys welcome back", "banned_opener",
     "Open mid-action or mid-sentence — never with a vlog intro"),
    ("hey guys", "banned_opener",
     "Open mid-action or mid-sentence — never with a vlog intro"),
    ("thanks for watching", "banned_outro",
     "Maintain energy to the final second — drop the sign-off"),
    ("don't forget to", "banned_outro",
     "State the ask once, drop the filler reminder"),
    ("let me tell you about a time when", "banned_opener",
     "Start in medias res — drop the 'let me tell you about' frame"),
    # Common generative-AI tics for spoken-script narration.
    ("let's dive in", "cliche",
     "Cut or replace with the actual transition"),
    ("in this comprehensive guide", "cliche",
     "Drop 'comprehensive' or rephrase as 'in this guide'"),
    ("in today's video", "filler",
     "Cut — viewers already know they're watching a video"),
    ("delve into", "aiism",
     "Replace with 'dig into' or 'look at'"),
    ("it's worth noting", "filler",
     "Cut — say the thing directly"),
    ("it's important to note", "filler",
     "Cut — say the thing directly"),
    ("a testament to", "aiism",
     "Replace with 'shows' or 'proves'"),
    ("in the realm of", "aiism",
     "Replace with 'in' or 'for'"),
    ("when it comes to", "filler",
     "Rephrase — usually removable"),
    ("plays a crucial role", "aiism",
     "Replace with 'matters' or 'drives'"),
    ("plays a key role", "aiism",
     "Replace with 'matters' or 'drives'"),
    ("navigate the world of", "aiism",
     "Replace with 'use' or 'work with'"),
    ("unlock the power of", "aiism",
     "Replace with 'use' or 'harness'"),
    ("in the ever-evolving", "aiism",
     "Replace with 'today's'"),
    ("a game-changer", "cliche",
     "Replace with a concrete claim"),
    ("the power of", "cliche",
     "Rephrase — usually removable"),
    ("whether you're a seasoned", "cliche",
     "Drop the audience-flattery opener"),
    ("a deep dive into", "cliche",
     "Replace with 'a close look at'"),
    ("at the end of the day", "filler",
     "Cut — say the thing directly"),
    ("in conclusion", "filler",
     "Cut — conclusions should be earned, not labelled"),
    ("to sum up", "filler",
     "Cut — say the takeaway directly"),
    ("needless to say", "filler",
     "Cut — if it's needless to say, don't say it"),
    ("it goes without saying", "filler",
     "Cut — same reason as 'needless to say'"),
]

# Start-of-line matches. Checked only against the start of the scene's first
# non-whitespace line of voiceover_text (lowercased). Tuple shape:
# (opener, category)
OPENERS_TO_AVOID = [
    ("so,", "filler"),
    ("now,", "transition"),
    ("moving on,", "transition"),
    ("moving on to", "transition"),
    ("let's talk about", "transition"),
    ("next up,", "transition"),
    ("have you ever wondered", "cliche_hook"),
    ("today we're going to", "vlog_intro"),
    ("today we are going to", "vlog_intro"),
    ("welcome back", "vlog_intro"),
    ("welcome to", "vlog_intro"),
    ("in this video", "filler"),
    ("first, let's", "filler"),
]

# Em-dash overuse threshold. >= N em-dashes in a scene with at least
# EM_DASH_MIN_WORDS spoken words warns. The word-count floor stops very short
# scenes from spuriously tripping on a single emphasized aside.
EM_DASH_THRESHOLD = 3
EM_DASH_MIN_WORDS = 30

# Pre-compiled patterns. Re-used by check_phase1_aiisms for every scene.
EM_DASH_RE = re.compile(r"\u2014")          # U+2014 em dash —
WORD_RE = re.compile(r"\b[\w']+\b")         # word with internal apostrophe (contractions)
