// thud — soft low knock: 60 Hz body + 0.25x 120 Hz (v2 soft_thud, 1:1 port).
import { bufferSource, envDecay, fadeOut, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.5;

export default async function render(Tone, { params, duration, destination, sr }) {
  const a = envDecay(sineArray(60, duration, sr), 0.16, sr);
  const b = envDecay(sineArray(120, duration, sr), 0.1, sr);
  for (let i = 0; i < a.length; i++) a[i] += 0.25 * b[i];
  fadeOut(a, 0.03, sr);
  normalize(a, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, a, outGain);
}