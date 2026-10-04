import {
  type ApiSuccess,
  type DashboardOverview,
  type MapFeatureCollection,
  type MapRequestProperties,
  type MapWorkOrderProperties,
  type SearchResultItem,
} from '@kent360/shared-types';
import { apiFetch } from '../api-client';

type Params = Record<string, string | number | boolean | undefined>;

export const operationsKeys = {
  dashboard: ['dashboard', 'overview'] as const,
  search: (q: string) => ['search', q] as const,
};

function toQuery(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  return (await apiFetch<ApiSuccess<DashboardOverview>>('/api/v1/dashboard/overview')).data;
}

/** GeoJSON is returned without the API envelope (MapLibre-ready). */
export function getMapRequests(
  params: Params,
  signal?: AbortSignal,
): Promise<MapFeatureCollection<MapRequestProperties>> {
  return apiFetch(`/api/v1/map/requests${toQuery(params)}`, { signal });
}

export function getMapWorkOrders(
  params: Params,
  signal?: AbortSignal,
): Promise<MapFeatureCollection<MapWorkOrderProperties>> {
  return apiFetch(`/api/v1/map/work-orders${toQuery(params)}`, { signal });
}

export async function globalSearch(q: string): Promise<SearchResultItem[]> {
  return (await apiFetch<ApiSuccess<SearchResultItem[]>>(`/api/v1/search${toQuery({ q })}`)).data;
}
