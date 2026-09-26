/** Standard success envelope returned by every KENT360 API endpoint. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/** Standard error envelope (see docs/API_DESIGN.md → Error format). */
export interface ApiError {
  success: false;
  code: string;
  message: string;
  details: unknown;
  timestamp: string;
  path?: string;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  checks?: Record<string, { status: 'up' | 'down'; latencyMs?: number; error?: string }>;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}
