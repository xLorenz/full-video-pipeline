// sparkle — random twinkles: 5 bell dings at random pitch/placement.
// Stochastic placement ported from v2; fully seeded via rng.
import { bufferSource } from "../../../sfx-render/lib/rng.js";

export const duration = 2.0;

function bellDing(f0, totalSamples, sr) {
  const out = new Float32Array(totalSamples);
  const partials = [
    [1.0, 1.0, 0.5],
    [2.0, 0.55, 0.35],
    [2.76, 0.35, 0.25],
    [5.4, 0.2, 0.15],
  ];
  for (const [ratio, amp, tau] of partials) {
    const n = Math.round(1.5 * sr);
    let ph = 0;
    for (let i = 0; i < n && i < out.length; i++) {
      ph += (2 * Math.PI * f0 * ratio) / sr;
      out[i] += amp * Math.exp(-i / (tau * sr)) * Math.sin(ph);
    }
  }
  return out;
}

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const totalSamples = Math.round(duration * sr);
  const out = new Float32Array(totalSamples);
  for (let i = 0; i < 5; i++) {
    const f0 = 1046.5 * (1.2 + rng() * 1.0);
    const start = Math.round(rng() * 0.35 * sr);
    const ding = bellDing(f0, totalSamples, sr);
    for (let j = 0; j + start < out.length; j++) {
      out[start + j] += 0.5 * ding[j];
    }
  }
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}