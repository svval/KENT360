import { type ApiError } from '@kent360/shared-types';
import { appConfig } from './config';

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

/**
 * Thin fetch wrapper. Converts the API error envelope into ApiRequestError so
 * TanStack Query consumers can show the server's (Turkish) message directly.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${appConfig.apiUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamıyor.');
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
