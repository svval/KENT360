import {
  type ApiError,
  type ApiSuccess,
  type Priority,
  type RequestDetail,
  type RequestMediaItem,
  type RequestStatus,
  type RequestSummary,
} from '@kent360/shared-types';
import { ApiRequestError, apiFetch } from '../api-client';
import { appConfig } from '../config';
import { getAccessToken, refreshSession } from '../session';

export const requestKeys = {
  all: ['requests'] as const,
  list: (params: Record<string, string | number | undefined>) =>
    ['requests', 'list', params] as const,
  detail: (id: string) => ['requests', 'detail', id] as const,
};

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export function listRequests(params: Record<string, string | number | undefined>) {
  return apiFetch<ApiSuccess<RequestSummary[]>>(`/api/v1/requests${toQuery(params)}`);
}

export async function getRequest(id: string): Promise<RequestDetail> {
  return (await apiFetch<ApiSuccess<RequestDetail>>(`/api/v1/requests/${id}`)).data;
}

export interface NewRequestInput {
  categoryId: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
}

export async function createRequest(input: NewRequestInput): Promise<RequestDetail> {
  return (await apiFetch<ApiSuccess<RequestDetail>>('/api/v1/requests', json('POST', input))).data;
}

export async function transitionRequest(
  id: string,
  to: RequestStatus,
  reason?: string,
): Promise<RequestDetail> {
  return (
    await apiFetch<ApiSuccess<RequestDetail>>(
      `/api/v1/requests/${id}/transitions`,
      json('POST', { to, ...(reason && { reason }) }),
    )
  ).data;
}

export async function changeRequestPriority(
  id: string,
  priority: Priority,
  reason?: string,
): Promise<RequestDetail> {
  return (
    await apiFetch<ApiSuccess<RequestDetail>>(
      `/api/v1/requests/${id}/priority`,
      json('PATCH', { priority, ...(reason && { reason }) }),
    )
  ).data;
}

export async function changeRequestDepartment(
  id: string,
  departmentId: string,
  reason?: string,
): Promise<RequestDetail> {
  return (
    await apiFetch<ApiSuccess<RequestDetail>>(
      `/api/v1/requests/${id}/department`,
      json('PATCH', { departmentId, ...(reason && { reason }) }),
    )
  ).data;
}

/**
 * Uploads one photo with progress reporting (fetch cannot report upload progress).
 * Renews an expired access token once, like apiFetch.
 */
export function uploadRequestPhoto(
  requestId: string,
  file: File,
  onProgress: (percent: number) => void,
  retried = false,
): Promise<RequestMediaItem[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${appConfig.apiUrl}/api/v1/requests/${requestId}/media`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiRequestError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamıyor.'));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((body as ApiSuccess<RequestMediaItem[]>).data);
        return;
      }
      if (xhr.status === 401 && token && !retried) {
        void refreshSession().then((session) =>
          session
            ? uploadRequestPhoto(requestId, file, onProgress, true).then(resolve, reject)
            : reject(new ApiRequestError(401, 'UNAUTHORIZED', 'Oturumunuzun süresi doldu.')),
        );
        return;
      }
      const error = body as ApiError | null;
      reject(
        new ApiRequestError(
          xhr.status,
          error?.code ?? 'HTTP_ERROR',
          error?.message ?? 'Fotoğraf yüklenemedi.',
          error?.details ?? null,
        ),
      );
    };
    const form = new FormData();
    form.append('files', file);
    xhr.send(form);
  });
}
