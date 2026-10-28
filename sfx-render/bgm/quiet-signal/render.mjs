#!/usr/bin/env node
/**
 * render.mjs — bakes quiet-signal.js into sfx/assets/bgm/quiet_signal.wav
 *
 *   node render.mjs
 *
 * quiet-signal.js is a live Transport script (16 bars @ 76 BPM: 4 intro, 8 drop,
 * 4 loopable outro), not a compose() factory. So this renderer:
 *   1. reads the source and patches 16 → 20 bars (bars 13–16 play twice, so the
 *      second pass is the steady-state loop and carries the first pass's tails),
 *   2. evaluates it inside Tone.Offline (so its synths land in the offline context),
 *   3. starts the transport at 0 and renders 20 bars + 4 s of tail.
 *
 * 76 BPM puts a bar at 139,263.16 samples, so the head/loop cuts are rounded to the
 * nearest sample (< 0.5 sample off the musical grid — inaudible at this loop length):
 *   head = bars 1–12 = 1,671,157 samples (37.894737 s)
 *   loop = bars 13–16 = 557,053 samples (12.631578 s)
 *   asset = 2,228,210 samples (50.526315 s)
 *
 * Assembly: head ++ second loop pass, one gain so the bed peaks at −1 dBFS, mono downmix.
 */
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(here, '../../..');
const assetPath = path.join(repoRoot, 'sfx', 'assets', 'bgm', 'quiet_signal.wav');
const outDir = path.resolve(path.join(here, 'out'));
const SR = 44100;
const BPM = 76;
const BAR = (4 * 60) / BPM;
const HEAD_BARS = 12;
const LOOP_BARS = 4;
const H = Math.round(HEAD_BARS * BAR * SR);
const N = Math.round((HEAD_BARS + LOOP_BARS) * BAR * SR) - H;
const TAIL = 4;
const BARS = 16 + LOOP_BARS;                    // 20: the outro plays twice

fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return p; } catch { /* fall through */ }
  const fixed = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
       'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const p of fixed) if (fs.existsSync(p)) return p;
  throw new Error('No Chromium found. Run `npx playwright install chromium` or set CHROME_PATH.');
}

async function renderInPage(cfg) {
  const buf = await Tone.Offline(async () => {
    new Function(cfg.src)();                    // builds the graph + schedules all bars directly
    await window.__qsRoom.ready;                // Tone.Reverb needs its IR before the render
  }, cfg.seconds + cfg.tail, 2, cfg.sr);

  const ab = buf.get();
  const pack = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return { n: ab.length, l: pack(ab.getChannelData(0)), r: pack(ab.getChannelData(1)) };
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

const decode = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const peakOf = (c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const db = (x) => (20 * Math.log10(x)).toFixed(2);
const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, a.length)); };

function ffmpegFrom(chs, outFile, codecArgs, rawName) {
  const raw = path.join(outDir, rawName);
  const ch = chs.length;
  const n = chs[0].length;
  const inter = new Float32Array(n * ch);
  for (let c = 0; c < ch; c++) for (let i = 0; i < n; i++) inter[i * ch + c] = chs[c][i];
  fs.writeFileSync(raw, Buffer.from(inter.buffer));
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR),
    '-ac', String(ch), '-i', raw, ...codecArgs, outFile]);
  fs.rmSync(raw, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
  console.log('  wrote', path.relative(process.cwd(), outFile), (fs.statSync(outFile).size / 1e6).toFixed(2) + ' MB');
}

(async () => {
  const t0 = Date.now();
  let src = fs.readFileSync(path.join(here, 'quiet-signal.js'), 'utf8');
  src = src.replace('for (let b = 0; b < 16; b++)', `for (let b = 0; b < ${BARS}; b++)`)
           .replace('"16:0:0"', `"${BARS}:0:0"`)
           // Tone's Transport runs on wall-clock timers, which do not advance during an
           // offline render — so fire each bar's callback directly at its absolute time.
           .replace('Tone.Transport.schedule((time) => {', '((time) => {')
           .replace('    }, barStart);', '    })(b * secondsPerBeat * 4);');
  if (!src.includes(`b < ${BARS}`)) throw new Error('quiet-signal.js layout changed — update the patch');
  if (src.includes('Tone.Transport.schedule(')) throw new Error('quiet-signal.js scheduling changed — update the patch');
  src += '\n;window.__qsRoom = room;\n;scheduleCue();\n';

  const browser = await chromium.launch({
    executablePath: findChrome(), headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.setContent('<!doctype html><title>quiet-signal render</title>');
  await page.evaluate(seedMathRandom);
  await page.addScriptTag({ path: require.resolve('tone/build/Tone.js') });

  console.log(`rendering ${BARS} bars @ ${BPM} BPM (${(BARS * BAR).toFixed(2)} s) …`);
  const r = await page.evaluate(renderInPage, { src, seconds: BARS * BAR, tail: TAIL, sr: SR });
  await browser.close();

  const L = decode(r.l), R = decode(r.r);
  let finite = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < L.length; i++) {
    if (Number.isFinite(L[i])) { finite++; if (L[i] < lo) lo = L[i]; if (L[i] > hi) hi = L[i]; }
  }
  console.log(`  render: ${L.length} frames, ${L.length - finite} non-finite, range ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  if (L.length < H + N + 64) throw new Error(`render too short: ${L.length} samples`);

  /* head ++ pass 2 of the loop */
  const L0 = H + N;                                  // start of the second outro pass
  const asset = new Float32Array(H + N);
  for (let i = 0; i < H; i++) asset[i] = 0.5 * (L[i] + R[i]);
  for (let i = 0; i < N; i++) asset[H + i] = 0.5 * (L[L0 + i] + R[L0 + i]);

  const g = Math.pow(10, -1 / 20) / peakOf(asset);
  for (let i = 0; i < asset.length; i++) asset[i] *= g;
  console.log(`  raw peak ${db(peakOf(asset) / g)} dBFS → applying ${db(g)} dB`);

  const loop = asset.subarray(H);
  let maxStep = 0, meanStep = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.abs(loop[i] - loop[i - 1]);
    if (d > maxStep) maxStep = d;
    meanStep += d;
  }
  meanStep /= loop.length;
  console.log(`  wrap step |loop[0]−loop[N−1]| = ${Math.abs(loop[0] - loop[loop.length - 1]).toFixed(5)} (mean ${meanStep.toFixed(5)}, max ${maxStep.toFixed(5)})`);
  console.log(`  loop RMS ${db(rms(loop))} dBFS`);

  ffmpegFrom([asset], assetPath, ['-c:a', 'pcm_s16le'], '.tmp-asset.f32');
  const full = new Float32Array(L0);
  for (let i = 0; i < L0; i++) full[i] = 0.5 * (L[i] + R[i]) * g;
  ffmpegFrom([full], path.join(outDir, 'quiet-signal-full.mp3'),
    ['-c:a', 'libmp3lame', '-b:a', '320k', '-metadata', 'title=Quiet Signal (full)'], '.tmp-full.f32');
  ffmpegFrom([loop], path.join(outDir, 'quiet-signal-loop.mp3'),
    ['-c:a', 'libmp3lame', '-b:a', '320k', '-metadata', 'title=Quiet Signal (loop)'], '.tmp-loop.f32');

  console.log(`  asset ${asset.length} frames = ${(asset.length / SR).toFixed(6)} s`);
  console.log(`  loop bounds: loop_start_seconds=${(H / SR).toFixed(12)} loop_end_seconds=${(asset.length / SR).toFixed(12)}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
})().catch((e) => { console.error(e); process.exit(1); });
