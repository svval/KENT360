/**
 * Phase 13 demo inbox – DEMO DATA. Gives every demo account a small, realistic inbox
 * built from the seeded records with the same message builders the API uses, so the
 * notification bell is not empty on the first login. Once per user (marker: the
 * SYSTEM welcome notification). Real notifications are then written by the workflows
 * themselves and by the SLA alert sweep.
 */
import { type PrismaClient } from '../src/generated/prisma/client';
import {
  citizenStatusChange,
  type NotificationContent,
  requestAssignedNotification,
  requestCriticalNotification,
  slaNotification,
  workOrderCompletedNotification,
} from '../src/modules/notifications/domain/notification-rules';

const HOUR = 3_600_000;
const WELCOME_TITLE = "KENT360'a hoş geldiniz";
const CLOSED = ['RESOLVED', 'VERIFIED', 'CLOSED', 'REJECTED'] as const;

export async function seedDemoNotifications(
  prisma: PrismaClient,
  municipalityId: string,
): Promise<number> {
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: {
      municipalityId,
      email: {
        in: [
          'admin@kent360.local',
          'manager@kent360.local',
          'leader@kent360.local',
          'field@kent360.local',
          'citizen@kent360.local',
        ],
      },
    },
    select: { id: true, email: true, departmentId: true },
  });
  const open = { municipalityId, status: { notIn: [...CLOSED] } };
  const requestSelect = {
    id: true,
    publicNumber: true,
    title: true,
    status: true,
    priority: true,
    category: { select: { name: true } },
    neighborhood: { select: { name: true } },
    department: { select: { name: true } },
  } as const;

  let created = 0;
  for (const user of users) {
    const seeded = await prisma.notification.count({
      where: { userId: user.id, type: 'SYSTEM', title: WELCOME_TITLE },
    });
    if (seeded > 0) continue;

    const items: NotificationContent[] = [];
    const role = user.email.split('@')[0];
    if (role === 'admin') {
      const breached = await prisma.request.findMany({
        where: { ...open, slaDueAt: { lt: new Date(now) } },
        select: requestSelect,
        orderBy: { slaDueAt: 'desc' },
        take: 3,
      });
      const critical = await prisma.request.findMany({
        where: { ...open, priority: 'CRITICAL' },
        select: requestSelect,
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      items.push(
        ...breached.map((r) =>
          slaNotification({
            kind: 'SLA_BREACHED',
            requestId: r.id,
            publicNumber: r.publicNumber,
            title: r.title,
          }),
        ),
        ...critical.map((r) =>
          requestCriticalNotification({
            requestId: r.id,
            publicNumber: r.publicNumber,
            title: r.title,
          }),
        ),
      );
    } else if (role === 'manager' && user.departmentId) {
      const latest = await prisma.request.findMany({
        where: { ...open, departmentId: user.departmentId },
        select: requestSelect,
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      const atRisk = await prisma.request.findMany({
        where: {
          ...open,
          departmentId: user.departmentId,
          slaAtRiskAt: { lte: new Date(now) },
          slaDueAt: { gte: new Date(now) },
        },
        select: requestSelect,
        take: 2,
      });
      const completed = await prisma.workOrder.findMany({
        where: { municipalityId, departmentId: user.departmentId, status: 'COMPLETED' },
        select: { id: true, publicNumber: true },
        orderBy: { completedAt: 'desc' },
        take: 2,
      });
      items.push(
        ...latest.map((r) =>
          requestAssignedNotification({
            requestId: r.id,
            publicNumber: r.publicNumber,
            categoryName: r.category?.name ?? 'Talep',
            neighborhoodName: r.neighborhood?.name ?? null,
            departmentName: r.department?.name ?? '',
            priority: r.priority,
          }),
        ),
        ...atRisk.map((r) =>
          slaNotification({
            kind: 'SLA_AT_RISK',
            requestId: r.id,
            publicNumber: r.publicNumber,
            title: r.title,
          }),
        ),
        ...completed.map((w) =>
          workOrderCompletedNotification({ workOrderId: w.id, publicNumber: w.publicNumber }),
        ),
      );
    } else if (role === 'leader' || role === 'field') {
      const assigned = await prisma.workOrder.findMany({
        where: {
          municipalityId,
          status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'WAITING'] },
          OR: [{ assignedUserId: user.id }, { fieldTeam: { leaderId: user.id } }],
        },
        select: { id: true, publicNumber: true, title: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      items.push(
        ...assigned.map((w): NotificationContent => ({
          type: 'WORK_ORDER_ASSIGNED',
          title: `Yeni iş emri: ${w.publicNumber}`,
          message: `${w.title} için bir iş emri atandı.`,
          entityType: 'WorkOrder',
          entityId: w.id,
        })),
      );
    } else if (role === 'citizen') {
      const own = await prisma.request.findMany({
        where: { municipalityId, createdById: user.id, status: { not: 'NEW' } },
        select: requestSelect,
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      items.push(
        ...own.map((r) =>
          citizenStatusChange({ requestId: r.id, publicNumber: r.publicNumber, to: r.status }),
        ),
      );
    }

    // Newest first in the inbox; the older half is already read.
    const rows = items.map((content, index) => {
      const createdAt = new Date(now - (index + 1) * 3 * HOUR);
      return {
        municipalityId,
        userId: user.id,
        type: content.type,
        title: content.title,
        body: content.message,
        entityType: content.entityType,
        entityId: content.entityId,
        createdAt,
        readAt: index >= Math.ceil(items.length / 2) ? new Date(createdAt.getTime() + HOUR) : null,
      };
    });
    rows.push({
      municipalityId,
      userId: user.id,
      type: 'SYSTEM',
      title: WELCOME_TITLE,
      body: 'Atanan işler, SLA uyarıları ve takip ettiğiniz taleplerdeki gelişmeler burada görünür.',
      entityType: null as never,
      entityId: null as never,
      createdAt: new Date(now - 72 * HOUR),
      readAt: new Date(now - 71 * HOUR),
    });
    await prisma.notification.createMany({ data: rows });
    created += rows.length;
  }
  return created;
}
