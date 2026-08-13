// shimmer — high sparkle: 3 inharmonic partials with 6 Hz vibrato, slow decay.
import { bufferSource } from "../../../sfx-render/lib/rng.js";

export const duration = 1.2;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const f0 = 2093;
  const partials = [
    [1.0, 1.0, 0.3],
    [2.0, 0.5, 0.2],
    [3.01, 0.4, 0.12],
  ];
  const out = new Float32Array(n);
  const attackN = Math.max(1, Math.round(0.002 * sr));
  for (const [ratio, amp, tau] of partials) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0 * ratio * (1 + 0.004 * Math.sin(2 * Math.PI * 6 * t));
      ph += (2 * Math.PI * f) / sr;
      const a = i < attackN ? i / attackN : 1;
      out[i] += amp * a * Math.exp(-i / (tau * sr)) * Math.sin(ph);
    }
  }
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}