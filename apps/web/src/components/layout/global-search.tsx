'use client';

import {
  REQUEST_STATUS_LABELS,
  type RequestStatus,
  type SearchResultItem,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderStatus,
} from '@kent360/shared-types';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Inbox, LoaderCircle, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { globalSearch, operationsKeys } from '@/lib/api/operations';
import { cn } from '@/lib/utils';

const hrefOf = (item: SearchResultItem) =>
  item.type === 'REQUEST' ? `/requests/${item.id}` : `/work-orders/${item.id}`;

const statusLabel = (item: SearchResultItem) =>
  item.type === 'REQUEST'
    ? REQUEST_STATUS_LABELS[item.status as RequestStatus]
    : WORK_ORDER_STATUS_LABELS[item.status as WorkOrderStatus];

/**
 * Topbar search over requests and work orders (GET /search – same scope as the lists).
 * Debounced; combobox keyboard pattern: ↑/↓ to move, Enter to open, Esc to close.
 */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const query = useQuery({
    queryKey: operationsKeys.search(term),
    queryFn: () => globalSearch(term),
    enabled: term.length >= 2,
    staleTime: 15_000,
  });
  const items = term.length >= 2 ? (query.data ?? []) : [];
  const show = open && term.length >= 2;

  const go = (item: SearchResultItem) => {
    setOpen(false);
    setText('');
    router.push(hrefOf(item));
  };

  return (
    <form
      ref={box}
      role="search"
      className="relative hidden sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        const item = items[active];
        if (item) go(item);
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Talep veya iş emri no, adres ya da açıklama ile ara
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
      />
      <input
        id="global-search"
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Talep no, adres, açıklama ara…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(items.length - 1, i + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
        }}
        className={cn(
          'h-9 w-56 rounded-[var(--radius-control)] border border-border bg-background pr-3 pl-9 text-[13px] placeholder:text-muted/80 xl:w-80',
          'focus-visible:border-primary focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25',
        )}
      />
      {show && (
        <div className="absolute top-11 right-0 z-40 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-popover)]">
          {query.isFetching && items.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-muted" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Aranıyor…
            </p>
          ) : query.isError ? (
            <p className="px-3 py-3 text-[13px] text-critical" role="alert">
              Arama yapılamadı. Tekrar deneyin.
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-muted" role="status">
              “{term}” için sonuç bulunamadı.
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="Arama sonuçları"
              className="max-h-96 overflow-y-auto py-1"
            >
              {items.map((item, index) => {
                const Icon = item.type === 'REQUEST' ? Inbox : ClipboardList;
                return (
                  <li
                    key={`${item.type}-${item.id}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(item);
                    }}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 px-3 py-2',
                      index === active && 'bg-subtle',
                    )}
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        item.type === 'REQUEST' ? 'text-primary' : 'text-warning-strong',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold">
                          {item.publicNumber}
                        </span>
                        <span className="rounded bg-subtle px-1.5 text-[11px] text-muted">
                          {item.type === 'REQUEST' ? 'Talep' : 'İş Emri'}
                        </span>
                      </span>
                      <span className="block truncate text-[13px]">{item.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {statusLabel(item)}
                        {item.subtitle && ` · ${item.subtitle}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
