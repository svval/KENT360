import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  type Permission,
  type PermissionSummary,
  type RoleSummary,
  RoleCode,
} from '@kent360/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type CreateRoleDto, type SetRolePermissionsDto } from './dto/roles.dto';

const SYSTEM_ROLE_CODES: ReadonlySet<string> = new Set(Object.values(RoleCode));

const roleNotFound = () => AppException.notFound(ErrorCode.ROLE_NOT_FOUND, 'Rol bulunamadı.');

/**
 * Role is the one tenant-owned model not handled by prisma.forTenant(): system roles
 * (municipalityId = NULL) are shared by all municipalities. Visibility is therefore
 * "system OR own municipality", and only own roles are writable – editing a system
 * role would silently change permissions in every municipality.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private visibleTo(actor: AuthUser): Prisma.RoleWhereInput {
    return { OR: [{ municipalityId: null }, { municipalityId: actor.municipalityId }] };
  }

  private select(actor: AuthUser) {
    return {
      id: true,
      code: true,
      name: true,
      description: true,
      isSystem: true,
      municipalityId: true,
      permissions: { select: { permission: { select: { code: true } } } },
      // Only users of the caller's municipality are counted, even for shared system roles.
      _count: { select: { users: { where: { user: { municipalityId: actor.municipalityId } } } } },
    } satisfies Prisma.RoleSelect;
  }

  private toSummary(
    role: Prisma.RoleGetPayload<{ select: ReturnType<RolesService['select']> }>,
  ): RoleSummary {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.municipalityId === null,
      permissions: role.permissions.map(({ permission }) => permission.code as Permission).sort(),
      userCount: role._count.users,
    };
  }

  async list(actor: AuthUser): Promise<RoleSummary[]> {
    const roles = await this.prisma.role.findMany({
      where: this.visibleTo(actor),
      select: this.select(actor),
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((role) => this.toSummary(role));
  }

  async listPermissions(): Promise<PermissionSummary[]> {
    const permissions = await this.prisma.permission.findMany({
      select: { code: true, name: true, group: true },
      orderBy: [{ group: 'asc' }, { code: 'asc' }],
    });
    return permissions.map((p) => ({ ...p, code: p.code as Permission }));
  }

  async create(actor: AuthUser, dto: CreateRoleDto, meta: RequestMeta): Promise<RoleSummary> {
    if (SYSTEM_ROLE_CODES.has(dto.code)) throw this.codeTaken();
    const permissionIds = await this.permissionIds(dto.permissions);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            municipalityId: actor.municipalityId,
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            isSystem: false,
            permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
          },
          select: this.select(actor),
        });
        const summary = this.toSummary(role);
        await this.audit.record(
          {
            action: AuditAction.ROLE_CREATED,
            entityType: 'Role',
            entityId: role.id,
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
        throw this.codeTaken();
      }
      throw error;
    }
  }

  async setPermissions(
    actor: AuthUser,
    roleId: string,
    dto: SetRolePermissionsDto,
    meta: RequestMeta,
  ): Promise<RoleSummary> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, ...this.visibleTo(actor) },
      select: this.select(actor),
    });
    if (!role) throw roleNotFound();
    if (role.municipalityId === null) {
      throw new AppException(
        ErrorCode.SYSTEM_ROLE_IMMUTABLE,
        'Sistem rolleri değiştirilemez. Belediyenize özel bir rol oluşturun.',
        HttpStatus.CONFLICT,
      );
    }
    const permissionIds = await this.permissionIds(dto.permissions);

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId, permissionId: { notIn: permissionIds } },
      });
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
      const updated = this.toSummary(
        await tx.role.findUniqueOrThrow({ where: { id: roleId }, select: this.select(actor) }),
      );
      await this.audit.record(
        {
          action: AuditAction.ROLE_PERMISSION_CHANGED,
          entityType: 'Role',
          entityId: roleId,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: { permissions: this.toSummary(role).permissions },
          after: { permissions: updated.permissions },
          meta,
        },
        tx,
      );
      return updated;
    });
  }

  private async permissionIds(codes: Permission[]): Promise<string[]> {
    const rows = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    // The DTO restricts codes to the catalogue; a mismatch means the seed is missing.
    if (rows.length !== codes.length) {
      throw new AppException(
        ErrorCode.CONFLICT,
        'İzin kataloğu veritabanında eksik. Seed çalıştırılmalı.',
        HttpStatus.CONFLICT,
      );
    }
    return rows.map((row) => row.id);
  }

  private codeTaken(): AppException {
    return AppException.conflict(ErrorCode.ROLE_CODE_TAKEN, 'Bu rol kodu zaten kullanılıyor.');
  }
}
