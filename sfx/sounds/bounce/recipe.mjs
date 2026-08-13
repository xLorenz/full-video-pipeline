// bounce — rubber ball: 4 decreasing pitch-drop hits settling, seeded jitter.
// Skill: ui-sound-design vocabulary (playful bounce / bubbly energy).
import { noiseArray, bufferSource, onepoleHP, envDecay } from "../../../sfx-render/lib/rng.js";

export const duration = 0.7;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  const hits = [
    { f: 420, at: 0.0, amp: 1.0, tau: 0.09, drop: 0.8 },
    { f: 285, at: 0.16, amp: 0.72, tau: 0.075, drop: 0.8 },
    { f: 215, at: 0.28, amp: 0.5, tau: 0.06, drop: 0.82 },
    { f: 172, at: 0.38, amp: 0.34, tau: 0.05, drop: 0.85 },
  ];
  const dropDur = 0.05;
  for (const h of hits) {
    const s = Math.round(h.at * sr);
    const len = Math.min(n - s, Math.round((dropDur + 0.2) * sr));
    const amp = h.amp * (1 + (rng() * 2 - 1) * 0.04);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / Math.max(1, Math.round(dropDur * sr));
      const f = h.f * Math.exp(Math.log(h.drop) * Math.min(1, t));
      const dec = Math.exp(-i / (h.tau * sr));
      ph += (2 * Math.PI * f) / sr;
      out[s + i] += amp * dec * Math.sin(ph);
    }
  }
  // seeded 2 ms tick on the first hit (ball strike transient)
  const tick = envDecay(onepoleHP(noiseArray(rng, 0.004, sr), 3000, sr), 0.002, sr);
  for (let i = 0; i < tick.length; i++) out[i] += 0.35 * tick[i];
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}