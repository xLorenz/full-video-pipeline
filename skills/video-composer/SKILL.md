---
name: video-composer
description: >
  Compose viral YouTube videos from idea to publish: audience-first ideation,
  packaging-first validation, curiosity-architected scripting, addictive
  storytelling loops, TTS-optimized voiceover writing, retention visual editing,
  immersive audio/music, high-CTR titles and thumbnails, and pre-publish QA.
  Optimized for explainer / faceless videos. Use this skill whenever someone asks
  to plan, script, structure, edit, title, thumbnail, improve retention on, or
  make a YouTube video go viral — even if they only mention one stage like
  "write a hook", "fix my script", "improve my editing", or "my CTR is low".
license: MIT
metadata:
  author: video-composer
  version: "1.0"
---

# Video Composer — Viral YouTube Composition (Explainer / Faceless)

> Turn an idea into a video viewers cannot stop watching and cannot resist
> clicking. This skill encodes a complete composition system: every stage from
> audience selection to pre-publish QA, with why each tactic works, how to apply
> it, and what to avoid.

This file is the router. Stage-specific playbooks live in `references/` — read
only the stage you are working on, plus this file.

## Core principles (apply everywhere)

1. **Value is not enough.** Every second needs both value (lesson, fact,
   payoff the viewer came for) AND a reason-to-care (problem, mystery, stakes,
   expectation). The creator knows why something is valuable. The viewer, with
   zero context, does not — until you tell them.
2. **Dopamine = prediction, not pleasure.** The brain fires while anticipating
   an outcome, not when receiving it. Uncertainty + personal relevance =
   prediction = attention. A fully predictable video is a vending machine:
   useful, forgettable, unaddictive. An uncertain one is a slot machine: the
   same action, a completely different response. Operationally: an unresolved
   prediction means the viewer can state a bet (X vs Y); distance between bets
   is measured in seconds against the Stage 1 drain rate. Engineer at least
   one open bet at all times.
3. **Clarity enables everything; confusion kills everything.** Clarity = I know
   what is happening. Uncertainty = I don't know what happens *next* (good).
   Confusion = I don't know what is happening (fatal). Any confusion washes out
   curiosity, stakes, and novelty. You are the expert with full context; the
   viewer is a first-timer with zero context. Design for them.
4. **Experience-first.** Every choice serves the experience the viewer came for.
   Disrupting the expected experience is the fastest way to make them leave.
   Decide the promise up front (hang out, be entertained, learn fast, feel
   something) and cut anything that breaks it, no matter how clever it is.
5. **Packaging is the gate, not the afterthought.** One angle is a hypothesis;
   three scored angles is a greenlight. 1–2 angles means rework scope, 0 means
   kill — never script on a single angle. A video with no packaging angle has
   no viewer to serve.
6. **The algorithm predicts enjoyability.** Recommendation systems push videos
   predicted to be most enjoyable for each viewer. To reach millions, be the
   predicted-most-enjoyable for millions: pick an audience you understand,
   study what that audience already rewarded with views, extract what they
   value, and deliver that value better than the competition.

## Stage map — read the matching reference

| # | Stage | You produce | Reference |
|---|-------|-------------|-----------|
| 1 | Ideation & audience | Audience definition, premise with built-in progression + stakes | `references/stage-1-ideation.md` |
| 2 | Packaging-first validation | 3+ viable title/thumbnail angles or a kill decision | `references/stage-2-packaging-first.md` |
| 3 | Scripting & curiosity architecture | Curiosity-architected outline/script with reason-to-care before every payoff | `references/stage-3-scripting.md` |
| 4 | Storytelling loop | Stakes → Big Question → Head Fake → Re-hook, on repeat with zero gaps | `references/stage-4-storytelling-loop.md` |
| 5 | Voiceover & delivery | TTS-optimized spoken script with cadence, emphasis, and emotion on the page | `references/stage-5-voiceover-delivery.md` |
| 6 | Visual editing | Shot plan with variety cadence, focus direction, and invisible continuity | `references/stage-6-visual-editing.md` |
| 7 | Audio & music | SFX map + mood-blocked music with manipulation moments | `references/stage-7-audio-music.md` |
| 8 | Title & thumbnail craft | Final title + thumbnail that stack 2-3 distinct hooks and pass the 1-second test | `references/stage-8-title-thumbnail.md` |
| 9 | Pre-publish QA | Audit fixes for loops, clarity, packaging-intro match, continuity, audio | `references/stage-9-qa-publish.md` |
| X | Shorts adaptation (appendix) | 0–2s swipe-native hook, compressed sentence skeleton, terminal payoff, rewatch loop | `references/appendix-shorts.md` |

