import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  type Paginated,
  Permission,
  PRIORITY_LABELS,
  RecordStatus,
  type RequestDetail,
  RequestSource,
  RequestStatus,
  type RequestSummary,
  SlaStatus,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, parseSort, toSkipTake } from '../../common/pagination/pagination';
import { parsePublicNumber } from '../../common/utils/public-number';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { effectiveSlaMinutes } from '../request-categories/domain/category-rules';
import { NeighborhoodLocator } from '../neighborhoods/neighborhood-locator';
import { NumberingService } from '../numbering/numbering.service';
import { StorageService } from '../storage/storage.service';
import {
  checkManualTransition,
  manualTransitions,
  SLA_STOPPED_STATUSES,
  statusChangeDescription,
  TERMINAL_STATUSES,
} from './domain/request-status.machine';
import { isMunicipalStaff, requestReadScope, requestTitle } from './domain/request-scope';
import { atRiskRatioFrom, slaSnapshot } from './domain/sla-policy';
import {
  type ChangeDepartmentDto,
  type ChangePriorityDto,
  type CreateRequestDto,
  type ListRequestsQueryDto,
  type TransitionRequestDto,
} from './dto/requests.dto';
import {
  locationNotice,
  requestDetailSelect,
  requestSummarySelect,
  toRequestSummary,
  toTimeline,
} from './request-mapper';

const SORTABLE = ['createdAt', 'slaDueAt', 'priority', 'publicNumber', 'status'] as const;

export const requestNotFound = () =>
  AppException.notFound(ErrorCode.REQUEST_NOT_FOUND, 'Talep bulunamadı.');

/** Root, transaction or tenant-scoped transaction client – anything that can write history. */
type HistoryWriter = {
  requestHistory: {
    create(args: { data: Prisma.RequestHistoryUncheckedCreateInput }): PromiseLike<unknown>;
  };
};

