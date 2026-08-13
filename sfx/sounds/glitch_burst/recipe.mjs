// glitch_burst — digital stutter burst: square blips, dropouts, bit-crushed tail.
// Sample-level stochastic logic ported from v2; fully seeded via rng.
import { bufferSource } from "../../../sfx-render/lib/rng.js";

export const duration = 0.2;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  const freqs = [220, 440, 523.25, 659.25, 880, 1046.5, 1318.5, 1760];
  let pos = Math.round(0.005 * sr);
  while (pos < n - Math.round(0.03 * sr)) {
    const f = freqs[Math.floor(rng() * freqs.length)];
    const blip = Math.round((0.002 + rng() * 0.005) * sr);
    const gap = Math.round((0.001 + rng() * 0.008) * sr);
    const amp = 0.35 + rng() * 0.65;
    const jump = rng() < 0.18;
    for (let k = 0; k < blip; k++) {
      if (pos + k >= n) break;
      const fk = jump && k > blip * 0.6 ? f * 2 : f;
      const sq = Math.sin((2 * Math.PI * fk * k) / sr) >= 0 ? 1 : -1;
      out[pos + k] += amp * 0.4 * sq;
    }
    if (rng() < 0.12) {
      pos += Math.round((0.01 + rng() * 0.015) * sr);
    } else {
      pos += blip + gap;
    }
  }
  const tailN = Math.round(0.035 * sr);
  const tailStart = n - tailN;
  let hold = 0;
  for (let k = 0; k < tailN; k++) {
    if (k % Math.floor(4 + rng() * 4) === 0) hold = rng() * 2 - 1;
    out[tailStart + k] += 0.5 * hold;
  }
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}