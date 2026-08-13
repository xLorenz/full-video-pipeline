// swell — slow tone + noise swell: 180 -> 520 Hz glide, power ramp (v2 ambient_swell, 1:1 port).
import { noiseArray, bufferSource, fadeOut, normalize, onepoleLP, sineSweep } from "../../../sfx-render/lib/rng.js";

export const duration = 2.5;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const tone = sineSweep(180, 520, duration, sr);
  const noise = onepoleLP(noiseArray(rng, duration, sr), 400, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    out[i] = (0.3 * tone[i] + 0.2 * noise[i]) * (0.25 + 0.75 * t ** 1.5);
  }
  fadeOut(out, 0.5, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}