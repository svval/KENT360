import { type AuditChange } from '@kent360/shared-types';
import { isSensitiveKey, REDACTED } from '../audit-sanitizer';

/**
 * Keys never shown in the audit UI even though they may be stored: free-text bodies and
 * technical envelopes (a prompt, a request body, headers). Secrets are already redacted
 * at write time; they are dropped here as well instead of showing "[REDACTED]".
 */
const HIDDEN_KEYS = new Set([
  'description',
  'body',
  'prompt',
  'rawresponse',
  'raw',
  'headers',
  'useragent',
  'summary',
  'reasoning',
  // Session identifiers are not secrets, but nothing an auditor needs to see either.
  'sessionid',
  'familyid',
]);

const MAX_DEPTH = 3;
const MAX_VALUE = 200;
const MAX_CHANGES = 40;

const hidden = (key: string) =>
  isSensitiveKey(key) || HIDDEN_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ''));

function display(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value === REDACTED) return null;
    return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      return display(value.map((item) => display(item)).join(', '));
    }
    return `${value.length} kayıt`;
  }
  return null;
}

/** { a: { b: 1 } } → { "a.b": "1" }, hidden keys and secrets removed. */
export function flattenAuditData(
  value: unknown,
  prefix = '',
  depth = 0,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) out.set(prefix, display(value));
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (hidden(key) || child === REDACTED) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child) && depth < MAX_DEPTH) {
      for (const [k, v] of flattenAuditData(child, path, depth + 1)) out.set(k, v);
    } else {
      out.set(path, display(child));
    }
  }
  return out;
}

/** Readable key/value changes of an audit entry: only fields that differ (or are set). */
export function auditChanges(before: unknown, after: unknown): AuditChange[] {
  const b = flattenAuditData(before);
  const a = flattenAuditData(after);
  const fields = [...new Set([...b.keys(), ...a.keys()])];
  return fields
    .map((field) => ({ field, before: b.get(field) ?? null, after: a.get(field) ?? null }))
    .filter((change) => change.before !== change.after)
    .slice(0, MAX_CHANGES);
}
