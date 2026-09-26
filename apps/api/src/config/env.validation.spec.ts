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
});
