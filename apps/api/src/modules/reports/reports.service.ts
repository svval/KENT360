import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type PerformanceRow,
  PRIORITY_LABELS,
  type Priority,
  REPORT_LABELS,
  REQUEST_SOURCE_LABELS,
  REQUEST_STATUS_LABELS,
  type ReportSummary,
  type ReportType,
  type RequestSource,
  type RequestStatus,
  WORK_ORDER_OPEN_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderStatus,
} from '@kent360/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { CLOSED_REQUEST_STATUSES } from '../operations/dashboard.service';
import { localDateKey, startOfLocalDay } from '../operations/domain/local-time';
import { type CsvValue, reportFilename, toCsv } from './domain/csv';
import {
  type ReportScope,
  reportRange,
  reportScope,
  shiftDay,
  slaOutcome,
} from './domain/report-scope';
import { type ReportFiltersDto } from './dto/reports.dto';

/** Upper bound of a row-level export; aggregate reports are small by nature. */
export const CSV_ROW_LIMIT = 10_000;

interface MetricsRow {
  id: string | null;
  name: string | null;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  sla_resolved: number;
  sla_within: number;
  avg_minutes: number | null;
}

interface Window {
  mid: string;
  scope: ReportScope;
  filters: ReportFiltersDto;
  start: Date;
  end: Date;
  from: string;
  to: string;
  timeZone: string;
  now: Date;
}

const percent = (ok: number, total: number) =>
  total > 0 ? Math.round((ok / total) * 1000) / 10 : null;
const hours = (minutes: number | null) => (minutes === null ? null : Number(minutes) / 60);

/** Per-group request metrics (alias r). One aggregate per report, no per-row queries. */
const METRICS = Prisma.sql`
  count(*)::int AS total,
  count(*) FILTER (WHERE r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[]))::int AS open,
  count(*) FILTER (WHERE r.resolved_at IS NOT NULL)::int AS resolved,
  count(*) FILTER (WHERE r.priority = 'CRITICAL'
                     AND r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[]))::int AS critical,
  count(*) FILTER (WHERE r.resolved_at IS NOT NULL AND r.sla_due_at IS NOT NULL)::int AS sla_resolved,
  count(*) FILTER (WHERE r.resolved_at <= r.sla_due_at)::int AS sla_within,
  avg(extract(epoch FROM r.resolved_at - r.created_at) / 60)
    FILTER (WHERE r.resolved_at IS NOT NULL) AS avg_minutes`;

const toPerformance = (row: MetricsRow, fallbackName: string): PerformanceRow => ({
  id: row.id,
  name: row.name ?? fallbackName,
  total: row.total,
  open: row.open,
  resolved: row.resolved,
  critical: row.critical,
  slaCompliancePercent: percent(row.sla_within, row.sla_resolved),
  avgResolutionMinutes: row.avg_minutes === null ? null : Math.round(Number(row.avg_minutes)),
});

