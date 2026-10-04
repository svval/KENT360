import {
  type ApiSuccess,
  type Priority,
  type RequestDetail,
  type RequestMediaItem,
  type RequestStatus,
  type RequestSummary,
} from '@kent360/shared-types';
import { apiFetch } from '../api-client';
import { uploadFile } from './upload';

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

/** Uploads one photo with progress reporting (shared multipart helper). */
export function uploadRequestPhoto(
  requestId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<RequestMediaItem[]> {
  return uploadFile<RequestMediaItem[]>(
    `/api/v1/requests/${requestId}/media`,
    file,
    {},
    onProgress,
  );
}
