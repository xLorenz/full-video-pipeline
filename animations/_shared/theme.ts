/**
 * Theme resolution for animation templates.
 *
 * The single source of truth is `lib/styles.ts` (per-video). Templates
 * receive it via the dependency-injected `predict()` callbacks so this
 * module stays import-free and testable in isolation.
 */

import type {
  ThemeOverride,
  ResolvedTheme,
  HexColor,
} from "./types";

export interface StylesSource {
  /** e.g. COLORS from `lib/styles.ts`. */
  colors: { [key: string]: HexColor };
  /** e.g. FONTS from `lib/styles.ts`. */
  fonts: { [key: string]: string };
  /**
   * Optional FONT_SIZES map (per-video constant the agent may add).
   * Templates that scale text use the `sizes.scale` multiplier against
   * whatever map they read at the call site; this helper only carries
   * the resolved multiplier.
   */
}

/**
 * Merge a runtime `ThemeOverride` on top of the per-video `styles.ts`
 * defaults. Behavior:
 *   - Omit `theme` entirely → resolved theme == styles.ts 1-to-1.
 *   - Override individual `palette.*` / `fonts.*` keys → only those
 *     keys replace; the rest fall back to styles.ts.
 *   - `colors`/`fonts` keys not present in styles.ts are allowed (e.g.
 *     `"glow"` from the rings example) and pass through; overrides of
 *     those keys likewise replace.
 *   - `sizes.scale` defaults to 1 when omitted.
 */
export function resolveTheme(
  override: ThemeOverride | undefined,
  styles: StylesSource,
): ResolvedTheme {
  const palette: { [key: string]: HexColor } = { ...styles.colors };
  if (override?.palette) {
    for (const [k, v] of Object.entries(override.palette)) {
      if (v !== undefined) palette[k] = v;
    }
  }

  const fonts: { [key: string]: string } = { ...styles.fonts };
  if (override?.fonts) {
    for (const [k, v] of Object.entries(override.fonts)) {
      if (v !== undefined) fonts[k] = v;
    }
  }

  const sizeScale =
    override?.sizes?.scale !== undefined && override.sizes.scale > 0
      ? override.sizes.scale
      : 1;

  return { palette, fonts, sizeScale };
}

/**
 * Helper: pick a color from the resolved theme, allowing an element-level
 * override to win. Returns the override when it's a non-empty hex string;
 * otherwise the resolved-theme palette lookup; otherwise the fallback.
 *
 *     const c = pickColor(element.color, theme, "primary", "#000000");
 */
export function pickColor(
  elementOverride: string | null | undefined,
  theme: ResolvedTheme,
  paletteKey: string,
  fallback: HexColor,
): HexColor {
  if (elementOverride && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(elementOverride)) {
    return elementOverride;
  }
  const fromTheme = theme.palette[paletteKey];
  return fromTheme ?? fallback;
}

/**
 * Helper: pick a font family with override priority. `scale` is applied
 * to the resolved font size at the call site, not here.
 */
export function pickFont(
  elementOverride: string | null | undefined,
  theme: ResolvedTheme,
  fontKey: string,
  fallback: string,
): string {
  if (elementOverride && elementOverride.trim().length > 0) {
    return elementOverride;
  }
  return theme.fonts[fontKey] ?? fallback;
}
