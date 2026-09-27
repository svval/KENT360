'use client';

import {
  Permission,
  PRIORITY_LABELS,
  Priority,
  REQUEST_STATUS_LABELS,
  RequestStatus,
  SLA_STATUS_LABELS,
  SlaStatus,
} from '@kent360/shared-types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilterX, Inbox, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QueryError, TableSkeleton } from '@/components/domain/query-states';
import { SlaIndicator } from '@/components/domain/sla-indicator';
import { PriorityBadge, RequestStatusBadge } from '@/components/domain/status-badges';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination, Table, TD, TH, THead, TR } from '@/components/ui/table';
import { useUrlState } from '@/hooks/use-url-state';
import {
  getCategoryTree,
  listDepartments,
  listNeighborhoods,
  queryKeys,
} from '@/lib/api/municipality-domain';
import { listRequests, requestKeys } from '@/lib/api/requests';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const PAGE_SIZE = 20;
const FILTER_KEYS = [
  'search',
  'status',
  'priority',
  'categoryId',
  'departmentId',
  'neighborhoodId',
  'slaStatus',
  'createdFrom',
  'createdTo',
  'page',
] as const;

/** yyyy-mm-dd (local day) → ISO instant at the start / end of that day. */
const dayStart = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined);
const dayEnd = (day: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined);

