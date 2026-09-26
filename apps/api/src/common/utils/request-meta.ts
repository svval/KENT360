import { type Request } from 'express';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Column limits: audit_logs / refresh_tokens ip_address(64), user_agent(500). */
export function requestMetaOf(req: Pick<Request, 'ip' | 'headers'>): RequestMeta {
  const userAgent = req.headers['user-agent'];
  return {
    ipAddress: req.ip ? req.ip.slice(0, 64) : null,
    userAgent: typeof userAgent === 'string' && userAgent ? userAgent.slice(0, 500) : null,
  };
}

/** Reads one cookie from the raw Cookie header (no cookie-parser dependency needed). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
