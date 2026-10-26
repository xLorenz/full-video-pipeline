#!/usr/bin/env node
/**
 * render.mjs — renders neon-drop.js to audio, offline and reproducibly.
 *
 *   one-time setup:   npm i tone playwright-core && npx playwright install chromium      (ffmpeg on PATH for MP3)
 *   render:           node render.mjs
 *
 *   → out/neon-drop-full.mp3   intro → drop → loop section ×2 → ending on the tonic
 *   → out/neon-drop-loop.mp3   part 3 alone, rendered so its tail wraps into its start
 *   → out/neon-drop-loop.wav   same loop, lossless (MP3 encoders add padding, so use the WAV for gapless looping)
 *
 * How it renders: "head" = intro + drop (bars 1–32), "tail" = part 3 played `loops` times + the ending. The two halves are
 * rendered separately (offline rendering slows down on long timelines) and joined by overlap-add, so reverb tails carry across bar 32.
 * The loop file is the 2nd pass of the tail render — the steady state, which already contains the wrapped tail of pass 1.
 *
 * Options
 *   --out=DIR           output folder (default ./out)
 *   --loops=2           how many times part 3 plays in the full track
 *   --master=<dB>       master gain into the limiter (default 0)
 *   --window=17-24      debug: render only these bars (1-indexed, inclusive) to out/debug.wav
 *   --only=drums,bass   debug / stems: drums | bass | music | fx  (or a single voice, e.g. growl)
 *   --part=head|tail|encode   run one stage at a time (raw audio is cached in <out>/.cache-*); default: all three
 *
 * Why a browser? Tone.js needs the Web Audio API, and Chromium's oscillators are alias-free.
 * Math.random is seeded (it drives the noise drums and the reverb), so renders are repeatable.
 */
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const arg = (k, d) => {
  const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a == null ? d : a.includes('=') ? a.split('=')[1] : true;
};

const outDir = path.resolve(arg('out', path.join(here, 'out')));
const loops = +arg('loops', 2);
const masterDb = +arg('master', 0);
const win = arg('window', null);
const only = arg('only', null) ? String(arg('only')).split(',') : null;
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return p; } catch { /* fall through */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse())
      for (const sub of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return p;
      }
  }
  throw new Error('No Chromium found. Run `npx playwright install chromium` or set CHROME_PATH.');
}

/* ── runs inside the page ── */
async function renderInPage(cfg) {
  const N = NeonDrop, sr = 44100, cut = N.at(N.PART.loop);           // cut = start of part 3 (bar 33)
  let events, seconds, tail = 4;
  if (cfg.mode === 'window') {
    const a = N.at(cfg.window[0]), b = N.at(cfg.window[1]);
    events = N.compose({ ending: false }).filter((e) => e.t >= a && e.t < b).map((e) => ({ ...e, t: e.t - a }));
    seconds = b - a; tail = 3;
  } else {
    const all = N.linear({ loops: cfg.loops, ending: true });
    if (cfg.mode === 'head') { events = all.events.filter((e) => e.t < cut); seconds = cut; }
    else { events = all.events.filter((e) => e.t >= cut).map((e) => ({ ...e, t: e.t - cut })); seconds = all.end - cut; }
  }
  const buf = await Tone.Offline(async () => {
    const rig = await N.createRig(Tone, { masterDb: cfg.masterDb, only: cfg.only });
    events.forEach((e) => rig.play(e));
  }, seconds + tail, 2, sr);

  const ab = buf.get();
  const pack = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return { sr, n: ab.length, loopSamples: Math.round(N.LOOP_LEN * sr), cutSamples: Math.round(cut * sr),
           l: pack(ab.getChannelData(0)), r: pack(ab.getChannelData(1)) };
}

