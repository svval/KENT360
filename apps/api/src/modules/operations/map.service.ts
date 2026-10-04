import { Injectable } from '@nestjs/common';
import {
  evaluateSla,
  MAP_FEATURE_LIMIT,
  type MapFeatureCollection,
  type MapRequestProperties,
  type MapWorkOrderProperties,
  type Priority,
  RequestStatus,
  SlaStatus,
  WORK_ORDER_OPEN_STATUSES,
  type WorkOrderStatus,
} from '@kent360/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { requestReadScope } from '../requests/domain/request-scope';
import { workOrderReadScope } from '../work-orders/domain/work-order-scope';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CLOSED_REQUEST_STATUSES } from './dashboard.service';
import { parseBbox } from './domain/bbox';
import { REQUEST_SCOPE_COLUMNS, scopeToSql, WORK_ORDER_SCOPE_COLUMNS } from './domain/scope-sql';
import { type MapRequestsQueryDto, type MapWorkOrdersQueryDto } from './dto/operations.dto';

interface RequestRow {
  id: string;
  public_number: string;
  status: RequestStatus;
  priority: Priority;
  latitude: number;
  longitude: number;
  created_at: Date;
  sla_due_at: Date | null;
  sla_at_risk_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  category: string | null;
  department: string | null;
  neighborhood: string | null;
}

interface WorkOrderRow {
  id: string;
  public_number: string;
  status: WorkOrderStatus;
  priority: Priority;
  latitude: number;
  longitude: number;
  department: string;
  team: string | null;
  assignee: string | null;
  request_id: string | null;
  request_number: string | null;
}

/** Viewport filter on the GIST-indexed point column (`&&` = bounding boxes intersect). */
function bboxSql(alias: 'r' | 'w', bbox: string | undefined): Prisma.Sql {
  const box = bbox ? parseBbox(bbox) : null;
  if (!box) return Prisma.sql`TRUE`;
  const column = Prisma.raw(`${alias}.location`);
  return Prisma.sql`${column} && ST_MakeEnvelope(${box.west}, ${box.south}, ${box.east}, ${box.north}, 4326)`;
}

const statusSql = (column: string, statuses: string[] | undefined): Prisma.Sql =>
  statuses?.length
    ? Prisma.sql`${Prisma.raw(column)}::text = ANY(${statuses}::text[])`
    : Prisma.sql`TRUE`;

const point = (row: { longitude: number; latitude: number }) => ({
  type: 'Point' as const,
  coordinates: [row.longitude, row.latitude] as [number, number],
});

/**
 * GeoJSON for the operations map (Phase 9). Same object scope as the lists, written as
 * SQL (scopeToSql) because the viewport filter is PostGIS; `municipality_id` is always
 * filtered explicitly. Properties are deliberately small – no descriptions, no people
 * except the assignee name on work orders. At most MAP_FEATURE_LIMIT features
 * (newest first); `truncated` tells the client to zoom in.
 */
