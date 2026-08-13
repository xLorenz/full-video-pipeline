// sac-shim.mjs — standardized-audio-context ships only a CommonJS bundle
// (build/es5/bundle.js); Node's ESM-CJS interop mis-detects its named exports.
// This shim re-exports the single CJS instance so every importer (tone +
// render.js) shares the same AudioParam/context wrapper classes.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sac = require("standardized-audio-context");

export const AudioBuffer = sac.AudioBuffer;
export const AudioContext = sac.AudioContext;
export const AudioWorkletNode = sac.AudioWorkletNode;
export const OfflineAudioContext = sac.OfflineAudioContext;
export const isAnyAudioContext = sac.isAnyAudioContext;
export const isAnyAudioNode = sac.isAnyAudioNode;
export const isAnyAudioParam = sac.isAnyAudioParam;
export const isAnyOfflineAudioContext = sac.isAnyOfflineAudioContext;
export const isSupported = sac.isSupported;