import {
  evaluateSla,
  LOCATION_OUTSIDE_NEIGHBORHOODS,
  type RequestSla,
  RequestStatus,
  type RequestSummary,
  type RequestTimelineEvent,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';

/** Columns and relations of a list row – one query, no N+1. */
export const requestSummarySelect = {
  id: true,
  publicNumber: true,
  title: true,
  status: true,
  priority: true,
  source: true,
  address: true,
  createdAt: true,
  slaDueAt: true,
  slaAtRiskAt: true,
  resolvedAt: true,
  closedAt: true,
  category: {
    select: { id: true, name: true, code: true, parent: { select: { id: true, name: true } } },
  },
  department: { select: { id: true, name: true, code: true } },
  neighborhood: { select: { id: true, name: true, code: true } },
  _count: { select: { media: true } },
} satisfies Prisma.RequestSelect;

export const requestDetailSelect = {
  ...requestSummarySelect,
  description: true,
  latitude: true,
  longitude: true,
  rejectionReason: true,
  createdById: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true, status: true } },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  },
  media: {
    select: { id: true, storageKey: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
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
} satisfies Prisma.RequestSelect;

export type RequestSummaryRecord = Prisma.RequestGetPayload<{
  select: typeof requestSummarySelect;
}>;
export type RequestDetailRecord = Prisma.RequestGetPayload<{ select: typeof requestDetailSelect }>;

/** The SLA clock stops when a request is resolved (or closed); rejected ones have none. */
export function slaOf(
  record: Pick<
    RequestSummaryRecord,
    'status' | 'slaDueAt' | 'slaAtRiskAt' | 'resolvedAt' | 'closedAt'
  >,
  now: Date,
): RequestSla {
  const dueAt = record.slaDueAt?.toISOString() ?? null;
  const atRiskAt = record.slaAtRiskAt?.toISOString() ?? null;
  if (record.status === RequestStatus.REJECTED) {
    return { dueAt, atRiskAt, status: null, remainingMinutes: null };
  }
  const evaluation = evaluateSla(
    {
      slaDueAt: record.slaDueAt,
      slaAtRiskAt: record.slaAtRiskAt,
      completedAt: record.resolvedAt ?? record.closedAt,
    },
    now,
  );
  return { dueAt, atRiskAt, ...evaluation };
}

export function toRequestSummary(record: RequestSummaryRecord, now: Date): RequestSummary {
  return {
    id: record.id,
    publicNumber: record.publicNumber,
    title: record.title,
    status: record.status,
    priority: record.priority,
    source: record.source,
    category: record.category,
    department: record.department,
    neighborhood: record.neighborhood,
    address: record.address,
    sla: slaOf(record, now),
    mediaCount: record._count.media,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Citizens see what happened, not which employee did it. */
export function toTimeline(
  history: RequestDetailRecord['history'],
  showPerformer: boolean,
): RequestTimelineEvent[] {
  return history.map((event) => ({
    id: event.id,
    type: event.eventType,
    description: event.description,
    oldStatus: event.oldStatus,
    newStatus: event.newStatus,
    createdAt: event.createdAt.toISOString(),
    performedBy:
      showPerformer && event.performedBy
        ? `${event.performedBy.firstName} ${event.performedBy.lastName}`
        : null,
  }));
}

export function locationNotice(neighborhoodId: string | null): string | null {
  return neighborhoodId ? null : LOCATION_OUTSIDE_NEIGHBORHOODS;
}
