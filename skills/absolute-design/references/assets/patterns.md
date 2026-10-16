# Pattern Recipes

Reusable decorative patterns as SVG snippets. Paste into SVG compositions, or use the CSS equivalents in HTML/CSS work. Every pattern is flat-color, scale-tunable, and tied to a style — pattern choice is a style decision, not filler.

General rules:
- Pattern color should be a *tint or shade* of the ground, or the accent used sparingly — pattern in full-saturation accent over the whole surface is how maximalism becomes noise.
- Set `patternUnits="userSpaceOnUse"` and control scale via the tile `width/height`.
- Keep pattern contrast low enough that type stays dominant (a pattern is texture, not content).

---

## 1. Diagonal stripes (Bauhaus, Deco, brutalist energy)

```xml
<pattern id="stripes" width="12" height="12" patternUnits="userSpaceOnUse"
         patternTransform="rotate(45)">
  <rect width="12" height="12" fill="#F7F7F5"/>
  <rect width="6" height="12" fill="#1A1A1A"/>
</pattern>
```
CSS: `repeating-linear-gradient(45deg, #1A1A1A 0 6px, #F7F7F5 6px 12px)`
*Use: bands, warnings, awnings, energy. Swap rotation (0/90/45) for the mood.*

## 2. Checker / gingham (playful, retro, punk-flier)

```xml
<pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
  <rect width="16" height="16" fill="#FFF8E7"/>
  <rect width="8" height="8" fill="#FF4F81"/>
  <rect x="8" y="8" width="8" height="8" fill="#FF4F81"/>
</pattern>
```
CSS: `conic-gradient(#FF4F81 25%, #FFF8E7 0 50%, #FF4F81 0 75%, #FFF8E7 0) 0 0/16px 16px`
*Gingham variant: overlay two semi-transparent stripe layers at 90°.*

## 3. Dot grid (Swiss, minimal, technical)

```xml
<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
  <circle cx="2" cy="2" r="1.5" fill="#9B9B9B"/>
</pattern>
```
CSS: `radial-gradient(#9B9B9B 1.5px, transparent 1.6px) 0 0/16px 16px`
*Use: subtle grounds, engineering/blueprint feel, bullet-catcher backgrounds. Keep dot radius ≤ 2px at text scale.*

## 4. Wave / sine (Art Nouveau, Memphis, retro-modern)

```xml
<pattern id="wave" width="60" height="20" patternUnits="userSpaceOnUse">
  <rect width="60" height="20" fill="#FAF3E0"/>
  <path d="M0 10 Q 7.5 0 15 10 T 30 10 T 45 10 T 60 10"
        fill="none" stroke="#8FBC8F" stroke-width="2"/>
</pattern>
```
*Use: water, calm motion, decorative bands. Stack two wave layers with offset phase for richness.*

## 5. Art Deco fan / sunburst

Radial fan (quarter-circle scallop):
```xml
<pattern id="decoFan" width="40" height="40" patternUnits="userSpaceOnUse">
  <rect width="40" height="40" fill="#0E1A38"/>
  <path d="M0 40 A 40 40 0 0 1 40 40" fill="none" stroke="#D4AF37" stroke-width="1.5"/>
  <path d="M0 40 A 28 28 0 0 1 28 40" fill="none" stroke="#D4AF37" stroke-width="1.5"/>
  <path d="M40 40 A 40 40 0 0 0 0 40" fill="none" stroke="#D4AF37" stroke-width="1.5"/>
</pattern>
```
For a full sunburst, use `<g>` with lines rotated around a focal point instead of a tile:
```xml
<g stroke="#D4AF37" stroke-width="1">
  <!-- repeat 24x -->
  <line x1="200" y1="200" x2="200" y2="0" transform="rotate(15 200 200)"/>
</g>
```
*Use: Deco grounds, luxury event art, hero halos. Gold on navy is the canonical pairing.*

## 6. Bauhaus geometric scatter

```xml
<pattern id="bauhaus" width="80" height="80" patternUnits="userSpaceOnUse">
  <rect width="80" height="80" fill="#FAFAFA"/>
  <circle cx="16" cy="16" r="10" fill="#E63329"/>
  <rect x="40" y="8" width="20" height="20" fill="#1F5FA9"/>
  <path d="M12 68 L 28 44 L 44 68 Z" fill="#F0C808"/>
  <line x1="48" y1="56" x2="72" y2="56" stroke="#111" stroke-width="3"/>
</pattern>
```
*Use: playful systematic grounds. Vary primitive sizes; keep at most 3 primitives per tile.*

## 7. Terrazzo / confetti (Memphis, 80s revival)

