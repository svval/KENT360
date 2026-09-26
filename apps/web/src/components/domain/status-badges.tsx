import { type Priority, type RecordStatus } from '@kent360/shared-types';
import { Badge } from '@/components/ui/badge';

const RECORD_STATUS: Record<RecordStatus, { label: string; tone: 'success' | 'neutral' }> = {
  ACTIVE: { label: 'Aktif', tone: 'success' },
  INACTIVE: { label: 'Pasif', tone: 'neutral' },
};

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  const { label, tone } = RECORD_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Labels and tones from UI_UX_GUIDE §6. */
export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Düşük',
  NORMAL: 'Normal',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warning' | 'critical'> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}
