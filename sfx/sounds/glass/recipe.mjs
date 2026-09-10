// glass — glass shatter: crack + thump + 90 shard cascade + 3 late clinks (v2 glass_shatter, 1:1 port).
import { noiseArray, bufferSource, envDecay, fadeOut, normalize, onepoleHP, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 1.2;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);

  const crack = envDecay(onepoleHP(noiseArray(rng, 0.035, sr), 2500, sr), 0.012, sr);
  for (let i = 0; i < crack.length; i++) out[i] += crack[i];

  const thump = envDecay(sineArray(180, 0.04, sr), 0.012, sr);
  for (let i = 0; i < thump.length; i++) out[i] += 0.4 * thump[i];

  for (let k = 0; k < 90; k++) {
    const tStart = Math.min(-Math.log(rng()) * 0.1, 0.7);
    const start = Math.round(tStart * sr);
    if (start >= n) continue;
    const f = 1400 + rng() * 5800;
    const tau = 0.015 + rng() * 0.075;
    const amp = tStart < 0.15 ? 0.06 + rng() * 0.44 : 0.03 + rng() * 0.19;
    const len = Math.min(n - start, Math.round(0.4 * sr));
    const tone = envDecay(sineArray(f, len / sr, sr), tau, sr);
    for (let i = 0; i < len; i++) out[start + i] += amp * tone[i];
  }

  for (const [tStart, f] of [[0.28, 3600], [0.5, 2800], [0.72, 4600]]) {
    const start = Math.round(tStart * sr);
    const tone = envDecay(sineArray(f, (n - start) / sr, sr), 0.05, sr);
    for (let i = 0; i < tone.length; i++) out[start + i] += 0.12 * tone[i];
  }

  fadeOut(out, 0.05, sr);
  normalize(out, 0.9);

  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}