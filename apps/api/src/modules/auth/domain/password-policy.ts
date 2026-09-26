import * as argon2 from 'argon2';

/** OWASP Password Storage Cheat Sheet – Argon2id minimum configuration. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
/** Upper bound keeps hashing cost bounded against oversized inputs. */
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}
