import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  type Paginated,
  RecordStatus,
  type RequestCategoryNode,
  type RequestCategorySummary,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, parseSort, toSkipTake } from '../../common/pagination/pagination';
import { changedFields, isUniqueViolation, pickFields } from '../../common/utils/prisma-errors';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  buildTree,
  categoryRuleViolation,
  effectiveSlaMinutes,
  type ParentState,
  slaLabel,
} from './domain/category-rules';
import {
  type CategoryTreeQueryDto,
  type CreateCategoryDto,
  type ListCategoriesQueryDto,
  type UpdateCategoryDto,
} from './dto/request-categories.dto';

const SORTABLE = ['sortOrder', 'name', 'code', 'createdAt', 'status'] as const;

const categorySelect = {
  id: true,
  parentId: true,
  departmentId: true,
  name: true,
  code: true,
  description: true,
  icon: true,
  defaultPriority: true,
  defaultSlaMinutes: true,
  keywords: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true, status: true } },
  parent: { select: { defaultSlaMinutes: true } },
  _count: { select: { children: true } },
} satisfies Prisma.RequestCategorySelect;

type CategoryRecord = Prisma.RequestCategoryGetPayload<{ select: typeof categorySelect }>;

/** Fields audited on CATEGORY_UPDATED (status has its own event). */
type EditableField =
  | 'name'
  | 'parentId'
  | 'departmentId'
  | 'description'
  | 'icon'
  | 'defaultPriority'
  | 'defaultSlaMinutes'
  | 'keywords'
  | 'sortOrder'
  | 'status';

