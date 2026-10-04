import { Injectable } from '@nestjs/common';
import {
  type DashboardOverview,
  Priority,
  RequestStatus,
  WORK_ORDER_OPEN_STATUSES,
} from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { requestReadScope } from '../requests/domain/request-scope';
import { requestSummarySelect, toRequestSummary } from '../requests/request-mapper';
import { workOrderReadScope } from '../work-orders/domain/work-order-scope';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { lastLocalDays, startOfLocalDay } from './domain/local-time';
import { REQUEST_SCOPE_COLUMNS, scopeToSql } from './domain/scope-sql';

const DAY = 86_400_000;
const TREND_DAYS = 30;
const LIST_SIZE = 8;

/** Requests the municipality no longer works on. */
export const CLOSED_REQUEST_STATUSES: RequestStatus[] = [
  RequestStatus.RESOLVED,
  RequestStatus.VERIFIED,
  RequestStatus.CLOSED,
  RequestStatus.REJECTED,
];

interface KpiRow {
  today: number;
  yesterday: number;
  open: number;
  critical: number;
  avg_current: number | null;
  avg_previous: number | null;
  sla_total_current: number;
  sla_ok_current: number;
  sla_total_previous: number;
  sla_ok_previous: number;
}

const percent = (ok: number, total: number) =>
  total > 0 ? Math.round((ok / total) * 1000) / 10 : null;

