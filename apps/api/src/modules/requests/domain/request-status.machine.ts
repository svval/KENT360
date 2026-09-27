import { Permission, REQUEST_STATUS_LABELS, RequestStatus } from '@kent360/shared-types';

/**
 * Request lifecycle – the single source of truth (ARCHITECTURE §6.1).
 *
 * The full graph is declared now, so later phases only switch transitions on instead of
 * re-shaping the machine:
 *   • `manual`: a person triggers it through POST /requests/:id/transitions (Phase 5);
 *   • `system`: another workflow triggers it – AI analysis (Phase 11), work orders
 *     (Phase 6), verification/closing (Phase 6). The manual endpoint refuses them.
 */
export type TransitionTrigger = 'manual' | 'system';

export interface TransitionRule {
  from: RequestStatus;
  to: RequestStatus;
  trigger: TransitionTrigger;
  /** Permission a person needs for a manual transition. */
  permission?: Permission;
  requiresReason?: boolean;
  /** Button / timeline wording. */
  label: string;
}

const S = RequestStatus;

export const REQUEST_TRANSITIONS: readonly TransitionRule[] = [
  // Intake & review (Phase 5)
  {
    from: S.NEW,
    to: S.UNDER_REVIEW,
    trigger: 'manual',
    permission: Permission.REQUESTS_UPDATE,
    label: 'İncelemeye al',
  },
  {
    from: S.NEW,
    to: S.REJECTED,
    trigger: 'manual',
    permission: Permission.REQUESTS_UPDATE,
    requiresReason: true,
    label: 'Reddet',
  },
  {
    from: S.UNDER_REVIEW,
    to: S.ASSIGNED_TO_DEPARTMENT,
    trigger: 'manual',
    permission: Permission.REQUESTS_ASSIGN,
    label: 'Müdürlüğe ata',
  },
  {
    from: S.UNDER_REVIEW,
    to: S.REJECTED,
    trigger: 'manual',
    permission: Permission.REQUESTS_UPDATE,
    requiresReason: true,
    label: 'Reddet',
  },
  {
    from: S.ASSIGNED_TO_DEPARTMENT,
    to: S.UNDER_REVIEW,
    trigger: 'manual',
    permission: Permission.REQUESTS_ASSIGN,
    requiresReason: true,
    label: 'İncelemeye geri al',
  },
  {
    from: S.ASSIGNED_TO_DEPARTMENT,
    to: S.REJECTED,
    trigger: 'manual',
    permission: Permission.REQUESTS_UPDATE,
    requiresReason: true,
    label: 'Reddet',
  },

  // AI analysis (Phase 11): NEW → AI_ANALYZED is done by the classifier; afterwards people continue.
  { from: S.NEW, to: S.AI_ANALYZED, trigger: 'system', label: 'AI analizi tamamlandı' },
  {
    from: S.AI_ANALYZED,
    to: S.UNDER_REVIEW,
    trigger: 'manual',
    permission: Permission.REQUESTS_UPDATE,
    label: 'İncelemeye al',
  },
  {
    from: S.AI_ANALYZED,
    to: S.ASSIGNED_TO_DEPARTMENT,
    trigger: 'manual',
    permission: Permission.REQUESTS_ASSIGN,
    label: 'Müdürlüğe ata',
  },
  {
    from: S.AI_ANALYZED,
    to: S.REJECTED,
    trigger: 'manual',
    permission: Permission.REQUESTS_UPDATE,
    requiresReason: true,
    label: 'Reddet',
  },

  // Work orders (Phase 6)
  {
    from: S.ASSIGNED_TO_DEPARTMENT,
    to: S.WORK_ORDER_CREATED,
    trigger: 'system',
    label: 'İş emri oluşturuldu',
  },
  {
    from: S.WORK_ORDER_CREATED,
    to: S.IN_PROGRESS,
    trigger: 'system',
    label: 'Saha çalışması başladı',
  },
  {
    from: S.WORK_ORDER_CREATED,
    to: S.ASSIGNED_TO_DEPARTMENT,
    trigger: 'system',
    label: 'İş emirleri iptal edildi',
  },
  { from: S.IN_PROGRESS, to: S.RESOLVED, trigger: 'system', label: 'Çözüldü' },
  { from: S.RESOLVED, to: S.VERIFIED, trigger: 'system', label: 'Doğrulandı' },
  { from: S.RESOLVED, to: S.IN_PROGRESS, trigger: 'system', label: 'Çözüm kabul edilmedi' },
  { from: S.VERIFIED, to: S.CLOSED, trigger: 'system', label: 'Kapatıldı' },
];

/** CLOSED and REJECTED end the lifecycle. */
export const TERMINAL_STATUSES: ReadonlySet<RequestStatus> = new Set([S.CLOSED, S.REJECTED]);

/** Statuses in which the request no longer runs against its SLA. */
export const SLA_STOPPED_STATUSES: ReadonlySet<RequestStatus> = new Set([
  S.RESOLVED,
  S.VERIFIED,
  S.CLOSED,
  S.REJECTED,
]);

export function findTransition(from: RequestStatus, to: RequestStatus): TransitionRule | undefined {
  return REQUEST_TRANSITIONS.find((rule) => rule.from === from && rule.to === to);
}

export type TransitionCheck =
  | { ok: true; rule: TransitionRule }
  | {
      ok: false;
      reason: 'INVALID' | 'SYSTEM_ONLY' | 'FORBIDDEN' | 'REASON_REQUIRED';
      allowed: RequestStatus[];
    };

/** Manual transitions available from `from` for someone holding `permissions`. */
export function manualTransitions(
  from: RequestStatus,
  permissions: ReadonlySet<string>,
): TransitionRule[] {
  return REQUEST_TRANSITIONS.filter(
    (rule) =>
      rule.from === from &&
      rule.trigger === 'manual' &&
      rule.permission !== undefined &&
      permissions.has(rule.permission),
  );
}

export function checkManualTransition(
  from: RequestStatus,
  to: RequestStatus,
  permissions: ReadonlySet<string>,
  reason: string | undefined,
): TransitionCheck {
  const allowed = manualTransitions(from, permissions).map((rule) => rule.to);
  const rule = findTransition(from, to);
  if (!rule) return { ok: false, reason: 'INVALID', allowed };
  if (rule.trigger !== 'manual') return { ok: false, reason: 'SYSTEM_ONLY', allowed };
  if (!rule.permission || !permissions.has(rule.permission))
    return { ok: false, reason: 'FORBIDDEN', allowed };
  if (rule.requiresReason && !reason?.trim())
    return { ok: false, reason: 'REASON_REQUIRED', allowed };
  return { ok: true, rule };
}

/** Timeline wording of a status change, e.g. "Durum: Yeni → İncelemede". */
export function statusChangeDescription(from: RequestStatus, to: RequestStatus): string {
  return `Durum: ${REQUEST_STATUS_LABELS[from]} → ${REQUEST_STATUS_LABELS[to]}`;
}
