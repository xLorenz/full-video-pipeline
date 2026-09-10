// impact — hard low hit: low body + short noise crack (v2 low_impact, 1:1 port).
import { noiseArray, bufferSource, envDecay, fadeOut, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.8;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const out = envDecay(sineArray(90, duration, sr), 0.22, sr);
  const click = noiseArray(rng, 0.025, sr);
  const click3 = noiseArray(rng, 0.003, sr);
  for (let i = 0; i < click.length; i++) out[i] += click[i] * 0.5;
  for (let i = 0; i < click3.length; i++) out[i] += click3[i] * 0.8;
  fadeOut(out, 0.03, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}