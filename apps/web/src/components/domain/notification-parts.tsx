import { type NotificationType } from '@kent360/shared-types';
import {
  AlarmClock,
  BadgeCheck,
  Bell,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  RotateCcw,
  Siren,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<NotificationType, [LucideIcon, string]> = {
  REQUEST_CREATED: [Inbox, 'bg-info-soft text-primary'],
  REQUEST_ASSIGNED: [Inbox, 'bg-info-soft text-primary'],
  REQUEST_CRITICAL: [Siren, 'bg-critical-soft text-critical'],
  REQUEST_STATUS_CHANGED: [Bell, 'bg-subtle text-muted'],
  REQUEST_UPDATED: [Bell, 'bg-info-soft text-primary'],
  REQUEST_VERIFIED: [BadgeCheck, 'bg-success-soft text-success'],
  WORK_ORDER_CREATED: [ClipboardList, 'bg-accent-soft text-accent'],
  WORK_ORDER_ASSIGNED: [ClipboardList, 'bg-accent-soft text-accent'],
  WORK_ORDER_COMPLETED: [ClipboardCheck, 'bg-success-soft text-success'],
  WORK_ORDER_RETURNED: [RotateCcw, 'bg-warning-soft text-warning-strong'],
  SLA_AT_RISK: [AlarmClock, 'bg-warning-soft text-warning-strong'],
  SLA_BREACHED: [CircleAlert, 'bg-critical-soft text-critical'],
  SYSTEM: [Bell, 'bg-subtle text-muted'],
};

/** Type icon of a notification (decorative – the title says what happened). */
export function NotificationIcon({
  type,
  className,
}: {
  type: NotificationType;
  className?: string;
}) {
  const [Icon, tone] = ICONS[type] ?? ICONS.SYSTEM;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        tone,
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
