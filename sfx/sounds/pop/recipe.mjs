// pop — cork-pop: sine glide 420 -> 80 Hz + 1.5 ms noise onset.
import { noiseArray, bufferSource } from "../../../sfx-render/lib/rng.js";

export const duration = 0.12;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const out = new Tone.Gain(1).connect(destination);

  const osc = new Tone.Oscillator({ type: "sine" });
  osc.frequency.setValueAtTime(420, 0);
  osc.frequency.exponentialRampToValueAtTime(80, 0.045);
  osc.connect(out);
  out.gain.setValueAtTime(1, 0);
  out.gain.setTargetAtTime(0, 0, 0.02);
  osc.start(0).stop(duration);

  const spike = new Tone.Gain(0.0001).connect(destination);
  bufferSource(Tone, noiseArray(rng, 0.0015, sr), spike);
  spike.gain.setValueAtTime(0.0001, 0);
  spike.gain.exponentialRampToValueAtTime(0.5, 0.001);
  spike.gain.exponentialRampToValueAtTime(0.0001, 0.003);
}