'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, ChevronDown, LogOut, Menu, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { ApiStatus } from './api-status';
import { findNavItem } from './navigation';

interface TopbarProps {
  onOpenMobileNav: () => void;
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toLocaleUpperCase('tr-TR');
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const router = useRouter();
  const { user, logout } = useAuth();

  const displayName = user ? `${user.firstName} ${user.lastName}` : '';
  const roleLabel = user?.roles.map((role) => role.name).join(', ') ?? '';

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Menüyü aç"
      >
        <Menu />
      </Button>

      <nav aria-label="Konum" className="hidden min-w-0 items-center gap-2 text-[13px] md:flex">
        <span className="text-muted">KENT360</span>
        <span aria-hidden="true" className="text-border-strong">
          /
        </span>
        <span className="truncate font-medium text-foreground">{current?.label ?? 'Sayfa'}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2 lg:gap-3">
        <form
          role="search"
          className="relative hidden sm:block"
          onSubmit={(e) => e.preventDefault()}
        >
          <label htmlFor="global-search" className="sr-only">
            Talep no, adres veya açıklama ile ara
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id="global-search"
            type="search"
            placeholder="Talep no, adres, açıklama ara…"
            className={cn(
              'h-9 w-56 rounded-[var(--radius-control)] border border-border bg-background pr-3 pl-9 text-[13px] placeholder:text-muted/80 xl:w-80',
              'focus-visible:border-primary focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25',
            )}
          />
        </form>

        <ApiStatus />

        <Button variant="ghost" size="icon" asChild>
          <Link href="/notifications" aria-label="Bildirimler">
            <Bell />
          </Link>
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Kullanıcı menüsü"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                {user ? initialsOf(user.firstName, user.lastName) : ''}
              </span>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-[13px] font-semibold">{displayName}</span>
                <span className="block text-xs text-muted">{roleLabel}</span>
              </span>
              <ChevronDown aria-hidden="true" className="hidden size-4 text-muted lg:block" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-52 rounded-[var(--radius-control)] border border-border bg-card p-1 shadow-[var(--shadow-popover)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <DropdownMenu.Label className="px-2.5 py-2 text-xs text-muted">
                <span className="block">Oturum açık</span>
                <span className="block truncate font-medium text-foreground">{user?.email}</span>
                {user && <span className="block truncate">{user.municipality.name}</span>}
              </DropdownMenu.Label>
              <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-subtle">
                <UserRound className="size-4 text-muted" aria-hidden="true" />
                Profilim
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={() => void handleLogout()}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-critical outline-none data-[highlighted]:bg-critical-soft"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Çıkış yap
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
