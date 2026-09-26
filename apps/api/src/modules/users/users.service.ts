import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, type Paginated, type UserSummary, UserStatus } from '@kent360/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, parseSort, toSkipTake } from '../../common/pagination/pagination';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeEmail } from '../auth/domain/login-policy';
import { PasswordService } from '../auth/password.service';
import {
  type CreateUserDto,
  type ListUsersQueryDto,
  type SetUserRolesDto,
  type UpdateUserDto,
} from './dto/users.dto';

const SORTABLE = ['createdAt', 'lastName', 'firstName', 'email', 'lastLoginAt'] as const;

const userSummarySelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  departmentId: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserSummaryRecord = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

function toSummary(user: UserSummaryRecord): UserSummary {
  return {
    ...user,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    roles: user.roles.map(({ role }) => role),
  };
}

const userNotFound = () => AppException.notFound(ErrorCode.USER_NOT_FOUND, 'Kullanıcı bulunamadı.');

/**
 * Staff and citizen accounts of the caller's municipality. Every query goes through
 * prisma.forTenant(), so users of another municipality are indistinguishable from
 * non-existent ones (404).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.role && { roles: { some: { role: { code: query.role } } } }),
      ...(q && {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        select: userSummarySelect,
        orderBy: parseSort(query.sort, SORTABLE, [{ createdAt: 'desc' }]),
        ...toSkipTake(query),
      }),
      db.user.count({ where }),
    ]);
    return paginated(items.map(toSummary), total, query);
  }

  async get(actor: AuthUser, id: string): Promise<UserSummary> {
    const user = await this.prisma
      .forTenant(actor.municipalityId)
      .user.findUnique({ where: { id }, select: userSummarySelect });
    if (!user) throw userNotFound();
    return toSummary(user);
  }

  async create(actor: AuthUser, dto: CreateUserDto, meta: RequestMeta): Promise<UserSummary> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const email = normalizeEmail(dto.email);
    if (dto.departmentId) await this.assertDepartment(actor, dto.departmentId);
    const roleIds = await this.resolveAssignableRoles(actor, dto.roleIds ?? []);
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      return await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone ?? null,
            departmentId: dto.departmentId ?? null,
            passwordHash,
            municipalityId: actor.municipalityId,
            roles: { create: roleIds.map((roleId) => ({ roleId, grantedById: actor.id })) },
          },
          select: userSummarySelect,
        });
        const summary = toSummary(created);
        await this.audit.record(
          {
            action: AuditAction.USER_CREATED,
            entityType: 'User',
            entityId: created.id,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: summary,
            meta,
          },
          tx,
        );
        return summary;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppException.conflict(
          ErrorCode.EMAIL_TAKEN,
          'Bu e-posta adresiyle kayıtlı bir kullanıcı var.',
        );
      }
      throw error;
    }
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateUserDto,
    meta: RequestMeta,
  ): Promise<UserSummary> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const before = await db.user.findUnique({ where: { id }, select: userSummarySelect });
    if (!before) throw userNotFound();

    const statusChanged = dto.status !== undefined && dto.status !== before.status;
    if (statusChanged && id === actor.id) {
      throw new AppException(
        ErrorCode.SELF_MODIFICATION_FORBIDDEN,
        'Kendi hesabınızın durumunu değiştiremezsiniz.',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.departmentId) await this.assertDepartment(actor, dto.departmentId);

    return db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          departmentId: dto.departmentId,
          status: dto.status,
        },
        select: userSummarySelect,
      });
      const base = {
        entityType: 'User',
        entityId: id,
        municipalityId: actor.municipalityId,
        userId: actor.id,
        meta,
      };

      const { status: _s, ...profileChanges } = dto;
      if (Object.values(profileChanges).some((value) => value !== undefined)) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.USER_UPDATED,
            before: pick(before, profileChanges),
            after: pick(updated, profileChanges),
          },
          tx,
        );
      }
      if (statusChanged) {
        // A deactivated account loses every session immediately (JwtAuthGuard also re-checks status).
        const revoked =
          updated.status === UserStatus.ACTIVE
            ? 0
            : (
                await tx.refreshToken.updateMany({
                  where: { userId: id, revokedAt: null },
                  data: { revokedAt: new Date() },
                })
              ).count;
        await this.audit.record(
          {
            ...base,
            action: AuditAction.USER_STATUS_CHANGED,
            before: { status: before.status },
            after: { status: updated.status, revokedTokens: revoked },
          },
          tx,
        );
      }
      return toSummary(updated);
    });
  }

  async setRoles(
    actor: AuthUser,
    id: string,
    dto: SetUserRolesDto,
    meta: RequestMeta,
  ): Promise<UserSummary> {
    if (id === actor.id) {
      throw new AppException(
        ErrorCode.SELF_MODIFICATION_FORBIDDEN,
        'Kendi rollerinizi değiştiremezsiniz.',
        HttpStatus.CONFLICT,
      );
    }
    const db = this.prisma.forTenant(actor.municipalityId);
    const before = await db.user.findUnique({ where: { id }, select: userSummarySelect });
    if (!before) throw userNotFound();
    const roleIds = await this.resolveAssignableRoles(actor, dto.roleIds);

    return db.$transaction(async (tx) => {
      // UserRole is keyed by the user, whose tenant was verified above.
      await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: roleIds } } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId, grantedById: actor.id })),
        skipDuplicates: true,
      });
      const updated = await tx.user.findUniqueOrThrow({ where: { id }, select: userSummarySelect });
      await this.audit.record(
        {
          action: AuditAction.USER_ROLE_CHANGED,
          entityType: 'User',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: { roles: before.roles.map(({ role }) => role.code) },
          after: { roles: updated.roles.map(({ role }) => role.code) },
          meta,
        },
        tx,
      );
      return toSummary(updated);
    });
  }

  /** Roles a tenant may hand out: system roles and its own custom roles. */
  private async resolveAssignableRoles(actor: AuthUser, roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        OR: [{ municipalityId: null }, { municipalityId: actor.municipalityId }],
      },
      select: { id: true },
    });
    if (roles.length !== roleIds.length) {
      throw AppException.notFound(ErrorCode.ROLE_NOT_FOUND, 'Rol bulunamadı.');
    }
    return roles.map((role) => role.id);
  }

  private async assertDepartment(actor: AuthUser, departmentId: string): Promise<void> {
    const department = await this.prisma
      .forTenant(actor.municipalityId)
      .department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!department)
      throw AppException.notFound(ErrorCode.DEPARTMENT_NOT_FOUND, 'Müdürlük bulunamadı.');
  }
}

function pick(
  source: Record<string, unknown>,
  keys: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(keys)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => [key, source[key]]),
  );
}
