# scan

Frequency sweep, ~1.2s: a sine sweeping up with a filtered-noise undertone — the "decoding"
sound. Built for barcode-scan and scanning animations.

Moods: tense, glitch, neutral

## When to use
- barcode / QR scan passes                    →  when: "beat:scanline"
- decoding reveals (decrypt-reveal template)
- sonar-style pings

## When NOT to use
- without a scanning visual — a sweep with nothing to scan is noise
- in calm scenes (a sweep implies active machinery)

## Parameters
None — fixed character (use `volume` to control presence).

## Examples
{ "sound": "scan", "when": "beat:scanline", "volume": 0.35 }