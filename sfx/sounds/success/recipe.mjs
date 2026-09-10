// success — ascending major-third chime (C5 -> E5) with bell sparkle.
// Skill: ui-sound-design #success (ascending major third, 200-500ms).
import { bufferSource, fadeOut, normalize } from "../../../sfx-render/lib/rng.js";

export const duration = 0.5;

export default async function render(Tone, { params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  const attackN = Math.max(1, Math.round(0.004 * sr));
  const notes = [
    { f0: 523.25, at: 0.0, amp: 1.0, tau: 0.12, sparkle: 0.22 },
    { f0: 659.25, at: 0.16, amp: 0.9, tau: 0.15, sparkle: 0.18 },
  ];
  for (const nt of notes) {
    const s = Math.round(nt.at * sr);
    const len = n - s;
    let ph = 0;
    let ph2 = 0;
    for (let i = 0; i < len; i++) {
      const a = i < attackN ? i / attackN : 1;
      const dec = Math.exp(-i / (nt.tau * sr));
      ph += (2 * Math.PI * nt.f0) / sr;
      ph2 += (2 * Math.PI * nt.f0 * 2.76) / sr;
      out[s + i] += nt.amp * a * dec * (Math.sin(ph) + nt.sparkle * Math.sin(ph2));
    }
  }
  fadeOut(out, 0.05, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}