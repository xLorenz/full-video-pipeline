// tick — clean short tick: filtered ping at cutoff + 2 ms noise snap.
// Params: cutoff (Hz), q (ring sharpness: higher q = longer ring).
import { noiseArray, bufferSource, envDecay, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.12;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const cutoff = params.cutoff ?? 3500;
  const q = params.q ?? 7.0;
  const tau = Math.min(0.09, Math.max(0.006, q * 0.003));
  const out = envDecay(sineArray(cutoff, duration, sr), tau, sr);
  const noise = noiseArray(rng, 0.002, sr);
  for (let i = 0; i < noise.length; i++) out[i] += noise[i] * 0.6;
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}