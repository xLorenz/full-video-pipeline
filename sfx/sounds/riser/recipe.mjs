// riser — long upward tension build: LP-swept noise + sine glide, energy builds.
// Array-domain port of v2 (tone Param.setValueCurveAtTime explodes into
// one ramp event per curve point, so envelopes are baked into the samples).
import { noiseArray, bufferSource, onepoleLPSweep, onepoleHP, sineSweep, fadeOut } from "../../../sfx-render/lib/rng.js";

export const duration = 1.6;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const noise = onepoleHP(onepoleLPSweep(noiseArray(rng, duration, sr), 150, 2600, sr), 200, sr);
  const tone = sineSweep(180, 950, duration, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    out[i] = (0.55 * noise[i] + 0.45 * tone[i]) * t ** 1.8;
  }
  fadeOut(out, 0.12, sr);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}