const seedMathRandom = () => {
  let a = 0x2f6e2b1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ── helpers on the Node side ── */
const stage = arg('part', 'all');
const want = (name) => stage === 'all' || stage === name;
const decode = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const peakOf = (...chs) => chs.reduce((m, c) => { for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; }, 0);
const db = (x) => (20 * Math.log10(x)).toFixed(2);
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const cache = (name, ext) => path.join(outDir, `.cache-${name}.${ext}`);

function save(name, r) {                                        // raw float32 stereo, interleaved
  const inter = new Float32Array(r.L.length * 2);
  for (let i = 0; i < r.L.length; i++) { inter[2 * i] = r.L[i]; inter[2 * i + 1] = r.R[i]; }
  fs.writeFileSync(cache(name, 'f32'), Buffer.from(inter.buffer));
  fs.writeFileSync(cache(name, 'json'), JSON.stringify({ sr: r.sr, n: r.n, loopSamples: r.loopSamples, cutSamples: r.cutSamples }));
}
function load(name) {
  if (!fs.existsSync(cache(name, 'f32'))) throw new Error(`Missing ${cache(name, 'f32')} — run --part=${name} first.`);
  const meta = JSON.parse(fs.readFileSync(cache(name, 'json'), 'utf8'));
  const b = fs.readFileSync(cache(name, 'f32'));
  const inter = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const L = new Float32Array(meta.n), R = new Float32Array(meta.n);
  for (let i = 0; i < meta.n; i++) { L[i] = inter[2 * i]; R[i] = inter[2 * i + 1]; }
  return { ...meta, L, R };
}

function ffmpegFrom(L, R, outFile, codecArgs) {
  const raw = path.join(outDir, '.tmp.f32');
  const inter = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
  fs.writeFileSync(raw, Buffer.from(inter.buffer));
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', raw, ...codecArgs, outFile]);
  fs.rmSync(raw, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
  console.log('  wrote', path.relative(process.cwd(), outFile), (fs.statSync(outFile).size / 1e6).toFixed(2) + ' MB');
}
const mp3Args = (title) => ['-c:a', 'libmp3lame', '-b:a', '320k', '-metadata', `title=${title}`, '-metadata', 'artist=Claude + Tone.js', '-metadata', 'album=Neon Drop'];

async function withPage(fn) {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ScriptProcessor/.test(m.text())) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.setContent('<!doctype html><title>render</title>');
  await page.evaluate(seedMathRandom);
  await page.addScriptTag({ path: require.resolve('tone/build/Tone.js') });
  await page.addScriptTag({ path: path.join(here, 'neon-drop.js') });
  const run = async (cfg) => { const r = await page.evaluate(renderInPage, { masterDb, only, ...cfg }); return { ...r, L: decode(r.l), R: decode(r.r) }; };
  try { return await fn(run); } finally { await browser.close(); }
}

/** Join head + tail, one gain for everything (peak → −1 dBFS), then: full MP3, loop MP3 + lossless loop WAV. */
function encodeAll() {
  const head = load('head'), tail = load('tail');
  const H0 = head.cutSamples, n = head.loopSamples, total = H0 + tail.n;
  const L = new Float32Array(total), R = new Float32Array(total);
  for (let i = 0; i < head.n; i++) { L[i] += head.L[i]; R[i] += head.R[i]; }            // overlap-add: head's reverb tail rings into part 3
  for (let i = 0; i < tail.n; i++) { L[H0 + i] += tail.L[i]; R[H0 + i] += tail.R[i]; }
  const g = Math.pow(10, -1 / 20) / peakOf(L, R);
  console.log(`  raw peak ${db(peakOf(L, R))} dBFS → applying ${db(g)} dB to everything`);
  for (const c of [L, R, tail.L, tail.R]) for (let i = 0; i < c.length; i++) c[i] *= g;
  if (tail.n < 2 * n) throw new Error('--loops must be at least 2 so a steady-state loop pass exists');
  const loopL = tail.L.slice(n, 2 * n), loopR = tail.R.slice(n, 2 * n);                  // pass 2 = steady state
  if (!hasFfmpeg) return console.warn('ffmpeg not found on PATH — install it to get MP3/WAV files.');
  ffmpegFrom(L, R, path.join(outDir, 'neon-drop-full.mp3'), mp3Args('Neon Drop (full)'));
  ffmpegFrom(loopL, loopR, path.join(outDir, 'neon-drop-loop.mp3'), mp3Args('Neon Drop (loop)'));
  ffmpegFrom(loopL, loopR, path.join(outDir, 'neon-drop-loop.wav'), ['-c:a', 'pcm_s16le']);
  if (arg('debug', false)) {                                                               // float WAVs for analysis
    ffmpegFrom(L, R, path.join(outDir, 'debug-full.wav'), ['-c:a', 'pcm_f32le']);
    ffmpegFrom(tail.L, tail.R, path.join(outDir, 'debug-tail.wav'), ['-c:a', 'pcm_f32le']);
  }
}

(async () => {
  const t0 = Date.now();
  if (win) {                                                      // ── debug window ──
    const [a, b] = String(win).split('-').map(Number);
    console.log(`rendering bars ${a}–${b}${only ? ' [' + only + ']' : ''} …`);
    await withPage(async (run) => {
      const r = await run({ mode: 'window', window: [a - 1, b] });
      console.log('  peak', db(peakOf(r.L, r.R)), 'dBFS');
      ffmpegFrom(r.L, r.R, path.join(outDir, 'debug.wav'), ['-c:a', 'pcm_f32le']);
    });
  } else {
    if (want('head') || want('tail')) await withPage(async (run) => {
      if (want('head')) { console.log('rendering head: intro + drop (bars 1–32) …'); save('head', await run({ mode: 'head', loops })); }
      if (want('tail')) { console.log(`rendering tail: part 3 ×${loops} + ending …`); save('tail', await run({ mode: 'tail', loops })); }
    });
    if (want('encode')) { console.log('encoding …'); encodeAll(); }
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
})().catch((e) => { console.error(e); process.exit(1); });
