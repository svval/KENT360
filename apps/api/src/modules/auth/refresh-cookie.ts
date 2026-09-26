import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CookieOptions, type Request, type Response } from 'express';
import { API_PREFIX } from '../../bootstrap';
import { type Env } from '../../config/env.validation';
import { readCookie } from '../../common/utils/request-meta';

export const REFRESH_COOKIE = 'kent360_rt';

/**
 * Refresh token transport for browsers (docs/SECURITY.md §2): httpOnly (unreadable by
 * scripts), SameSite=Strict (not sent cross-site → CSRF-safe), and scoped to the auth
 * routes so it never travels with ordinary API calls.
 */
@Injectable()
export class RefreshCookie {
  private readonly options: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    const secure =
      config.get('AUTH_COOKIE_SECURE', { infer: true }) ??
      config.get('NODE_ENV', { infer: true }) === 'production';
    this.options = { httpOnly: true, secure, sameSite: 'strict', path: `/${API_PREFIX}/auth` };
  }

  read(req: Request): string | undefined {
    return readCookie(req.headers.cookie, REFRESH_COOKIE);
  }

  set(res: Response, token: string, expires: Date): void {
    res.cookie(REFRESH_COOKIE, token, { ...this.options, expires });
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.options);
  }
}
