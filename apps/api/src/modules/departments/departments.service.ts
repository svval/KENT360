import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  type DepartmentSummary,
  type Paginated,
  RecordStatus,
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
  type CreateDepartmentDto,
  type ListDepartmentsQueryDto,
  type UpdateDepartmentDto,
} from './dto/departments.dto';

const SORTABLE = ['name', 'code', 'createdAt', 'status'] as const;

const departmentSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  contactEmail: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { users: true, categories: { where: { status: RecordStatus.ACTIVE } } },
  },
} satisfies Prisma.DepartmentSelect;

type DepartmentRecord = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;

function toSummary({ _count, ...d }: DepartmentRecord): DepartmentSummary {
  return {
    ...d,
    userCount: _count.users,
    categoryCount: _count.categories,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

const notFound = () =>
  AppException.notFound(ErrorCode.DEPARTMENT_NOT_FOUND, 'Müdürlük bulunamadı.');

/**
 * Departments (müdürlükler) are routing targets for request categories and the home
 * unit of staff. They are never deleted – only deactivated – so history stays intact.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    actor: AuthUser,
    query: ListDepartmentsQueryDto,
  ): Promise<Paginated<DepartmentSummary>> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const search = query.search?.trim();
    const where: Prisma.DepartmentWhereInput = {
      ...(query.status && { status: query.status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      db.department.findMany({
        where,
        select: departmentSelect,
        orderBy: parseSort(query.sort, SORTABLE, [{ name: 'asc' }]),
        ...toSkipTake(query),
      }),
      db.department.count({ where }),
    ]);
    return paginated(items.map(toSummary), total, query);
  }

  async get(actor: AuthUser, id: string): Promise<DepartmentSummary> {
    return toSummary(await this.load(actor, id));
  }

  async create(
    actor: AuthUser,
    dto: CreateDepartmentDto,
    meta: RequestMeta,
  ): Promise<DepartmentSummary> {
    const db = this.prisma.forTenant(actor.municipalityId);
    try {
      return await db.$transaction(async (tx) => {
        const created = await tx.department.create({
          data: {
            municipalityId: actor.municipalityId,
            name: dto.name,
            code: dto.code,
            description: dto.description ?? null,
            contactEmail: dto.contactEmail ?? null,
          },
          select: departmentSelect,
        });
        const summary = toSummary(created);
        await this.audit.record(
          {
            action: AuditAction.DEPARTMENT_CREATED,
            entityType: 'Department',
            entityId: created.id,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: { name: summary.name, code: summary.code, status: summary.status },
            meta,
          },
          tx,
        );
        return summary;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.DEPARTMENT_CODE_TAKEN,
          'Bu müdürlük kodu zaten kullanılıyor.',
        );
      }
      throw error;
    }
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateDepartmentDto,
    meta: RequestMeta,
  ): Promise<DepartmentSummary> {
    const before = await this.load(actor, id);
    const changed = changedFields(before, dto as Partial<DepartmentRecord>);
    if (changed.length === 0) return toSummary(before);

    const deactivating = changed.includes('status') && dto.status === RecordStatus.INACTIVE;
    if (deactivating && before._count.categories > 0) {
      // Deactivating a routing target would silently strand incoming requests (Phase 5).
      throw new AppException(
        ErrorCode.DEPARTMENT_IN_USE,
        `Bu müdürlüğe yönlendirilen ${before._count.categories} aktif kategori var. Önce kategorileri başka bir müdürlüğe taşıyın veya pasifleştirin.`,
        HttpStatus.CONFLICT,
        { activeCategories: before._count.categories },
      );
    }

    const db = this.prisma.forTenant(actor.municipalityId);
    return db.$transaction(async (tx) => {
      const updated = await tx.department.update({
        where: { id },
        data: pickFields(dto as Partial<DepartmentRecord>, changed),
        select: departmentSelect,
      });
      const base = {
        entityType: 'Department',
        entityId: id,
        municipalityId: actor.municipalityId,
        userId: actor.id,
        meta,
      };
      const profileFields = changed.filter((field) => field !== 'status');
      if (profileFields.length > 0) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.DEPARTMENT_UPDATED,
            before: pickFields(before, profileFields),
            after: pickFields(updated, profileFields),
          },
          tx,
        );
      }
      if (changed.includes('status')) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.DEPARTMENT_STATUS_CHANGED,
            before: { status: before.status },
            after: { status: updated.status },
          },
          tx,
        );
      }
      return toSummary(updated);
    });
  }

  private async load(actor: AuthUser, id: string): Promise<DepartmentRecord> {
    const department = await this.prisma
      .forTenant(actor.municipalityId)
      .department.findUnique({ where: { id }, select: departmentSelect });
    if (!department) throw notFound();
    return department;
  }
}
