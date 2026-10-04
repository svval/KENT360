import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  type Paginated,
  Permission,
  RecordStatus,
  RequestStatus,
  WORK_ORDER_REQUIRED_AFTER_PHOTOS,
  type WorkOrderDetail,
  WorkOrderMediaType,
  WorkOrderStatus,
  type WorkOrderSummary,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser, tenantContextOf } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, parseSort, toSkipTake } from '../../common/pagination/pagination';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { parsePublicNumber } from '../../common/utils/public-number';
import { type RequestMeta } from '../../common/utils/request-meta';
import { type Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FieldTeamsService, fieldStaffWhere } from '../field-teams/field-teams.service';
import { NumberingService } from '../numbering/numbering.service';
import { type WorkOrderSyncEvent } from '../requests/domain/work-order-sync';
import { RequestWorkOrderSync } from '../requests/request-work-order-sync.service';
import { RequestsService } from '../requests/requests.service';
import { StorageService } from '../storage/storage.service';
import { evaluateProximity, onSiteRadiusFrom } from './domain/field-proximity';
import {
  assignableTeams,
  isWorkOrderExecutor,
  type TeamMembership,
  workOrderReadScope,
} from './domain/work-order-scope';
import {
  ASSIGNABLE_STATUSES,
  availableWorkOrderTransitions,
  checkWorkOrderTransition,
  STEP_TIMESTAMP,
  workOrderStatusDescription,
  type WorkOrderTransitionRule,
} from './domain/work-order-status.machine';
import {
  type AssignWorkOrderDto,
  type CreateWorkOrderDto,
  type ListWorkOrdersQueryDto,
  type TransitionWorkOrderDto,
} from './dto/work-orders.dto';
import {
  fullName,
  toWorkOrderSummary,
  toWorkOrderTimeline,
  workOrderDetailSelect,
  workOrderSummarySelect,
} from './work-order-mapper';

const SORTABLE = ['createdAt', 'slaDueAt', 'priority', 'publicNumber', 'status'] as const;

/** Which evidence photo types can be added in which status. */
export const MEDIA_UPLOAD_STATUSES: Readonly<
  Record<WorkOrderMediaType, readonly WorkOrderStatus[]>
> = {
  BEFORE: [WorkOrderStatus.ON_SITE, WorkOrderStatus.IN_PROGRESS],
  DURING: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.WAITING],
  AFTER: [WorkOrderStatus.IN_PROGRESS],
};

/** Work order steps that move the source request (see requests/domain/work-order-sync.ts). */
const SYNC_EVENTS: ReadonlySet<string> = new Set([
  'STARTED',
  'RESUMED',
  'COMPLETED',
  'VERIFIED',
  'RETURNED',
  'CANCELLED',
]);

const AUDIT_FOR_EVENT: Partial<Record<WorkOrderTransitionRule['event'], AuditAction>> = {
  COMPLETED: AuditAction.WORK_ORDER_COMPLETED,
  VERIFIED: AuditAction.WORK_ORDER_VERIFIED,
  CANCELLED: AuditAction.WORK_ORDER_CANCELLED,
};

export const workOrderNotFound = () =>
  AppException.notFound(ErrorCode.WORK_ORDER_NOT_FOUND, 'İş emri bulunamadı.');

const forbidden = (message = 'Bu işlem için yetkiniz bulunmuyor.') =>
  new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);

const stale = () =>
  AppException.conflict(
    ErrorCode.WORK_ORDER_STALE,
    'İş emri bu sırada başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyin.',
  );

/** Everything that depends on who the actor is, loaded once per request. */
export interface ActorContext {
  actor: AuthUser;
  memberships: TeamMembership[];
}

/**
 * Work orders (iş emirleri): created from a request by its department, assigned to a
 * field team and/or person, executed step by step in the field (with a proximity check
 * and evidence photos), completed and verified. Every change writes the internal work
 * order timeline and the audit trail – and, through RequestWorkOrderSync, the request
 * status and its citizen-facing timeline – in ONE transaction.
 */
