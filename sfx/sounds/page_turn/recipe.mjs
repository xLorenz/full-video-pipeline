// page_turn — paper flip gesture: fluttered mid-band rustle + soft landing tap.
// Before/after reveals, card flips, dossier opens. Deliberately no rising
// sweep (that reads as zap/sizzle) — paper is a static band with flutter.
import { noiseArray, bufferSource, envAttack, envDecay, fadeOut, normalize, onepoleHP, onepoleLP, sineArray } from "../../../sfx-render/lib/rng.js";

export const duration = 0.32;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);
  // rustle: noise band-limited to 1200-4500 Hz with 22 Hz paper flutter,
  // decaying naturally like a flicked page
  const ph = rng() * 6.28;
  const band = onepoleHP(onepoleLP(noiseArray(rng, duration, sr), 4500, sr), 1200, sr);
  const rust = envDecay(band, 0.12, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const flut = 0.7 + 0.3 * Math.sin(2 * Math.PI * 22 * t + ph);
    out[i] += 0.85 * flut * rust[i];
  }
  envAttack(out, 0.006, sr);
  // landing tap: soft 150 Hz thump as the page settles
  const tapAt = Math.round(0.24 * sr);
  const tap = envDecay(sineArray(150, (n - tapAt) / sr, sr), 0.02, sr);
  for (let i = 0; i < tap.length; i++) out[tapAt + i] += 0.3 * tap[i];
  fadeOut(out, 0.03, sr);
  normalize(out, 0.9);
  const outGain = new Tone.Gain(1).connect(destination);
  bufferSource(Tone, out, outGain);
}
