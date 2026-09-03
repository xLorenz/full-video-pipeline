/**
 * Slot-override helpers for element-driven templates.
 *
 * Canonical content rule: ordered content lives in template-specific
 * `extras.*` base arrays; per-item overrides live in `config.elements[]`
 * under slot ids (`bar-0`, `word-2`, `event-1`, `chip-3`, `cell-0-1`, …).
 * Components build one id→override map per render and look slots up in it.
 */

import { useMemo } from "react";
import type { ElementOverride } from "./types";

/** Build an id→override map from `config.elements` (skips malformed entries). */
export function buildSlotOverrideMap(
  elements?: ElementOverride[],
): Map<string, ElementOverride> {
  const m = new Map<string, ElementOverride>();
  for (const e of elements ?? []) {
    if (e && typeof e.id === "string") m.set(e.id, e);
  }
  return m;
}

/** Memoized {@link buildSlotOverrideMap} for use inside components. */
export function useSlotOverrides(
  elements?: ElementOverride[],
): Map<string, ElementOverride> {
  return useMemo(() => buildSlotOverrideMap(elements), [elements]);
}
