// Deterministic PRNG (mulberry32). All recipes MUST source randomness from
// the rng passed in their render context — never Math.random.
export default function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helper: one-pole lowpass on an array in place, returns the array.
export function onepoleLP(data, cutoff, sr) {
  const w = Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y = (1 - w) * data[i] + w * y;
    data[i] = y;
  }
  return data;
}

// Helper: one-pole highpass on an array in place (DC-block style), returns the array.
export function onepoleHP(data, cutoff, sr) {
  const w = Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    y = w * (y + v - prev);
    prev = v;
    data[i] = y;
  }
  return data;
}

// Seeded white-noise Float32Array of `seconds` at `sr`.
// Recipes must use this instead of Tone.Noise: tone caches its noise buffers
// per-process, which leaks RNG state between jobs and breaks determinism.
export function noiseArray(rng, seconds, sr) {
  const n = Math.max(1, Math.round(seconds * sr));
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = rng() * 2 - 1;
  return data;
}

// Wrap a Float32Array in a Tone.BufferSource connected to `output`, started at 0.
// Must be called inside the offline render (ToneAudioBuffer.fromArray needs an
// active context to create the native AudioBuffer).
export function bufferSource(Tone, data, output) {
  const buffer = Tone.ToneAudioBuffer.fromArray([data]);
  const src = new Tone.BufferSource({ url: buffer });
  src.connect(output);
  src.start(0);
  return src;
}

// Exponential sine glide f0 -> f1 over `seconds` (matches v2 _sweep_sine).
export function sineSweep(f0, f1, seconds, sr) {
  const n = Math.max(1, Math.round(seconds * sr));
  const out = new Float32Array(n);
  const r = f0 > 0 ? Math.log(f1 / f0) : 0;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    ph += (2 * Math.PI * f0 * Math.exp(r * t)) / sr;
    out[i] = Math.sin(ph);
  }
  return out;
}

// Linear attack over the first `seconds` (matches v2 _env_attack).
export function envAttack(data, seconds, sr) {
  const n = Math.min(data.length, Math.max(1, Math.round(seconds * sr)));
  for (let i = 0; i < n; i++) data[i] *= i / n;
  return data;
}

// Exponential decay with time constant tau from index 0 (matches v2 _env_decay).
export function envDecay(data, tau, sr) {
  for (let i = 0; i < data.length; i++) data[i] *= Math.exp(-i / (tau * sr));
  return data;
}

// Squared fade over the last `seconds` (matches v2 _fade_out).
export function fadeOut(data, seconds, sr) {
  const n = Math.min(data.length, Math.max(1, Math.round(seconds * sr)));
  for (let i = 0; i < n; i++) {
    const f = (1 - i / n) ** 2;
    data[data.length - n + i] *= f;
  }
  return data;
}

// One-pole lowpass with exponentially ramping cutoff fc0 -> fc1 over the array
// (matches v2 noise_sweep recipes' per-sample filter).
export function onepoleLPSweep(data, fc0, fc1, sr) {
  const r = Math.log(fc1 / fc0);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    const fc = fc0 * Math.exp((r * i) / Math.max(1, data.length - 1));
    const w = Math.exp((-2 * Math.PI * fc) / sr);
    y = (1 - w) * data[i] + w * y;
    data[i] = y;
  }
  return data;
}