// boom — deep sub boom: 50 Hz body + 0.3x 25 Hz + 2 ms attack crack (v2 sub_boom, 1:1 port).
import { noiseArray, bufferSource, envDecay, fadeOut, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 1.2;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const a = envDecay(sineArray(50, duration, sr), 0.35, sr);
  const b = envDecay(sineArray(25, duration, sr), 0.5, sr);
  for (let i = 0; i < a.length; i++) a[i] += 0.3 * b[i];
  const crack = noiseArray(rng, 0.002, sr);
  for (let i = 0; i < crack.length; i++) a[i] += crack[i] * 0.9;
  fadeOut(a, 0.05, sr);
  normalize(a, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, a, outGain);
}