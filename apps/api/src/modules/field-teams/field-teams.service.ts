import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  type FieldStaffCandidate,
  type FieldTeamDetail,
  type FieldTeamSummary,
  type Paginated,
  Permission,
  RecordStatus,
  UserStatus,
  WORK_ORDER_OPEN_STATUSES,
  WorkOrderStatus,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser, tenantContextOf } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, parseSort, toSkipTake } from '../../common/pagination/pagination';
import { changedFields, isUniqueViolation, pickFields } from '../../common/utils/prisma-errors';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type TeamMembership } from '../work-orders/domain/work-order-scope';
import { checkTeamMembers, diffTeamMembers } from './domain/team-rules';
import {
  type CreateFieldTeamDto,
  type ListFieldTeamsQueryDto,
  type SetTeamMembersDto,
  type UpdateFieldTeamDto,
} from './dto/field-teams.dto';

const SORTABLE = ['name', 'code', 'createdAt', 'status'] as const;

const teamSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true } },
  leader: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { members: { where: { leftAt: null } } } },
} satisfies Prisma.FieldTeamSelect;

type TeamRecord = Prisma.FieldTeamGetPayload<{ select: typeof teamSelect }>;

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

const notFound = () =>
  AppException.notFound(ErrorCode.FIELD_TEAM_NOT_FOUND, 'Saha ekibi bulunamadı.');

/** Users who may do field work: an active account holding workOrders.execute. */
export const fieldStaffWhere = {
  status: UserStatus.ACTIVE,
  roles: {
    some: {
      role: { permissions: { some: { permission: { code: Permission.WORK_ORDERS_EXECUTE } } } },
    },
  },
} satisfies Prisma.UserWhereInput;

/**
 * Field teams (saha ekipleri) belong to one department of the municipality. Members are
 * active field staff of that department; a team has at most one leader. Teams and
 * memberships are never deleted: teams are deactivated, members get `leftAt`.
 */
