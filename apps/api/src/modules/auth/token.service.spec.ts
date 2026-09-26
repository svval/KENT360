import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type Env } from '../../config/env.validation';
import { JWT_AUDIENCE, JWT_ISSUER, TokenService } from './token.service';

const SECRET = 'a'.repeat(32);

function makeService(secret = SECRET, accessTtl = 900): TokenService {
  const jwt = new JwtService({
    secret,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: accessTtl,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
    verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  });
  const values: Partial<Env> = {
    JWT_ACCESS_TTL: accessTtl,
    JWT_REFRESH_TTL: 604_800,
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
  return new TokenService(jwt, config);
}

const claims = { sub: 'user-1', mid: 'mun-1', sid: 'fam-1', roles: ['SYSTEM_ADMIN'] };

describe('TokenService', () => {
  it('round-trips access token claims', () => {
    const service = makeService();
    const payload = service.verifyAccessToken(service.signAccessToken(claims));
    expect(payload).toMatchObject({ ...claims, typ: 'access', iss: JWT_ISSUER, aud: JWT_AUDIENCE });
  });

  it('rejects tampered, foreign-secret and expired tokens', () => {
    const service = makeService();
    const token = service.signAccessToken(claims);
    const [header, body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'admin' })).toString('base64url');

    expect(service.verifyAccessToken(`${header}.${forged}.${signature}`)).toBeNull();
    expect(makeService('c'.repeat(32)).verifyAccessToken(token)).toBeNull();
    expect(service.verifyAccessToken(`${header}.${body}.`)).toBeNull();
    expect(service.verifyAccessToken('garbage')).toBeNull();

    const expired = makeService(SECRET, -10);
    expect(expired.verifyAccessToken(expired.signAccessToken(claims))).toBeNull();
  });

  it('issues unguessable refresh tokens and stores only a keyed hash', () => {
    const service = makeService();
    const token = service.generateRefreshToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bit, base64url
    expect(service.generateRefreshToken()).not.toBe(token);
    expect(service.hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token));
    expect(service.hashRefreshToken(token)).not.toContain(token);
  });

  it('computes refresh expiry from the configured TTL', () => {
    const from = new Date('2026-09-26T00:00:00Z');
    expect(makeService().refreshExpiry(from).toISOString()).toBe('2026-10-03T00:00:00.000Z');
  });
});
