import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type Request } from 'express';

/** Login attempts are counted per IP + e-mail (docs/API_DESIGN.md §6); everything else per IP. */
export function throttleTracker(req: Pick<Request, 'ip' | 'path' | 'body'>): string {
  const ip = req.ip ?? 'unknown';
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (req.path.endsWith('/auth/login') && typeof email === 'string') {
    return `${ip}|${email.trim().toLowerCase()}`;
  }
  return ip;
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    return Promise.resolve(throttleTracker(req));
  }
}
