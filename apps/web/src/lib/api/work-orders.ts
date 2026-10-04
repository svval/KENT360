import {
  type ApiSuccess,
  type FieldStaffCandidate,
  type FieldTeamDetail,
  type FieldTeamMemberRole,
  type FieldTeamSummary,
  type RecordStatus,
  type WorkOrderDetail,
  type WorkOrderMediaItem,
  type WorkOrderMediaType,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from '@kent360/shared-types';
import { apiFetch } from '../api-client';
import { uploadFile } from './upload';

type Params = Record<string, string | number | undefined>;

export const workOrderKeys = {
  all: ['work-orders'] as const,
  list: (params: Params) => ['work-orders', 'list', params] as const,
  detail: (id: string) => ['work-orders', 'detail', id] as const,
};

export const fieldTeamKeys = {
  all: ['field-teams'] as const,
  list: (params: Params) => ['field-teams', 'list', params] as const,
  detail: (id: string) => ['field-teams', 'detail', id] as const,
  candidates: (departmentId: string) => ['field-teams', 'candidates', departmentId] as const,
};

function toQuery(params: Params): string {
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

// ─── Work orders ─────────────────────────────────────────────────────────────

export function listWorkOrders(params: Params) {
  return apiFetch<ApiSuccess<WorkOrderSummary[]>>(`/api/v1/work-orders${toQuery(params)}`);
}

export async function getWorkOrder(id: string): Promise<WorkOrderDetail> {
  return (await apiFetch<ApiSuccess<WorkOrderDetail>>(`/api/v1/work-orders/${id}`)).data;
}

export async function createWorkOrder(input: {
  requestId: string;
  instructions?: string;
}): Promise<WorkOrderDetail> {
  return (await apiFetch<ApiSuccess<WorkOrderDetail>>('/api/v1/work-orders', json('POST', input)))
    .data;
}

export async function assignWorkOrder(
  id: string,
  input: { fieldTeamId?: string; assignedUserId?: string; note?: string },
): Promise<WorkOrderDetail> {
  return (
    await apiFetch<ApiSuccess<WorkOrderDetail>>(
      `/api/v1/work-orders/${id}/assignment`,
      json('POST', input),
    )
  ).data;
}

export interface WorkOrderTransitionInput {
  to: WorkOrderStatus;
  /** The status the user saw – the API answers 409 WORK_ORDER_STALE if it moved on. */
  from: WorkOrderStatus;
  reason?: string;
  completionDescription?: string;
  latitude?: number;
  longitude?: number;
}

export async function transitionWorkOrder(
  id: string,
  input: WorkOrderTransitionInput,
): Promise<WorkOrderDetail> {
  return (
    await apiFetch<ApiSuccess<WorkOrderDetail>>(
      `/api/v1/work-orders/${id}/transitions`,
      json('POST', input),
    )
  ).data;
}

export function uploadWorkOrderPhoto(
  id: string,
  type: WorkOrderMediaType,
  file: File,
  onProgress: (percent: number) => void = () => undefined,
): Promise<WorkOrderMediaItem[]> {
  return uploadFile<WorkOrderMediaItem[]>(
    `/api/v1/work-orders/${id}/media`,
    file,
    { type },
    onProgress,
  );
}

// ─── Field teams ─────────────────────────────────────────────────────────────

export function listFieldTeams(params: Params = {}) {
  return apiFetch<ApiSuccess<FieldTeamSummary[]>>(`/api/v1/field-teams${toQuery(params)}`);
}

export async function getFieldTeam(id: string): Promise<FieldTeamDetail> {
  return (await apiFetch<ApiSuccess<FieldTeamDetail>>(`/api/v1/field-teams/${id}`)).data;
}

export async function createFieldTeam(input: {
  departmentId: string;
  name: string;
  code: string;
}): Promise<FieldTeamDetail> {
  return (await apiFetch<ApiSuccess<FieldTeamDetail>>('/api/v1/field-teams', json('POST', input)))
    .data;
}

export async function updateFieldTeam(
  id: string,
  input: { name?: string; status?: RecordStatus },
): Promise<FieldTeamDetail> {
  return (
    await apiFetch<ApiSuccess<FieldTeamDetail>>(`/api/v1/field-teams/${id}`, json('PATCH', input))
  ).data;
}

export async function setFieldTeamMembers(
  id: string,
  members: { userId: string; role: FieldTeamMemberRole }[],
): Promise<FieldTeamDetail> {
  return (
    await apiFetch<ApiSuccess<FieldTeamDetail>>(
      `/api/v1/field-teams/${id}/members`,
      json('PUT', { members }),
    )
  ).data;
}

export async function listFieldStaffCandidates(
  departmentId: string,
): Promise<FieldStaffCandidate[]> {
  return (
    await apiFetch<ApiSuccess<FieldStaffCandidate[]>>(
      `/api/v1/field-teams/candidates${toQuery({ departmentId })}`,
    )
  ).data;
}
