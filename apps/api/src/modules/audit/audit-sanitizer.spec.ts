import { isSensitiveKey, REDACTED, sanitizeAuditPayload } from './audit-sanitizer';

describe('audit sanitizer', () => {
  it.each([
    'password',
    'passwordHash',
    'password_hash',
    'newPassword',
    'accessToken',
    'refreshToken',
    'refresh-token',
    'tokenHash',
    'Authorization',
    'authorization',
    'cookie',
    'set-cookie',
    'JWT_SECRET',
    'apiKey',
  ])('treats %p as sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['email', 'status', 'firstName', 'roles', 'ipAddress'])('keeps %p', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });

  it('redacts nested secrets while keeping the rest of the payload', () => {
    const result = sanitizeAuditPayload({
      email: 'a@kent360.local',
      password: 'Kent360!Demo',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
      headers: { Authorization: 'Bearer eyJhbGciOi', 'user-agent': 'jest' },
      sessions: [{ refreshToken: 'rt', id: 's1' }],
      note: 'Bearer abc.def.ghi',
      hashLeak: '$argon2id$v=19$m=19456$xyz',
    });

    expect(result).toEqual({
      email: 'a@kent360.local',
      password: REDACTED,
      passwordHash: REDACTED,
      headers: { Authorization: REDACTED, 'user-agent': 'jest' },
      sessions: [{ refreshToken: REDACTED, id: 's1' }],
      note: REDACTED,
      hashLeak: REDACTED,
    });
    expect(JSON.stringify(result)).not.toMatch(/Kent360!Demo|eyJhbGciOi|argon2/);
  });

  it('normalises values to JSON and survives cycles', () => {
    const cyclic: Record<string, unknown> = { at: new Date('2026-09-26T10:00:00Z'), n: 10n };
    cyclic.self = cyclic;
    expect(sanitizeAuditPayload(cyclic)).toEqual({
      at: '2026-09-26T10:00:00.000Z',
      n: '10',
      self: '[CIRCULAR]',
    });
    expect(sanitizeAuditPayload(undefined)).toBeNull();
  });
});
