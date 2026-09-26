export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 8;
const MAX_STRING = 2000;

/**
 * Keys whose values must never reach audit storage, matched case- and
 * separator-insensitively (passwordHash, password_hash, refresh-token, Authorization…).
 */
export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  return (
    k.includes('password') ||
    k.includes('token') ||
    k.includes('secret') ||
    k.includes('cookie') ||
    k.endsWith('hash') ||
    k === 'authorization' ||
    k === 'apikey'
  );
}

/** Credential-looking string values are redacted even under an innocent key. */
function isSensitiveValue(value: string): boolean {
  return /^(bearer|basic)\s+\S+/i.test(value) || /^\$argon2(id|i|d)\$/.test(value);
}

/**
 * Deep copy of an audit payload with secrets redacted. Runs on every audit write,
 * so callers cannot forget it. Also normalises values to JSON (Dates → ISO strings,
 * bigint → string) and bounds depth / string length.
 */
export function sanitizeAuditPayload(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') {
    if (isSensitiveValue(value)) return REDACTED;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return null; // functions, symbols
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitizeAuditPayload(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : sanitizeAuditPayload(child, depth + 1, seen);
  }
  return out;
}
