#!/usr/bin/env node
/**
 * render.mjs — bakes clear-skies.js into the pipeline's second asset BGM bed.
 *
 *   one-time setup:   npm i --no-save playwright-core      (Chromium/Edge for Web Audio)
 *                     node fetch-samples.mjs                (vendors the piano samples)
 *   render:           node render.mjs
 *
 *   → sfx/assets/bgm/clear_skies.wav    the committed bed: head once, then one loop pass
 *   → out/clear-skies-full.mp3          head → lift → 2 loop passes (listening reference)
 *   → out/clear-skies-loop.mp3          the loop region alone (check the wrap by ear)
 *
 * WHY THIS SHAPE
 *   clear-skies.js is a 48-bar piece: 1–16 intro, 17–32 lift, 33–48 loop, and part 3 is
 *   written to repeat seamlessly. The pipeline's asset-bed contract (generate_sfx.py
 *   render_asset_run) is: samples [0, loop_start) play once, then [loop_start, loop_end)
 *   tiles forever. So the asset is
 *
 *       [ bars 1–32 | part 3, pass 2 ]
 *         head 32 bars   loop 16 bars
 *
 *   94.5 BPM makes a bar exactly 112,000 samples @ 44.1 kHz, so the seam lands on the
 *   sample: head = 3,584,000 (81.269841 s), loop = 1,792,000 (40.634921 s),
 *   asset = 5,376,000 frames (121.904762 s).
 *
 * WHY PASS 2 IS THE LOOP
 *   Part 3 is rendered twice. Pass 1 is pre-roll (it fills pass 2's reverb), pass 2 is the
 *   steady state we ship. Pass 2's first samples already carry the reverb of the previous
 *   pass, so tiling it wraps without a gap — that is the check printed as "wrap step" below.
 *
 * Options
 *   --out=DIR        output folder (default ./out)
 *   --master=<dB>    master gain into the limiter (default 0)
 *   --part=head|tail|encode   run one stage at a time (raw audio is cached in <out>/.cache-*)
 *   --headless=0     launch a visible browser (debugging)
 *
 * A browser is used because Tone.js needs the Web Audio API. Math.random is seeded in the
 * page, so the reverb/chorus noise is reproducible and rebuilds are byte-stable.
 */
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(here, '../../..');
const assetPath = path.join(repoRoot, 'sfx', 'assets', 'bgm', 'clear_skies.wav');

const arg = (k, d) => {
  const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a == null ? d : a.includes('=') ? a.split('=')[1] : true;
};

const outDir = path.resolve(arg('out', path.join(here, 'out')));
const masterDb = +arg('master', 0);
const headless = arg('headless', '1') !== '0';
const stage = arg('part', 'all');
const want = (name) => stage === 'all' || stage === name;
const TAIL = 4;                       // seconds of extra render so reverb/piano tails are captured
const SR = 44100;
fs.mkdirSync(outDir, { recursive: true });

/* ── sample set (vendored by fetch-samples.mjs) ── */
const samplesDir = path.join(here, 'samples');
function checkSamples() {
  const names = ['A0'];
  for (let o = 1; o <= 6; o++) for (const n of ['C', 'Ds', 'Fs', 'A']) names.push(n + o);
  names.push('C7');
  const missing = names.filter((n) => !fs.existsSync(path.join(samplesDir, `${n}.mp3`)));
  if (missing.length) throw new Error(`missing piano samples: ${missing.join(', ')} — run: node fetch-samples.mjs`);
  return names.length;
}

/* ── a throwaway same-origin static server, so the Sampler can fetch samples ── */
function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
    if (rel === '' || rel === 'index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><meta charset="utf-8"><title>clear-skies render</title>');
      return;
    }
    const file = path.join(here, rel);
    if (!file.startsWith(here) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('404'); return;
    }
    const type = file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/* ── Chromium: Playwright's own, else whatever Chrome/Edge is installed ── */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return p; } catch { /* fall through */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse())
      for (const sub of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return p;
      }
  }
  const fixed = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
       'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
         '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  for (const p of fixed) if (fs.existsSync(p)) return p;
  throw new Error('No Chromium found. Run `npx playwright install chromium` or set CHROME_PATH.');
}

