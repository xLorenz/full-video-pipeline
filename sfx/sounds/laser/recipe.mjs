// laser — sweeping laser blip: 900 -> 300 Hz glide + HP noise tick (v2 laser, 1:1 port).
import { noiseArray, bufferSource, envDecay, onepoleHP, sineSweep } from "../../../sfx-render/lib/rng.js";

export const duration = 0.22;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const out = envDecay(sineSweep(900, 300, duration, sr), 0.06, sr);
  const tick = onepoleHP(noiseArray(rng, 0.005, sr), 6000, sr);
  for (let i = 0; i < tick.length; i++) out[i] += tick[i] * 0.4;
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}