// scan — frequency sweep: 200 -> 1800 Hz tone + linearly rising band noise (v2 scan_sweep, 1:1 port).
import { noiseArray, bufferSource, envAttack, fadeOut, normalize, onepoleHPSweep, sineSweep } from "../../../sfx-render/lib/rng.js";

export const duration = 0.5;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const tone = sineSweep(200, 1800, duration, sr);
  const hi = onepoleHPSweep(noiseArray(rng, duration, sr), 400, 3500, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.7 * tone[i] + 0.3 * hi[i];
  envAttack(out, 0.05, sr);
  fadeOut(out, 0.05, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}