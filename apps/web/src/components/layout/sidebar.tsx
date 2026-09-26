'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/branding-provider';
import { navigation } from './navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const branding = useBranding();

  return (
    <aside
      aria-label="Ana menü"
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-navy text-slate-300 transition-[width,transform] duration-200',
        collapsed ? 'lg:w-sidebar-collapsed' : 'lg:w-sidebar',
        'w-sidebar',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="flex h-topbar shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold tracking-tight text-white"
        >
          K
        </span>
        <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
          <p className="text-[15px] leading-5 font-bold tracking-tight text-white">KENT360</p>
          <p className="truncate text-xs text-slate-400">{branding.municipalityName}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((section) => (
          <div key={section.id} className="mb-4 last:mb-0">
            {section.label && (
              <p
                className={cn(
                  'mb-2 border-t border-white/10 px-3 pt-4 text-[11px] font-semibold tracking-wider text-slate-500 uppercase',
                  collapsed && 'lg:px-0 lg:text-center lg:text-[0px]',
                )}
              >
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/60',
                        active
                          ? 'bg-white/10 text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white',
                        collapsed && 'lg:justify-center lg:px-0',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          'size-[18px] shrink-0',
                          active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200',
                        )}
                      />
                      <span className={cn('truncate', collapsed && 'lg:sr-only')}>
                        {item.label}
                      </span>
                      {active && !collapsed && (
                        <span
                          aria-hidden="true"
                          className="ml-auto h-4 w-0.5 rounded-full bg-primary"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hidden shrink-0 border-t border-white/10 p-3 lg:block">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white',
            'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/60',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-[18px]" aria-hidden="true" />
              <span>Menüyü daralt</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