/**
 * Requests (talepler): creation with server-side routing, SLA snapshot and atomic
 * numbering; scoped listing and detail; intent-based changes (transition, priority,
 * department). Every change writes the citizen-facing timeline (request_history) and
 * the security audit trail (audit_logs) in the same transaction.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly locator: NeighborhoodLocator,
    private readonly storage: StorageService,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────

  async create(actor: AuthUser, dto: CreateRequestDto, meta: RequestMeta): Promise<RequestDetail> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const category = await db.requestCategory.findUnique({
      where: { id: dto.categoryId },
      select: {
        id: true,
        name: true,
        status: true,
        defaultPriority: true,
        defaultSlaMinutes: true,
        parent: { select: { status: true, defaultSlaMinutes: true } },
        department: { select: { id: true, name: true, status: true } },
        _count: { select: { children: true } },
      },
    });
    if (!category)
      throw AppException.notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Kategori bulunamadı.');
    if (
      category.status !== RecordStatus.ACTIVE ||
      category.parent?.status === RecordStatus.INACTIVE
    ) {
      throw AppException.conflict(ErrorCode.CATEGORY_INACTIVE, 'Bu kategori artık kullanılmıyor.');
    }
    if (category._count.children > 0) {
      throw new AppException(
        ErrorCode.CATEGORY_NOT_SELECTABLE,
        'Lütfen bir alt kategori seçin.',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Routing snapshot: the department is copied onto the request and never follows
    // later category changes.
    const department = category.department;
    if (!department) {
      throw AppException.conflict(
        ErrorCode.CATEGORY_NOT_ROUTABLE,
        'Bu kategori için sorumlu müdürlük tanımlı değil.',
      );
    }
    if (department.status !== RecordStatus.ACTIVE) {
      throw AppException.conflict(
        ErrorCode.DEPARTMENT_INACTIVE,
        'Bu kategorinin bağlı olduğu müdürlük şu an talep kabul etmiyor.',
      );
    }

    const municipality = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: actor.municipalityId },
      select: { timezone: true, settings: true },
    });
    const neighborhood = await this.locator.locate(
      actor.municipalityId,
      dto.latitude,
      dto.longitude,
    );
    const now = new Date();
    const sla = slaSnapshot(
      now,
      effectiveSlaMinutes(category.defaultSlaMinutes, category.parent?.defaultSlaMinutes ?? null),
      atRiskRatioFrom(municipality.settings),
    );
    // Source is never taken from the client (MOBILE arrives with the Saha360/citizen app).
    const source = isMunicipalStaff(actor) ? RequestSource.MUNICIPAL_STAFF : RequestSource.WEB;

    const id = await db.$transaction(async (tx) => {
      const publicNumber = await this.numbering.next(
        tx,
        actor.municipalityId,
        'REQUEST',
        now,
        municipality.timezone,
      );
      const request = await tx.request.create({
        data: {
          municipalityId: actor.municipalityId,
          publicNumber,
          createdById: actor.id,
          categoryId: category.id,
          departmentId: department.id,
          neighborhoodId: neighborhood?.id ?? null,
          title: requestTitle(category.name, neighborhood?.name ?? null),
          description: dto.description,
          status: RequestStatus.NEW,
          priority: category.defaultPriority,
          source,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address ?? null,
          slaDueAt: sla?.slaDueAt ?? null,
          slaAtRiskAt: sla?.slaAtRiskAt ?? null,
          createdAt: now,
        },
        select: { id: true },
      });
      await tx.requestHistory.createMany({
        data: [
          {
            requestId: request.id,
            eventType: 'CREATED',
            newStatus: RequestStatus.NEW,
            description: `Talep oluşturuldu (${publicNumber}).`,
            performedById: actor.id,
            createdAt: now,
          },
          {
            requestId: request.id,
            eventType: 'DEPARTMENT_ASSIGNED',
            description: `${department.name} birimine yönlendirildi.`,
            metadata: { departmentId: department.id, automatic: true },
            createdAt: now,
          },
        ],
      });
      await this.audit.record(
        {
          action: AuditAction.REQUEST_CREATED,
          entityType: 'Request',
          entityId: request.id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          after: {
            publicNumber,
            categoryId: category.id,
            departmentId: department.id,
            neighborhoodId: neighborhood?.id ?? null,
            priority: category.defaultPriority,
            source,
            slaDueAt: sla?.slaDueAt ?? null,
          },
          meta,
        },
        tx,
      );
      return request.id;
    });
    return this.get(actor, id);
  }

  // ─── Read ───────────────────────────────────────────────────────────────

  async list(actor: AuthUser, query: ListRequestsQueryDto): Promise<Paginated<RequestSummary>> {
    const scope = requestReadScope(actor);
    if (!scope) return paginated([], 0, query);
    const now = new Date();
    const where: Prisma.RequestWhereInput = {
      AND: [
        scope,
        query.mine ? { createdById: actor.id } : {},
        query.status?.length ? { status: { in: query.status } } : {},
        query.priority?.length ? { priority: { in: query.priority } } : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.neighborhoodId ? { neighborhoodId: query.neighborhoodId } : {},
        query.source ? { source: query.source } : {},
        query.categoryId
          ? { OR: [{ categoryId: query.categoryId }, { category: { parentId: query.categoryId } }] }
          : {},
        query.createdFrom || query.createdTo
          ? {
              createdAt: {
                ...(query.createdFrom && { gte: new Date(query.createdFrom) }),
                ...(query.createdTo && { lte: new Date(query.createdTo) }),
              },
            }
          : {},
        query.slaStatus ? this.slaWhere(query.slaStatus, now) : {},
        query.search ? this.searchWhere(query.search) : {},
      ],
    };
    const db = this.prisma.forTenant(actor.municipalityId);
    const [items, total] = await Promise.all([
      db.request.findMany({
        where,
        select: requestSummarySelect,
        orderBy: [...parseSort(query.sort, SORTABLE, [{ createdAt: 'desc' }]), { id: 'desc' }],
        ...toSkipTake(query),
      }),
      db.request.count({ where }),
    ]);
    return paginated(
      items.map((item) => toRequestSummary(item, now)),
      total,
      query,
    );
  }

  async get(actor: AuthUser, id: string): Promise<RequestDetail> {
    const record = await this.findVisible(actor, id, requestDetailSelect);
    const now = new Date();
    const staff = isMunicipalStaff(actor);
    const media = await Promise.all(
      record.media.map(async (item) => {
        const signed = await this.storage.presignedUrl(item.storageKey);
        return {
          id: item.id,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          createdAt: item.createdAt.toISOString(),
          url: signed.url,
          urlExpiresAt: signed.expiresAt.toISOString(),
        };
      }),
    );
    const terminal = TERMINAL_STATUSES.has(record.status);
    return {
      ...toRequestSummary(record, now),
      description: record.description,
      location: { latitude: record.latitude, longitude: record.longitude },
      locationNotice: locationNotice(record.neighborhood?.id ?? null),
      rejectionReason: record.rejectionReason,
      department: record.department,
      reporter:
        staff && actor.permissions.has(Permission.USERS_READ) && record.createdBy
          ? {
              id: record.createdBy.id,
              fullName: `${record.createdBy.firstName} ${record.createdBy.lastName}`,
              email: record.createdBy.email,
              phone: record.createdBy.phone,
            }
          : null,
      media,
      timeline: toTimeline(record.history, staff),
      actions: {
        transitions: manualTransitions(record.status, actor.permissions).map((rule) => ({
          to: rule.to,
          label: rule.label,
          requiresReason: rule.requiresReason ?? false,
        })),
        canChangePriority: !terminal && actor.permissions.has(Permission.REQUESTS_UPDATE),
        canChangeDepartment: !terminal && actor.permissions.has(Permission.REQUESTS_ASSIGN),
        canAddMedia: this.canAddMedia(actor, record),
      },
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Loads a request the actor may see. Another municipality's request, or one outside
   * the actor's object scope, is indistinguishable from a missing one (404).
   */
  async findVisible<S extends Prisma.RequestSelect>(
    actor: AuthUser,
    id: string,
    select: S,
  ): Promise<Prisma.RequestGetPayload<{ select: S }>> {
    const scope = requestReadScope(actor);
    if (!scope) throw requestNotFound();
    const record = await this.prisma
      .forTenant(actor.municipalityId)
      .request.findFirst({ where: { AND: [{ id }, scope] }, select });
    if (!record) throw requestNotFound();
    return record as Prisma.RequestGetPayload<{ select: S }>;
  }

  canAddMedia(
    actor: AuthUser,
    record: { status: RequestStatus; createdById: string | null },
  ): boolean {
    if (TERMINAL_STATUSES.has(record.status)) return false;
    return (
      (record.createdById === actor.id && actor.permissions.has(Permission.REQUESTS_CREATE)) ||
      actor.permissions.has(Permission.REQUESTS_UPDATE)
    );
  }

  // ─── Workflow ───────────────────────────────────────────────────────────

  async transition(
    actor: AuthUser,
    id: string,
    dto: TransitionRequestDto,
    meta: RequestMeta,
  ): Promise<RequestDetail> {
    const current = await this.findVisible(actor, id, {
      status: true,
      department: { select: { status: true } },
    });
    const check = checkManualTransition(current.status, dto.to, actor.permissions, dto.reason);
    if (!check.ok) {
      if (check.reason === 'FORBIDDEN') {
        throw new AppException(
          ErrorCode.FORBIDDEN,
          'Bu işlem için yetkiniz bulunmuyor.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (check.reason === 'REASON_REQUIRED') {
        throw new AppException(
          ErrorCode.TRANSITION_REASON_REQUIRED,
          'Bu işlem için bir gerekçe yazmalısınız.',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw AppException.conflict(
        ErrorCode.INVALID_STATUS_TRANSITION,
        check.reason === 'SYSTEM_ONLY'
          ? 'Bu durum değişikliği ilgili iş akışı tarafından otomatik yapılır.'
          : 'Talep bu durumdan istenen duruma geçirilemez.',
        { from: current.status, to: dto.to, allowed: check.allowed },
      );
    }
    if (
      dto.to === RequestStatus.ASSIGNED_TO_DEPARTMENT &&
      current.department?.status !== RecordStatus.ACTIVE
    ) {
      throw AppException.conflict(
        ErrorCode.DEPARTMENT_INACTIVE,
        'Talebin müdürlüğü pasif. Önce aktif bir müdürlüğe yönlendirin.',
      );
    }

    const now = new Date();
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      // Optimistic concurrency: only moves on if nobody changed the status meanwhile.
      const { count } = await tx.request.updateMany({
        where: { id, status: current.status },
        data: {
          status: dto.to,
          ...(dto.to === RequestStatus.REJECTED && { rejectionReason: dto.reason, closedAt: now }),
        },
      });
      if (count !== 1) {
        throw AppException.conflict(
          ErrorCode.CONFLICT,
          'Talep bu sırada başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyin.',
        );
      }
      const description = dto.reason
        ? `${statusChangeDescription(current.status, dto.to)} – Gerekçe: ${dto.reason}`
        : statusChangeDescription(current.status, dto.to);
      await this.history(tx, id, actor, 'STATUS_CHANGED', description, now, {
        oldStatus: current.status,
        newStatus: dto.to,
      });
      await this.audit.record(
        {
          action: AuditAction.REQUEST_STATUS_CHANGED,
          entityType: 'Request',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: { status: current.status },
          after: { status: dto.to, ...(dto.reason && { reason: dto.reason }) },
          meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  async changePriority(
    actor: AuthUser,
    id: string,
    dto: ChangePriorityDto,
    meta: RequestMeta,
  ): Promise<RequestDetail> {
    const current = await this.findVisible(actor, id, { status: true, priority: true });
    this.assertOpen(current.status);
    if (current.priority === dto.priority) return this.get(actor, id);

    const now = new Date();
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      await tx.request.update({ where: { id }, data: { priority: dto.priority } });
      const text = `Öncelik: ${PRIORITY_LABELS[current.priority]} → ${PRIORITY_LABELS[dto.priority]}`;
      await this.history(
        tx,
        id,
        actor,
        'PRIORITY_CHANGED',
        dto.reason ? `${text} – Gerekçe: ${dto.reason}` : text,
        now,
        {
          metadata: { from: current.priority, to: dto.priority },
        },
      );
      await this.audit.record(
        {
          action: AuditAction.REQUEST_PRIORITY_CHANGED,
          entityType: 'Request',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: { priority: current.priority },
          after: { priority: dto.priority, ...(dto.reason && { reason: dto.reason }) },
          meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /** Re-routing keeps the SLA snapshot: the clock started when the citizen reported. */
  async changeDepartment(
    actor: AuthUser,
    id: string,
    dto: ChangeDepartmentDto,
    meta: RequestMeta,
  ): Promise<RequestDetail> {
    const current = await this.findVisible(actor, id, { status: true, departmentId: true });
    this.assertOpen(current.status);
    const department = await this.prisma.forTenant(actor.municipalityId).department.findUnique({
      where: { id: dto.departmentId },
      select: { id: true, name: true, status: true },
    });
    if (!department)
      throw AppException.notFound(ErrorCode.DEPARTMENT_NOT_FOUND, 'Müdürlük bulunamadı.');
    if (department.status !== RecordStatus.ACTIVE) {
      throw AppException.conflict(
        ErrorCode.DEPARTMENT_INACTIVE,
        'Pasif bir müdürlüğe talep yönlendirilemez.',
      );
    }
    if (current.departmentId === department.id) return this.get(actor, id);

    const now = new Date();
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      await tx.request.update({ where: { id }, data: { departmentId: department.id } });
      const text = `${department.name} birimine yönlendirildi.`;
      await this.history(
        tx,
        id,
        actor,
        'DEPARTMENT_ASSIGNED',
        dto.reason ? `${text} Gerekçe: ${dto.reason}` : text,
        now,
        {
          metadata: { from: current.departmentId, to: department.id },
        },
      );
      await this.audit.record(
        {
          action: AuditAction.REQUEST_DEPARTMENT_CHANGED,
          entityType: 'Request',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: { departmentId: current.departmentId },
          after: { departmentId: department.id, ...(dto.reason && { reason: dto.reason }) },
          meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  assertOpen(status: RequestStatus): void {
    if (TERMINAL_STATUSES.has(status) || SLA_STOPPED_STATUSES.has(status)) {
      throw AppException.conflict(
        ErrorCode.REQUEST_CLOSED,
        'Sonuçlanmış bir talep değiştirilemez.',
      );
    }
  }

  async history(
    tx: HistoryWriter,
    requestId: string,
    actor: AuthUser,
    eventType: Prisma.RequestHistoryUncheckedCreateInput['eventType'],
    description: string,
    at: Date,
    extra: {
      oldStatus?: RequestStatus;
      newStatus?: RequestStatus;
      metadata?: Prisma.InputJsonValue;
    } = {},
  ): Promise<void> {
    await tx.requestHistory.create({
      data: {
        requestId,
        eventType,
        description: description.slice(0, 500),
        performedById: actor.id,
        createdAt: at,
        ...extra,
      },
    });
  }

  /**
   * SLA status is computed, so the filter mirrors evaluateSla() with timestamps frozen at
   * creation (slaDueAt, slaAtRiskAt) and the completion time (resolvedAt).
   */
  private slaWhere(status: SlaStatus, now: Date): Prisma.RequestWhereInput {
    const fields = this.prisma.request.fields;
    const open = { resolvedAt: null, closedAt: null, status: { not: RequestStatus.REJECTED } };
    switch (status) {
      case SlaStatus.BREACHED:
        return {
          OR: [
            { ...open, slaDueAt: { lt: now } },
            { status: { not: RequestStatus.REJECTED }, resolvedAt: { gt: fields.slaDueAt } },
          ],
        };
      case SlaStatus.AT_RISK:
        return { ...open, slaAtRiskAt: { lte: now }, slaDueAt: { gte: now } };
      case SlaStatus.ON_TIME:
        return {
          OR: [
            { ...open, slaAtRiskAt: { gt: now } },
            { status: { not: RequestStatus.REJECTED }, resolvedAt: { lte: fields.slaDueAt } },
          ],
        };
    }
  }

  /** Exact public number, otherwise description / address (trigram-indexed ILIKE). */
  private searchWhere(search: string): Prisma.RequestWhereInput {
    const number = parsePublicNumber(search);
    if (number) return { publicNumber: search.trim().toUpperCase() };
    return {
      OR: [
        { publicNumber: { contains: search.toUpperCase() } },
        { description: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
}
