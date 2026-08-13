// zap — electric snap: 3 ms onset crackle, band-passed chopped noise, thump glide.
import { noiseArray, bufferSource, onepoleLP, onepoleHP, envDecay } from "../../../sfx-render/lib/rng.js";

export const duration = 0.16;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const crackle = new Tone.Gain(0.0001).connect(destination);
  bufferSource(Tone, noiseArray(rng, 0.003, sr), crackle);
  crackle.gain.setValueAtTime(0.0001, 0);
  crackle.gain.exponentialRampToValueAtTime(0.9, 0.001);
  crackle.gain.exponentialRampToValueAtTime(0.0001, 0.004);

  const n = Math.round(duration * sr);
  const raw = onepoleHP(onepoleLP(noiseArray(rng, duration, sr), 7000, sr), 2200, sr);
  for (let i = 0; i < n; i++) {
    raw[i] *= 0.25 + 0.75 * (rng() < 0.45 ? 1 : 0);
  }
  envDecay(raw, 0.045, sr);
  const arc = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, raw, arc);

  const thump = new Tone.Oscillator({ type: "sine" });
  thump.frequency.setValueAtTime(220, 0);
  thump.frequency.exponentialRampToValueAtTime(60, 0.09);
  const tg = new Tone.Gain(0.0001).connect(destination);
  thump.connect(tg);
  tg.gain.setValueAtTime(0.35, 0);
  tg.gain.setTargetAtTime(0, 0, 0.03);
  thump.start(0).stop(duration);
}