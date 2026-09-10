// sonar_ping — clean location ping: 880 Hz sine + octave shimmer, long tail.
// Map pins, radar sweeps, "you are here" moments.
// Params: decay (ping tail seconds; scales partial taus).
import { bufferSource, envAttack, envDecay, fadeOut, normalize, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 1.2;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const f0 = 880;
  const dScale = (params.decay ?? 0.8) / 0.8;
  const partials = [
    [1.0, 1.0, 0.8],
    [2.0, 0.3, 0.4],
    [2.99, 0.12, 0.25],
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
