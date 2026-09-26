import { type ApiSuccess, type AuthTokenResponse } from '@kent360/shared-types';
import { appConfig } from './config';

/**
 * Browser session (docs/SECURITY.md §2):
 *   • the access token lives only in memory – never localStorage/sessionStorage;
 *   • the refresh token is an httpOnly cookie the API sets on /api/v1/auth, invisible
 *     to scripts. A page reload restores the session with POST /auth/refresh.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

type SessionListener = (session: AuthTokenResponse | null) => void;
const listeners = new Set<SessionListener>();

/** Notified whenever the session is renewed or lost (e.g. refresh token revoked). */
export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(session: AuthTokenResponse | null): void {
  setAccessToken(session?.accessToken ?? null);
  for (const listener of listeners) listener(session);
}

export function startSession(session: AuthTokenResponse): void {
  publish(session);
}

export function endSession(): void {
  publish(null);
}

let inFlight: Promise<AuthTokenResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Refresh tokens rotate, and presenting an already-rotated token is treated as theft
 * (the whole session is revoked). Concurrent refreshes must therefore never race:
 * calls in this tab share one promise, and the Web Locks API serialises tabs – the
 * second tab refreshes only after the first has stored the rotated cookie.
 */
export function refreshSession(): Promise<AuthTokenResponse | null> {
  inFlight ??= withRefreshLock(requestRefresh).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    // request() resolves with the callback's awaited result; lib.dom types it as Promise<Promise<T>>.
    return navigator.locks.request('kent360-auth-refresh', task) as Promise<T>;
  }
  return task();
}

async function requestRefresh(): Promise<AuthTokenResponse | null> {
  try {
    const response = await fetch(`${appConfig.apiUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      endSession();
      return null;
    }
    const body = (await response.json()) as ApiSuccess<AuthTokenResponse>;
    publish(body.data);
    return body.data;
  } catch {
    // Network failure: keep whatever state we had; the caller shows an error.
    return null;
  }
}
