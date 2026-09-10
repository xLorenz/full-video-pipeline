// ding — bell-like confirm: C6 inharmonic partials, 2 ms attack (v2 bell_ding, 1:1 port).
// Params: decay (bell decay seconds; scales all partial taus).
import { bufferSource, envAttack, envDecay, fadeOut, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 1.5;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const f0 = 1046.5;
  const dScale = (params.decay ?? 0.4) / 0.4;
  const partials = [
    [1.0, 1.0, 0.5],
    [2.0, 0.55, 0.35],
    [2.76, 0.35, 0.25],
    [5.4, 0.2, 0.15],
  ];
  const out = new Float32Array(Math.round(duration * sr));
  for (const [ratio, amp, tau] of partials) {
    const tone = envDecay(sineArray(f0 * ratio, duration, sr), tau * dScale, sr);
    for (let i = 0; i < out.length; i++) out[i] += amp * tone[i];
  }
  envAttack(out, 0.002, sr);
  fadeOut(out, 0.05, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}