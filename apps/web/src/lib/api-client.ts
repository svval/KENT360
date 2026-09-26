import { type ApiError } from '@kent360/shared-types';
import { appConfig } from './config';
import { getAccessToken, refreshSession } from './session';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function isApiError(body: unknown): body is ApiError {
  return typeof body === 'object' && body !== null && (body as ApiError).success === false;
}

export interface ApiFetchInit extends RequestInit {
  /** Retry once after renewing an expired access token (default true). */
  retryOnUnauthorized?: boolean;
}

/**
 * Thin fetch wrapper. Adds the in-memory access token, renews it once on 401, and
 * converts the API error envelope into ApiRequestError so TanStack Query consumers
 * can show the server's (Turkish) message directly.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { retryOnUnauthorized = true, ...requestInit } = init;
  const token = getAccessToken();

  let response: Response;
  try {
    response = await fetch(`${appConfig.apiUrl}${path}`, {
      ...requestInit,
      // The refresh cookie is path-scoped to /api/v1/auth, so it only travels there.
      credentials: path.startsWith('/api/v1/auth/') ? 'include' : 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(requestInit.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...requestInit.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamıyor.');
  }

  if (response.status === 401 && token && retryOnUnauthorized) {
    const renewed = await refreshSession();
    if (renewed) return apiFetch<T>(path, { ...init, retryOnUnauthorized: false });
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiError(body)) {
      throw new ApiRequestError(response.status, body.code, body.message, body.details);
    }
    throw new ApiRequestError(response.status, 'HTTP_ERROR', 'Beklenmeyen bir yanıt alındı.');
  }

  return body as T;
}
