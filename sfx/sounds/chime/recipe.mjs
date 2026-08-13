// chime — softer bell: G6 inharmonic partials, 2 ms attack (v2 soft_chime, 1:1 port).
import { bufferSource, envAttack, envDecay, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 2.0;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const f0 = 1568;
  const partials = [
    [1.0, 1.0, 0.7],
    [2.0, 0.4, 0.45],
    [2.76, 0.3, 0.3],
  ];
  const out = new Float32Array(Math.round(duration * sr));
  for (const [ratio, amp, tau] of partials) {
    const tone = envDecay(sineArray(f0 * ratio, duration, sr), tau, sr);
    for (let i = 0; i < out.length; i++) out[i] += amp * tone[i];
  }
  envAttack(out, 0.002, sr);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}