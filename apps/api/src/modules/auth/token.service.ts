import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type Env } from '../../config/env.validation';

export const JWT_ISSUER = 'kent360-api';
export const JWT_AUDIENCE = 'kent360';

/** Claims of the short-lived access token (docs/SECURITY.md §2). */
export interface AccessTokenPayload {
  /** User id */
  sub: string;
  /** Municipality (tenant) id */
  mid: string;
  /** Session = refresh-token family id; lets logout revoke access tokens immediately. */
  sid: string;
  /** Informational only – authorization always re-reads roles from the database. */
  roles: string[];
  typ: 'access';
}

@Injectable()
export class TokenService {
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  private readonly refreshPepper: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtlSeconds = config.get('JWT_REFRESH_TTL', { infer: true });
    this.refreshPepper = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  signAccessToken(claims: Omit<AccessTokenPayload, 'typ'>): string {
    return this.jwt.sign({ ...claims, typ: 'access' } satisfies AccessTokenPayload);
  }

  /** Returns null for any invalid, expired or foreign token – callers answer 401. */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token);
      const valid =
        payload.typ === 'access' &&
        typeof payload.sub === 'string' &&
        typeof payload.mid === 'string' &&
        typeof payload.sid === 'string';
      return valid ? payload : null;
    } catch {
      return null;
    }
  }

  /** Opaque 256-bit refresh token; only its hash is ever stored. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * HMAC-SHA256 with a server-side pepper (JWT_REFRESH_SECRET): a leaked
   * refresh_tokens table alone is not enough to recognise or forge tokens.
   */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshPepper).update(token).digest('hex');
  }

  refreshExpiry(from = new Date()): Date {
    return new Date(from.getTime() + this.refreshTtlSeconds * 1000);
  }
}
