import {
  afterFailedLogin,
  isLocked,
  LOCK_DURATION_MS,
  MAX_FAILED_LOGINS,
  normalizeEmail,
} from './login-policy';

const now = new Date('2026-09-26T12:00:00Z');

describe('login policy', () => {
  it('is locked only while lockedUntil is in the future', () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now.getTime() + 1), now)).toBe(true);
    expect(isLocked(now, now)).toBe(false);
    expect(isLocked(new Date(now.getTime() - 1), now)).toBe(false);
  });

  it('locks on the 10th consecutive failure for 15 minutes', () => {
    expect(afterFailedLogin(MAX_FAILED_LOGINS - 1, now)).toEqual({ lock: false });
    expect(afterFailedLogin(MAX_FAILED_LOGINS, now)).toEqual({
      lock: true,
      lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
    });
    expect(LOCK_DURATION_MS).toBe(15 * 60 * 1000);
  });

  it('normalises emails', () => {
    expect(normalizeEmail('  Admin@Kent360.LOCAL ')).toBe('admin@kent360.local');
  });
});
