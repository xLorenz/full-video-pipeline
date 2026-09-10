// warning — double mid-range pulse, falling 750 -> 520 Hz.
// Skill: ui-sound-design #warning (double pulse, mid-range, 150-350ms).
import { bufferSource, fadeOut, normalize } from "../../../sfx-render/lib/rng.js";

export const duration = 0.3;

export default async function render(Tone, { params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  const pulses = [
    { at: 0.0, amp: 1.0, tau: 0.03 },
    { at: 0.15, amp: 0.85, tau: 0.03 },
  ];
  for (const p of pulses) {
    const s = Math.round(p.at * sr);
    const plen = Math.round(0.08 * sr);
    const attackN = Math.max(1, Math.round(0.003 * sr));
    let ph = 0;
    let ph2 = 0;
    for (let i = 0; i < plen && s + i < n; i++) {
      const t = i / Math.max(1, plen - 1);
      const f = 750 * Math.exp(Math.log(520 / 750) * t);
      const a = i < attackN ? i / attackN : 1;
      const dec = Math.exp(-i / (p.tau * sr));
      ph += (2 * Math.PI * f) / sr;
      ph2 += (2 * Math.PI * f * 2.0) / sr;
      out[s + i] += p.amp * a * dec * (Math.sin(ph) + 0.3 * Math.sin(ph2));
    }
  }
  fadeOut(out, 0.05, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}