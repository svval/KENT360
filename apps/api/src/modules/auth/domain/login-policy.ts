/** docs/SECURITY.md §2: 10 consecutive failures lock the account for 15 minutes. */
export const MAX_FAILED_LOGINS = 10;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Decides what a failed attempt does to the account, given the failure counter
 * *after* it was atomically incremented in the database.
 */
export function afterFailedLogin(
  failedLoginCount: number,
  now: Date,
): { lock: false } | { lock: true; lockedUntil: Date } {
  if (failedLoginCount < MAX_FAILED_LOGINS) return { lock: false };
  return { lock: true, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
}

/** Emails are stored lower-cased; login is case- and whitespace-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
