import { Prisma } from '../../generated/prisma/client';

/** True for a unique-constraint violation (P2002), e.g. a duplicate (municipality_id, code). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Returns the changed keys of `next` compared with `current` (undefined = "not sent"). */
export function changedFields<T extends object>(current: T, next: Partial<T>): (keyof T)[] {
  return (Object.keys(next) as (keyof T)[]).filter(
    (key) => next[key] !== undefined && next[key] !== current[key],
  );
}

/** Picks `keys` from `source` – used for audit before/after snapshots. */
export function pickFields<T extends object>(source: T, keys: (keyof T)[]): Partial<T> {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Partial<T>;
}