@Injectable()
export class FieldTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Read ───────────────────────────────────────────────────────────────

  async list(actor: AuthUser, query: ListFieldTeamsQueryDto): Promise<Paginated<FieldTeamSummary>> {
    const scope = this.readScope(actor);
    if (!scope) return paginated([], 0, query);
    const search = query.search?.trim();
    const where: Prisma.FieldTeamWhereInput = {
      AND: [
        scope,
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.status ? { status: query.status } : {},
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search.toUpperCase() } },
              ],
            }
          : {},
      ],
    };
    const db = this.prisma.forTenant(actor.municipalityId);
    const [items, total] = await Promise.all([
      db.fieldTeam.findMany({
        where,
        select: teamSelect,
        orderBy: [...parseSort(query.sort, SORTABLE, [{ name: 'asc' }]), { id: 'asc' }],
        ...toSkipTake(query),
      }),
      db.fieldTeam.count({ where }),
    ]);
    const counts = await this.workOrderCounts(
      actor.municipalityId,
      items.map((t) => t.id),
    );
    return paginated(
      items.map((team) => this.toSummary(team, counts)),
      total,
      query,
    );
  }

  async get(actor: AuthUser, id: string): Promise<FieldTeamDetail> {
    const team = await this.load(actor, id);
    const [counts, members] = await Promise.all([
      this.workOrderCounts(actor.municipalityId, [id]),
      this.prisma.fieldTeamMember.findMany({
        where: { teamId: id, leftAt: null },
        select: {
          role: true,
          joinedAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, status: true },
          },
        },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      }),
    ]);
    return {
      ...this.toSummary(team, counts),
      members: members.map((m) => ({
        userId: m.user.id,
        fullName: fullName(m.user),
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        active: m.user.status === UserStatus.ACTIVE,
      })),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  /** Active field staff of a department – the people who can be added to its teams. */
  async candidates(actor: AuthUser, departmentId: string): Promise<FieldStaffCandidate[]> {
    this.assertManagesDepartment(actor, departmentId);
    const users = await this.prisma.forTenant(actor.municipalityId).user.findMany({
      where: { ...fieldStaffWhere, departmentId },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });
    return users.map((u) => ({ id: u.id, fullName: fullName(u), email: u.email }));
  }

  /** Active memberships of a user (all teams of their municipality). */
  async membershipsOf(userId: string): Promise<TeamMembership[]> {
    const rows = await this.prisma.fieldTeamMember.findMany({
      where: { userId, leftAt: null },
      select: { teamId: true, role: true },
    });
    return rows;
  }

  // ─── Write ──────────────────────────────────────────────────────────────

  async create(
    actor: AuthUser,
    dto: CreateFieldTeamDto,
    meta: RequestMeta,
  ): Promise<FieldTeamDetail> {
    this.assertManagesDepartment(actor, dto.departmentId);
    const db = this.prisma.forTenant(actor.municipalityId);
    const department = await db.department.findUnique({
      where: { id: dto.departmentId },
      select: { id: true, status: true },
    });
    if (!department)
      throw AppException.notFound(ErrorCode.DEPARTMENT_NOT_FOUND, 'Müdürlük bulunamadı.');
    if (department.status !== RecordStatus.ACTIVE) {
      throw AppException.conflict(
        ErrorCode.DEPARTMENT_INACTIVE,
        'Pasif bir müdürlüğe saha ekibi eklenemez.',
      );
    }
    try {
      const id = await db.$transaction(async (tx) => {
        const created = await tx.fieldTeam.create({
          data: {
            municipalityId: actor.municipalityId,
            departmentId: dto.departmentId,
            name: dto.name,
            code: dto.code,
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            action: AuditAction.FIELD_TEAM_CREATED,
            entityType: 'FieldTeam',
            entityId: created.id,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: { name: dto.name, code: dto.code, departmentId: dto.departmentId },
            meta,
          },
          tx,
        );
        return created.id;
      });
      return this.get(actor, id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.FIELD_TEAM_CODE_TAKEN,
          'Bu ekip kodu zaten kullanılıyor.',
        );
      }
      throw error;
    }
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateFieldTeamDto,
    meta: RequestMeta,
  ): Promise<FieldTeamDetail> {
    const before = await this.load(actor, id);
    this.assertManagesDepartment(actor, before.departmentId);
    const changed = changedFields(before, dto as Partial<TeamRecord>);
    if (changed.length === 0) return this.get(actor, id);

    if (changed.includes('status') && dto.status === RecordStatus.INACTIVE) {
      const open = await this.prisma.forTenant(actor.municipalityId).workOrder.count({
        where: { fieldTeamId: id, status: { in: [...WORK_ORDER_OPEN_STATUSES] } },
      });
      if (open > 0) {
        throw new AppException(
          ErrorCode.FIELD_TEAM_HAS_ACTIVE_WORK,
          `Bu ekibin ${open} açık iş emri var. Önce iş emirlerini başka bir ekibe atayın veya tamamlayın.`,
          HttpStatus.CONFLICT,
          { openWorkOrders: open },
        );
      }
    }
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      await tx.fieldTeam.update({
        where: { id },
        data: {
          ...(changed.includes('name') && { name: dto.name }),
          ...(changed.includes('status') && { status: dto.status }),
        },
      });
      await this.audit.record(
        {
          action: AuditAction.FIELD_TEAM_UPDATED,
          entityType: 'FieldTeam',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: pickFields(before, changed),
          after: pickFields(dto as Partial<TeamRecord>, changed),
          meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  async setMembers(
    actor: AuthUser,
    id: string,
    dto: SetTeamMembersDto,
    meta: RequestMeta,
  ): Promise<FieldTeamDetail> {
    const team = await this.load(actor, id);
    this.assertManagesDepartment(actor, team.departmentId);
    const check = checkTeamMembers(dto.members);
    if (!check.ok) {
      const messages = {
        DUPLICATE_MEMBER: 'Aynı kişi ekibe iki kez eklenemez.',
        MULTIPLE_LEADERS: 'Bir ekibin en fazla bir sorumlusu olabilir.',
        TOO_MANY_MEMBERS: 'Bir ekip en fazla 30 kişiden oluşabilir.',
      };
      throw new AppException(
        ErrorCode.FIELD_TEAM_MEMBER_INVALID,
        messages[check.reason],
        HttpStatus.BAD_REQUEST,
        { reason: check.reason },
      );
    }

    // Every member: same municipality (tenant-scoped lookup), same department, active,
    // allowed to do field work. Unknown ids – including other tenants' users – are refused
    // without saying whether they exist elsewhere.
    const ids = dto.members.map((m) => m.userId);
    const eligible = await this.prisma.forTenant(actor.municipalityId).user.findMany({
      where: { id: { in: ids }, departmentId: team.departmentId, ...fieldStaffWhere },
      select: { id: true },
    });
    const eligibleIds = new Set(eligible.map((u) => u.id));
    const invalid = ids.filter((userId) => !eligibleIds.has(userId));
    if (invalid.length > 0) {
      throw new AppException(
        ErrorCode.FIELD_TEAM_MEMBER_INVALID,
        'Ekibe yalnızca aynı müdürlükteki aktif saha personeli eklenebilir.',
        HttpStatus.BAD_REQUEST,
        { invalidUserIds: invalid },
      );
    }

    const now = new Date();
    await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
      // Updating the team row first locks it: concurrent member changes queue up.
      await tx.fieldTeam.update({ where: { id }, data: { leaderId: check.leaderId } });
      const current = await tx.fieldTeamMember.findMany({
        where: { teamId: id },
        select: { userId: true, role: true, leftAt: true },
      });
      const diff = diffTeamMembers(current, dto.members);
      if (diff.add.length > 0) {
        await tx.fieldTeamMember.createMany({
          data: diff.add.map((m) => ({
            teamId: id,
            userId: m.userId,
            role: m.role,
            joinedAt: now,
          })),
        });
      }
      for (const m of diff.rejoin) {
        await tx.fieldTeamMember.update({
          where: { teamId_userId: { teamId: id, userId: m.userId } },
          data: { role: m.role, leftAt: null, joinedAt: now },
        });
      }
      for (const m of diff.changeRole) {
        await tx.fieldTeamMember.update({
          where: { teamId_userId: { teamId: id, userId: m.userId } },
          data: { role: m.role },
        });
      }
      if (diff.remove.length > 0) {
        await tx.fieldTeamMember.updateMany({
          where: { teamId: id, userId: { in: diff.remove } },
          data: { leftAt: now },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.FIELD_TEAM_MEMBERS_CHANGED,
          entityType: 'FieldTeam',
          entityId: id,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: {
            members: current
              .filter((row) => !row.leftAt)
              .map((row) => ({ userId: row.userId, role: row.role })),
          },
          after: { members: dto.members.map((m) => ({ userId: m.userId, role: m.role })) },
          meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Admin: every team; other staff: the teams of their own department. */
  readScope(actor: AuthUser): Prisma.FieldTeamWhereInput | null {
    const tenant = tenantContextOf(actor);
    if (!tenant.departmentScoped) return {};
    return tenant.departmentId ? { departmentId: tenant.departmentId } : null;
  }

  async load(actor: AuthUser, id: string): Promise<TeamRecord> {
    const scope = this.readScope(actor);
    if (!scope) throw notFound();
    const team = await this.prisma
      .forTenant(actor.municipalityId)
      .fieldTeam.findFirst({ where: { AND: [{ id }, scope] }, select: teamSelect });
    if (!team) throw notFound();
    return team;
  }

  private assertManagesDepartment(actor: AuthUser, departmentId: string): void {
    const tenant = tenantContextOf(actor);
    if (tenant.departmentScoped && tenant.departmentId !== departmentId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Yalnızca kendi müdürlüğünüzün saha ekiplerini yönetebilirsiniz.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Open / completed work orders per team – one grouped query for the whole page. */
  private async workOrderCounts(
    municipalityId: string,
    teamIds: string[],
  ): Promise<Map<string, { active: number; completed: number }>> {
    const counts = new Map<string, { active: number; completed: number }>();
    if (teamIds.length === 0) return counts;
    const rows = await this.prisma.forTenant(municipalityId).workOrder.groupBy({
      by: ['fieldTeamId', 'status'],
      where: { fieldTeamId: { in: teamIds } },
      _count: { _all: true },
    });
    const open = new Set<string>(WORK_ORDER_OPEN_STATUSES);
    for (const row of rows) {
      if (!row.fieldTeamId) continue;
      const entry = counts.get(row.fieldTeamId) ?? { active: 0, completed: 0 };
      if (open.has(row.status)) entry.active += row._count._all;
      else if (row.status === WorkOrderStatus.COMPLETED || row.status === WorkOrderStatus.VERIFIED)
        entry.completed += row._count._all;
      counts.set(row.fieldTeamId, entry);
    }
    return counts;
  }

  private toSummary(
    team: TeamRecord,
    counts: Map<string, { active: number; completed: number }>,
  ): FieldTeamSummary {
    const count = counts.get(team.id) ?? { active: 0, completed: 0 };
    return {
      id: team.id,
      code: team.code,
      name: team.name,
      status: team.status,
      department: team.department,
      leader: team.leader ? { id: team.leader.id, fullName: fullName(team.leader) } : null,
      memberCount: team._count.members,
      activeWorkOrders: count.active,
      completedWorkOrders: count.completed,
      createdAt: team.createdAt.toISOString(),
    };
  }
}
