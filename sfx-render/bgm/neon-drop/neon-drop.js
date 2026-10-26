/**
 * NEON DROP — an electronic track written for Tone.js (v14.7.x)
 * ---------------------------------------------------------------------------
 * 140 BPM · A minor · 48 bars (≈ 82 s before the loop repeats)
 *
 *   PART 1  bars  1–16   INTRO / BUILD   pad + FM-bell arps → light groove → snare-roll riser → 1 beat of silence
 *   PART 2  bars 17–32   BASS DROP       half-time drums, sub + wobble/vowel growl, supersaw stabs, hook lead
 *   PART 3  bars 33–48   LOOP            melodic groove; bar 48 flows back into bar 33, so it loops forever
 *
 * HARMONY — one 8-bar cycle, voice-led so every chord change moves by step or stays put:
 *
 *   | Am(add9)  | Am(add9)  | Fmaj9 | Fmaj9 | Cmaj9 | Cmaj9 | G6 | E7(b9) |  → Am
 *      i                      VI              III             VII    V7(b9)
 *
 *   Upper voices (low → high):  C E A B → C E G A → D E G B → D E G B → D F G# B → C E A B
 *   The V7(b9) → i turnaround resolves G#→A, F→E, D→C, so the cycle (and the loop) lands on the tonic.
 *   The bass plays the roots: A1 F1 C2 G1 E1.
 *
 * USAGE
 *   Browser:  <script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js"></script>
 *             <script src="neon-drop.js"></script>
 *             // inside a click handler (browsers need a user gesture before audio):
 *             const song = await NeonDrop.play(Tone, { loop: true });   // loop:false → plays once and ends on the tonic
 *             song.start();            // or song.start('drop') / song.start('loop');   song.stop();
 *   Offline:  render.mjs renders it with Tone.Offline → full MP3, loop MP3, loop WAV   (see the top of that file)
 *   Score:    NeonDrop.compose() → plain [{ t, v, ...params }] events; NeonDrop.linear() / loopOnly() re-time them.
 *
 * Everything is synthesised (no samples) and deterministic apart from noise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonDrop = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ─────────────────────────── TIME GRID ─────────────────────────── */
  const BPM = 140;
  const BEAT = 60 / BPM;            // seconds per quarter note
  const BAR = BEAT * 4;
  const STEP = BAR / 16;            // one 16th note
  const PART = { intro: 0, drop: 16, loop: 32, end: 48 };   // section starts, in bars (0-indexed)
  const at = (bar, step = 0) => bar * BAR + step * STEP;   // transport time in seconds

  /* ─────────────────────────── NOTE MATH ─────────────────────────── */
  const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const NAMES = Object.keys(PC);
  const midi = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return PC[m[1]] + 12 * (+m[2] + 1); };
  const shift = (n, semis) => { const v = midi(n) + semis; return NAMES[v % 12] + (Math.floor(v / 12) - 1); };

  /* ─────────────────────────── HARMONY ─────────────────────────── */
  const CHORDS = {
    Am: { name: 'Am(add9)', bass: 'A1', up: ['C4', 'E4', 'A4', 'B4'] },
    F:  { name: 'Fmaj9',    bass: 'F1', up: ['C4', 'E4', 'G4', 'A4'] },
    C:  { name: 'Cmaj9',    bass: 'C2', up: ['D4', 'E4', 'G4', 'B4'] },
    G:  { name: 'G6',       bass: 'G1', up: ['D4', 'E4', 'G4', 'B4'] },
    E:  { name: 'E7(b9)',   bass: 'E1', up: ['D4', 'F4', 'G#4', 'B4'] },
  };
  const CYCLE = ['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'E'];
  const chordAt = (bar) => CHORDS[CYCLE[bar % 8]];
  const lowUp = (c) => c.up.map((n) => shift(n, -12));                  // voicing one octave down
  const pool = (c) => [...c.up, ...c.up.map((n) => shift(n, 12))];     // 8 ascending chord tones (oct 4 + 5)

  /** Merge consecutive bars of the same chord into blocks: [{bar, len, chord}] */
  function blocks(from, to) {
    const out = [];
    for (let b = from; b < to; b++) {
      const key = CYCLE[b % 8], last = out[out.length - 1];
      if (last && last.key === key && last.bar + last.len === b) last.len++;
      else out.push({ bar: b, len: 1, key, chord: CHORDS[key] });
    }
    return out;
  }

  /* ─────────────────────────── MELODY ───────────────────────────
   * One bar = 16 tokens (16th notes):  NOTE = new note,  - = hold,  . = rest.
   * The hook is built from chord tones with passing 4ths/6ths, and the last bar
   * outlines E7(b9) so it pulls straight back to the tonic.                     */
  const HOOK = [
    'E5 - - D5 C5 - A4 - C5 - - . E5 - - -',      // Am
    'D5 - - C5 B4 - G4 - B4 - - . A4 - - -',      // Am
    'C5 - - A4 C5 - E5 - F5 - - . E5 - - -',      // Fmaj9
    'C5 - - A4 G4 - A4 - C5 - - . D5 - - -',      // Fmaj9
    'E5 - - E5 D5 - B4 - D5 - - . E5 - - -',      // Cmaj9
    'G5 - - E5 D5 - C5 - D5 - - . B4 - - -',      // Cmaj9
    'D5 - - B4 D5 - E5 - D5 - B4 - G4 - - -',     // G6
    'G#4 - B4 - D5 - F5 - E5 - - - . . . .',      // E7(b9)
  ];
  // second pass of the drop: the Cmaj9 answer climbs higher for extra lift
  const HOOK_UP = HOOK.slice();
  HOOK_UP[5] = 'G5 - - A5 G5 - E5 - D5 - E5 - G5 - - -';

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

  /* 16th-note arp shapes — indices into pool(chord) (0..7, ascending) */
  const ARP_8  = [0, 3, 5, 7, 5, 3, 4, 2];                         // intro, 8th notes
  const ARP_16 = [0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 6, 4, 3, 5, 7, 5]; // rising sequence, 16ths
  const ARP_16_DOWN = ARP_16.slice().reverse();

  /* Growl rhythms for the drop.  [startStep, lengthSteps, beatsPerWobbleCycle, semitoneOffset]
   * (offsets are only root / fifth / octave, so every note is a chord tone.) */
  const WOB = {
    A: [[0, 14, 0.5, 0]],                                         // one long 8th-note wub
    B: [[0, 6, 1 / 3, 0], [6, 2, 0.25, 12], [8, 8, 0.5, 0]],      // triplets → 16th stutter → 8ths
    C: [[0, 4, 0.25, 0], [4, 4, 0.5, 7], [8, 8, 1, 0]],           // 16ths → 8ths → slow sweep
    D: [[0, 3, 0.25, 0], [4, 3, 0.25, 7], [8, 3, 0.25, 12], [12, 4, 1 / 3, 0]], // stutter run
  };
  const DROP_WOB = ['A', 'B', 'A', 'C', 'A', 'D', 'B', 'C',
                    'A', 'B', 'C', 'B', 'A', 'D', 'C', 'D'];

  /* ─────────────────────────── PATTERNS ───────────────────────────
   * Drum strings: 16 characters = one bar of 16th notes.
   *   X accent · x hit · o ghost · . rest                                          */
  const P = {
    dropKickEven: 'X.........x.....',     // beat 1 + "and" of 3
    dropKickOdd:  'X.....x...x.....',     // + "and" of 2 → the half-time bounce
    dropHat:      'x.o.x.o.x.o.x.o.',
    dropHatOpen:  'x.o.x.o.x.o.x...',     // (an open hat takes step 14 instead)
    loopKick:     'X...x...x...x...',     // four on the floor
    loopShaker:   'oxoxoxoxoxoxoxox',
    clap24:       '....x.......x...',     // claps on beats 2 & 4
  };
  /* Loop-section bass rhythm: [step, length in 16ths, semitones above the chord root].
   * The +7 on step 15 is the chord's 5th — a chord tone of whatever chord comes next. */
  const LOOP_BASS = [[2, 2, 0], [6, 1, 0], [7, 1, 12], [10, 2, 0], [14, 1, 0], [15, 1, 7]];

  /* Sidechain depth per section: [music bus, bass bus]  (1 = untouched, 0.1 = ducked hard) */
  const SC = { intro: [0.72, 0.5], drop: [0.5, 0.1], loop: [0.5, 0.25] };

  /* ─────────────────────────── SMALL HELPERS ─────────────────────────── */
  function rng(seed) {                      // mulberry32: reproducible "human" velocity jitter
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
  const poolLow = (c) => pool(c).map((n) => shift(n, -12));

  /* ─────────────────────────── THE SCORE ───────────────────────────
   * compose() returns plain data — [{ t: seconds, v: voice, ...params }] — so the
   * arrangement can be read, tested and re-timed without touching any audio.       */
  function compose({ ending = false } = {}) {
    const ev = [];
    const rand = rng(140);
    const add = (t, v, p = {}) => ev.push({ t, v, ...p });
    const jit = (vel, amt = 0.12) => Math.min(1, vel * (1 - amt / 2 + rand() * amt));
    const hits = (bar, voice, str, extra = {}, mul = 1) =>
      grid(str).forEach((h) => add(at(bar, h.step), voice, { vel: jit(h.vel * mul), ...extra }));
    const hook = (bar, lines, extra) =>
      parseLine(lines[bar % 8]).forEach((n) =>
        add(at(bar, n.step), 'lead', { note: n.note, dur: n.len * STEP * 0.96, ...extra }));
    const chordBlocks = (from, to, voice, pick, vel, trim) =>
      blocks(from, to).forEach((b) => add(at(b.bar), voice, { notes: pick(b.chord), dur: b.len * BAR - trim, vel }));
    const snareRoll = (times, v0, v1, tune) =>
      times.forEach((t, i) => {
        const f = times.length > 1 ? i / (times.length - 1) : 1;
        add(t, 'snare', { vel: v0 + (v1 - v0) * f, tune: tune * f });
      });

    /* ═════════ PART 1 · bars 1–16 · INTRO / BUILD ═════════
     *  bars 1–8   pad + FM-bell arps (every other 8th → 8ths)
     *  bars 9–12  light groove: soft four-on-the-floor, offbeat hats, shaker, sub, 16th bells
     *  bars 13–16 snare-roll riser; the very last beat is silent so the drop lands hard      */
    {
      const I = PART.intro, G = I + 8, GAP = at(I + 15, 12);

      add(at(I), 'padSweep', { from: 450, to: 5200, dur: GAP - at(I) });                       // filter slowly opens
      blocks(I, I + 16).forEach((b) => {                                                         // pad swell per chord
        const stop = Math.min(at(b.bar + b.len) - STEP, GAP);
        add(at(b.bar), 'pad', { notes: lowUp(b.chord), dur: stop - at(b.bar), vel: 0.4 + 0.4 * ((b.bar - I) / 15) });
      });
      range(I, I + 16).forEach((b) => {                                                          // bell arps
        const p = pool(chordAt(b)), seq = b < G ? ARP_8 : ARP_16, len = 16 / seq.length, prog = (b - I) / 15;
        seq.forEach((ix, k) => {
          if (b < I + 4 && k % 2) return;                                                        // bars 1–4: sparse
          const t = at(b, k * len);
          if (t >= GAP) return;
          add(t, 'bell', { note: p[ix], dur: len * STEP * 2, pan: k % 2 ? 0.4 : -0.4,
                           vel: jit((k % 4 === 0 ? 0.85 : 0.6) * (0.5 + 0.5 * prog)) });
        });
      });
      blocks(G, I + 16).forEach((b) => {                                                         // sub follows the roots
        const stop = Math.min(at(b.bar + b.len), GAP);
        add(at(b.bar), 'sub', { note: b.chord.bass, dur: stop - at(b.bar) - 0.03, vel: 0.4 });
      });

      const KICKS = ['X...x...x...x...', 'X...x...x...x...', 'X...x...x...x...', 'X...x...x...x...',
                     'X...x...x...x...', 'X.......x.......', 'X...............', '................'];
      range(G, I + 16).forEach((b) => {
        const k = b - G;
        hits(b, 'kick', KICKS[k], { sc: SC.intro }, 0.55);
        if (k < 6) hits(b, 'hat', '..x...x...x...x.', { open: true }, 0.7);
        if (k < 6) hits(b, 'shaker', 'xoxoxoxoxoxoxoxo', {}, 0.55);
        if (k === 2 || k === 3) hits(b, 'clap', P.clap24, {}, 0.7);
      });

      // snare roll: 8ths → 16ths → 32nds, rising in level and pitch, stopping on the last beat
      snareRoll([...every(at(I + 12), at(I + 14), 2 * STEP), ...every(at(I + 14), at(I + 15, 8), STEP),
                 ...every(at(I + 15, 8), GAP, STEP / 2)], 0.25, 1, 12);
      add(at(G), 'riser', { dur: GAP - at(G), f0: 400, f1: 9000, level: 0.9 });
      add(at(I + 12), 'pitchRiser', { dur: GAP - at(I + 12), f0: 200, f1: 1600 });
      add(GAP, 'gate', { on: false });                                                           // 1 beat of silence
    }

    /* ═════════ PART 2 · bars 17–32 · BASS DROP ═════════
     *  half-time drums · sub + wobble/vowel growl · hook lead on top
     *  bars 17–24: sustained supersaw chords (pumping)   bars 25–32: tresillo stabs + shaker + higher hook */
    {
      const D = PART.drop;
      add(at(D), 'gate', { on: true });
      add(at(D), 'impact', { vel: 1, crash: 0.7 });
      add(at(D + 8), 'crash', { vel: 0.5 });
      chordBlocks(D, D + 8, 'saw', (c) => c.up, 0.5, STEP * 2);

      range(D, D + 16).forEach((b) => {
        const i = b - D, c = chordAt(b), B = i >= 8, fill = i % 8 === 7;

        // drums — kick on 1, snare + clap on 3
        hits(b, 'kick', i % 2 ? P.dropKickOdd : P.dropKickEven, { sc: SC.drop });
        hits(b, 'snare', '........X.......', { tune: 0 });
        hits(b, 'clap', '........x.......', {}, 0.9);
        hits(b, 'hat', i % 2 ? P.dropHatOpen : P.dropHat, {}, 0.8);
        if (i % 2) add(at(b, 14), 'hat', { vel: jit(0.75), open: true });
        if (B) hits(b, 'shaker', P.loopShaker, {}, 0.5);
        if (fill) {
          snareRoll(every(at(b, 12), at(b + 1), STEP), 0.55, 0.95, 5);
          add(at(b, 8), 'riser', { dur: 8 * STEP, f0: 1500, f1: 11000, level: i === 15 ? 0.6 : 0.35 });
        }

        // bass — sub holds the root, the growl moves on root / 5th / octave
        WOB[DROP_WOB[i]].forEach(([s, len, cyc, off]) => {
          const dur = len * STEP - 0.012;
          add(at(b, s), 'sub', { note: c.bass, dur, vel: 0.95 });
          add(at(b, s), 'growl', { note: shift(c.bass, 12 + off), dur, cycle: cyc * BEAT, vel: 0.9 });
        });

        // harmony + melody
        if (B) grid('x..x..x.x..x..x.').forEach((h) =>
          add(at(b, h.step), 'saw', { notes: c.up, dur: 2 * STEP, vel: jit(0.62) }));
        hook(b, B ? HOOK_UP : HOOK, { vel: B ? 0.85 : 0.7, bright: B ? 1 : 0.7 });
      });
    }

    /* ═════════ PART 3 · bars 33–48 · LOOP ═════════
     *  four-on-the-floor groove, offbeat sub + pluck bass, 16th plucked arps (up / down on alternate bars),
     *  sustained supersaw chords that pump. bars 41–48 add the hook. Bar 48 is the V7(b9) → it resolves
     *  into bar 33's Am(add9), and a reverse-riser + fill carries the energy across the seam.             */
    {
      const L = PART.loop;
      add(at(L), 'crash', { vel: 0.6 });
      add(at(L + 8), 'crash', { vel: 0.4 });
      chordBlocks(L, L + 16, 'saw', (c) => c.up, 0.5, STEP * 2);

      range(L, L + 16).forEach((b) => {
        const i = b - L, c = chordAt(b), B = i >= 8, fill = i % 8 === 7;

        hits(b, 'kick', P.loopKick, { sc: SC.loop });
        hits(b, 'clap', fill ? '....x...........' : P.clap24, {}, 0.8);
        [2, 6, 10].forEach((s) => add(at(b, s), 'hat', { vel: jit(0.7) }));
        add(at(b, 14), 'hat', { vel: jit(0.8), open: B || i % 2 === 1 });
        hits(b, 'shaker', P.loopShaker, {}, B ? 0.7 : 0.55);

        LOOP_BASS.forEach(([s, len, off]) => {
          add(at(b, s), 'sub', { note: shift(c.bass, off), dur: len * STEP * 0.92, vel: 0.7 });
          add(at(b, s), 'mid', { note: shift(c.bass, 12 + off), dur: len * STEP * 0.85, vel: 0.6 });
        });

        const seq = i % 2 ? ARP_16_DOWN : ARP_16, p = B ? poolLow(c) : pool(c);   // drop an octave when the hook enters
        seq.forEach((ix, k) => add(at(b, k), 'pluck', {
          note: p[ix], dur: STEP * 1.5, pan: k % 2 ? 0.45 : -0.45,
          vel: jit((k % 4 === 0 ? 0.85 : 0.6) * (B ? 0.7 : 0.9)),
        }));
        if (B) hook(b, HOOK, { vel: 0.8, bright: 0.75 });

        if (i === 7) ['E3', 'D3', 'A2', 'E2'].forEach((n, j) => add(at(b, 12 + j), 'tom', { note: n, vel: 0.85 }));
        if (i === 15) {
          snareRoll(every(at(b, 8), at(b + 1), STEP), 0.35, 0.95, 7);
          add(at(b, 8), 'riser', { dur: 8 * STEP, f0: 1800, f1: 11000, level: 0.5 });
        }
      });
    }

    /* ═════════ ENDING (only when the track is not looping) ═════════
     * V7(b9) at bar 48 finally resolves to the tonic: one big Am(add9), a bell run, and a long tail.   */
    if (ending) {
      const E = PART.end;
      add(at(E), 'kick', { vel: 1, sc: SC.loop });
      add(at(E), 'impact', { vel: 0.55, crash: 0.8 });
      add(at(E), 'saw', { notes: CHORDS.Am.up, dur: BAR * 1.5, vel: 0.7 });
      add(at(E), 'pad', { notes: lowUp(CHORDS.Am), dur: BAR * 2, vel: 0.7 });
      add(at(E), 'sub', { note: 'A1', dur: BAR * 2, vel: 0.9 });
      ['B5', 'A5', 'E5', 'C5', 'B4', 'A4', 'E4', 'A3'].forEach((n, k) =>
        add(at(E, 2 + k * 2), 'bell', { note: n, dur: STEP * 4, vel: 0.75 - k * 0.07, pan: k % 2 ? 0.4 : -0.4 }));
    }

    return ev.sort((a, b) => a.t - b.t);
  }

  /* ─────────────────────────── TIMELINES ─────────────────────────── */
  const LOOP_LEN = at(PART.end) - at(PART.loop);               // one pass of part 3 = 27.43 s (1,209,600 samples @ 44.1k)

  /** One linear performance: parts 1–2, `loops` passes of part 3, then (optionally) the ending. */
  function linear({ loops = 2, ending = true } = {}) {
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

  /** Part 3 only, repeated `passes` times from t = 0 (render ≥ 2 and keep the last full pass → a seamless loop). */
  function loopOnly({ passes = 3 } = {}) {
    const body = compose().filter((e) => e.t >= at(PART.loop) && e.t < at(PART.end));
    const events = [];
    for (let k = 0; k < passes; k++) body.forEach((e) => events.push({ ...e, t: e.t - at(PART.loop) + k * LOOP_LEN }));
    return { events: events.sort((a, b) => a.t - b.t), end: passes * LOOP_LEN };
  }

  const partAt = (sec) => (sec < at(PART.drop) ? 'intro' : sec < at(PART.loop) ? 'drop' : 'loop');

  /* ─────────────────────────── THE RIG ───────────────────────────
   * All sound design lives here. Every voice is a handler  (time, event) → schedules audio.
   * Signal flow:  voices → buses (drums · bass · music · fx) → master (HPF → glue comp → limiter)
   *               reverb + ping-pong delay are shared sends; the kick ducks the music/bass buses (sidechain). */
  const GROUP = {
    kick: 'drums', snare: 'drums', clap: 'drums', hat: 'drums', shaker: 'drums', tom: 'drums',
    sub: 'bass', growl: 'bass', mid: 'bass',
    pad: 'music', saw: 'music', bell: 'music', pluck: 'music', lead: 'music',
    riser: 'fx', pitchRiser: 'fx', impact: 'fx', crash: 'fx',
    gate: 'ctl', padSweep: 'ctl',
  };

  async function createRig(Tone, opts = {}) {
    const only = opts.only ? new Set([].concat(opts.only)) : null;      // group or voice names, e.g. ['drums','growl'] → stems / debugging
    const dest = Tone.getDestination ? Tone.getDestination() : Tone.Destination;
    const send = (node, to, amt) => { const g = new Tone.Gain(amt); node.connect(g); g.connect(to); return g; };
    const lerpExp = (a, b, s) => a * Math.pow(b / a, s);
    const lfoHz = (hz) => Math.max(1, Math.round(hz * LOOP_LEN)) / LOOP_LEN;    // whole LFO cycles per loop → the rendered loop wraps without a phase jump

    /* ── master ── */
    const master = new Tone.Gain(Math.pow(10, (opts.masterDb || 0) / 20));
    master.chain(
      new Tone.Filter({ type: 'highpass', frequency: 28, rolloff: -12 }),
      ...(opts.bypass ? [] : [new Tone.Compressor({ threshold: -14, ratio: 2.5, attack: 0.02, release: 0.2, knee: 8 }), new Tone.Limiter(-1)]),
      dest,
    );

    /* ── shared effects ── */
    const verb = new Tone.Reverb({ decay: 3.4, preDelay: 0.012 });
    await verb.ready;
    const verbIn = new Tone.Gain(1);
    verbIn.chain(verb, new Tone.Filter({ type: 'highpass', frequency: 260 }), master);
    const echo = new Tone.PingPongDelay({ delayTime: BEAT * 0.75, feedback: 0.36, wet: 1 });   // dotted 8th
    const echoIn = new Tone.Gain(1);
    echoIn.chain(echo, new Tone.Filter({ type: 'lowpass', frequency: 5200 }), master);

    /* ── buses ── */
    const drums = new Tone.Gain(1).connect(master);
    const bassBus = new Tone.Gain(1).connect(master);           // ducked hard by the kick
    const musicBus = new Tone.Gain(1);                          // ducked softly by the kick
    const musicGate = new Tone.Gain(1).connect(master);         // closes for the pre-drop silence
    musicBus.connect(musicGate);
    const fxBus = new Tone.Gain(1).connect(master);

    /** Sidechain "pump": drop the bus gain on the kick, then recover exponentially. */
    const pump = (t, depthMusic, depthBass) => {
      [[musicBus, depthMusic, 0.13], [bassBus, depthBass, 0.09]].forEach(([g, depth, tc]) => {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(depth, t);
        g.gain.setTargetAtTime(1, t + 0.025, tc);
      });
    };

    /* ═════ DRUMS ═════ */
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 6, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.05 },
    });
    kick.chain(new Tone.Distortion({ distortion: 0.3, wet: 0.25, oversample: '2x' }), drums);
    kick.volume.value = -3;
    const click = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.0005, decay: 0.012, sustain: 0 } });
    click.chain(new Tone.Filter({ type: 'bandpass', frequency: 3200, Q: 0.8 }), drums);
    click.volume.value = -12;

    const snBody = new Tone.MembraneSynth({
      pitchDecay: 0.012, octaves: 2.2, oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.02 },
    });
    const snNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.19, sustain: 0, release: 0.02 } });
    const snHP = new Tone.Filter({ type: 'highpass', frequency: 1500 });
    snBody.volume.value = -13; snNoise.volume.value = -12;
    snBody.connect(drums); snNoise.chain(snHP, drums);
    send(snHP, verbIn, 0.32); send(snBody, verbIn, 0.12);

    const clapBP = new Tone.Filter({ type: 'bandpass', frequency: 1500, Q: 1.1 });
    const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.012, sustain: 0 } });
    const clapTail = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } });
    clap.connect(clapBP); clapTail.connect(clapBP); clapBP.connect(drums); send(clapBP, verbIn, 0.3);
    clap.volume.value = -4; clapTail.volume.value = -4;

    const hat = new Tone.MetalSynth({
      frequency: 400, harmonicity: 5.1, modulationIndex: 32, resonance: 7000, octaves: 1.2,
      envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
    });
    hat.chain(new Tone.Filter({ type: 'highpass', frequency: 6500 }), new Tone.Panner(0.28), drums);
    hat.volume.value = -24;

    const shaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.012, decay: 0.045, sustain: 0 } });
    shaker.chain(new Tone.Filter({ type: 'bandpass', frequency: 6500, Q: 0.9 }), new Tone.Panner(-0.3), drums);
    shaker.volume.value = -14;

    const tom = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 2, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.05 },
    });
    tom.connect(drums); send(tom, verbIn, 0.2); tom.volume.value = -6;

    /* ═════ BASS ═════ */
    const sub = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.006, decay: 0.12, sustain: 0.9, release: 0.07 } });
    sub.chain(new Tone.Distortion({ distortion: 0.2, wet: 0.4, oversample: '2x' }), bassBus);   // soft saturation → 3rd harmonic, so it speaks on small speakers
    sub.volume.value = -14;

    // "wub": detuned saws → resonant low-pass whose cutoff is swept in time with the beat → distortion
    const wub = new Tone.Synth({
      oscillator: { type: 'fatsawtooth', count: 2, spread: 22 },
      envelope: { attack: 0.003, decay: 0.1, sustain: 1, release: 0.04 },
    });
    const wubF = new Tone.Filter({ type: 'lowpass', frequency: 200, Q: 5, rolloff: -24 });
    wub.chain(wubF, new Tone.Distortion({ distortion: 0.55, oversample: '2x' }),
              new Tone.Filter({ type: 'highpass', frequency: 95, rolloff: -24 }), new Tone.Gain(0.65), bassBus);
    wub.volume.value = -14;                                     // = drive into the distortion; level is set by the Gain after it

    // "yoi": saws → distortion → two band-pass formants that glide between vowels → distortion
    const yoi = new Tone.Synth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
      envelope: { attack: 0.003, decay: 0.1, sustain: 1, release: 0.04 },
    });
    const yoiDrive = new Tone.Distortion({ distortion: 0.7, oversample: '2x' });
    const fm1 = new Tone.Filter({ type: 'bandpass', frequency: 500, Q: 6 });
    const fm2 = new Tone.Filter({ type: 'bandpass', frequency: 1500, Q: 6 });
    const yoiSum = new Tone.Gain(2.2);
    yoi.connect(yoiDrive); yoiDrive.connect(fm1); yoiDrive.connect(fm2); fm1.connect(yoiSum); fm2.connect(yoiSum);
    yoiSum.chain(new Tone.Distortion({ distortion: 0.4, oversample: '2x' }), new Tone.Filter({ type: 'highpass', frequency: 160 }), new Tone.Gain(0.65), bassBus);
    yoi.volume.value = -21;

    // plucky mid-bass for the loop section
    const mid = new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', count: 2, spread: 14 },
      filter: { type: 'lowpass', Q: 3, rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.2, sustain: 0.5, release: 0.08 },
      filterEnvelope: { attack: 0.004, decay: 0.16, sustain: 0.15, release: 0.1, baseFrequency: 160, octaves: 3.4 },
    });
    mid.chain(new Tone.Filter({ type: 'highpass', frequency: 90 }), bassBus);
    mid.volume.value = 0;

    /* ═════ HARMONY & MELODY ═════ */
    const padF = new Tone.Filter({ type: 'lowpass', frequency: 450, Q: 0.7, rolloff: -24 });
    const padCh = new Tone.Chorus({ frequency: lfoHz(0.35), delayTime: 4, depth: 0.7, spread: 180, wet: 0.6 }).start();
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 28 },
      envelope: { attack: 1.1, decay: 0.6, sustain: 0.8, release: 1.8 },
    });
    pad.maxPolyphony = 16;
    pad.chain(padF, padCh, musicBus); send(padCh, verbIn, 0.45);
    pad.volume.value = -12;

    const sawF = new Tone.Filter({ type: 'lowpass', frequency: 4200, Q: 0.5 });
    const sawCh = new Tone.Chorus({ frequency: lfoHz(0.8), delayTime: 3, depth: 0.6, spread: 180, wet: 0.5 }).start();
    const saw = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 4, spread: 36 },
      envelope: { attack: 0.03, decay: 0.3, sustain: 0.75, release: 0.2 },
    });
    saw.maxPolyphony = 24;
    saw.chain(sawF, sawCh, musicBus); send(sawCh, verbIn, 0.22);
    saw.volume.value = -11;

    const bellPan = new Tone.Panner(0);
    const bell = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01, modulationIndex: 9, oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 1.1 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.5 },
    });
    bell.maxPolyphony = 24;
    bell.chain(bellPan, musicBus); send(bellPan, verbIn, 0.5); send(bellPan, echoIn, 0.35);
    bell.volume.value = -7;

    const pluckPan = new Tone.Panner(0);
    const pluck = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2, modulationIndex: 5, oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.2 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.2 },
    });
    pluck.maxPolyphony = 16;
    pluck.chain(pluckPan, musicBus); send(pluckPan, verbIn, 0.3); send(pluckPan, echoIn, 0.28);
    pluck.volume.value = -2;

    const leadF = new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 1, rolloff: -12 });
    const leadCh = new Tone.Chorus({ frequency: lfoHz(1.2), delayTime: 3.2, depth: 0.5, spread: 160, wet: 0.45 }).start();
    const lead = new Tone.Synth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
      envelope: { attack: 0.008, decay: 0.15, sustain: 0.75, release: 0.3 },
      portamento: 0.025,
    });
    lead.chain(leadF, leadCh, musicBus); send(leadCh, echoIn, 0.3); send(leadCh, verbIn, 0.3);
    lead.volume.value = -9;

    /* ═════ FX ═════ */
    const rNoise = new Tone.Noise('white');
    const rF = new Tone.Filter({ type: 'highpass', frequency: 400, Q: 1, rolloff: -24 });
    const rG = new Tone.Gain(0.0001);
    rNoise.chain(rF, rG, fxBus); send(rG, verbIn, 0.3);
    rNoise.volume.value = -9;

    const pOsc = new Tone.Oscillator(200, 'sawtooth');
    const pG = new Tone.Gain(0.0001);
    pOsc.chain(new Tone.Filter({ type: 'lowpass', frequency: 2600 }), pG, fxBus);
    pOsc.volume.value = -17;

    const boom = new Tone.MembraneSynth({ pitchDecay: 0.25, octaves: 3.5, envelope: { attack: 0.002, decay: 1.8, sustain: 0, release: 0.2 } });
    boom.connect(fxBus); boom.volume.value = -7;
    const crashN = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 2.2, sustain: 0, release: 0.5 } });
    const crashHP = new Tone.Filter({ type: 'highpass', frequency: 4500 });
    crashN.chain(crashHP, fxBus); send(crashHP, verbIn, 0.25); crashN.volume.value = -16;

    /* ═════ VOICE HANDLERS ═════ */
    const vel = (e) => (e.vel == null ? 1 : e.vel);
    const H = {
      kick(t, e) {
        kick.triggerAttackRelease('G1', 0.3, t, vel(e));
        click.triggerAttackRelease(0.012, t, vel(e));
        const [dm, db] = e.sc || [0.5, 0.2];
        pump(t, dm, db);
      },
      snare(t, e) {
        snBody.triggerAttackRelease(shift('E3', Math.round(e.tune || 0)), 0.1, t, vel(e) * 0.9);
        snNoise.triggerAttackRelease(0.16, t, vel(e));
      },
      clap(t, e) {
        [0, 0.011, 0.022].forEach((o) => clap.triggerAttackRelease(0.01, t + o, vel(e) * 0.8));
        clapTail.triggerAttackRelease(0.15, t + 0.034, vel(e));
      },
      hat(t, e) {
        const d = e.open ? 0.2 : 0.04;
        hat.envelope.decay = d;
        hat.triggerAttackRelease(400, d, t, vel(e));
      },
      shaker(t, e) { shaker.triggerAttackRelease(0.04, t, vel(e)); },
      tom(t, e) { tom.triggerAttackRelease(e.note, 0.3, t, vel(e)); },

      sub(t, e) { sub.triggerAttackRelease(e.note, e.dur, t, vel(e)); },
      mid(t, e) { mid.triggerAttackRelease(e.note, e.dur, t, vel(e)); },
      growl(t, e) {
        // one wobble cycle = e.cycle seconds; the sweep curves are drawn point by point (24 per cycle)
        const n = Math.max(3, Math.ceil((e.dur / e.cycle) * 24) + 1);
        const a = new Array(n), b = new Array(n), c = new Array(n);
        for (let k = 0; k < n; k++) {
          const ph = (k / (n - 1)) * (e.dur / e.cycle);
          const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);      // 0 → 1 → 0 every cycle
          a[k] = lerpExp(140, 2800, s);                          // wub: low-pass cutoff
          b[k] = lerpExp(300, 900, s);                           // yoi: formant 1 rises …
          c[k] = lerpExp(2400, 1000, s);                         //      … while formant 2 falls
        }
        wubF.frequency.setValueCurveAtTime(a, t, e.dur);
        fm1.frequency.setValueCurveAtTime(b, t, e.dur);
        fm2.frequency.setValueCurveAtTime(c, t, e.dur);
        wub.triggerAttackRelease(e.note, e.dur, t, vel(e));
        yoi.triggerAttackRelease(e.note, e.dur, t, vel(e));
      },

      pad(t, e) { pad.triggerAttackRelease(e.notes, e.dur, t, vel(e)); },
      saw(t, e) { saw.triggerAttackRelease(e.notes, e.dur, t, vel(e)); },
      bell(t, e) { bellPan.pan.setValueAtTime(e.pan || 0, t); bell.triggerAttackRelease(e.note, e.dur, t, vel(e)); },
      pluck(t, e) { pluckPan.pan.setValueAtTime(e.pan || 0, t); pluck.triggerAttackRelease(e.note, e.dur, t, vel(e)); },
      lead(t, e) {
        leadF.frequency.setValueAtTime(1500 + 3500 * (e.bright == null ? 1 : e.bright), t);
        lead.triggerAttackRelease(e.note, e.dur, t, vel(e));
      },

      riser(t, e) {                                              // filtered-noise sweep, swelling to the end
        rF.frequency.setValueAtTime(e.f0, t);
        rF.frequency.exponentialRampToValueAtTime(e.f1, t + e.dur);
        rG.gain.setValueAtTime(0.0001, t);
        rG.gain.exponentialRampToValueAtTime(e.level, t + e.dur);
        rG.gain.setValueAtTime(0.0001, t + e.dur + 0.002);
        rNoise.start(t); rNoise.stop(t + e.dur + 0.01);
      },
      pitchRiser(t, e) {                                         // saw gliding up ~3 octaves
        pOsc.frequency.setValueAtTime(e.f0, t);
        pOsc.frequency.exponentialRampToValueAtTime(e.f1, t + e.dur);
        pG.gain.setValueAtTime(0.0001, t);
        pG.gain.exponentialRampToValueAtTime(0.9, t + e.dur);
        pG.gain.setValueAtTime(0.0001, t + e.dur + 0.002);
        pOsc.start(t); pOsc.stop(t + e.dur + 0.01);
      },
      impact(t, e) {                                             // sub boom + cymbal wash (e.crash = its level)
        boom.triggerAttackRelease('A0', 1.5, t, vel(e));
        crashN.triggerAttackRelease(2.2, t, e.crash == null ? 0.6 : e.crash);
      },
      crash(t, e) { crashN.triggerAttackRelease(2.2, t, vel(e)); },

      gate(t, e) {                                               // music bus: closed during the pre-drop beat
        musicGate.gain.cancelScheduledValues(t);
        if (e.on) musicGate.gain.setValueAtTime(1, t); else musicGate.gain.setTargetAtTime(0, t, 0.012);
      },
      padSweep(t, e) {
        padF.frequency.setValueAtTime(e.from, t);
        padF.frequency.exponentialRampToValueAtTime(e.to, t + e.dur);
      },
    };

    /** Perform one score event. `time` defaults to e.t (offline); live playback passes the audio-clock time. */
    function play(e, time) {
      const h = H[e.v];
      if (!h) throw new Error('NeonDrop: unknown voice "' + e.v + '"');
      const g = GROUP[e.v];
      if (only && g !== 'ctl' && !only.has(g) && !only.has(e.v)) return;
      h(time == null ? e.t : time, e);
    }
    function silence() {
      [pad, saw, bell, pluck].forEach((s) => s.releaseAll());
      [sub, wub, yoi, mid, lead].forEach((s) => s.triggerRelease());
      try { rNoise.stop(); pOsc.stop(); } catch (_) { /* not running */ }
      musicGate.gain.cancelScheduledValues(0);
      musicGate.gain.value = 1;
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
    const rig = await createRig(Tone, opts);
    T.stop(); T.cancel(0); T.bpm.value = BPM;
    compose({ ending: !loop }).forEach((e) => T.schedule((time) => rig.play(e, time), e.t));
    if (loop) { T.loop = true; T.loopStart = at(PART.loop); T.loopEnd = at(PART.end); }
    else { T.loop = false; T.schedule(() => T.stop(), at(PART.end) + 3 * BAR); }
    const offset = (where) => (where === 'loop' ? at(PART.loop) : where === 'drop' ? at(PART.drop) : 0);
    return {
      start(where = opts.from) { T.start('+0.1', offset(where)); },   // where: 'intro' (default) | 'drop' | 'loop'
      stop() { T.stop(); rig.silence(); },
      get seconds() { return T.seconds; },
      get part() { return partAt(T.seconds); },
    };
  }

  return { BPM, BEAT, BAR, STEP, PART, LOOP_LEN, at, CHORDS, CYCLE, compose, linear, loopOnly, createRig, play, partAt };
});
