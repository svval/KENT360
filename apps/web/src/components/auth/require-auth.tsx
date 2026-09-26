'use client';

import { ShieldAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { findNavItem } from '@/components/layout/navigation';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';

/**
 * Console route protection. Anonymous visitors are sent to /login (with a return
 * path); nothing of the console renders before the session is known.
 * This is a UX guard – the API rejects unauthenticated calls on its own.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh" role="status" aria-label="Oturum doğrulanıyor">
        <div className="hidden w-sidebar shrink-0 bg-navy lg:block" />
        <div className="flex-1">
          <div className="h-topbar border-b border-border bg-card" />
          <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-8 lg:px-8">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }
  return children;
}

/** Hides a page whose menu entry requires a permission the user lacks. */
export function RoutePermissionGate({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  const pathname = usePathname();
  const required = findNavItem(pathname)?.permission;

  if (required && !hasPermission(required)) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Bu sayfayı görüntüleme yetkiniz yok"
          description="Erişim gerekiyorsa belediyenizin sistem yöneticisiyle iletişime geçin."
        />
      </Card>
    );
  }
  return children;
}
