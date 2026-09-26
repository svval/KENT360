export const PUBLIC_NUMBER_PREFIX = {
  REQUEST: 'KNT',
  WORK_ORDER: 'WO',
} as const;

export type PublicNumberScope = keyof typeof PUBLIC_NUMBER_PREFIX;

const SEQUENCE_DIGITS = 6;

/**
 * Formats a human-readable record number, e.g. KNT-2026-000001.
 * The sequence value itself comes from the atomic NumberSequence counter; this
 * function is pure so the format can be unit-tested independently of the database.
 */
export function formatPublicNumber(
  scope: PublicNumberScope,
  year: number,
  sequence: number,
): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Invalid year for public number: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Sequence must be a positive integer: ${sequence}`);
  }
  // Beyond 999999 the number simply grows wider; uniqueness is preserved.
  const padded = String(sequence).padStart(SEQUENCE_DIGITS, '0');
  return `${PUBLIC_NUMBER_PREFIX[scope]}-${year}-${padded}`;
}

const PUBLIC_NUMBER_PATTERN = /^(KNT|WO)-(\d{4})-(\d{6,})$/;

export function parsePublicNumber(
  value: string,
): { scope: PublicNumberScope; year: number; sequence: number } | null {
  const match = PUBLIC_NUMBER_PATTERN.exec(value.trim().toUpperCase());
  if (!match) return null;
  const [, prefix, year, sequence] = match;
  return {
    scope: prefix === PUBLIC_NUMBER_PREFIX.REQUEST ? 'REQUEST' : 'WORK_ORDER',
    year: Number(year),
    sequence: Number(sequence),
  };
}
