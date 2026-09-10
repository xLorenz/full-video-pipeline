// click — damped knock at cutoff + 2 ms attack spike.
// Params: cutoff (Hz), q (ring sharpness).
import { noiseArray, bufferSource } from "../../../sfx-render/lib/rng.js";

export const duration = 0.09;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const cutoff = params.cutoff ?? 2000;
  const q = params.q ?? 2.0;
  const tau = Math.max(0.0008, q * 0.0015);
  const ring = Math.min(0.05, tau * 5);

  const out = new Tone.Gain(0.001).connect(destination);
  out.gain.setValueAtTime(0.0001, 0);

  const osc = new Tone.Oscillator({ type: "sine", frequency: cutoff });
  osc.connect(out);
  out.gain.exponentialRampToValueAtTime(0.9, 0.001);
  out.gain.setValueAtTime(0.9, ring);
  out.gain.exponentialRampToValueAtTime(0.001, ring + 0.01);
  osc.start(0).stop(ring + 0.02);

  const spike = new Tone.Gain(0.0001).connect(destination);
  const noise = noiseArray(rng, 0.005, sr);
  const hp = new Tone.Filter({
    type: "highpass",
    frequency: Math.min(4000, cutoff * 2),
    rolloff: -12,
  });
  hp.connect(spike);
  bufferSource(Tone, noise, hp);
  spike.gain.exponentialRampToValueAtTime(0.5, 0.001);
  spike.gain.exponentialRampToValueAtTime(0.001, 0.004);
}