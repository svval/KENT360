/** Default on-site radius (ARCHITECTURE §6.4); municipality setting `onSiteRadiusMeters`. */
export const DEFAULT_ON_SITE_RADIUS_METERS = 150;
const MIN_RADIUS = 10;
const MAX_RADIUS = 5000;

/** `settings.onSiteRadiusMeters` (10–5000 m); falls back to 150 m when missing or invalid. */
export function onSiteRadiusFrom(settings: unknown): number {
  const value = (settings as { onSiteRadiusMeters?: unknown } | null)?.onSiteRadiusMeters;
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_RADIUS &&
    value <= MAX_RADIUS
    ? value
    : DEFAULT_ON_SITE_RADIUS_METERS;
}

export type ProximityOutcome =
  | { ok: true; distanceMeters: number | null; bypassed: boolean }
  | { ok: false; reason: 'LOCATION_REQUIRED' }
  | { ok: false; reason: 'TOO_FAR'; distanceMeters: number; radiusMeters: number };

/**
 * Decides a field step that needs the device position.
 *   • no position sent → refused, unless the development bypass is on;
 *   • farther than the radius → refused (TOO_FAR), unless the bypass is on;
 *   • the bypass (FIELD_LOCATION_BYPASS, never in production) is recorded as such.
 * `distanceMeters` is measured by PostGIS (ST_DistanceSphere) – null when no position.
 */
export function evaluateProximity(
  distanceMeters: number | null,
  radiusMeters: number,
  bypass: boolean,
): ProximityOutcome {
  if (distanceMeters === null) {
    return bypass
      ? { ok: true, distanceMeters: null, bypassed: true }
      : { ok: false, reason: 'LOCATION_REQUIRED' };
  }
  const rounded = Math.round(distanceMeters);
  if (distanceMeters > radiusMeters) {
    return bypass
      ? { ok: true, distanceMeters: rounded, bypassed: true }
      : { ok: false, reason: 'TOO_FAR', distanceMeters: rounded, radiusMeters };
  }
  return { ok: true, distanceMeters: rounded, bypassed: false };
}
