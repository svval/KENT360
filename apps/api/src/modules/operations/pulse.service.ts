import { Injectable } from '@nestjs/common';
import {
  type NeighborhoodPulse,
  type NeighborhoodPulseDetail,
  type PulseAnomaly,
  WORK_ORDER_OPEN_STATUSES,
} from '@kent360/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { requestReadScope } from '../requests/domain/request-scope';
import { requestSummarySelect, toRequestSummary } from '../requests/request-mapper';
import { workOrderReadScope } from '../work-orders/domain/work-order-scope';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CLOSED_REQUEST_STATUSES } from './dashboard.service';
import { type AnomalyCounts, detectAnomalies } from './domain/anomaly';
import { lastLocalDays, startOfLocalDay } from './domain/local-time';
import { neighborhoodRisk } from './domain/neighborhood-risk';
import { REQUEST_SCOPE_COLUMNS, scopeToSql, WORK_ORDER_SCOPE_COLUMNS } from './domain/scope-sql';

const DAY = 86_400_000;

interface MetricsRow {
  id: string;
  code: string;
  name: string;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  sla_tracked: number;
  sla_breached: number;
  avg_resolution: number | null;
  last7: number;
  last30: number;
  previous30: number;
}

/**
 * MahallePulse (Phase 10): neighbourhood metrics, explainable risk score and rule-based
 * anomalies over the user's request scope (admin: municipality, manager: department).
 * Every list is a handful of grouped SQL queries – never one query per neighbourhood.
 */
