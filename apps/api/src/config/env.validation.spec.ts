import { validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://kent360:secret@localhost:5432/kent360',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for optional values', () => {
    const env = validateEnv(validEnv);

    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.AI_PROVIDER).toBe('mock');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits and trims CORS origins', () => {
    const env = validateEnv({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:3000, https://kent360.example.gov.tr ,',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://kent360.example.gov.tr']);
  });

  it('exposes token lifetimes in seconds', () => {
    expect(validateEnv(validEnv)).toMatchObject({ JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 604_800 });
    expect(validateEnv({ ...validEnv, JWT_ACCESS_TTL: '5m' }).JWT_ACCESS_TTL).toBe(300);
  });

  it('rejects malformed token lifetimes', () => {
    expect(() => validateEnv({ ...validEnv, JWT_REFRESH_TTL: 'one week' })).toThrow(
      /JWT_REFRESH_TTL/,
    );
  });

  it('rejects short JWT secrets', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('refuses the example secret in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-access-token-secret-at-least-32-chars',
      }),
    ).toThrow(/production/);
  });

  it('keeps the field location check on unless a non-production env turns it off', () => {
    expect(validateEnv(validEnv).FIELD_LOCATION_BYPASS).toBe(false);
    expect(validateEnv({ ...validEnv, FIELD_LOCATION_BYPASS: 'true' }).FIELD_LOCATION_BYPASS).toBe(
      true,
    );
    expect(() =>
      validateEnv({ ...validEnv, NODE_ENV: 'production', FIELD_LOCATION_BYPASS: 'true' }),
    ).toThrow(/FIELD_LOCATION_BYPASS/);
  });
});
