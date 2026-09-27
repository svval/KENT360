'use client';

import {
  evaluateSla,
  formatDurationShort,
  type RequestSla,
  type RequestStatus,
  SLA_STATUS_LABELS,
  type SlaStatus,
} from '@kent360/shared-types';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE: Record<SlaStatus, 'success' | 'warning' | 'critical'> = {
  ON_TIME: 'success',
  AT_RISK: 'warning',
  BREACHED: 'critical',
};

const FINISHED: ReadonlySet<RequestStatus> = new Set([
  'RESOLVED',
  'VERIFIED',
  'CLOSED',
  'REJECTED',
]);

/** Re-renders every minute so an open request's countdown stays current. */
function useMinuteClock(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * SLA as badge + text, never colour alone (UI_UX_GUIDE §6):
 * "SLA içinde · 3 sa 42 dk kaldı", "SLA aşıldı · 1 sa 14 dk aşıldı".
 * Open requests are re-evaluated live from the frozen snapshot; finished ones show the
 * server's frozen result.
 */
export function SlaIndicator({
  sla,
  status,
  compact = false,
}: {
  sla: RequestSla;
  status: RequestStatus;
  compact?: boolean;
}) {
  const finished = FINISHED.has(status);
  const now = useMinuteClock(!finished && sla.dueAt !== null);
  const evaluation = finished
    ? { status: sla.status, remainingMinutes: sla.remainingMinutes }
    : evaluateSla({ slaDueAt: sla.dueAt, slaAtRiskAt: sla.atRiskAt, completedAt: null }, now);

  if (!evaluation.status || evaluation.remainingMinutes === null) {
    return (
      <span className="text-xs text-muted">{status === 'REJECTED' ? '—' : 'SLA tanımsız'}</span>
    );
  }
  const remaining = evaluation.remainingMinutes;
  const text = finished
    ? evaluation.status === 'BREACHED'
      ? `${formatDurationShort(remaining)} gecikmeyle sonuçlandı`
      : 'Süresi içinde sonuçlandı'
    : remaining >= 0
      ? `${formatDurationShort(remaining)} kaldı`
      : `${formatDurationShort(remaining)} aşıldı`;

  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5',
        compact ? 'text-xs' : 'text-[13px]',
      )}
    >
      <Badge tone={TONE[evaluation.status]}>{SLA_STATUS_LABELS[evaluation.status]}</Badge>
      <span className="tabular inline-flex items-center gap-1 text-muted">
        {!compact && <Clock className="size-3.5" aria-hidden="true" />}
        {text}
      </span>
    </span>
  );
}
