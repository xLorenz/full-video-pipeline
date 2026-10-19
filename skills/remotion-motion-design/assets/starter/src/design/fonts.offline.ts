import {staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';

/**
 * OFFLINE FONTS: use when fonts.googleapis.com / fonts.gstatic.com are unreachable
 * (restricted sandbox, locked-down CI, airplane). To activate:
 *
 *   1. bash scripts/setup_offline_fonts.sh        (copies woff2 files into public/fonts/)
 *   2. mv src/design/fonts.offline.ts src/design/fonts.ts   (replaces the Google version)
 *
 * @remotion/fonts' loadFont() calls delayRender internally, so frames still wait for the font.
 * Variable fonts (weight "100 900") let one file cover every weight you animate between.
 */
loadFont({family: 'Inter Tight', url: staticFile('fonts/inter-tight.woff2'), weight: '100 900'});
loadFont({family: 'Inter', url: staticFile('fonts/inter.woff2'), weight: '100 900'});
loadFont({family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono.woff2'), weight: '100 800'});

export const fonts = {
  display: "'Inter Tight', system-ui, sans-serif",
  text: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};