```xml
<pattern id="terrazzo" width="64" height="64" patternUnits="userSpaceOnUse">
  <rect width="64" height="64" fill="#FFF8E7"/>
  <path d="M8 12 l8 -4 5 7 -6 6 z" fill="#FF4F81"/>
  <circle cx="40" cy="14" r="4" fill="#2E5BFF"/>
  <path d="M50 40 q6 -8 12 0 q-6 8 -12 0" fill="#F6E200"/>
  <rect x="18" y="42" width="9" height="9" fill="#6EE7B7" transform="rotate(20 22 46)"/>
  <circle cx="36" cy="52" r="2.5" fill="#F63A2F"/>
  <path d="M2 54 l7 -3 2 5 z" fill="#B28DFF"/>
</pattern>
```
*Use: joyful grounds, packaging, social graphics. Scatter 5–8 chips of 2–3 shapes in 4–6 hues; keep chip size small relative to type.*

## 8. Halftone dots (grunge, pop, retro print)

```xml
<pattern id="halftone" width="8" height="8" patternUnits="userSpaceOnUse">
  <rect width="8" height="8" fill="#F63A2F"/>
  <circle cx="4" cy="4" r="2.6" fill="#0D0D0D"/>
</pattern>
```
*Use: image shading replacement, print-press energy. Vary radius per zone to fake gradients (size modulation = classic halftone).*

## 9. Grain / noise (mid-century, grunge, premium texture)

SVG filter grain:
```xml
<filter id="grain">
  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>
  <feColorMatrix type="saturate" values="0"/>
  <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
</filter>
<!-- usage -->
<rect width="100%" height="100%" filter="url(#grain)" style="mix-blend-mode: multiply"/>
```
CSS: `background-image: url("data:image/svg+xml,…feTurbulence…"); opacity: .05; mix-blend-mode: multiply;`
*Use: the mandatory texture layer for mid-century flat illustration; grunge degradation; any "expensive paper" feel. Keep alpha ≤ 0.08 — grain is felt, not seen.*

## 10. Torn / rough edge (punk, grunge)

```xml
<path d="M0 0 H 200 L 196 4 L 200 8 L 195 12 L 200 16 L 197 20 H 0 Z" fill="#EDEDED"/>
```
*Or crop with a jagged clip-path and layer 2–3 offset copies for a photocopied edge. Combine with halftone for the zine look.*

## 11. Border frames (Arts & Crafts, Nouveau, Deco, certificates)

Arts & Crafts vine-border skeleton:
```xml
<rect x="16" y="16" width="768" height="1168" fill="none" stroke="#2E4B3C" stroke-width="6"/>
<rect x="28" y="28" width="744" height="1144" fill="none" stroke="#B8860B" stroke-width="2"/>
<!-- corner motifs: quarter-circle vine or leaf cluster at each corner -->
```
Deco stepped corner:
```xml
<path d="M0 60 H 20 V 40 H 40 V 20 H 60 V 0" fill="none" stroke="#D4AF37" stroke-width="3"/>
```
*Use: certificates, book covers, invitations, menu headers. Two rules (heavy + hairline) is the classic ratio.*

## 12. Grid overlay (blueprint / Swiss / brutalist)

```xml
<pattern id="gridOverlay" width="40" height="40" patternUnits="userSpaceOnUse">
  <path d="M40 0 H 0 V 40" fill="none" stroke="#BCC7D1" stroke-width="0.5"/>
</pattern>
```
*Use: technical/structural backgrounds, "the grid is the design" statements (postmodern visible grid), presentation backdrops. Keep stroke ≤ 1px and low contrast under text.*

## 13. Gradient meshes & metallic sheen (Deco, maximalist, luxury)

```xml
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%"  stop-color="#B8860B"/>
  <stop offset="45%" stop-color="#F5E6A8"/>
  <stop offset="55%" stop-color="#D4AF37"/>
  <stop offset="100%" stop-color="#8A6D1F"/>
</linearGradient>
```
*Use: metallic type fills, Deco foil, luxury accents. Sheen = abrupt light stop in the middle, not a smooth ramp. Avoid default purple→blue AI gradients entirely.*

---

## Choosing a pattern by style

| Style | Go-to patterns |
|---|---|
| Swiss / minimal | dot grid (very low contrast), none at all |
| Bauhaus | geometric scatter, diagonal stripes, primary color blocks |
| Art Deco | fan/sunburst, stepped borders, parallel rule groups |
| Art Nouveau | wave, organic border frames, line tendrils |
| Arts & Crafts | vine borders, dense botanical repeat, gingham |
| Mid-century | grain over flat shapes, atomic starburst, boomerang shapes |
| Psychedelic | concentric rings, liquid wave, radial mandala |
| Punk / grunge | halftone, torn edges, xerox grain, checker |
| Memphis | terrazzo/confetti, squiggle repeat, zigzag, dots-on-dots |
| Brutalism | grid overlay, raw diagonal stripes, none (raw default) |
| Maximalism | layer 2–3 of the above with shared temperature |
