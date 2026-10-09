import { Permission } from '@kent360/shared-types';
import { type AuthUser, tenantContextOf } from '../../../common/auth/auth-user';

/**
 * Report scope: a report describes the work of an organisation unit, so it follows the
 * department rule only – the municipality for its administrator, the own department for
 * a manager. (Unlike the request list, requests a manager merely reported for other
 * departments are not in their department's figures.) null → no report.
 */
export type ReportScope = Record<string, never> | { departmentId: string };

export function reportScope(actor: AuthUser): ReportScope | null {
  if (!actor.permissions.has(Permission.REPORTS_EXPORT)) return null;
  if (!actor.permissions.has(Permission.REQUESTS_READ)) return null;
  const tenant = tenantContextOf(actor);
  if (!tenant.departmentScoped) return {};
  return tenant.departmentId ? { departmentId: tenant.departmentId } : null;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_REPORT_DAYS = 30;
export const MAX_REPORT_DAYS = 731;

/**
 * Inclusive calendar-day range (YYYY-MM-DD). Defaults to the last 30 days ending today.
 * Returns null when the range is reversed or longer than two years.
 */
export function reportRange(
  input: { dateFrom?: string; dateTo?: string },
  today: string,
): { from: string; to: string } | null {
  const to = input.dateTo && DAY_PATTERN.test(input.dateTo) ? input.dateTo : today;
  const from =
    input.dateFrom && DAY_PATTERN.test(input.dateFrom)
      ? input.dateFrom
      : shiftDay(to, -(DEFAULT_REPORT_DAYS - 1));
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (Number.isNaN(days) || days < 0 || days >= MAX_REPORT_DAYS) return null;
  return { from, to };
}

export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "SLA durumu" column of the request report. */
export function slaOutcome(
  row: {
    slaDueAt: Date | null;
    slaAtRiskAt: Date | null;
    resolvedAt: Date | null;
    closed: boolean;
  },
  now: Date,
): string {
  if (!row.slaDueAt) return 'SLA yok';
  if (row.resolvedAt) return row.resolvedAt <= row.slaDueAt ? 'Süresinde çözüldü' : 'Geç çözüldü';
  if (row.closed) return 'Kapatıldı';
  if (now > row.slaDueAt) return 'Aşıldı';
  if (row.slaAtRiskAt && now >= row.slaAtRiskAt) return 'Riskte';
  return 'Süresi içinde';
}
