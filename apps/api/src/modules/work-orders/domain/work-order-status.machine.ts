import { Permission, WORK_ORDER_STATUS_LABELS, WorkOrderStatus } from '@kent360/shared-types';

/**
 * Work order lifecycle – the single source of truth (ARCHITECTURE §6.2).
 *
 *   CREATED ─assign─► ASSIGNED ─► ACCEPTED ─► EN_ROUTE ─► ON_SITE ─► IN_PROGRESS ─► COMPLETED ─► VERIFIED
 *                                                                     ▲   │  ▲            │
 *                                                            WAITING ─┘   ▼  └─ (returned)┘
 *   CREATED / ASSIGNED / ACCEPTED ─► CANCELLED
 *
 * Who may trigger a step:
 *   • `assignment` – only through POST /work-orders/:id/assignment (CREATED → ASSIGNED);
 *   • `executor`   – the person doing the work: the assignee, or a member of the assigned
 *                    team when no person is assigned, or the leader of the assigned team;
 *   • `supervisor` – anyone holding the permission within their object scope (manager of
 *                    the department, municipality admin).
 */
export type WorkOrderActorKind = 'assignment' | 'executor' | 'supervisor';

/** Timeline event written for the step (WorkOrderEventType). */
export type WorkOrderStepEvent =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'STARTED'
  | 'WAITING'
  | 'RESUMED'
  | 'COMPLETED'
  | 'VERIFIED'
  | 'RETURNED'
  | 'CANCELLED';

export interface WorkOrderTransitionRule {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  actor: WorkOrderActorKind;
  permission: Permission;
  event: WorkOrderStepEvent;
  label: string;
  requiresReason?: boolean;
  /** The device position is checked against the work order location (§6.4). */
  requiresLocation?: boolean;
  /** completionDescription + at least one AFTER photo. */
  requiresCompletion?: boolean;
}

const S = WorkOrderStatus;
const EXECUTE = Permission.WORK_ORDERS_EXECUTE;
const CANCEL = Permission.WORK_ORDERS_CREATE;

export const WORK_ORDER_TRANSITIONS: readonly WorkOrderTransitionRule[] = [
  {
    from: S.CREATED,
    to: S.ASSIGNED,
    actor: 'assignment',
    permission: Permission.WORK_ORDERS_ASSIGN,
    event: 'ASSIGNED',
    label: 'Ata',
  },
  {
    from: S.ASSIGNED,
    to: S.ACCEPTED,
    actor: 'executor',
    permission: EXECUTE,
    event: 'ACCEPTED',
    label: 'Kabul et',
  },
  {
    from: S.ACCEPTED,
    to: S.EN_ROUTE,
    actor: 'executor',
    permission: EXECUTE,
    event: 'EN_ROUTE',
    label: 'Yola çık',
  },
  {
    from: S.EN_ROUTE,
    to: S.ON_SITE,
    actor: 'executor',
    permission: EXECUTE,
    event: 'ON_SITE',
    label: 'Sahaya vardım',
    requiresLocation: true,
  },
  {
    from: S.ON_SITE,
    to: S.IN_PROGRESS,
    actor: 'executor',
    permission: EXECUTE,
    event: 'STARTED',
    label: 'İşe başla',
    requiresLocation: true,
  },
  {
    from: S.IN_PROGRESS,
    to: S.WAITING,
    actor: 'executor',
    permission: EXECUTE,
    event: 'WAITING',
    label: 'Beklemeye al',
    requiresReason: true,
  },
  {
    from: S.WAITING,
    to: S.IN_PROGRESS,
    actor: 'executor',
    permission: EXECUTE,
    event: 'RESUMED',
    label: 'Devam et',
    requiresLocation: true,
  },
  {
    from: S.IN_PROGRESS,
    to: S.COMPLETED,
    actor: 'executor',
    permission: Permission.WORK_ORDERS_COMPLETE,
    event: 'COMPLETED',
    label: 'İşi tamamla',
    requiresCompletion: true,
  },
  {
    from: S.COMPLETED,
    to: S.VERIFIED,
    actor: 'supervisor',
    permission: Permission.WORK_ORDERS_VERIFY,
    event: 'VERIFIED',
    label: 'Doğrula',
  },
  {
    from: S.COMPLETED,
    to: S.IN_PROGRESS,
    actor: 'supervisor',
    permission: Permission.WORK_ORDERS_VERIFY,
    event: 'RETURNED',
    label: 'Geri gönder',
    requiresReason: true,
  },
  ...[S.CREATED, S.ASSIGNED, S.ACCEPTED].map((from): WorkOrderTransitionRule => ({
    from,
    to: S.CANCELLED,
    actor: 'supervisor',
    permission: CANCEL,
    event: 'CANCELLED',
    label: 'İptal et',
    requiresReason: true,
  })),
];

