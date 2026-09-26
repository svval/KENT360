import {
  type AreaGeometry,
  type NeighborhoodImportError,
  type Position,
} from '@kent360/shared-types';

/**
 * Structural validation of GeoJSON (RFC 7946) area geometries, before anything reaches
 * PostGIS. Topological validity (self-intersections, ring orientation problems…) is
 * checked afterwards with ST_IsValid, which is authoritative.
 */

export const MAX_IMPORT_FEATURES = 1000;
export const MAX_VERTICES_PER_GEOMETRY = 100_000;
export const NEIGHBORHOOD_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export type GeometryResult = { ok: true; geometry: AreaGeometry } | { ok: false; error: string };

function positionError(position: unknown): string | null {
  if (!Array.isArray(position) || position.length < 2 || position.length > 3) {
    return 'Koordinat [boylam, enlem] biçiminde olmalı.';
  }
  if (!position.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return 'Koordinat değerleri sayı olmalı.';
  }
  const [lng, lat] = position as number[];
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return `Koordinat aralık dışında: [${lng}, ${lat}] (boylam -180…180, enlem -90…90; koordinatlar WGS84/EPSG:4326 olmalı).`;
  }
  return null;
}

function ringError(ring: unknown, counter: { vertices: number }): string | null {
  if (!Array.isArray(ring) || ring.length < 4) {
    return 'Her halka (ring) en az 4 koordinat içermeli.';
  }
  for (const position of ring) {
    const error = positionError(position);
    if (error) return error;
  }
  counter.vertices += ring.length;
  const first = ring[0] as Position;
  const last = ring[ring.length - 1] as Position;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return 'Halka kapalı değil: ilk ve son koordinat aynı olmalı.';
  }
  return null;
}

function polygonError(polygon: unknown, counter: { vertices: number }): string | null {
  if (!Array.isArray(polygon) || polygon.length === 0) return 'Poligon en az bir halka içermeli.';
  for (const ring of polygon) {
    const error = ringError(ring, counter);
    if (error) return error;
  }
  return null;
}

export function validateAreaGeometry(input: unknown): GeometryResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Geometri bir GeoJSON nesnesi olmalı.' };
  }
  const { type, coordinates } = input as { type?: unknown; coordinates?: unknown };
  if (type !== 'Polygon' && type !== 'MultiPolygon') {
    return {
      ok: false,
      error: `Geometri tipi Polygon veya MultiPolygon olmalı (gelen: ${String(type)}).`,
    };
  }
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { ok: false, error: 'Geometri boş.' };
  }

  const counter = { vertices: 0 };
  const polygons = type === 'Polygon' ? [coordinates] : coordinates;
  for (const polygon of polygons) {
    const error = polygonError(polygon, counter);
    if (error) return { ok: false, error };
    if (counter.vertices > MAX_VERTICES_PER_GEOMETRY) {
      return {
        ok: false,
        error: `Geometri çok büyük (en fazla ${MAX_VERTICES_PER_GEOMETRY} köşe). Sadeleştirip tekrar deneyin.`,
      };
    }
  }
  return { ok: true, geometry: { type, coordinates } as AreaGeometry };
}

export interface ImportFeature {
  index: number;
  name: string;
  code: string;
  district: string | null;
  population: number | null;
  geometry: AreaGeometry;
}

export interface ParsedImport {
  features: ImportFeature[];
  errors: NeighborhoodImportError[];
}

/** Named CRS values meaning WGS84 lon/lat (the RFC 7946 default). */
const WGS84_CRS = /(CRS84|EPSG:+4326|EPSG::4326)$/i;

export function crsError(crs: unknown): string | null {
  if (crs === undefined || crs === null) return null;
  const name = (crs as { properties?: { name?: unknown } }).properties?.name;
  if (typeof name === 'string' && WGS84_CRS.test(name)) return null;
  return `Koordinat sistemi WGS84 (EPSG:4326) olmalı (gelen: ${typeof name === 'string' ? name : 'bilinmiyor'}). Dosyayı EPSG:4326 olarak dışa aktarın.`;
}

/**
 * Validates every feature of an import and reports all problems at once (not just the
 * first), so an operator can fix the file in one go. Duplicate codes inside the file
 * are errors too.
 */
export function parseImportFeatures(features: unknown[]): ParsedImport {
  const parsed: ImportFeature[] = [];
  const errors: NeighborhoodImportError[] = [];
  const seen = new Map<string, number>();

  features.forEach((raw, index) => {
    const feature = (raw ?? {}) as { type?: unknown; properties?: unknown; geometry?: unknown };
    const props = (
      typeof feature.properties === 'object' && feature.properties !== null
        ? feature.properties
        : {}
    ) as Record<string, unknown>;
    const code = typeof props.code === 'string' ? props.code.trim() : null;
    const fail = (message: string) => errors.push({ index, code, message });

    if (feature.type !== 'Feature') return fail('Öğe bir GeoJSON Feature olmalı.');
    const name = typeof props.name === 'string' ? props.name.trim() : '';
    if (name.length < 2 || name.length > 120) return fail('properties.name 2–120 karakter olmalı.');
    if (!code || !NEIGHBORHOOD_CODE_PATTERN.test(code)) {
      return fail(
        'properties.code harf/rakam ile başlamalı; harf, rakam, "-" ve "_" içerebilir (en fazla 40).',
      );
    }
    if (seen.has(code))
      return fail(`Kod dosyada tekrar ediyor (ilk kullanım: ${seen.get(code)! + 1}. öğe).`);
    seen.set(code, index);

    const district = props.district ?? null;
    if (district !== null && (typeof district !== 'string' || district.length > 80)) {
      return fail('properties.district en fazla 80 karakterlik metin olmalı.');
    }
    const population = props.population ?? null;
    if (population !== null && (!Number.isInteger(population) || (population as number) < 0)) {
      return fail('properties.population negatif olmayan tam sayı olmalı.');
    }

    const geometry = validateAreaGeometry(feature.geometry);
    if (!geometry.ok) return fail(geometry.error);

    parsed.push({
      index,
      name,
      code,
      district: (district as string | null)?.trim() || null,
      population: population as number | null,
      geometry: geometry.geometry,
    });
  });

  return { features: parsed, errors };
}
