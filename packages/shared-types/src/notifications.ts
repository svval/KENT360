/** In-app notification types (DB enum NotificationType). */
export const NotificationType = {
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_CRITICAL: 'REQUEST_CRITICAL',
  REQUEST_STATUS_CHANGED: 'REQUEST_STATUS_CHANGED',
  REQUEST_ASSIGNED: 'REQUEST_ASSIGNED',
  REQUEST_VERIFIED: 'REQUEST_VERIFIED',
  REQUEST_UPDATED: 'REQUEST_UPDATED',
  WORK_ORDER_CREATED: 'WORK_ORDER_CREATED',
  WORK_ORDER_ASSIGNED: 'WORK_ORDER_ASSIGNED',
  WORK_ORDER_COMPLETED: 'WORK_ORDER_COMPLETED',
  WORK_ORDER_RETURNED: 'WORK_ORDER_RETURNED',
  SLA_AT_RISK: 'SLA_AT_RISK',
  SLA_BREACHED: 'SLA_BREACHED',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  REQUEST_CREATED: 'Yeni talep',
  REQUEST_CRITICAL: 'Kritik talep',
  REQUEST_STATUS_CHANGED: 'Talep durumu',
  REQUEST_ASSIGNED: 'Talep atandı',
  REQUEST_VERIFIED: 'Talep doğrulandı',
  REQUEST_UPDATED: 'Talep güncellemesi',
  WORK_ORDER_CREATED: 'İş emri oluşturuldu',
  WORK_ORDER_ASSIGNED: 'İş emri atandı',
  WORK_ORDER_COMPLETED: 'İş emri tamamlandı',
  WORK_ORDER_RETURNED: 'İş emri iade edildi',
  SLA_AT_RISK: 'SLA riskte',
  SLA_BREACHED: 'SLA aşıldı',
  SYSTEM: 'Sistem',
};

/**
 * Types a citizen (no internal read permission) may ever receive. The inbox filters by
 * this list as a second line of defence: internal staff notifications never reach them.
 */
export const CITIZEN_NOTIFICATION_TYPES: readonly NotificationType[] = [
  NotificationType.REQUEST_UPDATED,
  NotificationType.REQUEST_VERIFIED,
  NotificationType.SYSTEM,
];

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  entityType: 'Request' | 'WorkOrder' | null;
  entityId: string | null;
}

/** `meta` of GET /notifications – pagination plus the caller's unread count. */
export interface NotificationListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
}
