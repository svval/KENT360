'use client';

import { KeyRound, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** Read-only account summary; account changes are made by the municipality's administrator. */
export function ProfileView() {
  const item = getNavItem('/profile');
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const groups = new Map<string, number>();
  for (const permission of user.permissions) {
    const group = permission.split('.')[0];
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={item.label} description={item.description} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hesap</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Ad Soyad</dt>
                <dd className="font-medium">
                  {user.firstName} {user.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">E-posta</dt>
                <dd className="break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Belediye</dt>
                <dd>{user.municipality.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Son giriş</dt>
                <dd className="tabular">
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="mb-1 text-xs text-muted">Roller</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <Badge key={role.code} tone="info">
                      {role.name}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Yetkiler</CardTitle>
              <CardDescription>
                {user.permissions.length} yetki, rollerinizden gelir. Değişiklik için sistem
                yöneticinize başvurun.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="flex flex-wrap gap-1.5" aria-label="Yetki grupları">
              {[...groups].map(([group, count]) => (
                <li key={group}>
                  <Badge tone="neutral">
                    <KeyRound className="size-3" aria-hidden="true" />
                    {group} · {count}
                  </Badge>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                await logout().catch(() => undefined);
                router.replace('/login');
              }}
            >
              <LogOut aria-hidden="true" />
              Çıkış yap
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
