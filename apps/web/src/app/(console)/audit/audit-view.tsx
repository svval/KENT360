'use client';

import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditLogItem,
  PRIORITY_LABELS,
  REQUEST_SOURCE_LABELS,
  REQUEST_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from '@kent360/shared-types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, FilterX, ScrollText, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QueryError, TableSkeleton } from '@/components/domain/query-states';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination, Table, TD, TH, THead, TR } from '@/components/ui/table';
import { useUrlState } from '@/hooks/use-url-state';
import { auditKeys, listAuditLogs } from '@/lib/api/console';
import { formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 25;
const FILTER_KEYS = [
  'user',
  'action',
  'entityType',
  'entityId',
  'dateFrom',
  'dateTo',
  'page',
] as const;

/** Readable field names of common audit payload keys; others are shown as they are. */
const FIELD_LABELS: Record<string, string> = {
  status: 'Durum',
  priority: 'Öncelik',
  reason: 'Gerekçe',
  publicNumber: 'Numara',
  departmentId: 'Müdürlük',
  categoryId: 'Kategori',
  neighborhoodId: 'Mahalle',
  fieldTeamId: 'Ekip',
  assignedUserId: 'Atanan personel',
  slaDueAt: 'SLA bitiş',
  source: 'Kaynak',
  name: 'Ad',
  code: 'Kod',
  email: 'E-posta',
  requestId: 'Talep',
  workOrderId: 'İş emri',
  workOrderEvent: 'İş emri adımı',
  provider: 'AI sağlayıcı',
  model: 'Model',
  confidence: 'Güven',
  'proximity.distanceMeters': 'Konum mesafesi (m)',
  'proximity.bypassed': 'Konum kontrolü atlandı',
};

const actionLabel = (action: string) => AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
const entityLabel = (type: string) => AUDIT_ENTITY_LABELS[type] ?? type;
const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
/** Enum codes of the usual fields in Turkish; the entity decides which status catalogue. */
function showValue(entry: AuditLogItem, field: string, value: string | null): string {
  if (value === null) return '—';
  if (isIso(value)) return formatDateTime(value);
  const labels: Record<string, string> | undefined =
    field === 'status'
      ? entry.entityType === 'WorkOrder'
        ? WORK_ORDER_STATUS_LABELS
        : entry.entityType === 'Request'
          ? REQUEST_STATUS_LABELS
          : undefined
      : field === 'workOrderEvent'
        ? WORK_ORDER_STATUS_LABELS
        : field === 'priority'
          ? PRIORITY_LABELS
          : field === 'source'
            ? REQUEST_SOURCE_LABELS
            : undefined;
  return labels?.[value] ?? value;
}

const entityHref = (item: AuditLogItem) =>
  item.entityId && item.entityType === 'Request'
    ? `/requests/${item.entityId}`
    : item.entityId && item.entityType === 'WorkOrder'
      ? `/work-orders/${item.entityId}`
      : null;

const tone = (action: string) =>
  /FAILED|LOCKED|REUSE|REJECTED|CANCELLED/.test(action)
    ? 'critical'
    : /CREATED|VERIFIED|COMPLETED|SUCCESS/.test(action)
      ? 'success'
      : 'neutral';

export function AuditView() {
  const item = getNavItem('/audit');
  const [filters, setFilters] = useUrlState(FILTER_KEYS);
  const [userDraft, setUserDraft] = useState(filters.user);
  const [entityDraft, setEntityDraft] = useState(filters.entityId);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const params = {
    user: filters.user || undefined,
    action: filters.action || undefined,
    entityType: filters.entityType || undefined,
    entityId: filters.entityId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    page: Number(filters.page) || 1,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => listAuditLogs(params),
    placeholderData: keepPreviousData,
  });
  const filtered = FILTER_KEYS.some((key) => key !== 'page' && filters[key]);
  const set = (changes: Partial<Record<(typeof FILTER_KEYS)[number], string>>) =>
    setFilters({ ...changes, page: undefined });
  const clear = () => {
    setUserDraft('');
    setEntityDraft('');
    setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])));
  };

  return (
    <div className="space-y-6">
      <PageHeader title={item.label} description={item.description} />

      <Card>
        <form
          role="search"
          aria-label="Audit filtreleri"
          className="grid grid-cols-2 gap-3 border-b border-border p-4 md:grid-cols-3 xl:grid-cols-7"
          onSubmit={(e) => {
            e.preventDefault();
            set({ user: userDraft.trim(), entityId: entityDraft.trim() });
          }}
        >
          <label className="col-span-2 text-xs text-muted md:col-span-1 xl:col-span-2">
            <span className="mb-1 block">Kullanıcı</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                className="pl-9"
                placeholder="Ad veya e-posta"
                value={userDraft}
                onChange={(e) => setUserDraft(e.target.value)}
                onBlur={() => userDraft.trim() !== filters.user && set({ user: userDraft.trim() })}
              />
            </span>
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">İşlem</span>
            <Select value={filters.action} onChange={(e) => set({ action: e.target.value })}>
              <option value="">Tümü</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Kaynak</span>
            <Select
              value={filters.entityType}
              onChange={(e) => set({ entityType: e.target.value })}
            >
              <option value="">Tümü</option>
              {AUDIT_ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {entityLabel(type)}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Kayıt kimliği</span>
            <Input
              placeholder="UUID"
              value={entityDraft}
              onChange={(e) => setEntityDraft(e.target.value)}
              onBlur={() =>
                entityDraft.trim() !== filters.entityId && set({ entityId: entityDraft.trim() })
              }
            />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Başlangıç</span>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => set({ dateFrom: e.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Bitiş</span>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => set({ dateTo: e.target.value })}
            />
          </label>
          <button type="submit" className="sr-only">
            Filtrele
          </button>
        </form>
        {filtered && (
          <div className="flex justify-end border-b border-border px-4 py-2">
            <Button variant="ghost" size="sm" onClick={clear}>
              <FilterX aria-hidden="true" />
              Filtreleri temizle
            </Button>
          </div>
        )}

        {list.isPending ? (
          <TableSkeleton rows={10} />
        ) : list.isError ? (
          <div className="p-4">
            <QueryError error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? 'Bu filtrelere uygun kayıt yok.' : 'Henüz denetim kaydı yok.'}
            description={filtered ? 'Filtreleri değiştirerek tekrar deneyin.' : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Tarih</TH>
                  <TH>Kullanıcı</TH>
                  <TH>İşlem</TH>
                  <TH>Kaynak</TH>
                  <TH>Kayıt</TH>
                  <TH>IP</TH>
                  <TH>
                    <span className="sr-only">Detay</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {list.data.data.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="tabular text-xs whitespace-nowrap text-muted">
                      {formatDateTime(entry.createdAt)}
                    </TD>
                    <TD className="max-w-56">
                      {entry.actor ? (
                        <>
                          <span className="block truncate font-medium">{entry.actor.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {entry.actor.email}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted">Sistem / anonim</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={tone(entry.action)}>{actionLabel(entry.action)}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">{entityLabel(entry.entityType)}</TD>
                    <TD className="font-mono text-xs text-muted">
                      {entry.entityId ? `${entry.entityId.slice(0, 8)}…` : '—'}
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-muted">
                      {entry.ipAddress ?? '—'}
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(entry)}
                        aria-label={`${actionLabel(entry.action)} kaydının detayı`}
                      >
                        Detay
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={list.data.meta.page}
              totalPages={list.data.meta.totalPages}
              total={list.data.meta.total}
              onPageChange={(page) => setFilters({ page })}
            />
          </>
        )}
      </Card>

      {selected && (
        <Dialog
          open
          onOpenChange={(open) => !open && setSelected(null)}
          title={actionLabel(selected.action)}
          description={formatDateTime(selected.createdAt)}
          size="lg"
        >
          <AuditDetail entry={selected} />
        </Dialog>
      )}
    </div>
  );
}

function AuditDetail({ entry }: { entry: AuditLogItem }) {
  const href = entityHref(entry);
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Kullanıcı</dt>
          <dd className="font-medium">
            {entry.actor ? `${entry.actor.name} (${entry.actor.email})` : 'Sistem / anonim'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Kaynak</dt>
          <dd>
            {entityLabel(entry.entityType)}
            {entry.entityId && (
              <span className="ml-1 font-mono text-xs break-all text-muted">{entry.entityId}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">İşlem kodu</dt>
          <dd className="font-mono text-xs">{entry.action}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">IP adresi</dt>
          <dd className="font-mono text-xs">{entry.ipAddress ?? '—'}</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Değişiklikler</h3>
        {entry.changes.length === 0 ? (
          <p className="rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-muted">
            Bu kayıt için gösterilecek alan değişikliği yok.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Alan
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Önce
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Sonra
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entry.changes.map((change) => (
                  <tr key={change.field}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {FIELD_LABELS[change.field] ?? change.field}
                    </th>
                    <td className="px-3 py-2 break-all text-muted">
                      {showValue(entry, change.field, change.before)}
                    </td>
                    <td className="px-3 py-2 break-all">
                      {showValue(entry, change.field, change.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          Parola, oturum, token, istek gövdesi ve tarayıcı bilgisi denetim ekranında gösterilmez.
        </p>
      </div>

      {href && (
        <Button asChild variant="secondary" size="sm">
          <Link href={href}>
            Kayda git
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </div>
  );
}