/**
 * Operations dashboard (Phase 8). Every figure is scoped exactly like the request /
 * work order lists (requestReadScope / workOrderReadScope): admins see the
 * municipality, managers their department. The request KPIs are ONE aggregate query
 * (FILTER clauses), the trend one grouped query per series; lists are bounded.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async overview(actor: AuthUser, now = new Date()): Promise<DashboardOverview> {
    const scope = requestReadScope(actor) ?? { createdById: actor.id };
    const ctx = await this.workOrders.context(actor);
    const woScope = workOrderReadScope(
      actor,
      ctx.memberships.map((m) => m.teamId),
    );
    const { timezone: timeZone } = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: actor.municipalityId },
      select: { timezone: true },
    });
    const mid = actor.municipalityId;
    const scopeSql = scopeToSql(scope, REQUEST_SCOPE_COLUMNS);
    const todayStart = startOfLocalDay(now, timeZone);
    const yesterdayStart = startOfLocalDay(new Date(todayStart.getTime() - DAY / 2), timeZone);
    const d30 = new Date(now.getTime() - 30 * DAY);
    const d60 = new Date(now.getTime() - 60 * DAY);
    const days = lastLocalDays(now, timeZone, TREND_DAYS);
    const trendStart = startOfLocalDay(new Date(`${days[0]}T12:00:00Z`), timeZone);
    const db = this.prisma.forTenant(mid);
    const open = { status: { notIn: CLOSED_REQUEST_STATUSES } };

    const [[kpi], openWorkOrders, created, resolved, critical, breached, atRisk, recent] =
      await Promise.all([
        this.prisma.$queryRaw<KpiRow[]>`
          SELECT
            count(*) FILTER (WHERE r.created_at >= ${todayStart})::int AS today,
            count(*) FILTER (WHERE r.created_at >= ${yesterdayStart} AND r.created_at < ${todayStart})::int AS yesterday,
            count(*) FILTER (WHERE r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[]))::int AS open,
            count(*) FILTER (WHERE r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[])
                               AND r.priority = 'CRITICAL')::int AS critical,
            avg(extract(epoch FROM r.resolved_at - r.created_at) / 60)
              FILTER (WHERE r.resolved_at >= ${d30}) AS avg_current,
            avg(extract(epoch FROM r.resolved_at - r.created_at) / 60)
              FILTER (WHERE r.resolved_at >= ${d60} AND r.resolved_at < ${d30}) AS avg_previous,
            count(*) FILTER (WHERE r.resolved_at >= ${d30} AND r.sla_due_at IS NOT NULL)::int AS sla_total_current,
            count(*) FILTER (WHERE r.resolved_at >= ${d30} AND r.resolved_at <= r.sla_due_at)::int AS sla_ok_current,
            count(*) FILTER (WHERE r.resolved_at >= ${d60} AND r.resolved_at < ${d30}
                               AND r.sla_due_at IS NOT NULL)::int AS sla_total_previous,
            count(*) FILTER (WHERE r.resolved_at >= ${d60} AND r.resolved_at < ${d30}
                               AND r.resolved_at <= r.sla_due_at)::int AS sla_ok_previous
          FROM requests r
          WHERE r.municipality_id = ${mid}::uuid AND ${scopeSql}`,
        woScope
          ? db.workOrder.count({
              where: { AND: [woScope, { status: { in: [...WORK_ORDER_OPEN_STATUSES] } }] },
            })
          : Promise.resolve(0),
        this.prisma.$queryRaw<{ day: string; count: number }[]>`
          SELECT to_char((r.created_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
                 count(*)::int AS count
          FROM requests r
          WHERE r.municipality_id = ${mid}::uuid AND ${scopeSql} AND r.created_at >= ${trendStart}
          GROUP BY 1`,
        this.prisma.$queryRaw<{ day: string; count: number }[]>`
          SELECT to_char((r.resolved_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
                 count(*)::int AS count
          FROM requests r
          WHERE r.municipality_id = ${mid}::uuid AND ${scopeSql} AND r.resolved_at >= ${trendStart}
          GROUP BY 1`,
        // Critical list: three small bounded queries instead of one unindexable CASE sort.
        db.request.findMany({
          where: { AND: [scope, open, { priority: Priority.CRITICAL }] },
          select: requestSummarySelect,
          orderBy: [{ slaDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
          take: LIST_SIZE,
        }),
        db.request.findMany({
          where: { AND: [scope, open, { slaDueAt: { lt: now } }] },
          select: requestSummarySelect,
          orderBy: [{ slaDueAt: 'asc' }],
          take: LIST_SIZE,
        }),
        db.request.findMany({
          where: { AND: [scope, open, { slaAtRiskAt: { lte: now } }, { slaDueAt: { gte: now } }] },
          select: requestSummarySelect,
          orderBy: [{ slaDueAt: 'asc' }],
          take: LIST_SIZE,
        }),
        db.request.findMany({
          where: scope,
          select: requestSummarySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: LIST_SIZE + 2,
        }),
      ]);

    const createdByDay = new Map(created.map((row) => [row.day, row.count]));
    const resolvedByDay = new Map(resolved.map((row) => [row.day, row.count]));
    const seen = new Set<string>();
    const criticalRequests = (
      [
        ...critical.map((r) => ({ r, reason: 'CRITICAL' as const })),
        ...breached.map((r) => ({ r, reason: 'BREACHED' as const })),
        ...atRisk.map((r) => ({ r, reason: 'AT_RISK' as const })),
      ] as const
    )
      .filter(({ r }) => !seen.has(r.id) && seen.add(r.id))
      .slice(0, LIST_SIZE)
      .map(({ r, reason }) => ({ ...toRequestSummary(r, now), reason }));

    return {
      generatedAt: now.toISOString(),
      timeZone,
      kpis: {
        todayRequests: { value: kpi.today, previous: kpi.yesterday },
        openRequests: { value: kpi.open, previous: null },
        criticalRequests: { value: kpi.critical, previous: null },
        openWorkOrders: { value: openWorkOrders, previous: null },
        avgResolutionMinutes: {
          value: kpi.avg_current === null ? null : Math.round(Number(kpi.avg_current)),
          previous: kpi.avg_previous === null ? null : Math.round(Number(kpi.avg_previous)),
        },
        slaCompliancePercent: {
          value: percent(kpi.sla_ok_current, kpi.sla_total_current),
          previous: percent(kpi.sla_ok_previous, kpi.sla_total_previous),
        },
      },
      trend: days.map((date) => ({
        date,
        created: createdByDay.get(date) ?? 0,
        resolved: resolvedByDay.get(date) ?? 0,
      })),
      criticalRequests,
      recentRequests: recent.map((r) => toRequestSummary(r, now)),
    };
  }
}
