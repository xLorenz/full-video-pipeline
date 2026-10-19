import {loadFont as loadDisplay} from '@remotion/google-fonts/InterTight';
import {loadFont as loadText} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

/**
 * FONTS. Two families at most: one for display, one for text, plus an optional mono for
 * small technical labels. Typography is half the perceived quality of a motion piece,
 * and an unloaded font silently falls back to Arial/Helvetica, which is the single
 * fastest way for a render to look cheap.
 *
 * loadFont() at module level registers a delayRender, so no frame is captured before
 * the font is ready. Request only the weights and subsets you use.
 *
 * Swap families by changing the three imports (see references/typography.md for
 * tested pairings). If Google Fonts is blocked (a sandbox, CI without internet),
 * use fonts.offline.ts instead: scripts/setup_offline_fonts.sh does the wiring.
 */
const display = loadDisplay('normal', {weights: ['600', '700', '800'], subsets: ['latin']});
const text = loadText('normal', {weights: ['400', '500', '600'], subsets: ['latin']});
const mono = loadMono('normal', {weights: ['500'], subsets: ['latin']});

export const fonts = {
  display: `${display.fontFamily}, system-ui, sans-serif`,
  text: `${text.fontFamily}, system-ui, sans-serif`,
  mono: `${mono.fontFamily}, ui-monospace, monospace`,
};