export function RequestsView() {
  const item = getNavItem('/requests');
  const { hasPermission } = useAuth();
  const isStaff = hasPermission(Permission.REQUESTS_READ);
  const canCreate = hasPermission(Permission.REQUESTS_CREATE);
  const canFilterDepartment = hasPermission(Permission.DEPARTMENTS_READ);
  const [filters, setFilters] = useUrlState(FILTER_KEYS);
  const [searchDraft, setSearchDraft] = useState(filters.search);

  const params = {
    search: filters.search || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    categoryId: filters.categoryId || undefined,
    departmentId: filters.departmentId || undefined,
    neighborhoodId: filters.neighborhoodId || undefined,
    slaStatus: filters.slaStatus || undefined,
    createdFrom: dayStart(filters.createdFrom),
    createdTo: dayEnd(filters.createdTo),
    page: Number(filters.page) || 1,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: requestKeys.list(params),
    queryFn: () => listRequests(params),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: queryKeys.categoryTree, queryFn: getCategoryTree });
  const neighborhoods = useQuery({
    queryKey: queryKeys.neighborhoods({ pageSize: 100 }),
    queryFn: () => listNeighborhoods({ pageSize: 100 }),
  });
  const departments = useQuery({
    queryKey: queryKeys.departments({ pageSize: 100 }),
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: canFilterDepartment,
  });

  const filtered = FILTER_KEYS.some((key) => key !== 'page' && filters[key]);
  const set = (key: (typeof FILTER_KEYS)[number]) => (value: string) =>
    setFilters({ [key]: value, page: undefined });
  const clear = () => {
    setSearchDraft('');
    setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isStaff ? item.label : 'Taleplerim'}
        description={
          isStaff ? item.description : 'Oluşturduğunuz taleplerin durumunu buradan takip edin.'
        }
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/requests/new">
                <Plus aria-hidden="true" />
                Yeni Talep
              </Link>
            </Button>
          )
        }
      />

      <Card>
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <form
              role="search"
              className="relative flex-1 lg:max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                setFilters({ search: searchDraft.trim(), page: undefined });
              }}
            >
              <label htmlFor="request-search" className="sr-only">
                Talep no, açıklama veya adres ile ara
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="request-search"
                type="search"
                className="pl-9"
                placeholder="Talep no (KNT-…), açıklama, adres…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onBlur={() =>
                  searchDraft.trim() !== filters.search &&
                  setFilters({ search: searchDraft.trim(), page: undefined })
                }
              />
            </form>
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              <FilterSelect label="Durum" value={filters.status} onChange={set('status')}>
                {Object.values(RequestStatus).map((s) => (
                  <option key={s} value={s}>
                    {REQUEST_STATUS_LABELS[s]}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Öncelik" value={filters.priority} onChange={set('priority')}>
                {Object.values(Priority).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="SLA" value={filters.slaStatus} onChange={set('slaStatus')}>
                {Object.values(SlaStatus).map((s) => (
                  <option key={s} value={s}>
                    {SLA_STATUS_LABELS[s]}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <FilterSelect label="Kategori" value={filters.categoryId} onChange={set('categoryId')}>
              {categories.data?.map((root) => (
                <optgroup key={root.id} label={root.name}>
                  <option value={root.id}>{root.name} (tümü)</option>
                  {root.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </FilterSelect>
            {canFilterDepartment && (
              <FilterSelect
                label="Müdürlük"
                value={filters.departmentId}
                onChange={set('departmentId')}
              >
                {departments.data?.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect
              label="Mahalle"
              value={filters.neighborhoodId}
              onChange={set('neighborhoodId')}
            >
              {neighborhoods.data?.data.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </FilterSelect>
            <label className="text-xs text-muted">
              <span className="mb-1 block">Başlangıç</span>
              <Input
                type="date"
                value={filters.createdFrom}
                onChange={(e) => set('createdFrom')(e.target.value)}
              />
            </label>
            <label className="text-xs text-muted">
              <span className="mb-1 block">Bitiş</span>
              <Input
                type="date"
                value={filters.createdTo}
                onChange={(e) => set('createdTo')(e.target.value)}
              />
            </label>
            {filtered && (
              <div className="flex items-end">
                <Button variant="ghost" size="md" onClick={clear}>
                  <FilterX aria-hidden="true" />
                  Filtreleri temizle
                </Button>
              </div>
            )}
          </div>
        </div>

        {list.isPending ? (
          <TableSkeleton rows={8} />
        ) : list.isError ? (
          <div className="p-4">
            <QueryError error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              filtered
                ? 'Bu filtrelere uygun talep bulunamadı.'
                : isStaff
                  ? 'Henüz talep yok.'
                  : 'Henüz bir talep oluşturmadınız.'
            }
            description={
              filtered
                ? 'Filtreleri değiştirerek veya temizleyerek tekrar deneyin.'
                : 'Yeni bir talep oluşturduğunuzda burada görünür.'
            }
            action={
              filtered ? (
                <Button size="sm" variant="secondary" onClick={clear}>
                  Filtreleri temizle
                </Button>
              ) : canCreate ? (
                <Button size="sm" asChild>
                  <Link href="/requests/new">
                    <Plus aria-hidden="true" />
                    Yeni Talep
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Talep No</TH>
                  <TH>Kategori</TH>
                  <TH>Mahalle</TH>
                  <TH>Müdürlük</TH>
                  <TH>Öncelik</TH>
                  <TH>Durum</TH>
                  <TH>SLA</TH>
                  <TH>Oluşturulma</TH>
                  <TH className="text-right">İşlem</TH>
                </tr>
              </THead>
              <tbody>
                {list.data.data.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs whitespace-nowrap">
                      <Link
                        href={`/requests/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.publicNumber}
                      </Link>
                    </TD>
                    <TD>
                      <p className="font-medium text-foreground">{r.category?.name ?? '—'}</p>
                      {r.category?.parent && (
                        <p className="text-xs text-muted">{r.category.parent.name}</p>
                      )}
                    </TD>
                    <TD>
                      {r.neighborhood?.name ?? (
                        <span className="text-xs text-muted">Sınır dışı</span>
                      )}
                    </TD>
                    <TD className="max-w-48 truncate">{r.department?.name ?? '—'}</TD>
                    <TD>
                      <PriorityBadge priority={r.priority} />
                    </TD>
                    <TD>
                      <RequestStatusBadge status={r.status} />
                    </TD>
                    <TD>
                      <SlaIndicator sla={r.sla} status={r.status} compact />
                    </TD>
                    <TD className="tabular text-xs whitespace-nowrap text-muted">
                      {formatDateTime(r.createdAt)}
                    </TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/requests/${r.id}`}
                          aria-label={`${r.publicNumber} talebini görüntüle`}
                        >
                          Görüntüle
                        </Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {list.data.meta && (
              <Pagination
                page={list.data.meta.page}
                totalPages={list.data.meta.totalPages}
                total={list.data.meta.total}
                onPageChange={(page) => setFilters({ page })}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs text-muted">
      <span className="mb-1 block">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tümü</option>
        {children}
      </Select>
    </label>
  );
}
