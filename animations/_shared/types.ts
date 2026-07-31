/**
 * Shared types for animation templates.
 *
 * Every template accepts `{ config: TemplateConfig }` and resolves it via
 * the helpers in `_shared/`. The shape mirrors the JSON Schema at
 * `schemas/animations.schema.json` (Draft 7).
 */

export type EasingName =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ease-in-cubic"
  | "ease-out-cubic"
  | "ease-out-quint"
  | "ease-out-expo"
  | "ease-out-back"
  | "ease-in-back";

export type HexColor = string;

/** A 2D pixel position. `null` resolves to the template's default layout. */
export interface PositionOverride {
  x?: number | null;
  y?: number | null;
}

export interface SizeOverride {
  fontSize?: number | null;
  scale?: number | null;
}

export interface ElementOverride {
  /** Stable id from this template's `animation.md`. */
  id: string;
  text?: string | null;
  /** Frames from scene start. `null` → auto-stagger. */
  delay?: number | null;
  /** Duration in frames. `null` → default-duration. */
  duration?: number | null;
  easing?: EasingName | null;
  position?: PositionOverride;
  size?: SizeOverride;
  /** Hex color override. `null` → resolved via theme + element role. */
  color?: HexColor | null;
  /** If true, the element is omitted entirely from this instance. */
  hidden?: boolean;
  /** Template-specific per-element fields. See template's `config/schema.json`. */
  custom?: Record<string, unknown>;
}

export interface PaletteOverride {
  primary?: HexColor;
  secondary?: HexColor;
  accent?: HexColor;
  background?: HexColor;
  text?: HexColor;
  muted?: HexColor;
  danger?: HexColor;
  success?: HexColor;
  gridLine?: HexColor;
  /** Allow templates to reference extras palette slots via custom. */
  [key: string]: HexColor | undefined;
}

export interface FontsOverride {
  heading?: string;
  body?: string;
  mono?: string;
  [key: string]: string | undefined;
}

export interface SizesOverride {
  /** Multiplier against the resolved FONT_SIZES. Default 1. */
  scale?: number;
}

export interface ThemeOverride {
  palette?: Partial<PaletteOverride>;
  fonts?: Partial<FontsOverride>;
  sizes?: SizesOverride;
}

export interface GlobalOverride {
  /** Multiplier applied to every delay+duration. Default 1. */
  speed?: number;
  /** Frames added to every delay. Default 0. */
  delayOffset?: number;
  /** Default easing; per-element override wins. */
  easing?: EasingName;
}

export interface TemplateConfig {
  $schema?: string;
  instanceId?: string;
  theme?: ThemeOverride;
  global?: GlobalOverride;
  elements?: ElementOverride[];
  /**
   * Template-specific globals. Declared in each template's
   * `config/schema.json`. Untyped here so templates can extend freely.
   */
  extras?: Record<string, unknown>;
}

/** Resolved theme — after merging styles.ts defaults with `theme` overrides. */
export interface ResolvedTheme {
  palette: { [key: string]: HexColor };
  fonts: { [key: string]: string };
  /** A scale multiplier to apply to FONT_SIZES at the call site. */
  sizeScale: number;
}

/** Resolved timing for a single element — ready to feed into `interpolate()`. */
export interface ResolvedTiming {
  /** Absolute delay in frames (includes global.delayOffset + speed scaling). */
  delay: number;
  /** Duration in frames (after speed scaling). */
  duration: number;
  easing: EasingName;
}
