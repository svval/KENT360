import {
  type ApiError,
  type ApiSuccess,
  type AuditLogItem,
  type NotificationItem,
  type NotificationListMeta,
  type PaginationMeta,
  type ReportSummary,
  type ReportType,
} from '@kent360/shared-types';
import { ApiRequestError, apiFetch } from '../api-client';
import { appConfig } from '../config';
import { getAccessToken, refreshSession } from '../session';

type Params = Record<string, string | number | boolean | undefined>;

function toQuery(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

// ─── Notifications ───────────────────────────────────────────────────────────

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params: Params) => ['notifications', 'list', params] as const,
};

/** The bell polls; no websocket/SSE in the MVP. */
export const NOTIFICATION_POLL_MS = 60_000;

export async function listNotifications(
  params: Params,
): Promise<{ data: NotificationItem[]; meta: NotificationListMeta }> {
  const res = await apiFetch<{ data: NotificationItem[]; meta: NotificationListMeta }>(
    `/api/v1/notifications${toQuery(params)}`,
  );
  return { data: res.data, meta: res.meta };
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  return (
    await apiFetch<ApiSuccess<NotificationItem>>(`/api/v1/notifications/${id}/read`, {
      method: 'PATCH',
    })
  ).data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return (
    await apiFetch<ApiSuccess<{ updated: number }>>('/api/v1/notifications/read-all', {
      method: 'POST',
    })
  ).data;
}

/** Deep link of a notification (null when it points nowhere). */
export function notificationHref(item: NotificationItem): string | null {
  if (!item.entityId) return null;
  if (item.entityType === 'Request') return `/requests/${item.entityId}`;
  if (item.entityType === 'WorkOrder') return `/work-orders/${item.entityId}`;
  return null;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportKeys = {
  summary: (params: Params) => ['reports', 'summary', params] as const,
};

export async function getReportSummary(params: Params): Promise<ReportSummary> {
  return (await apiFetch<ApiSuccess<ReportSummary>>(`/api/v1/reports/summary${toQuery(params)}`))
    .data;
}

/**
 * Downloads a CSV export with the in-memory access token (a plain link could not send
 * it) and saves it under the server's file name.
 */
export async function downloadReport(type: ReportType, params: Params): Promise<string> {
  const url = `${appConfig.apiUrl}/api/v1/reports/${type}.csv${toQuery(params)}`;
  const send = () => {
    const token = getAccessToken();
    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  let response: Response;
  try {
    response = await send();
    if (response.status === 401 && (await refreshSession())) response = await send();
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamıyor.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.code ?? 'HTTP_ERROR',
      body?.message ?? 'Rapor indirilemedi.',
    );
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `kent360-${type}.csv`;
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return filename;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export const auditKeys = {
  list: (params: Params) => ['audit', 'list', params] as const,
};

export async function listAuditLogs(
  params: Params,
): Promise<{ data: AuditLogItem[]; meta: PaginationMeta }> {
  const res = await apiFetch<{ data: AuditLogItem[]; meta: PaginationMeta }>(
    `/api/v1/audit${toQuery(params)}`,
  );
  return { data: res.data, meta: res.meta };
}
