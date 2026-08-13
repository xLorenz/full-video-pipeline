// toggle — springy flip sweep 300 -> 850 Hz with overshoot settle.
// Skill: ui-sound-design #toggle (rising pitch sweep with playful spring).
import { bufferSource } from "../../../sfx-render/lib/rng.js";

export const duration = 0.18;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  // piecewise-exponential frequency glide: rise, overshoot down, settle.
  const segs = [
    { f0: 300, f1: 850, dur: 0.05 },
    { f0: 850, f1: 620, dur: 0.05 },
    { f0: 620, f1: 520, dur: 0.06 },
  ];
  let pos = 0;
  let ph = 0;
  let ph2 = 0;
  const attackN = Math.max(1, Math.round(0.002 * sr));
  for (const seg of segs) {
    const segLen = Math.round(seg.dur * sr);
    const r = Math.log(seg.f1 / seg.f0);
    for (let i = 0; i < segLen && pos < n; i++) {
      const t = i / Math.max(1, segLen - 1);
      const f = seg.f0 * Math.exp(r * t);
      const a = pos < attackN ? pos / attackN : 1;
      ph += (2 * Math.PI * f) / sr;
      ph2 += (2 * Math.PI * f * 2.0) / sr;
      out[pos] += 0.5 * a * (Math.sin(ph) + 0.22 * Math.sin(ph2));
      pos++;
    }
  }
  // quick decay on the settle tail
  const tailStart = Math.round((duration - 0.05) * sr);
  for (let i = tailStart; i < n; i++) {
    out[i] *= Math.exp(-(i - tailStart) / (0.02 * sr));
  }
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}