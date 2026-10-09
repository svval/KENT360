import {
  CITIZEN_NOTIFICATION_TYPES,
  NotificationType,
  Permission,
  type Priority,
  REQUEST_STATUS_LABELS,
  type RequestStatus,
} from '@kent360/shared-types';

/** What a notification says; recipients are resolved separately. */
export interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
  entityType: 'Request' | 'WorkOrder';
  entityId: string;
}

const TITLE_MAX = 200;
const MESSAGE_MAX = 1000;

/**
 * Recipients of one notification: unique, never the person who caused it (nobody is
 * notified about their own action).
 */
export function recipientsOf(
  userIds: readonly (string | null | undefined)[],
  actorId: string | null,
) {
  return [...new Set(userIds.filter((id): id is string => !!id && id !== actorId))];
}

/** Users with any internal read right see staff notifications; everyone else is a citizen. */
export function isInternalReader(permissions: ReadonlySet<string>): boolean {
  return (
    permissions.has(Permission.REQUESTS_READ) ||
    permissions.has(Permission.WORK_ORDERS_READ) ||
    permissions.has(Permission.WORK_ORDERS_READ_ASSIGNED)
  );
}

/** Notification types a user may see in the inbox (null = all). */
export function visibleNotificationTypes(
  permissions: ReadonlySet<string>,
): readonly NotificationType[] | null {
  return isInternalReader(permissions) ? null : CITIZEN_NOTIFICATION_TYPES;
}

const bounded = (content: NotificationContent): NotificationContent => ({
  ...content,
  title: content.title.slice(0, TITLE_MAX),
  message: content.message.slice(0, MESSAGE_MAX),
});

// ─── Staff ────────────────────────────────────────────────────────────────

export function requestAssignedNotification(input: {
  requestId: string;
  publicNumber: string;
  categoryName: string;
  neighborhoodName: string | null;
  departmentName: string;
  priority: Priority;
}): NotificationContent {
  const where = input.neighborhoodName ? ` · ${input.neighborhoodName}` : '';
  const critical = input.priority === 'CRITICAL' ? ' Öncelik: Kritik.' : '';
  return bounded({
    type: NotificationType.REQUEST_ASSIGNED,
    title: `Yeni talep: ${input.publicNumber}`,
    message: `${input.categoryName}${where} – ${input.departmentName} müdürlüğüne yönlendirildi.${critical}`,
    entityType: 'Request',
    entityId: input.requestId,
  });
}

/** Escalation to the municipality's administrators. */
export function requestCriticalNotification(input: {
  requestId: string;
  publicNumber: string;
  title: string;
}): NotificationContent {
  return bounded({
    type: NotificationType.REQUEST_CRITICAL,
    title: `Kritik talep: ${input.publicNumber}`,
    message: `${input.title} – kritik öncelikle açıldı.`,
    entityType: 'Request',
    entityId: input.requestId,
  });
}

export function workOrderCreatedNotification(input: {
  workOrderId: string;
  publicNumber: string;
  requestNumber: string;
}): NotificationContent {
  return bounded({
    type: NotificationType.WORK_ORDER_CREATED,
    title: `İş emri oluşturuldu: ${input.publicNumber}`,
    message: `${input.requestNumber} talebi için iş emri açıldı; ekip ataması bekleniyor.`,
    entityType: 'WorkOrder',
    entityId: input.workOrderId,
  });
}

export function workOrderCompletedNotification(input: {
  workOrderId: string;
  publicNumber: string;
}): NotificationContent {
  return bounded({
    type: NotificationType.WORK_ORDER_COMPLETED,
    title: `İş emri tamamlandı: ${input.publicNumber}`,
    message: 'Saha ekibi işi tamamladı; önce/sonra kanıtını inceleyip doğrulayın.',
    entityType: 'WorkOrder',
    entityId: input.workOrderId,
  });
}

export function workOrderReturnedNotification(input: {
  workOrderId: string;
  publicNumber: string;
  reason: string | null;
}): NotificationContent {
  return bounded({
    type: NotificationType.WORK_ORDER_RETURNED,
    title: `İş emri iade edildi: ${input.publicNumber}`,
    message: `Çözüm doğrulanmadı, iş yeniden ele alınmalı.${input.reason ? ` Gerekçe: ${input.reason}` : ''}`,
    entityType: 'WorkOrder',
    entityId: input.workOrderId,
  });
}

export function slaNotification(input: {
  kind: 'SLA_AT_RISK' | 'SLA_BREACHED';
  requestId: string;
  publicNumber: string;
  title: string;
}): NotificationContent {
  const breached = input.kind === 'SLA_BREACHED';
  return bounded({
    type: breached ? NotificationType.SLA_BREACHED : NotificationType.SLA_AT_RISK,
    title: `${breached ? 'SLA aşıldı' : 'SLA riskte'}: ${input.publicNumber}`,
    message: breached
      ? `${input.title} – çözüm süresi doldu.`
      : `${input.title} – çözüm süresinin son dilimine girildi.`,
    entityType: 'Request',
    entityId: input.requestId,
  });
}

// ─── Citizens (no staff names, no internal detail) ────────────────────────

export function citizenRequestUpdate(input: {
  requestId: string;
  publicNumber: string;
  /** Citizen-facing text, e.g. the request timeline entry. */
  description: string;
  verified?: boolean;
}): NotificationContent {
  return bounded({
    type: input.verified ? NotificationType.REQUEST_VERIFIED : NotificationType.REQUEST_UPDATED,
    title: input.verified
      ? `Talebiniz çözüldü: ${input.publicNumber}`
      : `Talebinizde gelişme: ${input.publicNumber}`,
    message: input.description,
    entityType: 'Request',
    entityId: input.requestId,
  });
}

export function citizenStatusChange(input: {
  requestId: string;
  publicNumber: string;
  to: RequestStatus;
  reason?: string;
}): NotificationContent {
  return citizenRequestUpdate({
    requestId: input.requestId,
    publicNumber: input.publicNumber,
    description: `Talebinizin durumu "${REQUEST_STATUS_LABELS[input.to]}" olarak güncellendi.${
      input.reason ? ` Açıklama: ${input.reason}` : ''
    }`,
  });
}
