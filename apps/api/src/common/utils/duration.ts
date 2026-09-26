export const DURATION_PATTERN = /^(\d+)([smhd])$/;

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Parses "900s", "15m", "12h" or "7d" into seconds. */
export function parseDurationSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid duration "${value}" (expected e.g. 15m, 7d)`);
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
  if (seconds <= 0) throw new Error(`Duration "${value}" must be positive`);
  return seconds;
}
