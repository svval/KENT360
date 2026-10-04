import { RequestStatus } from '@kent360/shared-types';

/**
 * Request ↔ work order synchronisation (ARCHITECTURE §6.2) – one table, one direction:
 * work order steps move the request; the request never moves a work order.
 *
 * A request has at most one active work order at a time (DB index
 * work_orders_one_active_per_request), so "all work orders completed" is simply
 * "its active work order completed".
 *
 * | Work order step              | Request                                   |
 * | ---------------------------- | ----------------------------------------- |
 * | created                      | ASSIGNED_TO_DEPARTMENT → WORK_ORDER_CREATED |
 * | started / resumed (IN_PROG.) | WORK_ORDER_CREATED → IN_PROGRESS          |
 * | completed                    | IN_PROGRESS → RESOLVED (resolvedAt set)   |
 * | verified                     | RESOLVED → VERIFIED                       |
 * | returned by the supervisor   | RESOLVED → IN_PROGRESS (resolvedAt cleared) |
 * | cancelled                    | WORK_ORDER_CREATED → ASSIGNED_TO_DEPARTMENT |
 *
 * Closing (VERIFIED → CLOSED) stays a separate, manual request step.
 * Every pair is a `system` transition of the request state machine (unit-tested).
 */
export type WorkOrderSyncEvent =
  'CREATED' | 'STARTED' | 'RESUMED' | 'COMPLETED' | 'VERIFIED' | 'RETURNED' | 'CANCELLED';

export interface RequestSyncStep {
  from: RequestStatus;
  to: RequestStatus;
  /** Citizen-facing timeline text (no staff names, no internal detail). */
  description: string;
}

const R = RequestStatus;

export const WORK_ORDER_REQUEST_SYNC: Readonly<Record<WorkOrderSyncEvent, RequestSyncStep>> = {
  CREATED: {
    from: R.ASSIGNED_TO_DEPARTMENT,
    to: R.WORK_ORDER_CREATED,
    description: 'Talebiniz için saha iş emri oluşturuldu.',
  },
  STARTED: {
    from: R.WORK_ORDER_CREATED,
    to: R.IN_PROGRESS,
    description: 'Saha ekibi çalışmaya başladı.',
  },
  RESUMED: {
    from: R.WORK_ORDER_CREATED,
    to: R.IN_PROGRESS,
    description: 'Saha ekibi çalışmaya başladı.',
  },
  COMPLETED: {
    from: R.IN_PROGRESS,
    to: R.RESOLVED,
    description: 'Saha çalışması tamamlandı, sorun giderildi.',
  },
  VERIFIED: {
    from: R.RESOLVED,
    to: R.VERIFIED,
    description: 'Çözüm belediye tarafından doğrulandı.',
  },
  RETURNED: {
    from: R.RESOLVED,
    to: R.IN_PROGRESS,
    description: 'Çözüm yeniden ele alındı, saha çalışması sürüyor.',
  },
  CANCELLED: {
    from: R.WORK_ORDER_CREATED,
    to: R.ASSIGNED_TO_DEPARTMENT,
    description: 'İş emri iptal edildi; talep müdürlük tarafından yeniden planlanacak.',
  },
};

/**
 * The request step a work order event causes, or null when the request is already
 * past it (e.g. RESUMED after an earlier start: the request is IN_PROGRESS already).
 */
export function requestSyncStep(
  event: WorkOrderSyncEvent,
  requestStatus: RequestStatus,
): RequestSyncStep | null {
  const step = WORK_ORDER_REQUEST_SYNC[event];
  return step.from === requestStatus ? step : null;
}

/** Work order events that must move the request (creating a work order needs the request ready). */
export const REQUIRED_SYNC_EVENTS: ReadonlySet<WorkOrderSyncEvent> = new Set([
  'CREATED',
  'COMPLETED',
  'VERIFIED',
  'RETURNED',
  'CANCELLED',
]);
