import {
  PRIORITY_LABELS,
  type Priority,
  type RecordStatus,
  REQUEST_STATUS_LABELS,
  type RequestStatus,
} from '@kent360/shared-types';
import { Badge } from '@/components/ui/badge';

const RECORD_STATUS: Record<RecordStatus, { label: string; tone: 'success' | 'neutral' }> = {
  ACTIVE: { label: 'Aktif', tone: 'success' },
  INACTIVE: { label: 'Pasif', tone: 'neutral' },
};

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  const { label, tone } = RECORD_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export { PRIORITY_LABELS } from '@kent360/shared-types';

const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warning' | 'critical'> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

/** Request status tones (UI_UX_GUIDE §6). */
const REQUEST_STATUS_TONE: Record<
  RequestStatus,
  'neutral' | 'info' | 'accent' | 'warning' | 'success' | 'critical'
> = {
  NEW: 'info',
  AI_ANALYZED: 'accent',
  UNDER_REVIEW: 'neutral',
  ASSIGNED_TO_DEPARTMENT: 'info',
  WORK_ORDER_CREATED: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  VERIFIED: 'success',
  CLOSED: 'neutral',
  REJECTED: 'critical',
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={REQUEST_STATUS_TONE[status]}>{REQUEST_STATUS_LABELS[status]}</Badge>;
}
