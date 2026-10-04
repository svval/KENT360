/**
 * Local calendar days of the municipality (dashboard "today", trend buckets). Pure and
 * timezone-explicit – the server's own time zone never matters.
 */

function parts(date: Date, timeZone: string): Record<string, number> {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(
    formatted.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]),
  );
}

/** Minutes the zone is ahead of UTC at that instant (Istanbul: +180). */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** "2026-10-04" – the local calendar day of an instant. */
export function localDateKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The instant of local midnight that starts the day containing `date`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = parts(date, timeZone);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  let instant = midnightAsUtc - offsetMinutes(date, timeZone) * 60_000;
  // Correct once if the offset at midnight differs (daylight saving change that day).
  instant = midnightAsUtc - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** The last `days` local days ending with today, oldest first. */
export function lastLocalDays(now: Date, timeZone: string, days: number): string[] {
  const keys: string[] = [];
  let cursor = startOfLocalDay(now, timeZone);
  for (let i = 0; i < days; i += 1) {
    keys.unshift(localDateKey(cursor, timeZone));
    cursor = startOfLocalDay(new Date(cursor.getTime() - 12 * 3_600_000), timeZone);
  }
  return keys;
}
