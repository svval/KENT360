import { type Priority, type RecordStatus } from './enums';

// ─── GeoJSON (RFC 7946) – only the parts KENT360 uses ───────────────────────

/** [longitude, latitude] in WGS84 (EPSG:4326). */
export type Position = [number, number] | [number, number, number];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface Feature<G, P> {
  type: 'Feature';
  id?: string | number;
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
}

// ─── Municipality ────────────────────────────────────────────────────────────

export interface MunicipalityProfile {
  id: string;
  name: string;
  /** Stable machine code of the tenant (e.g. "sahinbey"); not editable via the API. */
  slug: string;
  city: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  timezone: string;
  locale: string;
  mapCenterLat: number | null;
  mapCenterLng: number | null;
  mapZoom: number | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Departments ─────────────────────────────────────────────────────────────

export interface DepartmentSummary {
  id: string;
  name: string;
  code: string;
  description: string | null;
  contactEmail: string | null;
  status: RecordStatus;
  userCount: number;
  /** Active categories routed to this department. */
  categoryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Neighbourhoods ──────────────────────────────────────────────────────────

export interface NeighborhoodSummary {
  id: string;
  name: string;
  code: string;
  district: string | null;
  population: number | null;
  status: RecordStatus;
  /** Stored as MultiPolygon; "Polygon" when it has a single part. */
  geometryType: 'Polygon' | 'MultiPolygon' | null;
  partCount: number;
  areaKm2: number | null;
  center: { latitude: number; longitude: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface NeighborhoodDetail extends NeighborhoodSummary {
  boundary: MultiPolygonGeometry | null;
}

export interface NeighborhoodFeatureProperties {
  id: string;
  name: string;
  code: string;
}

export type NeighborhoodFeatureCollection = FeatureCollection<
  MultiPolygonGeometry,
  NeighborhoodFeatureProperties
>;

/** Import input: one feature per neighbourhood. */
export interface NeighborhoodImportProperties {
  name: string;
  code: string;
  district?: string | null;
  population?: number | null;
}

export interface NeighborhoodImportResult {
  imported: number;
  failed: number;
  dryRun: boolean;
  codes: string[];
}

/** One rejected feature, returned in `details.errors` of NEIGHBORHOOD_IMPORT_FAILED. */
export interface NeighborhoodImportError {
  /** 0-based index in `features`. */
  index: number;
  code: string | null;
  message: string;
}

export interface NeighborhoodResolution {
  id: string;
  name: string;
  code: string;
}

// ─── Request categories ──────────────────────────────────────────────────────

export interface RequestCategorySummary {
  id: string;
  parentId: string | null;
  departmentId: string | null;
  department: { id: string; name: string; code: string; status: RecordStatus } | null;
  name: string;
  code: string;
  description: string | null;
  icon: string | null;
  defaultPriority: Priority;
  /** Own value; null means "inherit from parent". */
  defaultSlaMinutes: number | null;
  /** Own value or the parent's; what Phase 5 uses for slaDueAt. */
  effectiveSlaMinutes: number | null;
  /** Human readable effectiveSlaMinutes, e.g. "4 saat", "2 gün". */
  slaLabel: string | null;
  keywords: string[];
  sortOrder: number;
  status: RecordStatus;
  childCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestCategoryNode extends RequestCategorySummary {
  children: RequestCategoryNode[];
}

// ─── SLA ─────────────────────────────────────────────────────────────────────

/** Upper bound for a category SLA: 365 days, in minutes (also a DB CHECK). */
export const SLA_MAX_MINUTES = 525_600;

/**
 * Minutes are the canonical SLA unit; this renders them for people:
 * 30 → "30 dakika", 240 → "4 saat", 90 → "1 saat 30 dakika", 1440 → "1 gün", 2160 → "1 gün 12 saat".
 */
export function formatSlaMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);
  const parts = [
    days > 0 ? `${days} gün` : '',
    hours > 0 ? `${hours} saat` : '',
    mins > 0 && days === 0 ? `${mins} dakika` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `${minutes} dakika`;
}
