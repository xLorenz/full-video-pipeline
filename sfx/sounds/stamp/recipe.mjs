// stamp — authority verdict: low thump + paper slap + metallic clunk.
// Skill: ui-sound-design building blocks (impact thump + transient slap).
import { noiseArray, bufferSource, onepoleLP, onepoleHP, envDecay, fadeOut, normalize } from "../../../sfx-render/lib/rng.js";

export const duration = 0.25;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);

  // thump: 130 -> 55 Hz exp sweep, fast decay
  const thumpLen = Math.round(0.09 * sr);
  let ph = 0;
  for (let i = 0; i < thumpLen; i++) {
    const t = i / Math.max(1, thumpLen - 1);
    const f = 130 * Math.exp(Math.log(55 / 130) * t);
    const dec = Math.exp(-i / (0.06 * sr));
    ph += (2 * Math.PI * f) / sr;
    out[i] += dec * Math.sin(ph);
  }

  // paper slap: band-passed noise burst at the strike moment
  const slap = envDecay(onepoleHP(onepoleLP(noiseArray(rng, 0.04, sr), 4000, sr), 700, sr), 0.012, sr);
  const slapStart = Math.round(0.004 * sr);
  for (let i = 0; i < slap.length && slapStart + i < n; i++) {
    out[slapStart + i] += 0.5 * slap[i];
  }

  // metallic clunk: inharmonic 1.9x partial of the thump
  const clunkStart = Math.round(0.008 * sr);
  let ph2 = 0;
  for (let i = 0; i < n - clunkStart; i++) {
    const dec = Math.exp(-i / (0.03 * sr));
    ph2 += (2 * Math.PI * 247) / sr;
    out[clunkStart + i] += 0.35 * dec * Math.sin(ph2);
  }

  // body settle: low 85 Hz thump
  const bodyStart = Math.round(0.03 * sr);
  let ph3 = 0;
  for (let i = 0; i < n - bodyStart; i++) {
    const dec = Math.exp(-i / (0.05 * sr));
    ph3 += (2 * Math.PI * 85) / sr;
    out[bodyStart + i] += 0.2 * dec * Math.sin(ph3);
  }

  fadeOut(out, 0.03, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}