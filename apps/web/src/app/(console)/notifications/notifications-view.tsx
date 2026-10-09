'use client';

import { NOTIFICATION_TYPE_LABELS, type NotificationItem } from '@kent360/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { NotificationIcon } from '@/components/domain/notification-parts';
import { QueryError, TableSkeleton } from '@/components/domain/query-states';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/table';
import { useUrlState } from '@/hooks/use-url-state';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  notificationKeys,
} from '@/lib/api/console';
import { cn, formatDateTime, formatRelative } from '@/lib/utils';
import { useToast } from '@/providers/toast-provider';

const PAGE_SIZE = 20;

export function NotificationsView() {
  const item = getNavItem('/notifications');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useUrlState(['filter', 'page'] as const);
  const unreadOnly = filters.filter === 'unread';
  const params = { page: Number(filters.page) || 1, pageSize: PAGE_SIZE, unread: unreadOnly };
  const list = useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => listNotifications(params),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refresh,
    onError: () => toast.error('Bildirim güncellenemedi.'),
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async ({ updated }) => {
      await refresh();
      toast.success(`${updated} bildirim okundu olarak işaretlendi.`);
    },
    onError: () => toast.error('Bildirimler güncellenemedi.'),
  });
  const unread = list.data?.meta.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.label}
        description={item.description}
        actions={
          <Button
            variant="secondary"
            onClick={() => readAll.mutate()}
            disabled={unread === 0 || readAll.isPending}
          >
            <CheckCheck aria-hidden="true" />
            Tümünü okundu say
          </Button>
        }
      />

      <Card>
        <div
          role="tablist"
          aria-label="Bildirim filtresi"
          className="flex gap-1 border-b border-border px-4 pt-3"
        >
          {[
            ['', 'Tümü'],
            ['unread', `Okunmamış${unread > 0 ? ` (${unread})` : ''}`],
          ].map(([value, label]) => {
            const active = filters.filter === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilters({ filter: value, page: undefined })}
                className={cn(
                  '-mb-px border-b-2 px-3 pb-2.5 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {list.isPending ? (
          <TableSkeleton rows={6} />
        ) : list.isError ? (
          <div className="p-4">
            <QueryError error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={unreadOnly ? 'Okunmamış bildiriminiz yok.' : 'Henüz bildiriminiz yok.'}
            description="Size atanan işler, SLA uyarıları ve takip ettiğiniz taleplerdeki gelişmeler burada görünür."
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {list.data.data.map((n) => (
                <NotificationRow key={n.id} item={n} onRead={() => read.mutate(n.id)} />
              ))}
            </ul>
            <Pagination
              page={list.data.meta.page}
              totalPages={list.data.meta.totalPages}
              total={list.data.meta.total}
              onPageChange={(page) => setFilters({ page })}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: () => void }) {
  const href = notificationHref(item);
  const body = (
    <>
      <NotificationIcon type={item.type} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-[13.5px]', item.readAt ? 'text-foreground' : 'font-semibold')}>
            {item.title}
          </p>
          <Badge tone="neutral">{NOTIFICATION_TYPE_LABELS[item.type]}</Badge>
          {!item.readAt && <Badge tone="info">Yeni</Badge>}
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{item.message}</p>
        <p className="mt-1 text-xs text-muted">
          <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
            {formatRelative(item.createdAt)}
          </time>
        </p>
      </div>
      {href && <ChevronRight className="mt-2 size-4 shrink-0 text-muted" aria-hidden="true" />}
    </>
  );
  const className = cn(
    'flex gap-3 px-4 py-3.5 transition-colors',
    !item.readAt && 'bg-info-soft/40',
    href && 'hover:bg-subtle',
  );
  return (
    <li>
      {href ? (
        <Link href={href} onClick={() => !item.readAt && onRead()} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>
          {body}
          {!item.readAt && (
            <Button variant="ghost" size="sm" onClick={onRead}>
              Okundu
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
