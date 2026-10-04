export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * `?bbox=west,south,east,north` (WGS84 degrees, the order MapLibre's getBounds() gives).
 * Returns null for anything malformed or inverted; the antimeridian is not supported
 * (irrelevant at municipal scale).
 */
export function parseBbox(value: string): Bbox | null {
  const numbers = value.split(',').map((part) => Number(part.trim()));
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = numbers;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  if (west >= east || south >= north) return null;
  return { west, south, east, north };
}