/* ── runs inside the page ── */
async function renderInPage(cfg) {
  const N = ClearSkies;
  const cut = N.at(N.PART.loop);                   // 81.269841 s = bar 33
  const all = N.linear({ loops: cfg.loops, ending: false });
  let events, seconds;
  if (cfg.mode === 'head') {
    events = all.events.filter((e) => e.t < cut - 1e-9);
    seconds = cut;
  } else {
    events = all.events.filter((e) => e.t >= cut - 1e-9).map((e) => ({ ...e, t: e.t - cut }));
    seconds = all.end - cut;                        // 3 × part 3
  }
  const buf = await Tone.Offline(async () => {
    const rig = await N.createRig(Tone, { masterDb: cfg.masterDb, sampleBase: cfg.sampleBase });
    events.forEach((e) => rig.play(e));
  }, seconds + cfg.tail, 2, cfg.sr);

  const ab = buf.get();
  const pack = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return {
    sr: cfg.sr, n: ab.length,
    loopSamples: Math.round(N.LOOP_LEN * cfg.sr),
    cutSamples: Math.round(cut * cfg.sr),
    l: pack(ab.getChannelData(0)), r: pack(ab.getChannelData(1)),
  };
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

/* ── Node-side helpers ── */
const decode = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const peakOf = (...chs) => chs.reduce((m, c) => { for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; }, 0);
const db = (x) => (20 * Math.log10(x)).toFixed(2);
const rms = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i]; return Math.sqrt(s / Math.max(1, arr.length)); };
const cache = (name, ext) => path.join(outDir, `.cache-${name}.${ext}`);

function save(name, r) {
  const inter = new Float32Array(r.n * 2);
  for (let i = 0; i < r.n; i++) { inter[2 * i] = r.L[i]; inter[2 * i + 1] = r.R[i]; }
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

function ffmpegFrom(chs, outFile, codecArgs, rawName) {
  const raw = path.join(outDir, rawName);
  const chCount = chs.length;
  const n = chs[0].length;
  const inter = new Float32Array(n * chCount);
  for (let c = 0; c < chCount; c++) for (let i = 0; i < n; i++) inter[i * chCount + c] = chs[c][i];
  fs.writeFileSync(raw, Buffer.from(inter.buffer));
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR),
    '-ac', String(chCount), '-i', raw, ...codecArgs, outFile]);
  fs.rmSync(raw, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
  console.log('  wrote', path.relative(process.cwd(), outFile), (fs.statSync(outFile).size / 1e6).toFixed(2) + ' MB');
}

/** Slice helper: Float32Array view. */
const slice = (a, from, to) => a.subarray(from, Math.min(to, a.length));

/** dB of (a-b) relative to b over the first `len` samples. */
function diffDb(a, b, len) {
  const n = Math.min(len, a.length, b.length);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = a[i] - b[i];
  const ref = rms(slice(b, 0, n));
  return ref > 0 ? db(rms(d) / ref) : '-inf';
}