/**
 * Reports (Phase 13): an on-screen summary and five CSV exports. Every query filters
 * municipality_id explicitly (raw SQL) and the report scope (municipality for the
 * administrator, own department for a manager); filter values are bound parameters.
 * Personal data stays out: no reporter, no description – only the address a report
 * needs, written through the CSV-injection guard.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async window(actor: AuthUser, filters: ReportFiltersDto, now: Date): Promise<Window> {
    const scope = reportScope(actor);
    if (!scope) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Rapor almak için yetkiniz bulunmuyor.',
        HttpStatus.FORBIDDEN,
      );
    }
    const { timezone: timeZone } = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: actor.municipalityId },
      select: { timezone: true },
    });
    const range = reportRange(filters, localDateKey(now, timeZone));
    if (!range) {
      throw new AppException(
        ErrorCode.INVALID_DATE_RANGE,
        'Tarih aralığı geçersiz: başlangıç bitişten sonra olamaz ve aralık en fazla 2 yıl olabilir.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const day = (key: string) => startOfLocalDay(new Date(`${key}T12:00:00Z`), timeZone);
    return {
      mid: actor.municipalityId,
      scope,
      filters,
      start: day(range.from),
      end: day(shiftDay(range.to, 1)),
      from: range.from,
      to: range.to,
      timeZone,
      now,
    };
  }

  /** WHERE for requests (alias r): tenant, scope, created in range, filters. */
  private requestWhere(w: Window): Prisma.Sql {
    const f = w.filters;
    const parts = [
      Prisma.sql`r.municipality_id = ${w.mid}::uuid`,
      Prisma.sql`r.created_at >= ${w.start} AND r.created_at < ${w.end}`,
    ];
    if ('departmentId' in w.scope)
      parts.push(Prisma.sql`r.department_id = ${w.scope.departmentId}::uuid`);
    if (f.departmentId) parts.push(Prisma.sql`r.department_id = ${f.departmentId}::uuid`);
    if (f.categoryId) {
      parts.push(Prisma.sql`r.category_id IN (
        SELECT c.id FROM request_categories c
        WHERE c.municipality_id = ${w.mid}::uuid
          AND (c.id = ${f.categoryId}::uuid OR c.parent_id = ${f.categoryId}::uuid))`);
    }
    if (f.status) parts.push(Prisma.sql`r.status::text = ${f.status}`);
    if (f.priority) parts.push(Prisma.sql`r.priority::text = ${f.priority}`);
    if (f.neighborhoodId) parts.push(Prisma.sql`r.neighborhood_id = ${f.neighborhoodId}::uuid`);
    return Prisma.join(parts, ' AND ');
  }

  /**
   * WHERE for work orders (alias w, source request alias r via LEFT JOIN): created in
   * range, scope and department on the work order; category / neighbourhood / request
   * status through the source request; priority on the work order.
   */
  private workOrderWhere(w: Window): Prisma.Sql {
    const f = w.filters;
    const parts = [
      Prisma.sql`w.municipality_id = ${w.mid}::uuid`,
      Prisma.sql`w.created_at >= ${w.start} AND w.created_at < ${w.end}`,
    ];
    if ('departmentId' in w.scope)
      parts.push(Prisma.sql`w.department_id = ${w.scope.departmentId}::uuid`);
    if (f.departmentId) parts.push(Prisma.sql`w.department_id = ${f.departmentId}::uuid`);
    if (f.categoryId) {
      parts.push(Prisma.sql`r.category_id IN (
        SELECT c.id FROM request_categories c
        WHERE c.municipality_id = ${w.mid}::uuid
          AND (c.id = ${f.categoryId}::uuid OR c.parent_id = ${f.categoryId}::uuid))`);
    }
    if (f.status) parts.push(Prisma.sql`r.status::text = ${f.status}`);
    if (f.priority) parts.push(Prisma.sql`w.priority::text = ${f.priority}`);
    if (f.neighborhoodId) parts.push(Prisma.sql`r.neighborhood_id = ${f.neighborhoodId}::uuid`);
    return Prisma.join(parts, ' AND ');
  }

  // ─── Summary (on screen) ────────────────────────────────────────────────

  async summary(
    actor: AuthUser,
    filters: ReportFiltersDto,
    now = new Date(),
  ): Promise<ReportSummary> {
    const w = await this.window(actor, filters, now);
    const [[totals], [workOrders], departments, neighborhoods] = await Promise.all([
      this.prisma.$queryRaw<MetricsRow[]>`
        SELECT NULL::uuid AS id, NULL AS name, ${METRICS}
        FROM requests r WHERE ${this.requestWhere(w)}`,
      this.prisma.$queryRaw<{ total: number; open: number }[]>`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE w.status::text = ANY(${[...WORK_ORDER_OPEN_STATUSES]}::text[]))::int AS open
        FROM work_orders w LEFT JOIN requests r ON r.id = w.request_id
        WHERE ${this.workOrderWhere(w)}`,
      this.departmentRows(w),
      this.neighborhoodRows(w),
    ]);
    return {
      range: { from: w.from, to: w.to, timeZone: w.timeZone },
      totals: {
        requests: totals.total,
        resolved: totals.resolved,
        open: totals.open,
        slaCompliancePercent: percent(totals.sla_within, totals.sla_resolved),
        slaResolvedWithin: totals.sla_within,
        avgResolutionMinutes:
          totals.avg_minutes === null ? null : Math.round(Number(totals.avg_minutes)),
        openWorkOrders: workOrders.open,
        workOrders: workOrders.total,
      },
      departments: departments.map((row) => toPerformance(row, 'Müdürlük atanmamış')),
      neighborhoods: neighborhoods.map((row) => toPerformance(row, 'Mahalle dışı')),
    };
  }

  private departmentRows(w: Window) {
    return this.prisma.$queryRaw<MetricsRow[]>`
      SELECT r.department_id AS id, d.name AS name, ${METRICS}
      FROM requests r LEFT JOIN departments d ON d.id = r.department_id
      WHERE ${this.requestWhere(w)}
      GROUP BY r.department_id, d.name
      ORDER BY total DESC, name`;
  }

  private neighborhoodRows(w: Window) {
    return this.prisma.$queryRaw<MetricsRow[]>`
      SELECT r.neighborhood_id AS id, n.name AS name, ${METRICS}
      FROM requests r LEFT JOIN neighborhoods n ON n.id = r.neighborhood_id
      WHERE ${this.requestWhere(w)}
      GROUP BY r.neighborhood_id, n.name
      ORDER BY total DESC, name NULLS LAST`;
  }

  // ─── CSV exports ────────────────────────────────────────────────────────

  async csv(
    actor: AuthUser,
    type: ReportType,
    filters: ReportFiltersDto,
    now = new Date(),
  ): Promise<{ filename: string; body: string }> {
    const w = await this.window(actor, filters, now);
    const builders: Record<ReportType, () => Promise<{ headers: string[]; rows: CsvValue[][] }>> = {
      requests: () => this.requestsCsv(w),
      'work-orders': () => this.workOrdersCsv(w),
      sla: () => this.slaCsv(w),
      departments: () => this.departmentsCsv(w),
      neighborhoods: () => this.neighborhoodsCsv(w),
    };
    const { headers, rows } = await builders[type]();
    return {
      filename: reportFilename(REPORT_LABELS[type].slug, localDateKey(now, w.timeZone)),
      body: toCsv(headers, rows),
    };
  }

  private formatter(w: Window) {
    const format = new Intl.DateTimeFormat('tr-TR', {
      timeZone: w.timeZone,
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return (date: Date | null) => (date ? format.format(date) : null);
  }

  private async requestsCsv(w: Window) {
    const rows = await this.prisma.$queryRaw<
      {
        public_number: string;
        created_at: Date;
        status: RequestStatus;
        priority: Priority;
        category: string | null;
        parent_category: string | null;
        department: string | null;
        neighborhood: string | null;
        address: string | null;
        source: RequestSource;
        sla_due_at: Date | null;
        sla_at_risk_at: Date | null;
        resolved_at: Date | null;
        supporter_count: number;
      }[]
    >`
      SELECT r.public_number, r.created_at, r.status, r.priority, c.name AS category,
             pc.name AS parent_category, d.name AS department, n.name AS neighborhood,
             r.address, r.source, r.sla_due_at, r.sla_at_risk_at, r.resolved_at, r.supporter_count
      FROM requests r
      LEFT JOIN request_categories c ON c.id = r.category_id
      LEFT JOIN request_categories pc ON pc.id = c.parent_id
      LEFT JOIN departments d ON d.id = r.department_id
      LEFT JOIN neighborhoods n ON n.id = r.neighborhood_id
      WHERE ${this.requestWhere(w)}
      ORDER BY r.created_at DESC
      LIMIT ${CSV_ROW_LIMIT}`;
    const date = this.formatter(w);
    return {
      headers: [
        'Talep No',
        'Oluşturulma',
        'Durum',
        'Öncelik',
        'Ana Kategori',
        'Kategori',
        'Müdürlük',
        'Mahalle',
        'Adres',
        'Kaynak',
        'SLA Bitiş',
        'SLA Durumu',
        'Çözülme',
        'Çözüm Süresi (saat)',
        'Katılan Vatandaş',
      ],
      rows: rows.map((r) => [
        r.public_number,
        date(r.created_at),
        REQUEST_STATUS_LABELS[r.status],
        PRIORITY_LABELS[r.priority],
        r.parent_category,
        r.category,
        r.department,
        r.neighborhood,
        r.address,
        REQUEST_SOURCE_LABELS[r.source],
        date(r.sla_due_at),
        slaOutcome(
          {
            slaDueAt: r.sla_due_at,
            slaAtRiskAt: r.sla_at_risk_at,
            resolvedAt: r.resolved_at,
            closed: (CLOSED_REQUEST_STATUSES as string[]).includes(r.status),
          },
          w.now,
        ),
        date(r.resolved_at),
        r.resolved_at ? (r.resolved_at.getTime() - r.created_at.getTime()) / 3_600_000 : null,
        r.supporter_count,
      ]),
    };
  }

  private async workOrdersCsv(w: Window) {
    const rows = await this.prisma.$queryRaw<
      {
        public_number: string;
        created_at: Date;
        status: WorkOrderStatus;
        priority: Priority;
        request_number: string | null;
        department: string | null;
        team: string | null;
        assignee: string | null;
        started_at: Date | null;
        completed_at: Date | null;
        verified_at: Date | null;
        cancelled_at: Date | null;
      }[]
    >`
      SELECT w.public_number, w.created_at, w.status, w.priority, r.public_number AS request_number,
             d.name AS department, t.name AS team,
             CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS assignee,
             w.started_at, w.completed_at, w.verified_at, w.cancelled_at
      FROM work_orders w
      LEFT JOIN requests r ON r.id = w.request_id
      LEFT JOIN departments d ON d.id = w.department_id
      LEFT JOIN field_teams t ON t.id = w.field_team_id
      LEFT JOIN users u ON u.id = w.assigned_user_id
      WHERE ${this.workOrderWhere(w)}
      ORDER BY w.created_at DESC
      LIMIT ${CSV_ROW_LIMIT}`;
    const date = this.formatter(w);
    return {
      headers: [
        'İş Emri No',
        'Oluşturulma',
        'Durum',
        'Öncelik',
        'Kaynak Talep',
        'Müdürlük',
        'Ekip',
        'Atanan Personel',
        'Başlama',
        'Tamamlanma',
        'Doğrulama',
        'İptal',
        'Saha Süresi (saat)',
      ],
      rows: rows.map((r) => [
        r.public_number,
        date(r.created_at),
        WORK_ORDER_STATUS_LABELS[r.status],
        PRIORITY_LABELS[r.priority],
        r.request_number,
        r.department,
        r.team,
        r.assignee,
        date(r.started_at),
        date(r.completed_at),
        date(r.verified_at),
        date(r.cancelled_at),
        r.started_at && r.completed_at
          ? (r.completed_at.getTime() - r.started_at.getTime()) / 3_600_000
          : null,
      ]),
    };
  }

  private async slaCsv(w: Window) {
    const rows = await this.prisma.$queryRaw<
      {
        category: string | null;
        parent_category: string | null;
        with_sla: number;
        within: number;
        late: number;
        open_breached: number;
        open_at_risk: number;
        open_on_time: number;
      }[]
    >`
      SELECT c.name AS category, pc.name AS parent_category,
        count(*) FILTER (WHERE r.sla_due_at IS NOT NULL)::int AS with_sla,
        count(*) FILTER (WHERE r.resolved_at <= r.sla_due_at)::int AS within,
        count(*) FILTER (WHERE r.resolved_at > r.sla_due_at)::int AS late,
        count(*) FILTER (WHERE r.resolved_at IS NULL AND r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[])
                           AND r.sla_due_at < ${w.now})::int AS open_breached,
        count(*) FILTER (WHERE r.resolved_at IS NULL AND r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[])
                           AND r.sla_due_at >= ${w.now} AND r.sla_at_risk_at <= ${w.now})::int AS open_at_risk,
        count(*) FILTER (WHERE r.resolved_at IS NULL AND r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[])
                           AND r.sla_at_risk_at > ${w.now})::int AS open_on_time
      FROM requests r
      LEFT JOIN request_categories c ON c.id = r.category_id
      LEFT JOIN request_categories pc ON pc.id = c.parent_id
      WHERE ${this.requestWhere(w)}
      GROUP BY c.name, pc.name
      ORDER BY pc.name NULLS FIRST, c.name`;
    return {
      headers: [
        'Ana Kategori',
        'Kategori',
        'SLA Takipli Talep',
        'Süresinde Çözülen',
        'Geç Çözülen',
        'Açık – Süresi Aşılmış',
        'Açık – Riskte',
        'Açık – Süresi İçinde',
        'SLA Uyumu (%)',
      ],
      rows: rows.map((r) => [
        r.parent_category,
        r.category,
        r.with_sla,
        r.within,
        r.late,
        r.open_breached,
        r.open_at_risk,
        r.open_on_time,
        percent(r.within, r.within + r.late),
      ]),
    };
  }

  private async departmentsCsv(w: Window) {
    const [rows, workOrders] = await Promise.all([
      this.departmentRows(w),
      this.prisma.$queryRaw<{ id: string; total: number; open: number }[]>`
        SELECT w.department_id AS id, count(*)::int AS total,
               count(*) FILTER (WHERE w.status::text = ANY(${[...WORK_ORDER_OPEN_STATUSES]}::text[]))::int AS open
        FROM work_orders w LEFT JOIN requests r ON r.id = w.request_id
        WHERE ${this.workOrderWhere(w)}
        GROUP BY w.department_id`,
    ]);
    const byDepartment = new Map(workOrders.map((row) => [row.id, row]));
    return {
      headers: [
        'Müdürlük',
        'Toplam Talep',
        'Açık',
        'Çözülen',
        'Açık Kritik',
        'SLA Uyumu (%)',
        'Ort. Çözüm (saat)',
        'İş Emri',
        'Açık İş Emri',
      ],
      rows: rows.map((row) => {
        const p = toPerformance(row, 'Müdürlük atanmamış');
        const wo = row.id ? byDepartment.get(row.id) : undefined;
        return [
          p.name,
          p.total,
          p.open,
          p.resolved,
          p.critical,
          p.slaCompliancePercent,
          hours(p.avgResolutionMinutes),
          wo?.total ?? 0,
          wo?.open ?? 0,
        ];
      }),
    };
  }

  private async neighborhoodsCsv(w: Window) {
    const rows = await this.neighborhoodRows(w);
    return {
      headers: [
        'Mahalle',
        'Toplam Talep',
        'Açık',
        'Çözülen',
        'Açık Kritik',
        'SLA Uyumu (%)',
        'Ort. Çözüm (saat)',
      ],
      rows: rows.map((row) => {
        const p = toPerformance(row, 'Mahalle dışı');
        return [
          p.name,
          p.total,
          p.open,
          p.resolved,
          p.critical,
          p.slaCompliancePercent,
          hours(p.avgResolutionMinutes),
        ];
      }),
    };
  }
}