@Injectable()
export class WorkOrdersService {
  private readonly locationBypass: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly requests: RequestsService,
    private readonly sync: RequestWorkOrderSync,
    private readonly teams: FieldTeamsService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.locationBypass = config.get('FIELD_LOCATION_BYPASS', { infer: true });
  }

  async context(actor: AuthUser): Promise<ActorContext> {
    return { actor, memberships: await this.teams.membershipsOf(actor.id) };
  }

  // ─── Create ─────────────────────────────────────────────────────────────

  async create(
    actor: AuthUser,
    dto: CreateWorkOrderDto,
    meta: RequestMeta,
  ): Promise<WorkOrderDetail> {
    const request = await this.requests.findVisible(actor, dto.requestId, {
      id: true,
      publicNumber: true,
      title: true,
      priority: true,
      departmentId: true,
      latitude: true,
      longitude: true,
      address: true,
      slaDueAt: true,
      department: { select: { status: true } },
    });
    // A manager creates work orders for their own department only (they may also see
    // requests they reported for other departments).
    const tenant = tenantContextOf(actor);
    if (tenant.departmentScoped && request.departmentId !== tenant.departmentId) {
      throw forbidden('Yalnızca kendi müdürlüğünüzün talepleri için iş emri oluşturabilirsiniz.');
    }
    if (!request.departmentId || request.department?.status !== RecordStatus.ACTIVE) {
      throw AppException.conflict(
        ErrorCode.DEPARTMENT_INACTIVE,
        'Talebin müdürlüğü pasif. Önce aktif bir müdürlüğe yönlendirin.',
      );
    }
    const departmentId = request.departmentId;
    const municipality = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: actor.municipalityId },
      select: { timezone: true },
    });

    const now = new Date();
    try {
      const id = await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
        // Lock the request row: concurrent creations for the same request queue up here
        // and the second one sees the new status (deterministic 409).
        const [locked] = await tx.$queryRaw<{ status: RequestStatus }[]>`
          SELECT status FROM requests
          WHERE id = ${request.id}::uuid AND municipality_id = ${actor.municipalityId}::uuid
          FOR UPDATE`;
        if (!locked) throw this.requestsNotFound();
        this.assertRequestReady(locked.status);

        const publicNumber = await this.numbering.next(
          tx,
          actor.municipalityId,
          'WORK_ORDER',
          now,
          municipality.timezone,
        );
        const workOrder = await tx.workOrder.create({
          data: {
            municipalityId: actor.municipalityId,
            publicNumber,
            requestId: request.id,
            departmentId,
            createdById: actor.id,
            title: request.title,
            description: dto.instructions || null,
            priority: request.priority,
            status: WorkOrderStatus.CREATED,
            // Location snapshot: a later change of the request never moves the work order.
            latitude: request.latitude,
            longitude: request.longitude,
            address: request.address,
            slaDueAt: request.slaDueAt,
            createdAt: now,
          },
          select: { id: true },
        });
        await tx.workOrderHistory.create({
          data: {
            workOrderId: workOrder.id,
            eventType: 'CREATED',
            newStatus: WorkOrderStatus.CREATED,
            description: `İş emri oluşturuldu (${publicNumber}) – kaynak talep ${request.publicNumber}.`,
            performedById: actor.id,
            createdAt: now,
          },
        });
        await this.audit.record(
          {
            action: AuditAction.WORK_ORDER_CREATED,
            entityType: 'WorkOrder',
            entityId: workOrder.id,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: {
              publicNumber,
              requestId: request.id,
              departmentId,
              priority: request.priority,
            },
            meta,
          },
          tx,
        );
        await this.sync.apply(tx, {
          actor,
          requestId: request.id,
          event: 'CREATED',
          workOrder: { id: workOrder.id, publicNumber },
          at: now,
          meta,
        });
        return workOrder.id;
      });
      return this.get(await this.context(actor), id);
    } catch (error) {
      // Backstop: the partial unique index "one active work order per request".
      if (isUniqueViolation(error)) throw this.alreadyExists();
      throw error;
    }
  }

  // ─── Read ───────────────────────────────────────────────────────────────

  async list(
    ctx: ActorContext,
    query: ListWorkOrdersQueryDto,
  ): Promise<Paginated<WorkOrderSummary>> {
    const scope = workOrderReadScope(
      ctx.actor,
      ctx.memberships.map((m) => m.teamId),
    );
    if (!scope) return paginated([], 0, query);
    const where: Prisma.WorkOrderWhereInput = {
      AND: [
        scope,
        query.status?.length ? { status: { in: query.status } } : {},
        query.priority?.length ? { priority: { in: query.priority } } : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.fieldTeamId ? { fieldTeamId: query.fieldTeamId } : {},
        query.assignedUserId ? { assignedUserId: query.assignedUserId } : {},
        query.neighborhoodId ? { request: { neighborhoodId: query.neighborhoodId } } : {},
        query.createdFrom || query.createdTo
          ? {
              createdAt: {
                ...(query.createdFrom && { gte: new Date(query.createdFrom) }),
                ...(query.createdTo && { lte: new Date(query.createdTo) }),
              },
            }
          : {},
        query.search ? this.searchWhere(query.search) : {},
      ],
    };
    const db = this.prisma.forTenant(ctx.actor.municipalityId);
    const now = new Date();
    const [items, total] = await Promise.all([
      db.workOrder.findMany({
        where,
        select: workOrderSummarySelect,
        orderBy: [...parseSort(query.sort, SORTABLE, [{ createdAt: 'desc' }]), { id: 'desc' }],
        ...toSkipTake(query),
      }),
      db.workOrder.count({ where }),
    ]);
    return paginated(
      items.map((item) => toWorkOrderSummary(item, now)),
      total,
      query,
    );
  }

  async get(ctx: ActorContext, id: string): Promise<WorkOrderDetail> {
    const record = await this.findVisible(ctx, id, workOrderDetailSelect);
    const { actor } = ctx;
    const now = new Date();
    const sign = async (item: {
      id: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: Date;
    }) => {
      const signed = await this.storage.presignedUrl(item.storageKey);
      return {
        id: item.id,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt.toISOString(),
        url: signed.url,
        urlExpiresAt: signed.expiresAt.toISOString(),
      };
    };
    const [media, requestMedia, radiusMeters] = await Promise.all([
      Promise.all(record.media.map(async (item) => ({ ...(await sign(item)), type: item.type }))),
      Promise.all((record.request?.media ?? []).map(sign)),
      this.radiusMeters(actor.municipalityId),
    ]);
    const isExecutor = isWorkOrderExecutor(actor.id, ctx.memberships, record);
    return {
      ...toWorkOrderSummary(record, now),
      description: record.description,
      source: record.request
        ? {
            id: record.request.id,
            publicNumber: record.request.publicNumber,
            status: record.request.status,
            description: record.request.description,
            media: requestMedia,
          }
        : null,
      location: { latitude: record.latitude, longitude: record.longitude },
      completionDescription: record.completionDescription,
      cancellationReason: record.cancellationReason,
      dates: {
        createdAt: record.createdAt.toISOString(),
        acceptedAt: record.acceptedAt?.toISOString() ?? null,
        enRouteAt: record.enRouteAt?.toISOString() ?? null,
        arrivedAt: record.arrivedAt?.toISOString() ?? null,
        startedAt: record.startedAt?.toISOString() ?? null,
        completedAt: record.completedAt?.toISOString() ?? null,
        verifiedAt: record.verifiedAt?.toISOString() ?? null,
        cancelledAt: record.cancelledAt?.toISOString() ?? null,
      },
      media,
      assignments: record.assignments.map((a) => ({
        id: a.id,
        fieldTeam: a.fieldTeam,
        assignee: a.assignee ? { id: a.assignee.id, fullName: fullName(a.assignee) } : null,
        assignedBy: a.assignedBy ? fullName(a.assignedBy) : null,
        note: a.note,
        assignedAt: a.assignedAt.toISOString(),
        unassignedAt: a.unassignedAt?.toISOString() ?? null,
      })),
      timeline: toWorkOrderTimeline(record.history),
      actions: {
        transitions: availableWorkOrderTransitions(record.status, {
          permissions: actor.permissions,
          isExecutor,
        }).map((rule) => ({
          to: rule.to,
          label: rule.label,
          requiresReason: rule.requiresReason ?? false,
          requiresLocation: rule.requiresLocation ?? false,
          requiresCompletion: rule.requiresCompletion ?? false,
        })),
        canAssign: this.canAssign(ctx, record),
        canUploadMedia:
          isExecutor && actor.permissions.has(Permission.WORK_ORDERS_EXECUTE)
            ? Object.values(WorkOrderMediaType).filter((type) =>
                MEDIA_UPLOAD_STATUSES[type].includes(record.status),
              )
            : [],
      },
      proximity: { radiusMeters, bypass: this.locationBypass },
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Loads a work order the actor may see. Another municipality's work order, or one
   * outside the actor's object scope, is indistinguishable from a missing one (404).
   */
  async findVisible<S extends Prisma.WorkOrderSelect>(
    ctx: ActorContext,
    id: string,
    select: S,
  ): Promise<Prisma.WorkOrderGetPayload<{ select: S }>> {
    const scope = workOrderReadScope(
      ctx.actor,
      ctx.memberships.map((m) => m.teamId),
    );
    if (!scope) throw workOrderNotFound();
    const record = await this.prisma
      .forTenant(ctx.actor.municipalityId)
      .workOrder.findFirst({ where: { AND: [{ id }, scope] }, select });
    if (!record) throw workOrderNotFound();
    return record as Prisma.WorkOrderGetPayload<{ select: S }>;
  }

  isExecutor(
    ctx: ActorContext,
    record: { assignedUserId: string | null; fieldTeamId: string | null },
  ): boolean {
    return isWorkOrderExecutor(ctx.actor.id, ctx.memberships, record);
  }

  // ─── Assignment ─────────────────────────────────────────────────────────

  async assign(
    ctx: ActorContext,
    id: string,
    dto: AssignWorkOrderDto,
    meta: RequestMeta,
  ): Promise<WorkOrderDetail> {
    const { actor } = ctx;
    if (!dto.fieldTeamId && !dto.assignedUserId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Bir ekip veya personel seçmelisiniz.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const current = await this.findVisible(ctx, id, {
      status: true,
      publicNumber: true,
      departmentId: true,
      fieldTeamId: true,
      assignedUserId: true,
    });
    const rights = assignableTeams(actor, ctx.memberships);
    if (!rights) throw forbidden();
    const nextStatus = ASSIGNABLE_STATUSES.get(current.status);
    if (!nextStatus) {
      throw AppException.conflict(
        ErrorCode.WORK_ORDER_NOT_ASSIGNABLE,
        'Bu aşamadaki iş emri yeniden atanamaz. Sahadaki işi önce beklemeye alın.',
        { status: current.status },
      );
    }
    const teamId = dto.fieldTeamId ?? null;
    // Team leaders (no department-wide rights) only move work between the teams they lead.
    if (rights !== 'department') {
      const ownsCurrent = current.fieldTeamId !== null && rights.has(current.fieldTeamId);
      const ownsTarget = teamId !== null && rights.has(teamId);
      if (!ownsCurrent || !ownsTarget) {
        throw forbidden('Yalnızca sorumlusu olduğunuz ekiplerin işlerini atayabilirsiniz.');
      }
    }

    const db = this.prisma.forTenant(actor.municipalityId);
    let team: { id: string; name: string; leaderId: string | null } | null = null;
    if (teamId) {
      const found = await db.fieldTeam.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, status: true, departmentId: true, leaderId: true },
      });
      if (!found)
        throw AppException.notFound(ErrorCode.FIELD_TEAM_NOT_FOUND, 'Saha ekibi bulunamadı.');
      if (found.status !== RecordStatus.ACTIVE) {
        throw AppException.conflict(ErrorCode.FIELD_TEAM_INACTIVE, 'Pasif bir ekibe iş atanamaz.');
      }
      if (found.departmentId !== current.departmentId) {
        throw AppException.conflict(
          ErrorCode.ASSIGNEE_INVALID,
          'Seçilen ekip bu iş emrinin müdürlüğüne ait değil.',
        );
      }
      team = found;
    }
    let assignee: { id: string; firstName: string; lastName: string } | null = null;
    if (dto.assignedUserId) {
      // Same municipality (tenant-scoped), active, allowed to do field work, and either a
      // member of the chosen team or – without a team – staff of the same department.
      assignee = await db.user.findFirst({
        where: {
          id: dto.assignedUserId,
          ...fieldStaffWhere,
          ...(teamId
            ? { teamMemberships: { some: { teamId, leftAt: null } } }
            : { departmentId: current.departmentId }),
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!assignee) {
        throw AppException.conflict(
          ErrorCode.ASSIGNEE_INVALID,
          teamId
            ? 'Personel seçilen ekibin aktif bir üyesi değil.'
            : 'Personel bu müdürlükte aktif bir saha personeli değil.',
        );
      }
    }
    const assignedUserId = assignee?.id ?? null;
    if (
      current.fieldTeamId === teamId &&
      current.assignedUserId === assignedUserId &&
      current.status === nextStatus
    ) {
      return this.get(ctx, id); // nothing changes
    }

    const now = new Date();
    const target = [team?.name, assignee && fullName(assignee)].filter(Boolean).join(' / ');
    await db.$transaction(async (tx) => {
      // Optimistic: matches only if nobody (re)assigned or moved the job meanwhile.
      const { count } = await tx.workOrder.updateMany({
        where: {
          id,
          status: current.status,
          fieldTeamId: current.fieldTeamId,
          assignedUserId: current.assignedUserId,
        },
        data: { status: nextStatus, fieldTeamId: teamId, assignedUserId },
      });
      if (count !== 1) throw stale();
      const { count: closed } = await tx.workOrderAssignment.updateMany({
        where: { workOrderId: id, unassignedAt: null },
        data: { unassignedAt: now },
      });
      await tx.workOrderAssignment.create({
        data: {
          workOrderId: id,
          fieldTeamId: teamId,
          assigneeId: assignedUserId,
          assignedById: actor.id,
          note: dto.note || null,
          assignedAt: now,
        },
      });
      const reassigned = closed > 0;
      const statusNote =
        current.status !== nextStatus && current.status !== WorkOrderStatus.CREATED
          ? ' Yeni atanan personelin işi yeniden kabul etmesi gerekiyor.'
          : '';
      await tx.workOrderHistory.create({
        data: {
          workOrderId: id,
          eventType: reassigned ? 'REASSIGNED' : 'ASSIGNED',
          oldStatus: current.status !== nextStatus ? current.status : null,
          newStatus: current.status !== nextStatus ? nextStatus : null,
          description: `${reassigned ? 'Yeniden atandı' : 'Atandı'}: ${target}.${statusNote}${
            dto.note ? ` Not: ${dto.note}` : ''
          }`.slice(0, 500),
          metadata: { fieldTeamId: teamId, assignedUserId },
          performedById: actor.id,
          createdAt: now,
        },
      });
      await this.audit.record(
        {
          action: reassigned ? AuditAction.WORK_ORDER_REASSIGNED : AuditAction.WORK_ORDER_ASSIGNED,
          entityType: 'WorkOrder',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: {
            status: current.status,
            fieldTeamId: current.fieldTeamId,
            assignedUserId: current.assignedUserId,
          },
          after: { status: nextStatus, fieldTeamId: teamId, assignedUserId },
          meta,
        },
        tx,
      );
      // In-app notification (Phase 13 adds the inbox UI and other channels).
      const recipient = assignedUserId ?? team?.leaderId ?? null;
      if (recipient && recipient !== actor.id) {
        await tx.notification.create({
          data: {
            municipalityId: actor.municipalityId,
            userId: recipient,
            type: 'WORK_ORDER_ASSIGNED',
            title: `Yeni iş emri: ${current.publicNumber}`,
            body: `${target} için bir iş emri atandı.`.slice(0, 1000),
            entityType: 'WorkOrder',
            entityId: id,
            createdAt: now,
          },
        });
      }
    });
    return this.get(ctx, id);
  }

  canAssign(
    ctx: ActorContext,
    record: { status: WorkOrderStatus; fieldTeamId: string | null },
  ): boolean {
    if (!ASSIGNABLE_STATUSES.has(record.status)) return false;
    const rights = assignableTeams(ctx.actor, ctx.memberships);
    if (!rights) return false;
    return (
      rights === 'department' || (record.fieldTeamId !== null && rights.has(record.fieldTeamId))
    );
  }

  // ─── Workflow ───────────────────────────────────────────────────────────

  async transition(
    ctx: ActorContext,
    id: string,
    dto: TransitionWorkOrderDto,
    meta: RequestMeta,
  ): Promise<WorkOrderDetail> {
    const { actor } = ctx;
    const current = await this.findVisible(ctx, id, {
      status: true,
      publicNumber: true,
      requestId: true,
      fieldTeamId: true,
      assignedUserId: true,
      startedAt: true,
    });
    if (dto.from && dto.from !== current.status) throw stale();
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Konum için enlem ve boylam birlikte gönderilmeli.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const check = checkWorkOrderTransition(
      current.status,
      dto.to,
      { permissions: actor.permissions, isExecutor: this.isExecutor(ctx, current) },
      dto,
    );
    if (!check.ok) {
      switch (check.reason) {
        case 'FORBIDDEN':
          throw forbidden();
        case 'NOT_EXECUTOR':
          throw new AppException(
            ErrorCode.NOT_WORK_ORDER_EXECUTOR,
            'Bu adımı yalnızca işe atanan personel veya ekip yapabilir.',
            HttpStatus.FORBIDDEN,
          );
        case 'REASON_REQUIRED':
          throw new AppException(
            ErrorCode.TRANSITION_REASON_REQUIRED,
            'Bu işlem için bir gerekçe yazmalısınız.',
            HttpStatus.BAD_REQUEST,
          );
        case 'COMPLETION_DESCRIPTION_REQUIRED':
          throw new AppException(
            ErrorCode.COMPLETION_DESCRIPTION_REQUIRED,
            'İşi tamamlamak için yapılan çalışmayı açıklayın.',
            HttpStatus.BAD_REQUEST,
          );
        default:
          throw AppException.conflict(
            ErrorCode.INVALID_STATUS_TRANSITION,
            check.reason === 'ASSIGNMENT_ONLY'
              ? 'Bu geçiş atama işlemiyle yapılır.'
              : 'İş emri bu durumdan istenen duruma geçirilemez.',
            { from: current.status, to: dto.to, allowed: check.allowed },
          );
      }
    }
    const rule = check.rule;

    // Field proximity (ARCHITECTURE §6.4) – measured by PostGIS against the snapshot.
    let proximity: { distanceMeters: number | null; bypassed: boolean } | null = null;
    if (rule.requiresLocation) {
      const distance =
        dto.latitude !== undefined && dto.longitude !== undefined
          ? await this.distanceMeters(actor.municipalityId, id, dto.latitude, dto.longitude)
          : null;
      const radius = await this.radiusMeters(actor.municipalityId);
      const outcome = evaluateProximity(distance, radius, this.locationBypass);
      if (!outcome.ok) {
        if (outcome.reason === 'LOCATION_REQUIRED') {
          throw new AppException(
            ErrorCode.FIELD_LOCATION_REQUIRED,
            'Bu adım için cihaz konumunuz gerekiyor. Konum iznini açıp tekrar deneyin.',
            HttpStatus.BAD_REQUEST,
          );
        }
        await this.recordLocationRejected(ctx, id, dto, outcome, meta);
        throw AppException.conflict(
          ErrorCode.FIELD_LOCATION_TOO_FAR,
          `İş emri konumuna henüz yeterince yakın değilsiniz (${outcome.distanceMeters} m; en fazla ${outcome.radiusMeters} m).`,
          { distanceMeters: outcome.distanceMeters, radiusMeters: outcome.radiusMeters },
        );
      }
      proximity = { distanceMeters: outcome.distanceMeters, bypassed: outcome.bypassed };
    }

    const now = new Date();
    const stamp = STEP_TIMESTAMP[rule.event];
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      // Optimistic concurrency: only moves on if the status is still the one we checked.
      const { count } = await tx.workOrder.updateMany({
        where: { id, status: current.status },
        data: {
          status: rule.to,
          ...(stamp && (stamp !== 'startedAt' || !current.startedAt) && { [stamp]: now }),
          ...(rule.event === 'COMPLETED' && { completionDescription: dto.completionDescription }),
          ...(rule.event === 'CANCELLED' && { cancellationReason: dto.reason }),
          ...(rule.event === 'RETURNED' && { completedAt: null }),
        },
      });
      if (count !== 1) throw stale();
      if (rule.requiresCompletion) {
        // Counted after the row lock: a photo upload cannot slip in between.
        const afterPhotos = await tx.workOrderMedia.count({
          where: { workOrderId: id, type: WorkOrderMediaType.AFTER },
        });
        if (afterPhotos < WORK_ORDER_REQUIRED_AFTER_PHOTOS) {
          throw AppException.conflict(
            ErrorCode.AFTER_PHOTO_REQUIRED,
            'İşi tamamlamak için en az bir "sonra" fotoğrafı yükleyin.',
            { afterPhotos, required: WORK_ORDER_REQUIRED_AFTER_PHOTOS },
          );
        }
      }
      const base = workOrderStatusDescription(current.status, rule.to);
      const details = [
        dto.reason && `Gerekçe: ${dto.reason}`,
        proximity && !proximity.bypassed && `Konum doğrulandı (${proximity.distanceMeters} m).`,
        proximity?.bypassed &&
          `Konum kontrolü geliştirme modunda atlandı${
            proximity.distanceMeters === null ? '' : ` (${proximity.distanceMeters} m)`
          }.`,
      ].filter(Boolean);
      await tx.workOrderHistory.create({
        data: {
          workOrderId: id,
          eventType: rule.event,
          oldStatus: current.status,
          newStatus: rule.to,
          description: [base, ...details].join(' – ').slice(0, 500),
          metadata: proximity ? { ...proximity } : undefined,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          performedById: actor.id,
          createdAt: now,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_FOR_EVENT[rule.event] ?? AuditAction.WORK_ORDER_STATUS_CHANGED,
          entityType: 'WorkOrder',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: { status: current.status },
          after: {
            status: rule.to,
            ...(dto.reason && { reason: dto.reason }),
            ...(proximity && { proximity }),
          },
          meta,
        },
        tx,
      );
      if (current.requestId && SYNC_EVENTS.has(rule.event)) {
        await this.sync.apply(tx, {
          actor,
          requestId: current.requestId,
          event: rule.event as WorkOrderSyncEvent,
          workOrder: { id, publicNumber: current.publicNumber },
          at: now,
          meta,
        });
      }
    });
    return this.get(ctx, id);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async radiusMeters(municipalityId: string): Promise<number> {
    const municipality = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: municipalityId },
      select: { settings: true },
    });
    return onSiteRadiusFrom(municipality.settings);
  }

  /** Great-circle distance (m) between the work order point and the device position. */
  private async distanceMeters(
    municipalityId: string,
    id: string,
    latitude: number,
    longitude: number,
  ): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ distance: number | null }[]>`
      SELECT ST_DistanceSphere(
               w.location,
               ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326)
             ) AS distance
      FROM work_orders w
      WHERE w.id = ${id}::uuid AND w.municipality_id = ${municipalityId}::uuid`;
    if (!row || row.distance === null) throw workOrderNotFound();
    return Number(row.distance);
  }

  /** A refused attempt stays visible in the timeline and the audit trail. */
  private async recordLocationRejected(
    ctx: ActorContext,
    id: string,
    dto: TransitionWorkOrderDto,
    outcome: { distanceMeters: number; radiusMeters: number },
    meta: RequestMeta,
  ): Promise<void> {
    const { actor } = ctx;
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      await tx.workOrderHistory.create({
        data: {
          workOrderId: id,
          eventType: 'LOCATION_CHECK_FAILED',
          description: `Konum doğrulanamadı: iş emri konumuna ${outcome.distanceMeters} m (en fazla ${outcome.radiusMeters} m).`,
          metadata: { ...outcome, attemptedStatus: dto.to },
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          performedById: actor.id,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.WORK_ORDER_LOCATION_REJECTED,
          entityType: 'WorkOrder',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          after: { attemptedStatus: dto.to, ...outcome },
          meta,
        },
        tx,
      );
    });
  }

  private assertRequestReady(status: RequestStatus): void {
    if (status === RequestStatus.ASSIGNED_TO_DEPARTMENT) return;
    if (status === RequestStatus.WORK_ORDER_CREATED || status === RequestStatus.IN_PROGRESS) {
      throw this.alreadyExists();
    }
    throw AppException.conflict(
      ErrorCode.REQUEST_NOT_READY_FOR_WORK_ORDER,
      'İş emri yalnızca müdürlüğe atanmış bir talep için oluşturulabilir.',
      { requestStatus: status },
    );
  }

  private alreadyExists(): AppException {
    return AppException.conflict(
      ErrorCode.WORK_ORDER_ALREADY_EXISTS,
      'Bu talep için zaten aktif bir iş emri var.',
    );
  }

  private requestsNotFound(): AppException {
    return AppException.notFound(ErrorCode.REQUEST_NOT_FOUND, 'Talep bulunamadı.');
  }

  /** Exact work order or request number, otherwise number parts, description, address. */
  private searchWhere(search: string): Prisma.WorkOrderWhereInput {
    const parsed = parsePublicNumber(search);
    const upper = search.trim().toUpperCase();
    if (parsed?.scope === 'WORK_ORDER') return { publicNumber: upper };
    if (parsed?.scope === 'REQUEST') return { request: { publicNumber: upper } };
    return {
      OR: [
        { publicNumber: { contains: upper } },
        { request: { publicNumber: { contains: upper } } },
        { request: { description: { contains: search, mode: 'insensitive' } } },
        { address: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
}
