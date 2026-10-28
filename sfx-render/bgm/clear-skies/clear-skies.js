/**
 * CLEAR SKIES — chill, still-moving piano background music for Tone.js (v14.7.x)
 * ---------------------------------------------------------------------------------
 * 94.5 BPM · C major · 48 bars (≈ 2 min) — made for explainer videos: warm, forward-moving, never pushy.
 *
 *   PART 1  bars  1–16   INTRO   solo piano arpeggios → the melody enters → soft groove → build → one beat of air
 *   PART 2  bars 17–32   LIFT    the beat and bass arrive: full melody, marimba pings, warm pad  (the "drop")
 *   PART 3  bars 33–48   LOOP    steady, voice-over-friendly groove that repeats seamlessly (bar 48 → bar 33)
 *
 * HARMONY — an 8-bar cycle over a stepwise-descending bass line (C B A G · F E D · G):
 *
 *   | Cmaj9 | Em7/B | Am9 | G6 | Fmaj9 | Fm6  →  C/E | Dm9 | G7sus4  →  G7 |  → Cmaj9
 *     I       iii7    vi9   V6   IV9     iv6 (borrowed) I6    ii9    V7sus4   V7
 *
 *   • The upper voices were picked by a small dynamic-programming search for minimal motion: on average a voice moves
 *     0.75 semitones per chord change, and 23 of the 40 voice-moves in the cycle are "stay put".
 *   • The borrowed iv chord (Fm6) brings A♭, which falls a half-step to G just as C/E lands — the bittersweet moment.
 *   • G7sus4 → G7 → Cmaj9: C falls to B, then F falls to E; every other voice is a common tone.
 *   (Notes are spelled with sharps only, so "G#3" below is A♭3.)
 *
 * SOUNDS — the piano is the Salamander Grand Piano by Alexander Holm (CC BY 3.0), played through Tone.Sampler from the
 *   Tone.js audio repo (needs a network connection, or a local copy — see render-clear-skies.mjs). Everything else is
 *   synthesised: an FM marimba, a low-passed saw pad, a sine + triangle bass and a soft lo-fi drum kit.
 *
 * USAGE
 *   Browser:  <script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js"></script>
 *             <script src="clear-skies.js"></script>
 *             // inside a click handler (browsers need a user gesture before audio):
 *             const song = await ClearSkies.play(Tone, { loop: true });   // loop:false → plays once and ends on the tonic
 *             song.start();            // or song.start('lift') / song.start('loop');   song.stop();
 *   Offline:  render-clear-skies.mjs renders it with Tone.Offline → full MP3, loop MP3, loop WAV
 *   Score:    ClearSkies.compose() → plain [{ t, v, ...params }] events that createRig() performs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClearSkies = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ─────────────────────────── TIME GRID ─────────────────────────── */
  const BPM = 94.5;                 // chosen so that a bar is exactly 112,000 samples @ 44.1 kHz = 875 × the 128-sample Web Audio render
  const BEAT = 60 / BPM;            // 0.635 s       quantum: every bar of an offline render is then sample-identical, and a loop is exact
  const BAR = BEAT * 4;             // 2.54 s
  const STEP = BAR / 16;            // one 16th note
  const PART = { intro: 0, lift: 16, loop: 32, end: 48 };         // section starts, in bars (0-indexed)
  const at = (bar, step = 0) => bar * BAR + step * STEP;         // transport time in seconds
  const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';

  /* ─────────────────────────── NOTE MATH ─────────────────────────── */
  const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const NAMES = Object.keys(PC);
  const midi = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return PC[m[1]] + 12 * (+m[2] + 1); };
  const shift = (n, semis) => { const v = midi(n) + semis; return NAMES[v % 12] + (Math.floor(v / 12) - 1); };

  /* ─────────────────────────── HARMONY ───────────────────────────
   * bass = the lowest note (piano left hand + synth bass); up = the four upper-structure notes (voice-led, see above). */
  const CHORDS = {
    Cmaj9:  { name: 'Cmaj9',  bass: 'C2', up: ['G3', 'B3', 'D4', 'E4'] },
    EmB:    { name: 'Em7/B',  bass: 'B1', up: ['G3', 'B3', 'D4', 'E4'] },
    Am9:    { name: 'Am9',    bass: 'A1', up: ['G3', 'B3', 'C4', 'E4'] },
    G6:     { name: 'G6',     bass: 'G1', up: ['G3', 'B3', 'D4', 'E4'] },
    Fmaj9:  { name: 'Fmaj9',  bass: 'F2', up: ['G3', 'A3', 'C4', 'E4'] },
    Fm6:    { name: 'Fm6',    bass: 'F2', up: ['F3', 'G#3', 'C4', 'D4'] },    // G#3 = A♭3, the borrowed note
    CoverE: { name: 'C/E',    bass: 'E2', up: ['E3', 'G3', 'C4', 'E4'] },
    Dm9:    { name: 'Dm9',    bass: 'D2', up: ['F3', 'C4', 'D4', 'E4'] },
    G7sus:  { name: 'G7sus4', bass: 'G1', up: ['G3', 'C4', 'D4', 'F4'] },
    G7:     { name: 'G7',     bass: 'G1', up: ['G3', 'B3', 'D4', 'F4'] },
  };
  /* one entry per bar: [chord, from-step, to-step] — two bars of the cycle change chord on beat 3 */
  const CYCLE = [
    [['Cmaj9', 0, 16]], [['EmB', 0, 16]], [['Am9', 0, 16]], [['G6', 0, 16]],
    [['Fmaj9', 0, 16]], [['Fm6', 0, 8], ['CoverE', 8, 16]], [['Dm9', 0, 16]], [['G7sus', 0, 8], ['G7', 8, 16]],
  ];
  const segsAt = (bar) => CYCLE[bar % 8].map(([k, from, to]) => ({ chord: CHORDS[k], from, to }));
  const chordAtStep = (bar, step) => segsAt(bar).find((g) => step >= g.from && step < g.to).chord;
  const pool5 = (c) => [...c.up, shift(c.up[0], 12)];                              // arpeggio pool, G3–G4 register
  const poolHi = (c) => [...c.up.map((n) => shift(n, 12)), shift(c.up[0], 24)];    // marimba pool, one octave up

  /* ─────────────────────────── MELODY ───────────────────────────
   * One bar = 16 tokens (16th notes):  NOTE = new note,  - = hold,  . = rest.
   * Strong beats land on chord tones; the 9ths and passing notes sit on weak beats. The last bar is a suspension
   * (C over G7sus4) that resolves to B on beat 3, then steps D → E to pick up the next Cmaj9.                */
  const MEL_A = [
    'E5 - - - - - D5 - C5 - - - D5 - E5 -',       // Cmaj9
    'G5 - - - - - E5 - D5 - - - B4 - D5 -',       // Em7/B
    'C5 - - - - - B4 - A4 - - - B4 - C5 -',       // Am9
    'E5 - - - - - D5 - B4 - - - D5 - E5 -',       // G6
    'A5 - - - - - G5 - E5 - - - C5 - E5 -',       // Fmaj9      (the peak of the phrase)
    'G#5 - - - - - G5 - E5 - - - C5 - D5 -',      // Fm6 | C/E  (A♭ falls to G)
    'F5 - - - - - E5 - D5 - - - A4 - C5 -',       // Dm9
    'C5 - - - - - - - B4 - - - - - D5 -',         // G7sus4 | G7
  ];
  /* second statement: the same tune, syncopated and climbing to C6 */
  const MEL_B = [
    'G5 - - - E5 - - D5 - - C5 - D5 - E5 -',
    'D5 - - - B4 - - G4 - - B4 - D5 - G5 -',
    'E5 - - - C5 - - A4 - - C5 - E5 - G5 -',
    'G5 - - - E5 - - D5 - - B4 - D5 - E5 -',
    'A5 - - - C6 - - A5 - - G5 - E5 - G5 -',
    'G#5 - - - G5 - F5 - E5 - - - G5 - - -',
    'F5 - - - E5 - D5 - C5 - - - A4 - C5 -',
    'C5 - - - - - - - B4 - - - D5 - E5 -',
  ];
  function parseLine(str) {
    const toks = str.trim().split(/\s+/);
    if (toks.length !== 16) throw new Error('A bar needs 16 steps: ' + str);
    const out = []; let cur = null;
    toks.forEach((t, i) => {
      if (t === '-') { if (cur) cur.len++; }
      else if (t === '.') cur = null;
      else out.push((cur = { step: i, note: t, len: 1 }));
    });
    return out;
  }

  /* ─────────────────────────── PATTERNS ───────────────────────────
   * Arpeggio shapes: indices into pool5() — [root-ish, …, top].  Eighth notes: A on even bars, B on odd bars.        */
  const ARP_A = [0, 2, 3, 4, 3, 2, 1, 2];
  const ARP_B = [0, 1, 3, 4, 2, 4, 3, 1];
  const ARP_S = [0, 2, 4, 3];                                       // sparse quarter-note version for the first bars
  const PING = [1, 3, 2, 4];                                        // marimba pings (indices into poolHi) on the off-beats

  /* Drum strings: 16 characters = one bar of 16th notes.  X accent · x hit · o ghost · . rest */
  const P = {
    liftKick: 'X.....x...x.....',        // beat 1, "and" of 2, "and" of 3 — a gentle bounce
    loopKick: 'X.........x.....',
    rim:      '....x.......x...',        // beats 2 and 4
    hat:      'o.x.o.x.o.x.o.x.',        // eighths, the off-beats a little stronger
    hatOpen:  'o.x.o.x.o.x.o...',        // (an open hat takes step 14)
    shaker:   'oxoxoxoxoxoxoxox',
  };
  /* Synth-bass rhythms: [step, length in 16ths]  (the second hit of the lift is an octave pop) */
  const LIFT_BASS = [[0, 5], [6, 3], [10, 5]];
  const LOOP_BASS = [[0, 8], [10, 4]];
  const INTRO_TRIM = 0.7;              // the intro is mixed ~3 dB under the rest, so the lift lands as a lift

  /* ─────────────────────────── SMALL HELPERS ─────────────────────────── */
  function rng(seed) {                      // mulberry32: reproducible "human" jitter
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const every = (t0, t1, dt) => { const out = []; for (let t = t0; t < t1 - 1e-9; t += dt) out.push(t); return out; };
  const grid = (s) => [...s].flatMap((ch, step) =>
    ch === '.' || ch === ' ' ? [] : [{ step, vel: ch === 'X' ? 1 : ch === 'x' ? 0.75 : 0.45 }]);

  /* ─────────────────────────── THE SCORE ───────────────────────────
   * compose() returns plain data — [{ t: seconds, v: voice, ...params }] — so the arrangement can be read,
   * tested and re-timed without touching any audio.                                                          */
  function compose({ ending = false } = {}) {
    const ev = [];
    const rand = rng(96);
    const add = (t, v, p = {}) => ev.push({ t, v, ...p });
    const jit = (vel, amt = 0.14) => Math.min(1, vel * (1 - amt / 2 + rand() * amt));
    const hum = (ms) => (rand() * ms) / 1000;                       // laid-back timing: notes land 0–ms late, never early
    const hits = (bar, voice, str, extra = {}, mul = 1, swing = 0, stop = 16) =>
      grid(str).forEach((h) => {
        if (h.step >= stop) return;
        add(at(bar, h.step) + (h.step % 2 ? swing * STEP : 0), voice, { vel: jit(h.vel * mul), ...extra });
      });
    const melody = (bar, lines, { stop = 16, ...extra } = {}) =>
      parseLine(lines[bar % 8]).forEach((n) => {
        if (n.step >= stop) return;
        const len = Math.min(n.len, stop - n.step);
        add(at(bar, n.step), 'mel', { note: n.note, dur: len * STEP * 0.97, hum: hum(10), ...extra, vel: jit(extra.vel) });
      });
    /** one bar of piano arpeggio; density 4 = quarter notes, 8 = eighths, 16 = sixteenths. Notes are lifted at the chord change (pedal). */
    const arps = (bar, density, vel, stop = 16) => {
      const segs = segsAt(bar);
      const seq = density === 4 ? ARP_S : density === 8 ? (bar % 2 ? ARP_B : ARP_A) : ARP_A.concat(ARP_B);
      seq.forEach((ix0, k) => {
        const step = (k * 16) / density;
        if (step >= stop) return;
        const s = segs.find((g) => step >= g.from && step < g.to);
        const ix = segs.length > 1 ? k % 4 : ix0;            // a bar that changes chord: roll each chord's four notes upward so its colour is heard at once
        add(at(bar, step), 'arp', { note: pool5(s.chord)[ix], dur: Math.min((s.to - step) * STEP, 12 * STEP) - 0.03, hum: hum(10),
                                    vel: jit(vel * (k % (density / 2) === 0 ? 1.15 : 0.9)) });
      });
    };
    const snareRoll = (times, v0, v1, tune) =>
      times.forEach((t, i) => {
        const f = times.length > 1 ? i / (times.length - 1) : 1;
        add(t, 'snare', { vel: v0 + (v1 - v0) * f, tune: tune * f });
      });
    /** every chord segment between two bars, merged when the upper voicing doesn't change (so the pad holds across them) */
    const merged = (b0, b1) => range(b0, b1)
      .flatMap((bar) => segsAt(bar).map((s) => ({ ...s, bar, t0: at(bar, s.from), t1: at(bar, s.to) })))
      .reduce((out, s) => {
        const last = out[out.length - 1];
        if (last && last.chord.up.join() === s.chord.up.join() && Math.abs(last.t1 - s.t0) < 1e-9) last.t1 = s.t1;
        else out.push({ ...s });
        return out;
      }, []);
    const bassLine = (bar, pattern, vel) => pattern.forEach(([s, len], j) => {
      const c = chordAtStep(bar, s);
      add(at(bar, s), 'bass', { note: j === 1 && pattern === LIFT_BASS ? shift(c.bass, 12) : c.bass, dur: len * STEP - 0.03, vel: jit(vel) });
    });

    /* ═════════ PART 1 · bars 1–16 · INTRO ═════════
     *  bars 1–2    sparse quarter-note arpeggio, left-hand octaves
     *  bars 3–8    eighth-note arpeggio; the pad swells in at bar 5; a shaker whispers in at bar 7
     *  bars 9–12   the melody enters; rim clicks on 2 & 4; sixteenth-note shaker
     *  bars 13–16  hats + soft kick, sixteenth-note arpeggio, a brushed snare roll and a swell — then one beat of air  */
    {
      const I = PART.intro, G = I + 8, GAP = at(I + 15, 12);

      add(at(I + 4), 'padSweep', { from: 500, to: 1800, dur: GAP - at(I + 4) });                   // pad filter slowly opens
      merged(I + 4, I + 16).forEach((s) => add(s.t0, 'pad', {
        notes: s.chord.up, dur: Math.min(s.t1, GAP) - s.t0 - 0.05, vel: 0.22 + 0.3 * ((s.bar - I - 4) / 11) }));

      range(I, I + 16).forEach((bar) => {
        const prog = (bar - I) / 15, last = bar === I + 15;
        segsAt(bar).forEach(({ chord, from, to }) => {                                              // left hand: bass + octave, pedalled
          const t0 = at(bar, from), t1 = Math.min(at(bar, to), GAP);
          add(t0, 'lh', { notes: [chord.bass, shift(chord.bass, 12)], dur: t1 - t0 - 0.03, vel: jit(0.34 + 0.16 * prog), hum: hum(6) });
          if (to - from === 16) add(at(bar, 8), 'lh', { notes: [shift(chord.bass, 12)], dur: 8 * STEP - 0.03, vel: jit(0.2 + 0.1 * prog), hum: hum(6) });
        });
        arps(bar, bar < I + 2 ? 4 : bar < I + 12 ? 8 : 16, 0.26 + 0.2 * prog, last ? 12 : 16);
        if (bar >= G) melody(bar, MEL_A, { vel: 0.5 + 0.12 * ((bar - G) / 7), stop: last ? 12 : 16 });
      });

      [I + 6, I + 7].forEach((bar) => hits(bar, 'shaker', 'x.x.x.x.x.x.x.x.', {}, 0.3, 0.1));
      const KICKS = ['', '', '', '', 'X...............', 'X.......x.......', 'X.......x.......', ''];
      range(G, I + 16).forEach((bar) => {
        const k = bar - G, stop = bar === I + 15 ? 12 : 16;
        hits(bar, 'rim', P.rim, {}, 0.45 + 0.04 * k, 0, stop);
        hits(bar, 'shaker', P.shaker, {}, 0.45, 0.12, stop);
        if (k >= 4) hits(bar, 'hat', P.hat, {}, 0.45, 0.12, stop);
        if (KICKS[k]) hits(bar, 'kick', KICKS[k], {}, 0.5);
      });
      snareRoll([...every(at(I + 14, 8), at(I + 15), 2 * STEP), ...every(at(I + 15), GAP, STEP)], 0.2, 0.55, 4);
      add(at(I + 12), 'swell', { dur: GAP - at(I + 12), f0: 600, f1: 9000, level: 0.5 });
      add(GAP, 'gate', { on: false });                                                              // one beat of air
    }

    /* ═════════ PART 2 · bars 17–32 · LIFT ═════════
     *  the groove arrives: kick/rim/snap/hats, synth bass, a warm pad, off-beat marimba pings, the full melody
     *  (octave-doubled). Bars 17–24 state the tune; bars 25–32 play the syncopated, climbing version.            */
    {
      const L = PART.lift;
      add(at(L), 'gate', { on: true });
      add(at(L), 'impact', { vel: 0.8, crash: 0.5 });
      add(at(L + 8), 'crash', { vel: 0.35 });
      merged(L, L + 16).forEach((s) => add(s.t0, 'pad', { notes: s.chord.up, dur: s.t1 - s.t0 - 0.05, vel: 0.65 }));

      range(L, L + 16).forEach((bar) => {
        const i = bar - L, B = i >= 8, fill = i % 8 === 7;
        hits(bar, 'kick', P.liftKick, {}, 1);
        hits(bar, 'rim', P.rim, {}, 0.9);
        hits(bar, 'snap', P.rim, {}, 0.7);
        hits(bar, 'hat', i % 2 ? P.hatOpen : P.hat, {}, 0.8, 0.12);
        if (i % 2) add(at(bar, 14), 'hat', { vel: jit(0.7), open: true });
        if (i >= 4) hits(bar, 'shaker', P.shaker, {}, B ? 0.6 : 0.45, 0.12);

        bassLine(bar, i === 15 ? LIFT_BASS.slice(0, 2) : LIFT_BASS, 1);
        segsAt(bar).forEach(({ chord, from, to }) => add(at(bar, from), 'lh', {
          notes: [shift(chord.bass, 12)], dur: (to - from) * STEP - 0.03, vel: jit(0.4), hum: hum(6) }));
        [2, 6, 10, 14].forEach((s, j) => add(at(bar, s), 'pluck', {
          note: poolHi(chordAtStep(bar, s))[PING[j]], dur: 0.3, pan: j % 2 ? 0.4 : -0.4, vel: jit(B ? 0.72 : 0.62) }));
        melody(bar, B ? MEL_B : MEL_A, { vel: B ? 0.98 : 0.88, dbl: B ? 0.5 : 0.4 });

        if (fill) {
          snareRoll(every(at(bar, 12), at(bar + 1), STEP), 0.3, 0.7, 5);
          add(at(bar, 8), 'swell', { dur: 8 * STEP, f0: 1500, f1: 9000, level: i === 15 ? 0.45 : 0.25 });
        }
      });
    }

    /* ═════════ PART 3 · bars 33–48 · LOOP ═════════
     *  steady and voice-over friendly: soft kick + rim + hats, a simple bass, eighth-note piano arpeggio (up on even
     *  bars, a different shape on odd ones), sustained pad, sparse marimba. Bars 41–48 add the tune, quietly.
     *  Bar 48 is the G7 that falls into bar 33's Cmaj9; a brushed roll + swell carry it across the seam.            */
    {
      const L = PART.loop;
      add(at(L), 'crash', { vel: 0.3 });
      merged(L, L + 16).forEach((s) => add(s.t0, 'pad', { notes: s.chord.up, dur: s.t1 - s.t0 - 0.05, vel: 0.36 }));

      range(L, L + 16).forEach((bar) => {
        const i = bar - L, B = i >= 8, fill = i % 8 === 7;
        hits(bar, 'kick', P.loopKick, {}, 0.75);
        hits(bar, 'rim', fill ? '....x...........' : P.rim, {}, 0.7);
        hits(bar, 'hat', i % 2 ? P.hatOpen : P.hat, {}, 0.7, 0.12);
        if (i % 2) add(at(bar, 14), 'hat', { vel: jit(0.65), open: true });
        hits(bar, 'shaker', P.shaker, {}, 0.5, 0.12);

        bassLine(bar, LOOP_BASS, 0.55);
        segsAt(bar).forEach(({ chord, from, to }) => add(at(bar, from), 'lh', {
          notes: [shift(chord.bass, 12)], dur: (to - from) * STEP - 0.03, vel: jit(0.3), hum: hum(6) }));
        arps(bar, 8, B ? 0.27 : 0.34);
        [6, 14].forEach((s, j) => add(at(bar, s), 'pluck', {
          note: poolHi(chordAtStep(bar, s))[j ? 4 : 2], dur: 0.3, pan: j ? 0.35 : -0.35, vel: jit(B ? 0.42 : 0.35) }));
        if (B) melody(bar, MEL_A, { vel: 0.44 });

        if (i === 7) ['G3', 'E3', 'C3', 'G2'].forEach((n, j) => add(at(bar, 12 + j), 'tom', { note: n, vel: 0.6 }));
        if (i === 15) {
          snareRoll(every(at(bar, 10), at(bar + 1), STEP), 0.25, 0.6, 5);
          add(at(bar, 8), 'swell', { dur: 8 * STEP, f0: 1800, f1: 9000, level: 0.35 });
        }
      });
    }

    /* ═════════ ENDING (only when the track is not looping) ═════════
     * The G7 of bar 48 finally lands: one rolled Cmaj9, a long bass note and a last marimba ping, with a long tail.   */
    if (ending) {
      const E = PART.end;
      add(at(E), 'impact', { vel: 0.45, crash: 0.4 });
      add(at(E), 'lh', { notes: ['C2', 'C3'], dur: BAR * 2.2, vel: 0.7, hum: 0 });
      add(at(E), 'pad', { notes: CHORDS.Cmaj9.up, dur: BAR * 2, vel: 0.5 });
      ['G3', 'B3', 'D4', 'E4', 'B4', 'E5'].forEach((n, k) =>
        add(at(E) + k * 0.05, 'mel', { note: n, dur: BAR * 1.8, vel: 0.55, hum: 0 }));
      add(at(E, 8), 'pluck', { note: 'G5', dur: 0.4, vel: 0.4, pan: 0.2 });
    }

    ev.forEach((e) => {                                                // section balance (see INTRO_TRIM)
      if (e.t >= at(PART.lift)) return;
      if (e.vel != null) e.vel *= INTRO_TRIM;
      if (e.level != null) e.level *= INTRO_TRIM;
    });
    return ev.sort((a, b) => a.t - b.t);
  }

  /* ─────────────────────────── TIMELINES ─────────────────────────── */
  const LOOP_LEN = at(PART.end) - at(PART.loop);               // 40.63 s = 1,792,000 samples @ 44.1 kHz

  /** One linear performance: parts 1–2, `loops` passes of part 3, then (optionally) the ending. */
  function linear({ loops = 1, ending = true } = {}) {
    const all = compose({ ending });
    const pre = all.filter((e) => e.t < at(PART.loop));
    const body = all.filter((e) => e.t >= at(PART.loop) && e.t < at(PART.end));
    const tail = all.filter((e) => e.t >= at(PART.end));
    const events = [...pre];
    for (let k = 0; k < loops; k++) body.forEach((e) => events.push({ ...e, t: e.t + k * LOOP_LEN }));
    tail.forEach((e) => events.push({ ...e, t: e.t + (loops - 1) * LOOP_LEN }));
    const end = at(PART.end) + (loops - 1) * LOOP_LEN + (ending ? 2 * BAR : 0);
    return { events: events.sort((a, b) => a.t - b.t), end };
  }

  /** Part 3 as a seamless-loop render. Times are relative to the loop start; the last `preroll` bars of the loop play first
   *  (negative times) so reverb and piano tails are already ringing at t = 0. Render from `start`, keep [0, LOOP_LEN). */
  function loopRender({ preroll = 4 } = {}) {
    const body = compose().filter((e) => e.t >= at(PART.loop) && e.t < at(PART.end)).map((e) => ({ ...e, t: e.t - at(PART.loop) }));
    const pre = body.filter((e) => e.t >= LOOP_LEN - preroll * BAR).map((e) => ({ ...e, t: e.t - LOOP_LEN }));
    return { events: [...pre, ...body].sort((a, b) => a.t - b.t), start: -preroll * BAR, end: LOOP_LEN };
  }

  const partAt = (sec) => (sec < at(PART.lift) ? 'intro' : sec < at(PART.loop) ? 'lift' : 'loop');

  /* ─────────────────────────── THE RIG ───────────────────────────
   * All sound design lives here. Every voice is a handler  (time, event) → schedules audio.
   * Signal flow:  voices → buses (piano · pad · drums · bass · fx) → master (HPF → glue comp → limiter)
   *               reverb + ping-pong delay are shared sends. The piano comes in two flavours that share the same samples:
   *               "soft" (darker, for arpeggios and left hand) and "main" (brighter, for the melody).                  */
  const GROUP = {
    arp: 'piano', mel: 'piano', lh: 'piano',
    pad: 'pad', pluck: 'pad',
    bass: 'bass',
    kick: 'drums', rim: 'drums', snap: 'drums', snare: 'drums', hat: 'drums', shaker: 'drums', tom: 'drums',
    swell: 'fx', impact: 'fx', crash: 'fx',
    gate: 'ctl', padSweep: 'ctl',
  };

  function pianoUrls() {                                          // one sample every minor third, A0 … C7
    const urls = { A0: 'A0.mp3' };
    for (let o = 1; o <= 6; o++) [['C', 'C'], ['D#', 'Ds'], ['F#', 'Fs'], ['A', 'A']].forEach(([n, f]) => { urls[n + o] = f + o + '.mp3'; });
    urls.C7 = 'C7.mp3';
    return urls;
  }

  async function createRig(Tone, opts = {}) {
    const only = opts.only ? new Set([].concat(opts.only)) : null;      // group or voice names, e.g. ['drums','mel'] → stems / debugging
    const dest = Tone.getDestination ? Tone.getDestination() : Tone.Destination;
    const send = (node, to, amt) => { const g = new Tone.Gain(amt); node.connect(g); g.connect(to); return g; };
    const lfoHz = (hz) => Math.max(1, Math.round(hz * LOOP_LEN)) / LOOP_LEN;   // whole LFO cycles per loop → a rendered loop wraps without a phase jump

    /* ── master ── */
    const master = new Tone.Gain(Math.pow(10, (opts.masterDb || 0) / 20));
    master.chain(
      new Tone.Filter({ type: 'highpass', frequency: 30, rolloff: -12 }),
      ...(opts.bypass ? [] : [new Tone.Compressor({ threshold: -20, ratio: 2, attack: 0.03, release: 0.25, knee: 10 }), new Tone.Limiter(-1)]),
      dest,
    );

    /* ── shared effects ── */
    const verb = new Tone.Reverb({ decay: 4.5, preDelay: 0.02 });                              // Tone's decay is ~1.9× the audible RT60 → about 2.4 s
    await verb.ready;
    const verbIn = new Tone.Gain(1);
    verbIn.chain(verb, new Tone.Filter({ type: 'highpass', frequency: 220 }), master);
    const echo = new Tone.PingPongDelay({ delayTime: BEAT * 0.75, feedback: 0.3, wet: 1 });   // dotted 8th
    const echoIn = new Tone.Gain(1);
    echoIn.chain(echo, new Tone.Filter({ type: 'lowpass', frequency: 4200 }), master);

    /* ── buses ── */
    const pianoBus = new Tone.Gain(1);                                  // gentle compression keeps the piano even — good for under-voice use
    pianoBus.chain(...(opts.bypass ? [] : [new Tone.Compressor({ threshold: -26, ratio: 2, attack: 0.02, release: 0.3, knee: 12 })]), master);
    const padBus = new Tone.Gain(1).connect(master);                    // pad + marimba; closes for the pre-lift beat of air
    const drums = new Tone.Gain(1);
    drums.chain(new Tone.Filter({ type: 'lowpass', frequency: 11000 }), master);   // a little lo-fi warmth
    const bassBus = new Tone.Gain(1);
    bassBus.chain(new Tone.Filter({ type: 'highpass', frequency: 32, rolloff: -12 }), master);
    const fxBus = new Tone.Gain(1).connect(master);

    /* ═════ PIANO (Salamander samples) ═════ */
    const urls = pianoUrls();
    const loadPiano = (cut, release, rev, ech) => new Promise((resolve, reject) => {
      const lp = new Tone.Filter({ type: 'lowpass', frequency: cut, rolloff: -12 });
      const s = new Tone.Sampler({ urls, baseUrl: opts.sampleBase || SAMPLE_BASE, release, onload: () => resolve(s), onerror: reject });
      s.connect(lp); lp.connect(pianoBus); send(lp, verbIn, rev); if (ech) send(lp, echoIn, ech);
    });
    const [soft, main] = await Promise.all([loadPiano(3400, 0.5, 0.28, 0), loadPiano(7500, 0.7, 0.32, 0.1)]);
    soft.volume.value = 0; main.volume.value = 0;

    /* ═════ PAD & MARIMBA ═════ */
    const padF = new Tone.Filter({ type: 'lowpass', frequency: 1800, Q: 0.6, rolloff: -24 });   // rests at its final value; the intro sweeps it up from 500 Hz
    const padCh = new Tone.Chorus({ frequency: lfoHz(0.3), delayTime: 4, depth: 0.6, spread: 180, wet: 0.5 }).start();
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 0.9, decay: 0.5, sustain: 0.85, release: 1.4 },
    });
    pad.maxPolyphony = 16;
    pad.chain(padF, padCh, padBus); send(padCh, verbIn, 0.4);
    pad.volume.value = -21;

    const pluckPan = new Tone.Panner(0);
    const pluck = new Tone.PolySynth(Tone.FMSynth, {                    // FM marimba: a quick bright "tok" over a pure sine body
      harmonicity: 4, modulationIndex: 2.2, oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.55, sustain: 0, release: 0.4 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.2 },
    });
    pluck.maxPolyphony = 16;
    pluck.chain(pluckPan, padBus); send(pluckPan, verbIn, 0.35); send(pluckPan, echoIn, 0.3);
    pluck.volume.value = -2;

    /* ═════ BASS ═════ */
    const sub = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.012, decay: 0.15, sustain: 0.85, release: 0.18 } });
    sub.chain(new Tone.Distortion({ distortion: 0.12, wet: 0.3, oversample: '2x' }), bassBus);   // a touch of 3rd harmonic so it speaks on small speakers
    sub.volume.value = -22;
    const midB = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      filter: { type: 'lowpass', Q: 1.2, rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.15 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.25, release: 0.2, baseFrequency: 140, octaves: 2.3 },
    });
    midB.connect(bassBus);
    midB.volume.value = -26;

    /* ═════ DRUMS (soft, lo-fi) ═════ */
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.03, octaves: 5, oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.26, sustain: 0, release: 0.05 },
    });
    kick.connect(drums); kick.volume.value = -10;

    const rimBody = new Tone.MembraneSynth({
      pitchDecay: 0.008, octaves: 1.5, oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
    });
    const rimNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.025, sustain: 0 } });
    const rimBP = new Tone.Filter({ type: 'bandpass', frequency: 3000, Q: 1 });
    rimBody.connect(drums); rimNoise.chain(rimBP, drums); send(rimBP, verbIn, 0.15); send(rimBody, verbIn, 0.1);
    rimBody.volume.value = -12; rimNoise.volume.value = -12;

    const snap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.07, sustain: 0 } });
    const snapBP = new Tone.Filter({ type: 'bandpass', frequency: 2000, Q: 1.5 });
    snap.chain(snapBP, new Tone.Panner(-0.15), drums); send(snapBP, verbIn, 0.25);
    snap.volume.value = 2;

    const snBody = new Tone.MembraneSynth({
      pitchDecay: 0.012, octaves: 2, oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
    });
    const snNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.004, decay: 0.15, sustain: 0, release: 0.02 } });
    const snHP = new Tone.Filter({ type: 'highpass', frequency: 1300 });
    snBody.connect(drums); snNoise.chain(snHP, drums); send(snHP, verbIn, 0.25);
    snBody.volume.value = -15; snNoise.volume.value = -13;

    const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 } });
    hat.chain(new Tone.Filter({ type: 'highpass', frequency: 7500 }), new Tone.Panner(0.25), drums);
    hat.volume.value = -15;

    const shaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.015, decay: 0.05, sustain: 0 } });
    shaker.chain(new Tone.Filter({ type: 'bandpass', frequency: 6500, Q: 0.9 }), new Tone.Panner(-0.3), drums);
    shaker.volume.value = -17;

    const tom = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 2, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
    });
    tom.connect(drums); send(tom, verbIn, 0.2); tom.volume.value = -10;

    /* ═════ FX ═════ */
    const rNoise = new Tone.Noise('pink');
    const rF = new Tone.Filter({ type: 'highpass', frequency: 600, Q: 0.8, rolloff: -24 });
    const rG = new Tone.Gain(0.0001);
    rNoise.chain(rF, rG, fxBus); send(rG, verbIn, 0.3);
    rNoise.volume.value = -5;

    const boom = new Tone.MembraneSynth({ pitchDecay: 0.2, octaves: 3, envelope: { attack: 0.003, decay: 1.4, sustain: 0, release: 0.2 } });
    boom.connect(fxBus); boom.volume.value = -10;
    const crashN = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.003, decay: 1.8, sustain: 0, release: 0.4 } });
    const crashHP = new Tone.Filter({ type: 'highpass', frequency: 5000 });
    crashN.chain(crashHP, fxBus); send(crashHP, verbIn, 0.3); crashN.volume.value = -15;

    /* ═════ VOICE HANDLERS ═════ */
    const vel = (e) => (e.vel == null ? 1 : e.vel);
    const late = (t, e) => t + (e.hum || 0);
    const H = {
      arp(t, e) { soft.release = 0.5; soft.triggerAttackRelease(e.note, Math.max(0.05, e.dur), late(t, e), vel(e)); },
      mel(t, e) {
        main.release = 0.7;
        const tt = late(t, e), d = Math.max(0.05, e.dur);
        main.triggerAttackRelease(e.note, d, tt, vel(e));
        if (e.dbl) main.triggerAttackRelease(shift(e.note, -12), d, tt, vel(e) * e.dbl);       // octave doubling underneath
      },
      lh(t, e) { soft.release = 0.9; soft.triggerAttackRelease(e.notes, Math.max(0.05, e.dur), late(t, e), vel(e)); },

      pad(t, e) { pad.triggerAttackRelease(e.notes, Math.max(0.1, e.dur), t, vel(e)); },
      pluck(t, e) { pluckPan.pan.setValueAtTime(e.pan || 0, t); pluck.triggerAttackRelease(e.note, e.dur || 0.3, t, vel(e)); },
      bass(t, e) {
        sub.triggerAttackRelease(e.note, e.dur, t, vel(e));
        midB.triggerAttackRelease(shift(e.note, 12), e.dur, t, vel(e));
      },

      kick(t, e) { kick.triggerAttackRelease('G1', 0.25, t, vel(e)); },
      rim(t, e) { rimBody.triggerAttackRelease('G4', 0.05, t, vel(e)); rimNoise.triggerAttackRelease(0.03, t, vel(e)); },
      snap(t, e) { snap.triggerAttackRelease(0.08, t, vel(e)); },
      snare(t, e) {
        snBody.triggerAttackRelease(shift('E3', Math.round(e.tune || 0)), 0.1, t, vel(e) * 0.9);
        snNoise.triggerAttackRelease(0.12, t, vel(e));
      },
      hat(t, e) {
        const d = e.open ? 0.16 : 0.035;
        hat.envelope.decay = d;
        hat.triggerAttackRelease(d, t, vel(e));
      },
      shaker(t, e) { shaker.triggerAttackRelease(0.05, t, vel(e)); },
      tom(t, e) { tom.triggerAttackRelease(e.note, 0.3, t, vel(e)); },

      swell(t, e) {                                              // filtered-noise swell (reverse-cymbal feel)
        rF.frequency.setValueAtTime(e.f0, t);
        rF.frequency.exponentialRampToValueAtTime(e.f1, t + e.dur);
        rG.gain.setValueAtTime(0.0001, t);
        rG.gain.exponentialRampToValueAtTime(e.level, t + e.dur);
        rG.gain.setValueAtTime(0.0001, t + e.dur + 0.002);
        rNoise.start(t); rNoise.stop(t + e.dur + 0.01);
      },
      impact(t, e) {                                             // soft sub boom + cymbal wash (e.crash = its level)
        boom.triggerAttackRelease('A0', 1.2, t, vel(e));
        crashN.triggerAttackRelease(1.8, t, e.crash == null ? 0.5 : e.crash);
      },
      crash(t, e) { crashN.triggerAttackRelease(1.8, t, vel(e)); },

      gate(t, e) {                                               // pad + marimba bus: closed during the pre-lift beat of air
        padBus.gain.cancelScheduledValues(t);
        if (e.on) padBus.gain.setValueAtTime(1, t); else padBus.gain.setTargetAtTime(0, t, 0.08);
      },
      padSweep(t, e) {
        padF.frequency.setValueAtTime(e.from, t);
        padF.frequency.exponentialRampToValueAtTime(e.to, t + e.dur);
      },
    };

    /** Perform one score event. `time` defaults to e.t (offline); live playback passes the audio-clock time. */
    function play(e, time) {
      const h = H[e.v];
      if (!h) throw new Error('ClearSkies: unknown voice "' + e.v + '"');
      const g = GROUP[e.v];
      if (only && g !== 'ctl' && !only.has(g) && !only.has(e.v)) return;
      h(time == null ? e.t : time, e);
    }
    function silence() {
      [soft, main, pad, pluck].forEach((s) => s.releaseAll());
      [sub, midB].forEach((s) => s.triggerRelease());
      try { rNoise.stop(); } catch (_) { /* not running */ }
      padBus.gain.cancelScheduledValues(0);
      padBus.gain.value = 1;
    }
    return { play, silence };
  }

  /* ─────────────────────────── LIVE PLAYBACK ───────────────────────────
   * play(Tone, { loop: true })  → plays part 1, part 2, then repeats part 3 forever.
   * play(Tone, { loop: false }) → plays through once and ends on the tonic.            */
  async function play(Tone, opts = {}) {
    const loop = opts.loop !== false;
    const T = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
    await Tone.start();
    const rig = await createRig(Tone, opts);                    // loads the piano samples
    T.stop(); T.cancel(0); T.bpm.value = BPM;
    compose({ ending: !loop }).forEach((e) => T.schedule((time) => rig.play(e, time), e.t));
    if (loop) { T.loop = true; T.loopStart = at(PART.loop); T.loopEnd = at(PART.end); }
    else { T.loop = false; T.schedule(() => T.stop(), at(PART.end) + 3 * BAR); }
    const offset = (where) => (where === 'loop' ? at(PART.loop) : where === 'lift' ? at(PART.lift) : 0);
    return {
      start(where = opts.from) { T.start('+0.1', offset(where)); },   // where: 'intro' (default) | 'lift' | 'loop'
      stop() { T.stop(); rig.silence(); },
      get seconds() { return T.seconds; },
      get part() { return partAt(T.seconds); },
    };
  }

  return { BPM, BEAT, BAR, STEP, PART, LOOP_LEN, at, CHORDS, CYCLE, SAMPLE_BASE, compose, linear, loopRender, createRig, play, partAt };
});
