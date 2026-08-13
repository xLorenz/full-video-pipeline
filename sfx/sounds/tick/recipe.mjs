// tick — clean short tick: 2 ms noise + 2000 Hz ring (v2 short_tick, 1:1 port).
import { noiseArray, bufferSource, envDecay, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.12;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const out = envDecay(sineArray(2000, duration, sr), 0.02, sr);
  const noise = noiseArray(rng, 0.002, sr);
  for (let i = 0; i < noise.length; i++) out[i] += noise[i] * 0.6;
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}