# Briefs, storyboards & playbooks

Design the piece on paper before writing a line of code. A storyboard takes five minutes and prevents the most expensive mistake: building beautiful scenes in the wrong order.

Contents: 1 The brief (and defaults) · 2 Story shape · 3 The storyboard table · 4 Playbooks by video type · 5 Pacing & copy rules

---

## 1. The brief: extract, then **decide**

Don't interrogate. Pull what's in the request, **assume the rest, and state the assumptions in 2–3 lines** so the user can correct them. One clarifying question at most, and only if the answer would change the whole structure (e.g. "is there a voice-over?").

| need | if unspecified, default to |
|---|---|
| purpose + audience | infer from the subject; write it as one sentence |
| platform → **format** | 16:9 1920×1080 · (social/mobile/"reel"/"short"/"TikTok" → 9:16 1080×1920) |
| **duration** | 15 s ad / 30 s launch / 5 s logo / 60 s explainer: see playbooks |
| fps | 30 (60 for screen recordings, 24 for cinematic) |
| tone → **personality** | infer from subject (table in `motion-language.md` §6) |
| **concept** (one-line metaphor) | invent one; it unifies motion and visuals |
| brand assets (logo, colours, fonts, copy) | honour them exactly if supplied; else pick a palette + pairing |
| **audio** | none supplied → silent + a cue sheet; ask if a licensed track exists |
| CTA | a verb + outcome ("Start building") + URL/handle |
| deliverables | one master + the other aspect ratios the platform needs |

**Brief card** (write this at the top of your plan):
> *Purpose:* … · *Audience:* … · *Platform/format:* 9:16, 1080×1920, 30 fps, 15 s · *Personality:* Precise · *Concept:* "everything locks to a grid" · *Palette/type:* `midnight`, InterTight + Inter · *Audio:* none (cue sheet) · *CTA:* "Start building →"

---

## 2. Story shape

**Hook → Build → Payoff → Resolve.** Every beat has **one idea**.

- **Hook** (0–2 s social · 0–4 s longer): a bold claim or a striking image. The first frame is already a composition (pre-roll the hero, `at = −0.1`). Viewers decide in ~1 s.
- **Build:** problem → benefit → mechanism, each as a distinct beat. Escalate: each beat slightly bigger/faster or more specific than the last.
- **Payoff:** the proof moment: the number, the demo, the reveal. This is the **biggest move** of the piece (and the first beat of a music phrase).
- **Resolve:** the end card. Lockup assembles by ~60% of the last scene, then **holds ≥ 1.5 s**. It should work as a poster on its own.

Tempo should **vary**: burst → flow → rest. A piece that is all burst numbs; all rest bores. The energy graph from `filmstrip.py --energy` should look like a skyline with valleys, not a plateau.

---

## 3. The storyboard table

| # | time (s) | beat | viewer must learn / feel | hero (one) | support | motion idea | out-transition | sound |
|---|---|---|---|---|---|---|---|---|
| 1 | 0–2.0 | Hook | "this is different" | headline "Make motion feel inevitable." | kicker | words mask-up, camera creep | crossfade | hit @0.1 |
| 2 | 2.0–5.5 | Build | three ideas | 3 cards | icons pop after cards land | stagger 0.16 s, float | crossfade | ticks |
| 3 | 5.5–9.0 | Payoff | it works | **$4.2M** counter | bar chart, trend line | count ↑ 1.7 s, bars stagger | crossfade | riser → ding |
| 4 | 9.0–12.5 | Resolve | what to do | logo lockup + CTA | URL | ring draws, wordmark masks, CTA pops | none (hold ≥ 1.5 s) | impact |

Fill it, check durations sum (minus transition overlaps), check **one hero per row**, check tempo varies. Scene durations then become **constants** that feed both the scenes and the composition's `durationInFrames`.

---

## 4. Playbooks by video type (seconds; adjust to the personality)

