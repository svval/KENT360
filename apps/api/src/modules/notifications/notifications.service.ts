import { Injectable } from '@nestjs/common';
import {
  type NotificationItem,
  type NotificationListMeta,
  Permission,
  RoleCode,
  UserStatus,
} from '@kent360/shared-types';
import {
  type NotificationType as DbNotificationType,
  type Prisma,
} from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { toSkipTake } from '../../common/pagination/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type NotificationContent,
  recipientsOf,
  visibleNotificationTypes,
} from './domain/notification-rules';
import { type ListNotificationsQueryDto } from './dto/notifications.dto';

/**
 * Whatever a workflow transaction can write notifications with: the tenant-scoped
 * transaction client (municipalityId is then forced by the tenant extension).
 */
export interface NotificationDb {
  notification: {
    createMany(args: { data: Prisma.NotificationUncheckedCreateInput[] }): PromiseLike<unknown>;
  };
  user: {
    findMany(args: {
      where: Prisma.UserWhereInput;
      select: { id: true };
    }): PromiseLike<{ id: string }[]>;
  };
}

const withPermission = (code: Permission): Prisma.UserWhereInput => ({
  roles: { some: { role: { permissions: { some: { permission: { code } } } } } },
});

const notificationNotFound = () =>
  AppException.notFound(ErrorCode.NOTIFICATION_NOT_FOUND, 'Bildirim bulunamadı.');

const select = {
  id: true,
  type: true,
  title: true,
  body: true,
  createdAt: true,
  readAt: true,
  entityType: true,
  entityId: true,
} satisfies Prisma.NotificationSelect;

type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;

const toItem = (row: Row): NotificationItem => ({
  id: row.id,
  type: row.type as NotificationItem['type'],
  title: row.title,
  message: row.body,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
  entityType:
    row.entityType === 'Request' || row.entityType === 'WorkOrder' ? row.entityType : null,
  entityId: row.entityId,
});

/**
 * In-app notification inbox (Phase 13). Workflows write notifications in their own
 * transaction (`notify`), so a notification exists exactly when the change committed.
 * Reading is strictly "own notifications of the own municipality": another user's id
 * is simply not found (404), and citizens only ever see citizen notification types.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Writing (inside workflow transactions) ─────────────────────────────

  async notify(
    db: NotificationDb,
    input: {
      municipalityId: string;
      recipients: readonly (string | null | undefined)[];
      actorId: string | null;
      content: NotificationContent;
      at?: Date;
    },
  ): Promise<number> {
    const userIds = recipientsOf(input.recipients, input.actorId);
    if (userIds.length === 0) return 0;
    const { content } = input;
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        municipalityId: input.municipalityId,
        userId,
        type: content.type as DbNotificationType,
        title: content.title,
        body: content.message,
        entityType: content.entityType,
        entityId: content.entityId,
        ...(input.at && { createdAt: input.at }),
      })),
    });
    return userIds.length;
  }

  /** Active staff of a department holding a permission (e.g. its managers). */
  async departmentStaff(
    db: NotificationDb,
    departmentId: string | null,
    permission: Permission,
  ): Promise<string[]> {
    if (!departmentId) return [];
    const users = await db.user.findMany({
      where: { departmentId, status: UserStatus.ACTIVE, ...withPermission(permission) },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  /** The municipality's administrators (escalations: critical requests, SLA breaches). */
  async municipalityAdmins(db: NotificationDb): Promise<string[]> {
    const users = await db.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { code: RoleCode.SYSTEM_ADMIN } } },
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  /**
   * Citizens following a request: its reporter and everyone who joined it – only
   * accounts without internal read rights (staff get staff notifications instead).
   */
  async citizenWatchers(db: NotificationDb, requestId: string): Promise<string[]> {
    const users = await db.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [
          { requestsCreated: { some: { id: requestId } } },
          { requestFollows: { some: { requestId } } },
        ],
        NOT: [
          withPermission(Permission.REQUESTS_READ),
          withPermission(Permission.WORK_ORDERS_READ),
          withPermission(Permission.WORK_ORDERS_READ_ASSIGNED),
        ],
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  // ─── Inbox ──────────────────────────────────────────────────────────────

  private ownWhere(actor: AuthUser): Prisma.NotificationWhereInput {
    const types = visibleNotificationTypes(actor.permissions);
    return {
      userId: actor.id,
      ...(types && { type: { in: types as DbNotificationType[] } }),
    };
  }

  async list(
    actor: AuthUser,
    query: ListNotificationsQueryDto,
  ): Promise<{ items: NotificationItem[]; meta: NotificationListMeta }> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const own = this.ownWhere(actor);
    const where: Prisma.NotificationWhereInput = query.unread ? { ...own, readAt: null } : own;
    const [rows, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { ...own, readAt: null } }),
    ]);
    return {
      items: rows.map(toItem),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        unreadCount,
      },
    };
  }

  async markRead(actor: AuthUser, id: string): Promise<NotificationItem> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const where = { ...this.ownWhere(actor), id };
    await db.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await db.notification.findFirst({ where, select });
    if (!row) throw notificationNotFound();
    return toItem(row);
  }

  async markAllRead(actor: AuthUser): Promise<{ updated: number }> {
    const { count } = await this.prisma.forTenant(actor.municipalityId).notification.updateMany({
      where: { ...this.ownWhere(actor), readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
