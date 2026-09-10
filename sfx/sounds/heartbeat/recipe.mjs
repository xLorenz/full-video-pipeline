// heartbeat — low lub-dub: paired 68/58 Hz thumps + strike click.
// Countdowns, medical beats, tension pulses under narration.
import { noiseArray, bufferSource, envDecay, fadeOut, normalize, onepoleLP, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.7;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  // lub-dub: strong beat + weaker answer 0.26 s later
  const beats = [
    { at: 0.0, f: 68, amp: 1.0, tau: 0.07 },
    { at: 0.26, f: 58, amp: 0.75, tau: 0.06 },
  ];
  for (const b of beats) {
    const s = Math.round(b.at * sr);
    const tone = envDecay(sineArray(b.f, (n - s) / sr, sr), b.tau, sr);
    for (let i = 0; i < tone.length; i++) out[s + i] += b.amp * tone[i];
  }
  // strike click: lowpassed transient on the first beat
  const click = envDecay(onepoleLP(noiseArray(rng, 0.008, sr), 900, sr), 0.004, sr);
  for (let i = 0; i < click.length; i++) out[i] += 0.4 * click[i];
  fadeOut(out, 0.05, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}
