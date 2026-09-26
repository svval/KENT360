import { type NeighborhoodImportError } from '@kent360/shared-types';

/**
 * Two active neighbourhoods of one municipality must not share area.
 *
 * Measure: area of ST_Intersection(a, b) on the spheroid (geography, m²). ST_Intersects
 * only pre-filters candidates via the GIST index – on its own it would also flag
 * neighbours that merely touch along a common border (intersection area 0).
 *
 * Tolerance: an intersection counts as an overlap above 1 m². Floating-point and
 * re-projection artefacts along shared borders are orders of magnitude smaller
 * (coordinates at 6+ decimals ≈ 10 cm), while any genuine double assignment of land is
 * tens of m² or more. A sliver above 1 m² is reported, never silently accepted.
 */
export const OVERLAP_TOLERANCE_M2 = 1;

export const OVERLAP_REASON = 'NEIGHBORHOOD_BOUNDARY_OVERLAP';

export interface OverlapConflict {
  /** Index of the checked geometry (0 for single create/update). */
  index: number;
  /** The neighbourhood it collides with. */
  code: string;
  name: string;
  source: 'database' | 'file';
  overlapM2: number;
}

const areaFormatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

export function formatOverlapArea(m2: number): string {
  return m2 >= 10_000
    ? `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(m2 / 1_000_000)} km²`
    : `${areaFormatter.format(Math.max(1, Math.round(m2)))} m²`;
}

export function overlapMessage(
  conflict: Pick<OverlapConflict, 'code' | 'name' | 'source' | 'overlapM2'>,
): string {
  const where = conflict.source === 'file' ? 'dosyadaki' : 'kayıtlı';
  return `Sınır, ${where} ${conflict.name} (${conflict.code}) mahallesiyle yaklaşık ${formatOverlapArea(conflict.overlapM2)} çakışıyor.`;
}

/** Import error entry for an overlap (geometry is never echoed back). */
export function overlapImportError(
  conflict: OverlapConflict,
  feature: { index: number; code: string },
): NeighborhoodImportError {
  return {
    index: feature.index,
    code: feature.code,
    message: overlapMessage(conflict),
    reason: OVERLAP_REASON,
    conflict: {
      code: conflict.code,
      name: conflict.name,
      source: conflict.source,
      overlapM2: Math.round(conflict.overlapM2),
    },
  };
}

/** An import failing only because of overlaps is reported with the specific code. */
export function importFailureIsOverlapOnly(errors: NeighborhoodImportError[]): boolean {
  return errors.length > 0 && errors.every((error) => error.reason === OVERLAP_REASON);
}