/** VERIFIED and CANCELLED end the lifecycle (the database refuses changes too). */
export const WORK_ORDER_FINAL_STATUSES: ReadonlySet<WorkOrderStatus> = new Set([
  S.VERIFIED,
  S.CANCELLED,
]);

/** Field work is over: no more photos, no reassignment. */
export const WORK_ORDER_CLOSED_STATUSES: ReadonlySet<WorkOrderStatus> = new Set([
  S.COMPLETED,
  S.VERIFIED,
  S.CANCELLED,
]);

/**
 * Where (re)assignment is possible, and the status it leads to. A new assignee must
 * accept again (ACCEPTED → ASSIGNED); a WAITING job stays WAITING and the new assignee
 * resumes it on site. Once someone is on the way or working, the job is first put on
 * WAITING – so the on-site proof always belongs to the person who did the work.
 */
export const ASSIGNABLE_STATUSES: ReadonlyMap<WorkOrderStatus, WorkOrderStatus> = new Map([
  [S.CREATED, S.ASSIGNED],
  [S.ASSIGNED, S.ASSIGNED],
  [S.ACCEPTED, S.ASSIGNED],
  [S.WAITING, S.WAITING],
]);

/** Timestamp column set when a step happens. */
export const STEP_TIMESTAMP: Partial<
  Record<
    WorkOrderStepEvent,
    | 'acceptedAt'
    | 'enRouteAt'
    | 'arrivedAt'
    | 'startedAt'
    | 'completedAt'
    | 'verifiedAt'
    | 'cancelledAt'
  >
> = {
  ACCEPTED: 'acceptedAt',
  EN_ROUTE: 'enRouteAt',
  ON_SITE: 'arrivedAt',
  STARTED: 'startedAt',
  COMPLETED: 'completedAt',
  VERIFIED: 'verifiedAt',
  CANCELLED: 'cancelledAt',
};

export function findWorkOrderTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): WorkOrderTransitionRule | undefined {
  return WORK_ORDER_TRANSITIONS.find((rule) => rule.from === from && rule.to === to);
}

export interface WorkOrderActorContext {
  permissions: ReadonlySet<string>;
  /** The actor does the work of this work order (see `executor` above). */
  isExecutor: boolean;
}

function allowedFor(rule: WorkOrderTransitionRule, actor: WorkOrderActorContext): boolean {
  if (rule.actor === 'assignment') return false;
  if (!actor.permissions.has(rule.permission)) return false;
  return rule.actor === 'supervisor' || actor.isExecutor;
}

/** Steps the actor may take now – drives the buttons; the API re-checks everything. */
export function availableWorkOrderTransitions(
  from: WorkOrderStatus,
  actor: WorkOrderActorContext,
): WorkOrderTransitionRule[] {
  return WORK_ORDER_TRANSITIONS.filter((rule) => rule.from === from && allowedFor(rule, actor));
}

export type WorkOrderTransitionCheck =
  | { ok: true; rule: WorkOrderTransitionRule }
  | {
      ok: false;
      reason:
        | 'INVALID'
        | 'ASSIGNMENT_ONLY'
        | 'FORBIDDEN'
        | 'NOT_EXECUTOR'
        | 'REASON_REQUIRED'
        | 'COMPLETION_DESCRIPTION_REQUIRED';
      allowed: WorkOrderStatus[];
    };

export function checkWorkOrderTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  actor: WorkOrderActorContext,
  input: { reason?: string; completionDescription?: string },
): WorkOrderTransitionCheck {
  const allowed = availableWorkOrderTransitions(from, actor).map((rule) => rule.to);
  const rule = findWorkOrderTransition(from, to);
  if (!rule) return { ok: false, reason: 'INVALID', allowed };
  if (rule.actor === 'assignment') return { ok: false, reason: 'ASSIGNMENT_ONLY', allowed };
  if (!actor.permissions.has(rule.permission)) return { ok: false, reason: 'FORBIDDEN', allowed };
  if (rule.actor === 'executor' && !actor.isExecutor)
    return { ok: false, reason: 'NOT_EXECUTOR', allowed };
  if (rule.requiresReason && !input.reason?.trim())
    return { ok: false, reason: 'REASON_REQUIRED', allowed };
  if (rule.requiresCompletion && !input.completionDescription?.trim())
    return { ok: false, reason: 'COMPLETION_DESCRIPTION_REQUIRED', allowed };
  return { ok: true, rule };
}

/** Timeline wording, e.g. "Durum: Kabul Edildi → Yolda". */
export function workOrderStatusDescription(from: WorkOrderStatus, to: WorkOrderStatus): string {
  return `Durum: ${WORK_ORDER_STATUS_LABELS[from]} → ${WORK_ORDER_STATUS_LABELS[to]}`;
}
