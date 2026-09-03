#!/usr/bin/env node
// Offline Tone.js/WebAudio SFX renderer.
//
// usage: node sfx-render/render.js --manifest <jobs.json> --out <dir> [--sr 44100]
//
// Manifest jobs:
//   { id, recipe, params, seed, duration }
// recipe: absolute path to a recipe module exporting:
//   export const duration = <seconds>;            // optional; overrides job.duration
//   export default async (Tone, { rng, params, duration, destination }) => void
//
// Determinism contract:
//   - Math.random is patched with the seeded PRNG for the whole render, so
//     Tone internals (e.g. Tone.Noise buffer gen) are deterministic too.
//   - Recipes must source their own randomness from the injected rng.
// Same job => byte-identical WAV.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire, register } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// --- WebAudio in Node ---------------------------------------------
// Node has no native WebAudio. standardized-audio-context (which Tone's ESM
// build imports) needs real native constructors on `window`; node-web-audio-api
// provides them. Must be set BEFORE sac/Tone load. `self` stays absent so Tone
// never eagerly builds a real-time context (we are offline-only).
const { AudioContext, OfflineAudioContext, AudioBuffer, AudioParam, AudioNode } = require("node-web-audio-api");
globalThis.window = { AudioContext, OfflineAudioContext, AudioBuffer, AudioParam, AudioNode };

// Tone's shipped ESM build uses extensionless relative imports; patch with a
// loader hook before importing it.
register("./lib/tone-esm-loader.mjs", import.meta.url);
const Tone = await import("tone/build/esm/index.js");

const mulberry32 = (await import("./lib/rng.js")).default;
const { writeWav } = await import("./lib/wav.js");

function parseArgs(argv) {
  const out = { manifest: null, outDir: null, sr: 44100 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--manifest") out.manifest = argv[++i];
    else if (argv[i] === "--out") out.outDir = argv[++i];
    else if (argv[i] === "--sr") out.sr = parseInt(argv[++i], 10);
    else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!out.manifest || !out.outDir) {
    console.error("usage: render.js --manifest <jobs.json> --out <dir> [--sr 44100]");
    process.exit(2);
  }
  return out;
}

async function main() {
  const { manifest, outDir, sr } = parseArgs(process.argv);
  const jobs = JSON.parse(readFileSync(manifest, "utf8"));
  mkdirSync(outDir, { recursive: true });
  const results = [];
  let failed = 0;

  for (const job of jobs) {
    const origRandom = Math.random;
    try {
      const rng = mulberry32((job.seed >>> 0) || 1);
      Math.random = () => rng();
      if (typeof job.duration !== "number" || !(job.duration > 0)) {
        throw new Error(`invalid job.duration for ${job.id}: ${job.duration}`);
      }
      const mod = await import(pathToFileURL(resolve(job.recipe)).href + `?job=${encodeURIComponent(job.id)}`);
      const duration = mod.duration ?? job.duration;
      if (typeof duration !== "number" || !(duration > 0)) {
        throw new Error(`invalid duration for ${job.id}: ${duration}`);
      }
      const buffer = await Tone.Offline(
        async (ctx) => {
          await mod.default(Tone, {
            rng,
            params: job.params || {},
            duration,
            destination: ctx.destination,
            sr,
          });
        },
        duration,
        1,
        sr,
      );

      const data = buffer.getChannelData(0);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
        sum += a * a;
      }
      let rms = Math.sqrt(sum / data.length);
      if (peak > 0.9) {
        const g = 0.9 / peak;
        for (let i = 0; i < data.length; i++) data[i] *= g;
        peak = 0.9;
        rms *= g;
      }
      const wavPath = join(outDir, `${job.id}.wav`);
      writeWav(wavPath, data, sr);
      results.push({
        id: job.id,
        ok: true,
        wav: wavPath,
        duration: data.length / sr,
        peak_db: 20 * Math.log10(peak || 1e-9),
        rms_db: 20 * Math.log10(rms || 1e-9),
      });
      console.error(`[render] ok ${job.id}: ${(data.length / sr).toFixed(3)}s peak=${results[results.length - 1].peak_db.toFixed(1)}dB`);
    } catch (e) {
      failed++;
      results.push({ id: job?.id ?? "unknown", ok: false, error: String((e && e.message) || e) });
      console.error(`[render] FAIL ${job?.id ?? "unknown"}: ${(e && e.stack) || e}`);
    } finally {
      Math.random = origRandom;
    }
  }
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});