@Injectable()
export class PulseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async list(actor: AuthUser, now = new Date()): Promise<NeighborhoodPulse[]> {
    return (await this.metrics(actor, null, now)).sort(
      (a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name, 'tr'),
    );
  }

  async detail(actor: AuthUser, id: string, now = new Date()): Promise<NeighborhoodPulseDetail> {
    const [pulse] = await this.metrics(actor, id, now);
    if (!pulse) {
      throw AppException.notFound(ErrorCode.NEIGHBORHOOD_NOT_FOUND, 'Mahalle bulunamadı.');
    }
    const mid = actor.municipalityId;
    const scope = this.requestScope(actor);
    const scopeSql = scopeToSql(scope, REQUEST_SCOPE_COLUMNS);
    const { timezone: timeZone } = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: mid },
      select: { timezone: true },
    });
    const days = lastLocalDays(now, timeZone, 90);
    const trendStart = startOfLocalDay(new Date(`${days[0]}T12:00:00Z`), timeZone);
    const d90 = new Date(now.getTime() - 90 * DAY);
    const db = this.prisma.forTenant(mid);
    const ctx = await this.workOrders.context(actor);
    const woScope = workOrderReadScope(
      actor,
      ctx.memberships.map((m) => m.teamId),
    );

    const [[center], categories, created, resolved, openRequests, activeWorkOrders, anomalies] =
      await Promise.all([
        this.prisma.$queryRaw<{ latitude: number; longitude: number }[]>`
          SELECT ST_Y(center) AS latitude, ST_X(center) AS longitude
          FROM neighborhoods WHERE id = ${id}::uuid AND municipality_id = ${mid}::uuid AND center IS NOT NULL`,
        this.prisma.$queryRaw<{ id: string; name: string; count: number }[]>`
          SELECT c.id, c.name, count(*)::int AS count
          FROM requests r JOIN request_categories c ON c.id = r.category_id
          WHERE r.municipality_id = ${mid}::uuid AND r.neighborhood_id = ${id}::uuid
            AND ${scopeSql} AND r.created_at >= ${d90}
          GROUP BY c.id, c.name ORDER BY count DESC, c.name`,
        this.dailyCounts('created_at', mid, id, scopeSql, timeZone, trendStart),
        this.dailyCounts('resolved_at', mid, id, scopeSql, timeZone, trendStart),
        db.request.findMany({
          where: {
            AND: [scope, { neighborhoodId: id }, { status: { notIn: CLOSED_REQUEST_STATUSES } }],
          },
          select: requestSummarySelect,
          orderBy: [{ slaDueAt: { sort: 'asc', nulls: 'last' } }],
          take: 10,
        }),
        woScope
          ? db.workOrder.findMany({
              where: {
                AND: [
                  woScope,
                  { request: { neighborhoodId: id } },
                  { status: { in: [...WORK_ORDER_OPEN_STATUSES] } },
                ],
              },
              select: {
                id: true,
                publicNumber: true,
                status: true,
                priority: true,
                fieldTeam: { select: { name: true } },
                request: { select: { publicNumber: true } },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            })
          : Promise.resolve([]),
        this.anomalies(actor, now, id),
      ]);
    const createdBy = new Map(created.map((r) => [r.day, r.count]));
    const resolvedBy = new Map(resolved.map((r) => [r.day, r.count]));
    return {
      ...pulse,
      center: center ?? null,
      categories,
      trend: days.map((date) => ({
        date,
        created: createdBy.get(date) ?? 0,
        resolved: resolvedBy.get(date) ?? 0,
      })),
      openRequests: openRequests.map((r) => toRequestSummary(r, now)),
      activeWorkOrders: activeWorkOrders.map((w) => ({
        id: w.id,
        publicNumber: w.publicNumber,
        status: w.status,
        priority: w.priority,
        team: w.fieldTeam?.name ?? null,
        requestNumber: w.request?.publicNumber ?? null,
      })),
      anomalies,
    };
  }

  /** Rule-based anomalies (domain/anomaly.ts) – one grouped query. */
  async anomalies(
    actor: AuthUser,
    now = new Date(),
    neighborhoodId?: string,
  ): Promise<PulseAnomaly[]> {
    const mid = actor.municipalityId;
    const d7 = new Date(now.getTime() - 7 * DAY);
    const d35 = new Date(now.getTime() - 35 * DAY);
    const rows = await this.prisma.$queryRaw<
      {
        neighborhood_id: string;
        neighborhood_name: string;
        category_id: string;
        category_name: string;
        last7: number;
        previous28: number;
      }[]
    >`
      SELECT n.id AS neighborhood_id, n.name AS neighborhood_name,
             c.id AS category_id, c.name AS category_name,
             count(*) FILTER (WHERE r.created_at >= ${d7})::int AS last7,
             count(*) FILTER (WHERE r.created_at < ${d7})::int AS previous28
      FROM requests r
      JOIN neighborhoods n ON n.id = r.neighborhood_id
      JOIN request_categories c ON c.id = r.category_id
      WHERE r.municipality_id = ${mid}::uuid
        AND ${scopeToSql(this.requestScope(actor), REQUEST_SCOPE_COLUMNS)}
        AND r.created_at >= ${d35} AND r.status <> 'REJECTED'
        AND ${neighborhoodId ? Prisma.sql`n.id = ${neighborhoodId}::uuid` : Prisma.sql`TRUE`}
      GROUP BY n.id, n.name, c.id, c.name`;
    return detectAnomalies(
      rows.map((r): AnomalyCounts => ({
        neighborhoodId: r.neighborhood_id,
        neighborhoodName: r.neighborhood_name,
        categoryId: r.category_id,
        categoryName: r.category_name,
        last7: r.last7,
        previous28: r.previous28,
      })),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /** Staff scope only – the endpoint requires analytics.read + requests.read. */
  private requestScope(actor: AuthUser) {
    return requestReadScope(actor) ?? { createdById: actor.id };
  }

  private async metrics(
    actor: AuthUser,
    id: string | null,
    now: Date,
  ): Promise<NeighborhoodPulse[]> {
    const mid = actor.municipalityId;
    const scopeSql = scopeToSql(this.requestScope(actor), REQUEST_SCOPE_COLUMNS);
    const ctx = await this.workOrders.context(actor);
    const woScope = workOrderReadScope(
      actor,
      ctx.memberships.map((m) => m.teamId),
    );
    const d7 = new Date(now.getTime() - 7 * DAY);
    const d30 = new Date(now.getTime() - 30 * DAY);
    const d60 = new Date(now.getTime() - 60 * DAY);
    const d90 = new Date(now.getTime() - 90 * DAY);
    const closed = CLOSED_REQUEST_STATUSES;
    const only = id ? Prisma.sql`n.id = ${id}::uuid` : Prisma.sql`TRUE`;

    const [rows, top, workOrders] = await Promise.all([
      this.prisma.$queryRaw<MetricsRow[]>`
        SELECT n.id, n.code, n.name,
          count(r.id)::int AS total,
          count(r.id) FILTER (WHERE r.status::text <> ALL(${closed}::text[]))::int AS open,
          count(r.id) FILTER (WHERE r.resolved_at IS NOT NULL)::int AS resolved,
          count(r.id) FILTER (WHERE r.status::text <> ALL(${closed}::text[])
                                AND r.priority = 'CRITICAL')::int AS critical,
          count(r.id) FILTER (WHERE r.created_at >= ${d90} AND r.sla_due_at IS NOT NULL
                                AND r.status <> 'REJECTED')::int AS sla_tracked,
          count(r.id) FILTER (WHERE r.created_at >= ${d90} AND r.sla_due_at IS NOT NULL
                                AND r.status <> 'REJECTED'
                                AND coalesce(r.resolved_at, r.closed_at, ${now}) > r.sla_due_at)::int
            AS sla_breached,
          avg(extract(epoch FROM r.resolved_at - r.created_at) / 60)
            FILTER (WHERE r.resolved_at >= ${d90}) AS avg_resolution,
          count(r.id) FILTER (WHERE r.created_at >= ${d7})::int AS last7,
          count(r.id) FILTER (WHERE r.created_at >= ${d30})::int AS last30,
          count(r.id) FILTER (WHERE r.created_at >= ${d60} AND r.created_at < ${d30})::int AS previous30
        FROM neighborhoods n
        LEFT JOIN requests r
          ON r.neighborhood_id = n.id AND r.municipality_id = ${mid}::uuid AND ${scopeSql}
        WHERE n.municipality_id = ${mid}::uuid AND n.status = 'ACTIVE' AND ${only}
        GROUP BY n.id, n.code, n.name`,
      this.prisma.$queryRaw<{ neighborhood_id: string; id: string; name: string; count: number }[]>`
        SELECT DISTINCT ON (r.neighborhood_id) r.neighborhood_id, c.id, c.name, count(*)::int AS count
        FROM requests r
        JOIN neighborhoods n ON n.id = r.neighborhood_id
        JOIN request_categories c ON c.id = r.category_id
        WHERE r.municipality_id = ${mid}::uuid AND ${scopeSql} AND r.created_at >= ${d90} AND ${only}
        GROUP BY r.neighborhood_id, c.id, c.name
        ORDER BY r.neighborhood_id, count(*) DESC, c.name`,
      woScope
        ? this.prisma.$queryRaw<{ neighborhood_id: string; count: number }[]>`
            SELECT r.neighborhood_id, count(*)::int AS count
            FROM work_orders w
            JOIN requests r ON r.id = w.request_id
            JOIN neighborhoods n ON n.id = r.neighborhood_id
            WHERE w.municipality_id = ${mid}::uuid
              AND w.status::text = ANY(${[...WORK_ORDER_OPEN_STATUSES]}::text[])
              AND ${scopeToSql(woScope, WORK_ORDER_SCOPE_COLUMNS)} AND ${only}
            GROUP BY r.neighborhood_id`
        : Promise.resolve([]),
    ]);
    const topBy = new Map(top.map((t) => [t.neighborhood_id, t]));
    const woBy = new Map(workOrders.map((w) => [w.neighborhood_id, w.count]));
    return rows.map((row) => {
      const avg = row.avg_resolution === null ? null : Math.round(Number(row.avg_resolution));
      const risk = neighborhoodRisk({
        open: row.open,
        openCritical: row.critical,
        slaTracked: row.sla_tracked,
        slaBreached: row.sla_breached,
        last30: row.last30,
        previous30: row.previous30,
        avgResolutionMinutes: avg,
      });
      const t = topBy.get(row.id);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        total: row.total,
        open: row.open,
        resolved: row.resolved,
        critical: row.critical,
        openWorkOrders: woBy.get(row.id) ?? 0,
        slaBreachPercent:
          row.sla_tracked > 0 ? Math.round((row.sla_breached / row.sla_tracked) * 1000) / 10 : null,
        avgResolutionMinutes: avg,
        topCategory: t ? { id: t.id, name: t.name, count: t.count } : null,
        last7: row.last7,
        last30: row.last30,
        previous30: row.previous30,
        changePercent:
          row.previous30 > 0
            ? Math.round(((row.last30 - row.previous30) / row.previous30) * 100)
            : null,
        ...risk,
      };
    });
  }

  private dailyCounts(
    column: 'created_at' | 'resolved_at',
    mid: string,
    neighborhoodId: string,
    scopeSql: Prisma.Sql,
    timeZone: string,
    from: Date,
  ) {
    const col = Prisma.raw(`r.${column}`);
    return this.prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char((${col} AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS count
      FROM requests r
      WHERE r.municipality_id = ${mid}::uuid AND r.neighborhood_id = ${neighborhoodId}::uuid
        AND ${scopeSql} AND ${col} >= ${from}
      GROUP BY 1`;
  }
}
