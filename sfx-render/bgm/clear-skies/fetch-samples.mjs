#!/usr/bin/env node
/**
 * fetch-samples.mjs — vendors the Salamander Grand Piano samples used by clear-skies.js.
 *
 *   node fetch-samples.mjs          (one-time, needs network)
 *
 * Writes samples/<note>.mp3 for the 26 keys clear-skies.js asks for (A0, then every minor
 * third C1 … A6, then C7) plus samples/SHA256SUMS, so render.mjs can prove the samples it
 * bakes with are the ones that were reviewed. The samples are committed: rendering is
 * offline and reproducible, and the CC BY 3.0 attribution lives in samples/README.md.
 *
 * Source: https://tonejs.github.io/audio/salamander/  (Alexander Holm, CC BY 3.0)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'samples');
const BASE = 'https://tonejs.github.io/audio/salamander/';

/** mirrors pianoUrls() in clear-skies.js */
const names = ['A0'];
for (let o = 1; o <= 6; o++) for (const n of ['C', 'Ds', 'Fs', 'A']) names.push(n + o);
names.push('C7');

fs.mkdirSync(dir, { recursive: true });
const sums = [];

for (const name of names) {
  const file = `${name}.mp3`;
  const dest = path.join(dir, file);
  let bytes;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    bytes = fs.readFileSync(dest);
    console.log(`  have ${file} (${(bytes.length / 1024).toFixed(0)} KB)`);
  } else {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, bytes);
    console.log(`  got  ${file} (${(bytes.length / 1024).toFixed(0)} KB)`);
  }
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);
}

fs.writeFileSync(path.join(dir, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`done: ${sums.length} samples in ${path.relative(process.cwd(), dir)}`);
