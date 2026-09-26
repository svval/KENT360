import {
  type ApiSuccess,
  type AuthTokenResponse,
  type AuthUserProfile,
} from '@kent360/shared-types';
import { apiFetch } from './api-client';
import { endSession, startSession } from './session';

export async function login(email: string, password: string): Promise<AuthTokenResponse> {
  const { data } = await apiFetch<ApiSuccess<AuthTokenResponse>>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    retryOnUnauthorized: false,
  });
  startSession(data);
  return data;
}

/** Ends the session on the server; the local session is dropped even if the call fails. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/v1/auth/logout', { method: 'POST', retryOnUnauthorized: false });
  } finally {
    endSession();
  }
}

export async function fetchMe(): Promise<AuthUserProfile> {
  const { data } = await apiFetch<ApiSuccess<AuthUserProfile>>('/api/v1/auth/me');
  return data;
}

/**
 * Only same-site relative paths are accepted as post-login targets, so a crafted
 * `?next=https://evil.example` or `//evil.example` cannot redirect off-site.
 */
export function safeRedirectTarget(
  next: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next.startsWith('/login') ? fallback : next;
}
