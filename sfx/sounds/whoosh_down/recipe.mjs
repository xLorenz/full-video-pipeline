// whoosh_down — falling band-passed noise sweep ("something leaves / resets").
import { noiseArray, bufferSource, envAttack, fadeOut } from "../../../sfx-render/lib/rng.js";

export const duration = 0.7;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const noise = envAttack(fadeOut(noiseArray(rng, duration, sr), 0.25, sr), 0.1, sr);
  const lp = new Tone.Filter({ type: "lowpass", Q: 0.6 });
  lp.frequency.setValueAtTime(7500, 0);
  lp.frequency.exponentialRampToValueAtTime(350, duration);
  const hp = new Tone.Filter({ type: "highpass", frequency: 200 });
  const out = new Tone.Gain(1).connect(destination);
  lp.connect(hp);
  hp.connect(out);
  bufferSource(Tone, noise, lp);
}