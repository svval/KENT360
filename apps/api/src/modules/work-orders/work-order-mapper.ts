import {
  evaluateSla,
  type RequestSla,
  WorkOrderStatus,
  type WorkOrderSummary,
  type WorkOrderTimelineEvent,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';

const person = { select: { id: true, firstName: true, lastName: true } } as const;

/** Columns and relations of a list row – one query, no N+1. */
export const workOrderSummarySelect = {
  id: true,
  publicNumber: true,
  title: true,
  status: true,
  priority: true,
  address: true,
  createdAt: true,
  slaDueAt: true,
  completedAt: true,
  cancelledAt: true,
  request: {
    select: {
      id: true,
      publicNumber: true,
      slaAtRiskAt: true,
      category: { select: { id: true, name: true } },
      neighborhood: { select: { id: true, name: true } },
    },
  },
  department: { select: { id: true, name: true, code: true } },
  fieldTeam: { select: { id: true, name: true, code: true } },
  assignedUser: person,
} satisfies Prisma.WorkOrderSelect;

export const workOrderDetailSelect = {
  ...workOrderSummarySelect,
  description: true,
  latitude: true,
  longitude: true,
  departmentId: true,
  fieldTeamId: true,
  assignedUserId: true,
  requestId: true,
  completionDescription: true,
  cancellationReason: true,
  acceptedAt: true,
  enRouteAt: true,
  arrivedAt: true,
  startedAt: true,
  verifiedAt: true,
  updatedAt: true,
  request: {
    select: {
      ...workOrderSummarySelect.request.select,
      status: true,
      description: true,
      media: {
        select: { id: true, storageKey: true, mimeType: true, sizeBytes: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  media: {
    select: {
      id: true,
      type: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  assignments: {
    select: {
      id: true,
      note: true,
      assignedAt: true,
      unassignedAt: true,
      fieldTeam: { select: { id: true, name: true } },
      assignee: person,
      assignedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
  },
  history: {
    select: {
      id: true,
      eventType: true,
      description: true,
      oldStatus: true,
      newStatus: true,
      createdAt: true,
      performedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.WorkOrderSelect;

export type WorkOrderSummaryRecord = Prisma.WorkOrderGetPayload<{
  select: typeof workOrderSummarySelect;
}>;
export type WorkOrderDetailRecord = Prisma.WorkOrderGetPayload<{
  select: typeof workOrderDetailSelect;
}>;

export const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`;

/**
 * The SLA belongs to the source request (snapshot copied at creation); for the work order
 * the clock stops when the work is completed. Cancelled work orders have no SLA status.
 */
export function workOrderSla(record: WorkOrderSummaryRecord, now: Date): RequestSla {
  const dueAt = record.slaDueAt?.toISOString() ?? null;
  const atRiskAt = record.request?.slaAtRiskAt?.toISOString() ?? null;
  if (record.status === WorkOrderStatus.CANCELLED) {
    return { dueAt, atRiskAt, status: null, remainingMinutes: null };
  }
  const evaluation = evaluateSla(
    {
      slaDueAt: record.slaDueAt,
      slaAtRiskAt: record.request?.slaAtRiskAt ?? null,
      completedAt: record.completedAt,
    },
    now,
  );
  return { dueAt, atRiskAt, ...evaluation };
}

export function toWorkOrderSummary(record: WorkOrderSummaryRecord, now: Date): WorkOrderSummary {
  return {
    id: record.id,
    publicNumber: record.publicNumber,
    title: record.title,
    status: record.status,
    priority: record.priority,
    request: record.request
      ? { id: record.request.id, publicNumber: record.request.publicNumber }
      : null,
    category: record.request?.category ?? null,
    neighborhood: record.request?.neighborhood ?? null,
    department: record.department,
    fieldTeam: record.fieldTeam,
    assignedUser: record.assignedUser
      ? { id: record.assignedUser.id, fullName: fullName(record.assignedUser) }
      : null,
    address: record.address,
    sla: workOrderSla(record, now),
    createdAt: record.createdAt.toISOString(),
  };
}

export function toWorkOrderTimeline(
  history: WorkOrderDetailRecord['history'],
): WorkOrderTimelineEvent[] {
  return history.map((event) => ({
    id: event.id,
    type: event.eventType,
    description: event.description,
    oldStatus: event.oldStatus,
    newStatus: event.newStatus,
    createdAt: event.createdAt.toISOString(),
    performedBy: event.performedBy ? fullName(event.performedBy) : null,
  }));
}