@Injectable()
export class MapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async requests(
    actor: AuthUser,
    query: MapRequestsQueryDto,
    now = new Date(),
  ): Promise<MapFeatureCollection<MapRequestProperties>> {
    const scope = requestReadScope(actor);
    if (!scope) return { type: 'FeatureCollection', features: [], truncated: false };
    const rows = await this.prisma.$queryRaw<RequestRow[]>`
      SELECT r.id, r.public_number, r.status, r.priority, r.latitude, r.longitude, r.created_at,
             r.sla_due_at, r.sla_at_risk_at, r.resolved_at, r.closed_at,
             c.name AS category, d.name AS department, n.name AS neighborhood
      FROM requests r
      LEFT JOIN request_categories c ON c.id = r.category_id
      LEFT JOIN departments d ON d.id = r.department_id
      LEFT JOIN neighborhoods n ON n.id = r.neighborhood_id
      WHERE r.municipality_id = ${actor.municipalityId}::uuid
        AND r.location IS NOT NULL
        AND ${bboxSql('r', query.bbox)}
        AND ${scopeToSql(scope, REQUEST_SCOPE_COLUMNS)}
        AND ${statusSql('r.status', query.status)}
        AND ${statusSql('r.priority', query.priority)}
        AND ${query.open ? Prisma.sql`r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[])` : Prisma.sql`TRUE`}
        AND ${query.departmentId ? Prisma.sql`r.department_id = ${query.departmentId}::uuid` : Prisma.sql`TRUE`}
        AND ${query.categoryId ? Prisma.sql`(r.category_id = ${query.categoryId}::uuid OR c.parent_id = ${query.categoryId}::uuid)` : Prisma.sql`TRUE`}
        AND ${query.createdFrom ? Prisma.sql`r.created_at >= ${new Date(query.createdFrom)}` : Prisma.sql`TRUE`}
        AND ${query.createdTo ? Prisma.sql`r.created_at <= ${new Date(query.createdTo)}` : Prisma.sql`TRUE`}
      ORDER BY r.created_at DESC
      LIMIT ${MAP_FEATURE_LIMIT + 1}`;
    const truncated = rows.length > MAP_FEATURE_LIMIT;
    return {
      type: 'FeatureCollection',
      truncated,
      features: rows.slice(0, MAP_FEATURE_LIMIT).map((row) => {
        const done = (CLOSED_REQUEST_STATUSES as string[]).includes(row.status);
        const slaStatus =
          row.status === RequestStatus.REJECTED
            ? null
            : evaluateSla(
                {
                  slaDueAt: row.sla_due_at,
                  slaAtRiskAt: row.sla_at_risk_at,
                  completedAt: row.resolved_at ?? row.closed_at,
                },
                now,
              ).status;
        return {
          type: 'Feature',
          id: row.id,
          geometry: point(row),
          properties: {
            id: row.id,
            publicNumber: row.public_number,
            status: row.status,
            priority: row.priority,
            category: row.category,
            department: row.department,
            neighborhood: row.neighborhood,
            slaStatus,
            critical: !done && (row.priority === 'CRITICAL' || slaStatus === SlaStatus.BREACHED),
            done,
            createdAt: row.created_at.toISOString(),
          },
        };
      }),
    };
  }

  async workOrdersLayer(
    actor: AuthUser,
    query: MapWorkOrdersQueryDto,
  ): Promise<MapFeatureCollection<MapWorkOrderProperties>> {
    const ctx = await this.workOrders.context(actor);
    const scope = workOrderReadScope(
      actor,
      ctx.memberships.map((m) => m.teamId),
    );
    if (!scope) return { type: 'FeatureCollection', features: [], truncated: false };
    const rows = await this.prisma.$queryRaw<WorkOrderRow[]>`
      SELECT w.id, w.public_number, w.status, w.priority, w.latitude, w.longitude,
             d.name AS department, t.name AS team,
             CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS assignee,
             r.id AS request_id, r.public_number AS request_number
      FROM work_orders w
      JOIN departments d ON d.id = w.department_id
      LEFT JOIN field_teams t ON t.id = w.field_team_id
      LEFT JOIN users u ON u.id = w.assigned_user_id
      LEFT JOIN requests r ON r.id = w.request_id
      WHERE w.municipality_id = ${actor.municipalityId}::uuid
        AND w.location IS NOT NULL
        AND ${bboxSql('w', query.bbox)}
        AND ${scopeToSql(scope, WORK_ORDER_SCOPE_COLUMNS)}
        AND ${statusSql('w.status', query.status)}
        AND ${statusSql('w.priority', query.priority)}
        AND ${query.open ? Prisma.sql`w.status::text = ANY(${[...WORK_ORDER_OPEN_STATUSES]}::text[])` : Prisma.sql`TRUE`}
        AND ${query.departmentId ? Prisma.sql`w.department_id = ${query.departmentId}::uuid` : Prisma.sql`TRUE`}
      ORDER BY w.created_at DESC
      LIMIT ${MAP_FEATURE_LIMIT + 1}`;
    return {
      type: 'FeatureCollection',
      truncated: rows.length > MAP_FEATURE_LIMIT,
      features: rows.slice(0, MAP_FEATURE_LIMIT).map((row) => ({
        type: 'Feature',
        id: row.id,
        geometry: point(row),
        properties: {
          id: row.id,
          publicNumber: row.public_number,
          status: row.status,
          priority: row.priority,
          department: row.department,
          team: row.team,
          assignedUser: row.assignee,
          requestId: row.request_id,
          requestNumber: row.request_number,
        },
      })),
    };
  }
}
