// rain — steady procedural rain: hiss + flutter + 600 droplets (v2 steady_rain, 1:1 port).
import { noiseArray, bufferSource, envAttack, envDecay, fadeOut, normalize, onepoleHP, onepoleLP, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 5.0;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const hiss = onepoleHP(onepoleLP(onepoleLP(noiseArray(rng, duration, sr), 4500, sr), 4500, sr), 500, sr);
  const ph = rng() * 6.28;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const flut =
      (0.75 +
        0.25 *
          Math.sin(2 * Math.PI * 0.21 * t + ph) *
          Math.sin(2 * Math.PI * 0.13 * t + 1.3));
    out[i] = hiss[i] * flut;
  }
  for (let k = 0; k < 600; k++) {
    const start = Math.floor(rng() * n);
    const f = 1800 + rng() * 4700;
    const tau = 0.002 + rng() * 0.008;
    const amp = 0.02 + rng() * 0.12;
    const len = Math.min(Math.round(0.06 * sr), n - start);
    const tone = envDecay(sineArray(f, len / sr, sr), tau, sr);
    for (let i = 0; i < len; i++) out[start + i] += amp * tone[i];
  }
  envAttack(out, 0.4, sr);
  fadeOut(out, 0.5, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}