// error — descending buzzy fail: detuned saw pair, closing LP, 28 Hz AM, soft clip.
export const duration = 0.7;

export default async function render(Tone, { rng, params, duration, destination, sr }) {
  const saw1 = new Tone.Oscillator({ type: "sawtooth" });
  const saw2 = new Tone.Oscillator({ type: "sawtooth" });
  const r = Math.log(160 / 520);
  for (const [osc, f0] of [[saw1, 520], [saw2, 528]]) {
    osc.frequency.setValueAtTime(f0, 0);
    osc.frequency.exponentialRampToValueAtTime(f0 * Math.exp(r), duration);
  }

  const lp = new Tone.Filter({ type: "lowpass", Q: 0.6 });
  lp.frequency.setValueAtTime(2500, 0);
  lp.frequency.exponentialRampToValueAtTime(900, duration);

  const am = new Tone.Gain(1);
  const lfo = new Tone.LFO({ frequency: 28, min: 0.94, max: 1.06 });
  lfo.connect(am.gain);

  const tanh = Math.tanh(1.6);
  const curveLen = 2048;
  const curve = new Float32Array(curveLen);
  for (let i = 0; i < curveLen; i++) {
    const x = (i / (curveLen - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / tanh;
  }
  const shaper = new Tone.WaveShaper({ curve, oversample: "none" });

  const out = new Tone.Gain(0.0001).connect(destination);
  const holdUntil = Math.max(0.003, duration - 0.12);
  out.gain.setValueAtTime(0.0001, 0);
  out.gain.exponentialRampToValueAtTime(1, 0.003);
  out.gain.setValueAtTime(1, holdUntil);
  out.gain.exponentialRampToValueAtTime(0.0001, duration);

  const mix = new Tone.Gain(0.5).connect(am);
  saw1.connect(mix);
  saw2.connect(mix);
  am.connect(lp);
  lp.connect(shaper);
  shaper.connect(out);
  saw1.start(0).stop(duration);
  saw2.start(0).stop(duration);
  lfo.start(0).stop(duration);
}