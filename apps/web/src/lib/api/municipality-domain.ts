import {
  type ApiSuccess,
  type DepartmentSummary,
  type MunicipalityProfile,
  type NeighborhoodDetail,
  type NeighborhoodFeatureCollection,
  type NeighborhoodImportResult,
  type NeighborhoodSummary,
  type Priority,
  type RecordStatus,
  type RequestCategoryNode,
  type RequestCategorySummary,
} from '@kent360/shared-types';
import { apiFetch } from '../api-client';

/** Query keys – invalidate a whole domain with e.g. `['departments']`. */
export const queryKeys = {
  municipality: ['municipality'] as const,
  departments: (params: Record<string, string | number | undefined> = {}) =>
    ['departments', params] as const,
  categoryTree: ['request-categories', 'tree'] as const,
  neighborhoods: (params: Record<string, string | number | undefined> = {}) =>
    ['neighborhoods', params] as const,
  neighborhood: (id: string) => ['neighborhoods', 'detail', id] as const,
  neighborhoodGeoJson: ['neighborhoods', 'geojson'] as const,
};

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// ─── Municipality ────────────────────────────────────────────────────────────

export type MunicipalityUpdate = Partial<
  Pick<
    MunicipalityProfile,
    | 'name'
    | 'city'
    | 'logoUrl'
    | 'primaryColor'
    | 'secondaryColor'
    | 'contactEmail'
    | 'contactPhone'
    | 'website'
    | 'address'
    | 'timezone'
    | 'mapCenterLat'
    | 'mapCenterLng'
    | 'mapZoom'
  >
>;

export async function getMunicipality(): Promise<MunicipalityProfile> {
  return (await apiFetch<ApiSuccess<MunicipalityProfile>>('/api/v1/municipality')).data;
}

export async function updateMunicipality(input: MunicipalityUpdate): Promise<MunicipalityProfile> {
  return (
    await apiFetch<ApiSuccess<MunicipalityProfile>>('/api/v1/municipality', json('PATCH', input))
  ).data;
}

// ─── Departments ─────────────────────────────────────────────────────────────

export interface DepartmentInput {
  name: string;
  code?: string;
  description?: string | null;
  contactEmail?: string | null;
  status?: RecordStatus;
}

export function listDepartments(params: Record<string, string | number | undefined>) {
  return apiFetch<ApiSuccess<DepartmentSummary[]>>(`/api/v1/departments${toQuery(params)}`);
}

export async function createDepartment(input: DepartmentInput): Promise<DepartmentSummary> {
  return (await apiFetch<ApiSuccess<DepartmentSummary>>('/api/v1/departments', json('POST', input)))
    .data;
}

export async function updateDepartment(
  id: string,
  input: Partial<DepartmentInput>,
): Promise<DepartmentSummary> {
  return (
    await apiFetch<ApiSuccess<DepartmentSummary>>(`/api/v1/departments/${id}`, json('PATCH', input))
  ).data;
}

// ─── Request categories ──────────────────────────────────────────────────────

export interface CategoryInput {
  name: string;
  code?: string;
  parentId?: string | null;
  departmentId?: string | null;
  description?: string | null;
  icon?: string | null;
  defaultPriority?: Priority;
  defaultSlaMinutes?: number | null;
  keywords?: string[];
  sortOrder?: number;
  status?: RecordStatus;
}

export async function getCategoryTree(): Promise<RequestCategoryNode[]> {
  return (await apiFetch<ApiSuccess<RequestCategoryNode[]>>('/api/v1/request-categories/tree'))
    .data;
}

export async function createCategory(input: CategoryInput): Promise<RequestCategorySummary> {
  return (
    await apiFetch<ApiSuccess<RequestCategorySummary>>(
      '/api/v1/request-categories',
      json('POST', input),
    )
  ).data;
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
): Promise<RequestCategorySummary> {
  return (
    await apiFetch<ApiSuccess<RequestCategorySummary>>(
      `/api/v1/request-categories/${id}`,
      json('PATCH', input),
    )
  ).data;
}

// ─── Neighbourhoods ──────────────────────────────────────────────────────────

export interface NeighborhoodUpdate {
  name?: string;
  district?: string | null;
  population?: number | null;
  status?: RecordStatus;
}

export function listNeighborhoods(params: Record<string, string | number | undefined>) {
  return apiFetch<ApiSuccess<NeighborhoodSummary[]>>(`/api/v1/neighborhoods${toQuery(params)}`);
}

export async function getNeighborhoodGeoJson(): Promise<NeighborhoodFeatureCollection> {
  // Raw FeatureCollection (no envelope) – usable directly as a map source.
  return apiFetch<NeighborhoodFeatureCollection>('/api/v1/neighborhoods/geojson');
}

export async function updateNeighborhood(
  id: string,
  input: NeighborhoodUpdate,
): Promise<NeighborhoodDetail> {
  return (
    await apiFetch<ApiSuccess<NeighborhoodDetail>>(
      `/api/v1/neighborhoods/${id}`,
      json('PATCH', input),
    )
  ).data;
}

export async function importNeighborhoods(
  collection: unknown,
  dryRun: boolean,
): Promise<NeighborhoodImportResult> {
  return (
    await apiFetch<ApiSuccess<NeighborhoodImportResult>>(
      `/api/v1/neighborhoods/import${dryRun ? '?dryRun=true' : ''}`,
      json('POST', collection),
    )
  ).data;
}
