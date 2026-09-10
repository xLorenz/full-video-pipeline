// punch — sharp mid transient: 100 Hz body + 15 ms noise (v2 mid_punch, 1:1 port).
import { noiseArray, bufferSource, envDecay, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.25;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const out = envDecay(sineArray(100, duration, sr), 0.06, sr);
  const noise = noiseArray(rng, 0.015, sr);
  for (let i = 0; i < noise.length; i++) out[i] += noise[i] * 0.3;
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}