function toSummary({ parent, _count, ...c }: CategoryRecord): RequestCategorySummary {
  const effective = effectiveSlaMinutes(c.defaultSlaMinutes, parent?.defaultSlaMinutes ?? null);
  return {
    ...c,
    effectiveSlaMinutes: effective,
    slaLabel: slaLabel(effective),
    childCount: _count.children,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const notFound = (message = 'Kategori bulunamadı.') =>
  AppException.notFound(ErrorCode.CATEGORY_NOT_FOUND, message);

/**
 * Request categories: a two-level tree whose sub-categories carry the default routing
 * (department), priority and SLA that Phase 5 applies to new requests. Parent and
 * department are always resolved through the tenant-scoped client, so a reference to
 * another municipality's record is "not found" (and a DB trigger backs this up).
 */
@Injectable()
export class RequestCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    actor: AuthUser,
    query: ListCategoriesQueryDto,
  ): Promise<Paginated<RequestCategorySummary>> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const search = query.search?.trim();
    const where: Prisma.RequestCategoryWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.parentId && { parentId: query.parentId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      db.requestCategory.findMany({
        where,
        select: categorySelect,
        orderBy: parseSort(query.sort, SORTABLE, [{ sortOrder: 'asc' }, { name: 'asc' }]),
        ...toSkipTake(query),
      }),
      db.requestCategory.count({ where }),
    ]);
    return paginated(items.map(toSummary), total, query);
  }

  /** The whole tree in one response – categories number in the dozens, not thousands. */
  async tree(actor: AuthUser, query: CategoryTreeQueryDto): Promise<RequestCategoryNode[]> {
    const items = await this.prisma.forTenant(actor.municipalityId).requestCategory.findMany({
      where: query.status ? { status: query.status } : {},
      select: categorySelect,
    });
    const summaries = items.map(toSummary);
    const ids = new Set(summaries.map((s) => s.id));
    // With ?status=ACTIVE an active sub-category of an inactive root is not reachable.
    const visible = summaries.filter((s) => s.parentId === null || ids.has(s.parentId));
    return buildTree(visible).map((root) => ({
      ...root,
      children: root.children.map((child) => ({ ...child, children: [] })),
    }));
  }

  async get(actor: AuthUser, id: string): Promise<RequestCategorySummary> {
    return toSummary(await this.load(actor, id));
  }

  async create(
    actor: AuthUser,
    dto: CreateCategoryDto,
    meta: RequestMeta,
  ): Promise<RequestCategorySummary> {
    const parent = dto.parentId ? await this.loadParent(actor, dto.parentId) : null;
    if (dto.departmentId) await this.assertAssignableDepartment(actor, dto.departmentId);
    this.assertRules(
      {
        parentId: dto.parentId ?? null,
        departmentId: dto.departmentId ?? null,
        status: RecordStatus.ACTIVE,
        hasChildren: false,
      },
      parent,
    );

    const db = this.prisma.forTenant(actor.municipalityId);
    try {
      return await db.$transaction(async (tx) => {
        const created = await tx.requestCategory.create({
          data: {
            municipalityId: actor.municipalityId,
            parentId: dto.parentId ?? null,
            departmentId: dto.departmentId ?? null,
            name: dto.name,
            code: dto.code,
            description: dto.description ?? null,
            icon: dto.icon ?? null,
            defaultPriority: dto.defaultPriority,
            defaultSlaMinutes: dto.defaultSlaMinutes ?? null,
            keywords: dto.keywords ?? [],
            sortOrder: dto.sortOrder ?? 0,
          },
          select: categorySelect,
        });
        const summary = toSummary(created);
        await this.audit.record(
          {
            action: AuditAction.CATEGORY_CREATED,
            entityType: 'RequestCategory',
            entityId: created.id,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: pickFields(summary, [
              'name',
              'code',
              'parentId',
              'departmentId',
              'defaultPriority',
              'defaultSlaMinutes',
              'status',
            ]),
            meta,
          },
          tx,
        );
        return summary;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.CATEGORY_CODE_TAKEN,
          'Bu kategori kodu zaten kullanılıyor.',
        );
      }
      throw error;
    }
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateCategoryDto,
    meta: RequestMeta,
  ): Promise<RequestCategorySummary> {
    const before = await this.load(actor, id);
    const changed = changedFields(before, dto as Partial<CategoryRecord>).filter(
      (field) => field !== 'keywords' || !sameKeywords(before.keywords, dto.keywords),
    ) as EditableField[];
    if (changed.length === 0) return toSummary(before);

    const next = {
      id,
      parentId: dto.parentId !== undefined ? dto.parentId : before.parentId,
      departmentId: dto.departmentId !== undefined ? dto.departmentId : before.departmentId,
      status: dto.status ?? before.status,
      hasChildren: before._count.children > 0,
    };
    const parent = next.parentId ? await this.loadParent(actor, next.parentId) : null;
    if (changed.includes('departmentId') && next.departmentId) {
      await this.assertAssignableDepartment(actor, next.departmentId);
    }
    this.assertRules(next, parent);

    const db = this.prisma.forTenant(actor.municipalityId);
    return db.$transaction(async (tx) => {
      const updated = await tx.requestCategory.update({
        where: { id },
        // Scalar foreign keys (parentId, departmentId): the unchecked update input.
        data: pickFields(
          dto,
          changed as (keyof UpdateCategoryDto)[],
        ) as Prisma.RequestCategoryUncheckedUpdateInput,
        select: categorySelect,
      });

      // Deactivating a root takes its sub-categories with it (they cannot stay active).
      let cascaded: string[] = [];
      if (
        changed.includes('status') &&
        updated.status === RecordStatus.INACTIVE &&
        updated.parentId === null
      ) {
        const children = await tx.requestCategory.findMany({
          where: { parentId: id, status: RecordStatus.ACTIVE },
          select: { id: true, code: true },
        });
        if (children.length > 0) {
          await tx.requestCategory.updateMany({
            where: { id: { in: children.map((c) => c.id) } },
            data: { status: RecordStatus.INACTIVE },
          });
          cascaded = children.map((c) => c.code);
        }
      }

      const base = {
        entityType: 'RequestCategory',
        entityId: id,
        municipalityId: actor.municipalityId,
        userId: actor.id,
        meta,
      };
      const fields = changed.filter((field) => field !== 'status');
      if (fields.length > 0) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.CATEGORY_UPDATED,
            before: pickFields(before, fields),
            after: pickFields(updated, fields),
          },
          tx,
        );
      }
      if (changed.includes('status')) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.CATEGORY_STATUS_CHANGED,
            before: { status: before.status },
            after: {
              status: updated.status,
              ...(cascaded.length > 0 && { deactivatedSubCategories: cascaded }),
            },
          },
          tx,
        );
      }
      return toSummary(updated);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private assertRules(
    next: Parameters<typeof categoryRuleViolation>[0],
    parent: ParentState | null,
  ): void {
    const violation = categoryRuleViolation(next, parent);
    if (!violation) return;
    const status =
      violation.code === 'CATEGORY_DEPARTMENT_REQUIRED'
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.CONFLICT;
    throw new AppException(ErrorCode[violation.code], violation.message, status);
  }

  private async load(actor: AuthUser, id: string): Promise<CategoryRecord> {
    const category = await this.prisma
      .forTenant(actor.municipalityId)
      .requestCategory.findUnique({ where: { id }, select: categorySelect });
    if (!category) throw notFound();
    return category;
  }

  private async loadParent(actor: AuthUser, parentId: string): Promise<ParentState> {
    const parent = await this.prisma.forTenant(actor.municipalityId).requestCategory.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, status: true },
    });
    if (!parent) throw notFound('Üst kategori bulunamadı.');
    return parent;
  }

  /** Same tenant (else 404) and ACTIVE: new routing must not point at a closed department. */
  private async assertAssignableDepartment(actor: AuthUser, departmentId: string): Promise<void> {
    const department = await this.prisma
      .forTenant(actor.municipalityId)
      .department.findUnique({ where: { id: departmentId }, select: { status: true } });
    if (!department) {
      throw AppException.notFound(ErrorCode.DEPARTMENT_NOT_FOUND, 'Müdürlük bulunamadı.');
    }
    if (department.status !== RecordStatus.ACTIVE) {
      throw AppException.conflict(
        ErrorCode.DEPARTMENT_INACTIVE,
        'Pasif bir müdürlüğe kategori yönlendirilemez.',
      );
    }
  }
}

function sameKeywords(a: string[], b: string[] | undefined): boolean {
  return b !== undefined && a.length === b.length && a.every((keyword, i) => keyword === b[i]);
}
