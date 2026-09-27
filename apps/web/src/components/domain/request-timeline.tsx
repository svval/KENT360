import { type RequestStatus, type RequestTimelineEvent } from '@kent360/shared-types';
import { cn, formatDateTime } from '@/lib/utils';

/** What the citizen / operator waits for next – shown as the open end of the timeline. */
const NEXT_STEP: Partial<Record<RequestStatus, string>> = {
  NEW: 'İnceleme bekleniyor',
  AI_ANALYZED: 'İnceleme bekleniyor',
  UNDER_REVIEW: 'Müdürlük ataması bekleniyor',
  ASSIGNED_TO_DEPARTMENT: 'Saha çalışmasının planlanması bekleniyor',
  WORK_ORDER_CREATED: 'Saha ekibinin çalışmaya başlaması bekleniyor',
  IN_PROGRESS: 'Saha çalışması sürüyor',
  RESOLVED: 'Çözümün doğrulanması bekleniyor',
  VERIFIED: 'Talebin kapatılması bekleniyor',
};

/** request_history rendered as a vertical process timeline (oldest first). */
export function RequestTimeline({
  events,
  status,
}: {
  events: RequestTimelineEvent[];
  status: RequestStatus;
}) {
  const next = NEXT_STEP[status];
  return (
    <ol className="relative space-y-0" aria-label="Süreç">
      {events.map((event, index) => {
        const last = index === events.length - 1 && !next;
        return (
          <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {(!last || next) && (
              <span
                aria-hidden="true"
                className="absolute top-3 left-[5px] h-full w-px bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative mt-1.5 size-[11px] shrink-0 rounded-full border-2',
                event.type === 'STATUS_CHANGED' && event.newStatus === 'REJECTED'
                  ? 'border-critical bg-critical'
                  : 'border-primary bg-primary',
              )}
            />
            <div className="min-w-0">
              <p className="text-[13.5px] text-foreground">{event.description}</p>
              <p className="tabular mt-0.5 text-xs text-muted">
                <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                {event.performedBy && ` · ${event.performedBy}`}
              </p>
            </div>
          </li>
        );
      })}
      {next && (
        <li className="relative flex gap-3">
          <span
            aria-hidden="true"
            className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-primary bg-card"
          />
          <p className="text-[13.5px] text-muted">{next}</p>
        </li>
      )}
    </ol>
  );
}