**Logo sting / bumper: 4–6 s**
`0–0.5` anticipation (a line, a spark; riser) · `0.5–1.8` mark assembles/draws (hero 0.8–1.2 s) · `1.8–2.6` wordmark lands (mask) · `2.6–5` **hold ≥ 1.5 s** with a subtle shine/ambient. Impact on the lock-up frame. Deliver 16:9 + 1:1, and a transparent-background version if asked.

**15 s social ad (9:16)**
`0–1.5` **hook**: claim ≤ 6 words, big, already visible at frame 0 · `1.5–6` three beats of ~1.5 s: problem / benefit / feature, one line + one visual each · `6–11` proof or demo (one hero) · `11–15` CTA lockup by 12.5 s, **hold ≥ 2 s**. Cut every 1.5–2.5 s, on the beat. Stay in the 9:16 safe zone. Burn in captions if there's speech.

**30 s product launch (16:9)**
`0–3` title (kicker + headline + mark) · `3–9` problem/opportunity (2 beats) · `9–21` product in action: **3 features × ~4 s**, each a UI hero shot with a camera move + callouts · `21–26` proof (stat / quote / logos) · `26–30` CTA, hold ≥ 2 s. Scenes 3–5 s, transitions 0.4–0.6 s.

**60–90 s explainer**
`0–8` hook + promise · `8–25` the problem, relatable, 3 beats · `25–55` the solution in **3 steps** (label → visual → result) · `55–70` benefit/proof · `70–80` CTA + hold. One idea per scene (4–8 s). **VO sets the timing:** ~2.5 words/s (150 wpm), so a 30 s VO is ~75 words; time each scene to its sentence, and start the visual ~0.2 s *before* the word it illustrates.

**Data story: 10–25 s**
question (2 s) → chart skeleton (axes, gridlines; 1 s) → **build the data** (bars stagger 0.08–0.1 s / line draws left→right; 2–3 s) → **highlight the insight** (one colour pop or zoom; 2 s) → takeaway headline (2 s) → hold.
- Annotate the insight; don't just show a chart. Direct labels beat legends. Sort bars. **One** highlight colour. Bars start at zero. Numbers `tabular-nums`. Draw bars, line and dots in **one SVG viewBox** so they can't misalign (see `Proof` in `Showcase.tsx`).

**UI / app showcase**
Frame the recording in a window/device (radius 24u, soft two-layer shadow) over the `Backdrop`. **Zoom to the region of interest** (1.3–1.8×, `ease.move`, 0.6–0.9 s) instead of showing a whole screen with unreadable text; callouts **draw on**; the cursor travels on an eased path with a click ripple. Cut or **speed-ramp** (2–4×) through waiting. Prefer 60 fps sources. Text must be ≥ ~44 px *after* zoom. Use `<Video>` from `@remotion/media` with `trimBefore`.

**Kinetic typography / quote / lyric**
One idea per line, ≤ 8 words; hierarchy by size + weight + colour; each line replaces the last via mask-out/in (`SplitText` + `exitAt`, or `useTransitionStagger`); lines land **on the beat**; hold each for reading time; one background for the whole piece. The type *is* the transition.

**Ambient loop: 3–8 s (backgrounds, social)**
Every animated value must be **periodic over exactly the loop length**: use `sin(2π·k·t/T)` with integer `k`; no one-shot eases. Last frame + 1 must equal frame 0. Verify by diffing frame 0 against frame `T`.

---

## 5. Pacing & copy rules

| personality | average shot / scene | transitions |
|---|---|---|
| Kinetic / hype | 0.8–1.5 s | hard cuts on the beat, whips |
| Social promo | 1.5–2.5 s | hard cuts, 0.2 s whips |
| Product / precise | 3–5 s | 0.4–0.6 s |
| Editorial | 3–6 s | wipes, cuts |
| Explainer | 4–10 s | 0.5 s crossfades |
| Cinematic | 4–8 s | 0.8–1.2 s dissolves |

**Copy:** ≤ 6–8 words per line · verb first · specific numbers ("4.2M", not "millions") · one idea per beat · cut adverbs · sentence case (ALL CAPS only for tiny tracked labels) · CTA = verb + outcome. If the user supplied copy, don't rewrite it; if it's too long for the beat, say so and propose a cut.