Work stages in order. Do not jump to scripting without an audience (Stage 1),
do not produce without a packaging angle (Stage 2), and do not publish without
the QA pass (Stage 9).

## How to use this skill

1. **Identify the stage.** Map the user's request to the table above. "Help
   with my video" without a stage means start at Stage 1 and walk forward.
2. **Read the stage file plus its required cross-sections.** Load the target
   reference fully, plus: for Stage 2, Stage 8 §§1–2 (legibility + build
   rules); for Stage 3, Stage 4 §§0–4 (the loop you are scripting inside);
   for Stage 5, Stage 1 §5 (mood arc) and Stage 4 §4 (bridges). Prior stage
   outputs travel too, with one correction: Stage 2 packaging works from the
   premise's *promised* peak (predicted from research), not actual moments —
   Stage 8 finalizes against the *actual* peak after the edit, and any new
   Stage 8 angle re-opens the Stage 2 gate. Never cite a section you have not
   read — inline the rule or stop.
3. **Apply the playbook, explain the why.** Each reference gives tactics with
   the psychology behind them, concrete application steps, phrasing patterns,
   and common mistakes. Prefer explaining why a tactic matters over rigid
   musts — adapt the dose to the video's promise.
4. **Enforce the stage gate before moving on.** Each reference ends with an
   exit checklist. Do not advance until it passes; looping back is cheaper
   than fixing a structural flaw in the edit or after publish.
5. **Keep score with unresolved predictions.** At any point in the composition,
   you should be able to point to the open question in the viewer's head. If
   there is a stretch with no open question, that stretch needs a hook, a
   cut, or a compress.

## Global anti-patterns (all stages)

- Trimming pauses/tangents/bad takes and calling the video done. A clean
  timeline with no attention design is still doomed.
- Connecting with and-then (`this happened and then this happened and then…`).
  It hides causality and creates exit points. Use but/therefore (Stage 3).
- Adding variety for its own sake (cuts, effects, SFX, graphics). Variety is
  seasoning: the right dose brings out flavor, too much ruins the dish.
- Repeating the same information in thumbnail and title. Stack new hooks;
  never caption the thumbnail with the title.
- Promising a secret, danger, or spectacle and delivering common knowledge, a
  calm walkthrough, or a payoff buried minutes late. The loop must pay off
  fast and honestly.
- Skipping the outsider test. You cannot self-review clarity — you have the
  curse of full context. Stage 9 is non-negotiable.

## Explainer / faceless adaptations (read first)

- There is no host charisma to fall back on, so structure carries the video:
  the curiosity architecture (Stage 3) and the storytelling loop (Stage 4)
  matter more, not less.
- "Delivery" means writing that survives text-to-speech: short sentences,
  front-loaded meaning, explicit emphasis words, punctuation that forces
  cadence (Stage 5). If a human narrates instead, the same script still works.
- Visuals must carry what a face would: every spoken thing gets a visual, and
  focus is directed explicitly every few seconds (Stage 6). A static talking
  head is replaced by B-roll and motion graphics — never by nothing.
- Packaging cannot rely on a familiar creator face, so the spotlight element
  is usually an object, symbol, or 1–3 word text hook plus contrast and
  novelty (Stage 8).