function encodeAll() {
  const head = load('head'), tail = load('tail');
  const H0 = head.cutSamples;               // head length (bar 33 start)
  const N = head.loopSamples;               // one part-3 pass
  const { L: hL, R: hR } = head;
  const { L: tL, R: tR } = tail;

  /* ── the shipped bed: head once, then part 3 pass 2 ── */
  const assetLen = H0 + N;
  const aL = new Float32Array(assetLen), aR = new Float32Array(assetLen);
  aL.set(slice(hL, 0, H0), 0);  aR.set(slice(hR, 0, H0), 0);
  aL.set(slice(tL, N, 2 * N), H0);  aR.set(slice(tR, N, 2 * N), H0);

  /* ── the continuous timeline, for listening (head + pass 1 + pass 2) ── */
  const fullLen = H0 + 2 * N;
  const fL = new Float32Array(fullLen), fR = new Float32Array(fullLen);
  fL.set(slice(hL, 0, H0), 0);  fR.set(slice(hR, 0, H0), 0);
  fL.set(slice(tL, 0, 2 * N), H0);  fR.set(slice(tR, 0, 2 * N), H0);

  /* ── one gain for everything: the shipped bed peaks at −1 dBFS ── */
  const mono = new Float32Array(assetLen);
  for (let i = 0; i < assetLen; i++) mono[i] = 0.5 * (aL[i] + aR[i]);
  const peak = peakOf(mono);
  const g = Math.pow(10, -1 / 20) / peak;
  console.log(`  asset peak ${db(peak)} dBFS → applying ${db(g)} dB`);
  for (const c of [aL, aR, fL, fR, mono]) for (let i = 0; i < c.length; i++) c[i] *= g;

  /* ── seam report ── */
  const loopMono = slice(mono, H0, H0 + N);
  const naturalContinuation = new Float32Array(N);
  for (let i = 0; i < N; i++) naturalContinuation[i] = 0.5 * (tL[i] + tR[i]) * g;
  console.log(`  head→loop seam (pass 1 vs shipped loop):  first 0.5 s ${diffDb(naturalContinuation, loopMono, Math.round(0.5 * SR))} dB`);
  let maxStep = 0;
  let meanStep = 0;
  for (let i = 1; i < loopMono.length; i++) {
    const d = Math.abs(loopMono[i] - loopMono[i - 1]);
    if (d > maxStep) maxStep = d;
    meanStep += d;
  }
  meanStep /= loopMono.length;
  console.log(`  wrap step: |loop[0] − loop[N−1]| = ${Math.abs(loopMono[0] - loopMono[N - 1]).toFixed(5)} (mean in-loop step ${meanStep.toFixed(5)}, max ${maxStep.toFixed(5)})`);
  console.log(`  loop loudness: RMS ${db(rms(loopMono))} dBFS`);

  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  if (!hasFfmpeg) return console.warn('ffmpeg not found on PATH — install it to get the WAV/MP3 files.');

  ffmpegFrom([mono], assetPath, ['-c:a', 'pcm_s16le'], '.tmp-asset.f32');
  ffmpegFrom([fL, fR], path.join(outDir, 'clear-skies-full.mp3'),
    ['-c:a', 'libmp3lame', '-b:a', '320k', '-metadata', 'title=Clear Skies (full)'], '.tmp-full.f32');
  ffmpegFrom([slice(aL, H0, assetLen), slice(aR, H0, assetLen)], path.join(outDir, 'clear-skies-loop.mp3'),
    ['-c:a', 'libmp3lame', '-b:a', '320k', '-metadata', 'title=Clear Skies (loop)'], '.tmp-loop.f32');

  const size = fs.statSync(assetPath).size;
  console.log(`  asset: ${assetLen} frames = ${(assetLen / SR).toFixed(6)} s, mono 44.1 kHz 16-bit, ${(size / 1e6).toFixed(2)} MB`);
  console.log(`  loop bounds: loop_start_seconds=${(H0 / SR).toFixed(12)} loop_end_seconds=${(assetLen / SR).toFixed(12)}`);
}

async function withPage(fn) {
  const { server, port } = await startServer();
  const browser = await chromium.launch({
    executablePath: findChrome(),
    headless,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ScriptProcessor/.test(m.text())) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(seedMathRandom);
  await page.addScriptTag({ path: require.resolve('tone/build/Tone.js') });
  await page.addScriptTag({ path: path.join(here, 'clear-skies.js') });
  const sampleBase = `http://127.0.0.1:${port}/samples/`;
  const run = async (cfg) => {
    const r = await page.evaluate(renderInPage, { masterDb, sampleBase, sr: SR, tail: TAIL, ...cfg });
    return { ...r, L: decode(r.l), R: decode(r.r) };
  };
  try { return await fn(run); } finally { await browser.close(); server.close(); }
}

(async () => {
  const t0 = Date.now();
  console.log(`samples: ${checkSamples()} files in ${path.relative(process.cwd(), samplesDir)}`);
  if (want('head') || want('tail')) await withPage(async (run) => {
    if (want('head')) { console.log('rendering head: intro + lift (bars 1–32, 81.27 s) …'); save('head', await run({ mode: 'head', loops: 2 })); }
    if (want('tail')) { console.log('rendering tail: part 3 ×2 (81.27 s) …'); save('tail', await run({ mode: 'tail', loops: 2 })); }
  });
  if (want('encode')) { console.log('assembling …'); encodeAll(); }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
})().catch((e) => { console.error(e); process.exit(1); });
