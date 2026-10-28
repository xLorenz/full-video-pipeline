# Piano samples — Salamander Grand Piano

26 mp3s, one every minor third (A0, then C/D♯/F♯/A for octaves 1–6, then C7), matching the
`pianoUrls()` map in `../clear-skies.js`.

**Attribution (CC BY 3.0).** The Salamander Grand Piano is by **Alexander Holm**, released
under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/),
distributed for Tone.js at <https://tonejs.github.io/audio/salamander/>.

These files are vendored so `render.mjs` needs no network: the bed `sfx/assets/bgm/clear_skies.wav`
is baked from exactly these samples. `SHA256SUMS` records what was vendored;
re-fetch with `node ../fetch-samples.mjs` (idempotent, keeps existing files).

Only the piano voice is sampled — the marimba, pad, bass, drums and FX in `clear-skies.js` are
synthesised by Tone.js.
