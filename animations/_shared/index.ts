/**
 * Barrel for animation-template shared helpers.
 *
 * Templates do:
 *   import { resolveTheme, resolveTiming } from "../_shared";
 *
 * Per-video copies of templates import from `../_shared` (a relative
 * path within `components/animations/_shared/`). The re-exports here
 * keep the public surface stable if internals are rearranged.
 */

export * from "./types";
export * from "./theme";
export * from "./timing";
export * from "./layout";
