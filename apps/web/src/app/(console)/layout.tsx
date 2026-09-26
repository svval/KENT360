import { type ReactNode } from 'react';
import { RequireAuth, RoutePermissionGate } from '@/components/auth/require-auth';
import { AppShell } from '@/components/layout/app-shell';

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>
        <RoutePermissionGate>{children}</RoutePermissionGate>
      </AppShell>
    </RequireAuth>
  );
}
