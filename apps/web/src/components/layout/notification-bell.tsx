'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { type NotificationItem } from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NotificationIcon } from '@/components/domain/notification-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_POLL_MS,
  notificationHref,
  notificationKeys,
} from '@/lib/api/console';
import { cn, formatRelative } from '@/lib/utils';
import { useToast } from '@/providers/toast-provider';

const PREVIEW = { page: 1, pageSize: 6 };

/** Topbar bell: unread badge (polled) and the latest notifications. */
export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: notificationKeys.list(PREVIEW),
    queryFn: () => listNotifications(PREVIEW),
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  const read = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async ({ updated }) => {
      await refresh();
      toast.success(
        updated > 0 ? `${updated} bildirim okundu olarak işaretlendi.` : 'Okunmamış bildirim yok.',
      );
    },
    onError: () => toast.error('Bildirimler güncellenemedi.'),
  });

  const unread = preview.data?.meta.unreadCount ?? 0;
  const open = (item: NotificationItem) => {
    if (!item.readAt) read.mutate(item.id);
    const href = notificationHref(item);
    router.push(href ?? '/notifications');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Bildirimler, ${unread} okunmamış` : 'Bildirimler'}
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="tabular absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-critical px-1 text-[10.5px] leading-none font-semibold text-white ring-2 ring-card"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(380px,calc(100vw-24px))] rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-popover)] data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <DropdownMenu.Label className="text-sm font-semibold">
              Bildirimler
              {unread > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted">{unread} okunmamış</span>
              )}
            </DropdownMenu.Label>
            {unread > 0 && (
              <DropdownMenu.Item
                onSelect={(event) => {
                  event.preventDefault();
                  readAll.mutate();
                }}
                className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary outline-none data-[highlighted]:bg-subtle"
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Tümünü okundu say
              </DropdownMenu.Item>
            )}
          </div>
          <div className="max-h-[min(420px,60dvh)] overflow-y-auto py-1">
            {preview.isPending ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : preview.isError ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">
                Bildirimler yüklenemedi.
              </p>
            ) : preview.data.data.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">
                Henüz bildiriminiz yok.
              </p>
            ) : (
              preview.data.data.map((item) => (
                <DropdownMenu.Item
                  key={item.id}
                  onSelect={() => open(item)}
                  className="flex cursor-pointer gap-3 px-4 py-2.5 outline-none data-[highlighted]:bg-subtle"
                >
                  <NotificationIcon type={item.type} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[13px]',
                        item.readAt ? 'text-muted' : 'font-semibold text-foreground',
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted">{item.message}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {formatRelative(item.createdAt)}
                    </span>
                  </span>
                  {!item.readAt && (
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                      aria-label="Okunmadı"
                    />
                  )}
                </DropdownMenu.Item>
              ))
            )}
          </div>
          <div className="border-t border-border p-2">
            <DropdownMenu.Item asChild>
              <Link
                href="/notifications"
                className="block rounded-md px-3 py-2 text-center text-[13px] font-medium text-primary outline-none data-[highlighted]:bg-subtle"
              >
                Tümünü gör
              </Link>
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
