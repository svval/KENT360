'use client';

import {
  Permission,
  PRIORITY_LABELS,
  Priority,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderStatus,
} from '@kent360/shared-types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, FilterX, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QueryError, TableSkeleton } from '@/components/domain/query-states';
import { SlaIndicator } from '@/components/domain/sla-indicator';
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/domain/status-badges';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination, Table, TD, TH, THead, TR } from '@/components/ui/table';
import { useUrlState } from '@/hooks/use-url-state';
import { listDepartments, queryKeys } from '@/lib/api/municipality-domain';
import {
  fieldTeamKeys,
  getFieldTeam,
  listFieldTeams,
  listWorkOrders,
  workOrderKeys,
} from '@/lib/api/work-orders';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const PAGE_SIZE = 20;
const FILTER_KEYS = [
  'search',
  'status',
  'priority',
  'departmentId',
  'fieldTeamId',
  'assignedUserId',
  'createdFrom',
  'createdTo',
  'page',
] as const;

/** yyyy-mm-dd (local day) → ISO instant at the start / end of that day. */
const dayStart = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined);
const dayEnd = (day: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined);

/** Request statuses the SLA indicator treats as finished, by work order status. */
const SLA_STATUS = (status: WorkOrderStatus) =>
  status === 'COMPLETED' || status === 'VERIFIED' ? 'RESOLVED' : 'IN_PROGRESS';

export function WorkOrdersView() {
  const item = getNavItem('/work-orders');
  const { hasPermission } = useAuth();
  // Department-wide readers (managers, admins) vs. field staff / team leaders (own work).
  const supervisor = hasPermission(Permission.WORK_ORDERS_READ);
  const canFilterDepartment = supervisor && hasPermission(Permission.DEPARTMENTS_READ);
  const canFilterTeam = hasPermission(Permission.FIELD_TEAMS_READ);
  const [filters, setFilters] = useUrlState(FILTER_KEYS);
  const [searchDraft, setSearchDraft] = useState(filters.search);

  const params = {
    search: filters.search || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    departmentId: filters.departmentId || undefined,
    fieldTeamId: filters.fieldTeamId || undefined,
    assignedUserId: filters.assignedUserId || undefined,
    createdFrom: dayStart(filters.createdFrom),
    createdTo: dayEnd(filters.createdTo),
    page: Number(filters.page) || 1,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: workOrderKeys.list(params),
    queryFn: () => listWorkOrders(params),
    placeholderData: keepPreviousData,
  });
  const departments = useQuery({
    queryKey: queryKeys.departments({ pageSize: 100 }),
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: canFilterDepartment,
  });
  const teamParams = { pageSize: 100, departmentId: filters.departmentId || undefined };
  const teams = useQuery({
    queryKey: fieldTeamKeys.list(teamParams),
    queryFn: () => listFieldTeams(teamParams),
    enabled: canFilterTeam,
  });
  // Staff filter: the members of the selected team.
  const team = useQuery({
    queryKey: fieldTeamKeys.detail(filters.fieldTeamId),
    queryFn: () => getFieldTeam(filters.fieldTeamId),
    enabled: canFilterTeam && filters.fieldTeamId !== '',
  });

  const filtered = FILTER_KEYS.some((key) => key !== 'page' && filters[key]);
  const set = (key: (typeof FILTER_KEYS)[number]) => (value: string) =>
    setFilters({
      [key]: value,
      page: undefined,
      // Narrowing the department or team resets the dependent filters.
      ...(key === 'departmentId' && { fieldTeamId: undefined, assignedUserId: undefined }),
      ...(key === 'fieldTeamId' && { assignedUserId: undefined }),
    });
  const clear = () => {
    setSearchDraft('');
    setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={supervisor ? item.label : 'Görevlerim'}
        description={
          supervisor
            ? item.description
            : 'Size veya ekibinize atanan iş emirleri. Sahadaki adımları iş emri ekranından ilerletin.'
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
              <label htmlFor="wo-search" className="sr-only">
                İş emri no, talep no, açıklama veya adres ile ara
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="wo-search"
                type="search"
                className="pl-9"
                placeholder="WO-…, KNT-…, açıklama, adres…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onBlur={() =>
                  searchDraft.trim() !== filters.search &&
                  setFilters({ search: searchDraft.trim(), page: undefined })
                }
              />
            </form>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <FilterSelect label="Durum" value={filters.status} onChange={set('status')}>
                {Object.values(WorkOrderStatus).map((s) => (
                  <option key={s} value={s}>
                    {WORK_ORDER_STATUS_LABELS[s]}
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
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
            {canFilterTeam && (
              <FilterSelect label="Ekip" value={filters.fieldTeamId} onChange={set('fieldTeamId')}>
                {teams.data?.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            {canFilterTeam && (
              <label className="text-xs text-muted">
                <span className="mb-1 block">Personel</span>
                <Select
                  value={filters.assignedUserId}
                  onChange={(e) => set('assignedUserId')(e.target.value)}
                  disabled={!filters.fieldTeamId}
                  title={filters.fieldTeamId ? undefined : 'Önce bir ekip seçin'}
                >
                  <option value="">{filters.fieldTeamId ? 'Tümü' : 'Önce ekip seçin'}</option>
                  {team.data?.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName}
                    </option>
                  ))}
                </Select>
              </label>
            )}
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
            icon={ClipboardList}
            title={
              filtered
                ? 'Bu filtrelere uygun iş emri bulunamadı.'
                : supervisor
                  ? 'Henüz iş emri yok.'
                  : 'Size atanmış bir iş emri yok.'
            }
            description={
              filtered
                ? 'Filtreleri değiştirerek veya temizleyerek tekrar deneyin.'
                : supervisor
                  ? 'Müdürlüğe atanmış bir talebin detayından "İş Emri Oluştur" ile başlayın.'
                  : 'Size veya ekibinize iş atandığında burada görünür.'
            }
            action={
              filtered ? (
                <Button size="sm" variant="secondary" onClick={clear}>
                  Filtreleri temizle
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>İş Emri No</TH>
                  <TH>Kaynak Talep</TH>
                  <TH>Kategori</TH>
                  <TH>Mahalle</TH>
                  <TH>Müdürlük</TH>
                  <TH>Ekip</TH>
                  <TH>Personel</TH>
                  <TH>Öncelik</TH>
                  <TH>Durum</TH>
                  <TH>SLA</TH>
                  <TH>Oluşturulma</TH>
                </tr>
              </THead>
              <tbody>
                {list.data.data.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-mono text-xs whitespace-nowrap">
                      <Link
                        href={`/work-orders/${w.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {w.publicNumber}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-muted">
                      {w.request?.publicNumber ?? '—'}
                    </TD>
                    <TD className="font-medium">{w.category?.name ?? '—'}</TD>
                    <TD>{w.neighborhood?.name ?? <span className="text-xs text-muted">—</span>}</TD>
                    <TD className="max-w-44 truncate">{w.department.name}</TD>
                    <TD className="max-w-44 truncate">
                      {w.fieldTeam?.name ?? <span className="text-xs text-muted">Atanmadı</span>}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {w.assignedUser?.fullName ?? <span className="text-xs text-muted">—</span>}
                    </TD>
                    <TD>
                      <PriorityBadge priority={w.priority} />
                    </TD>
                    <TD>
                      <WorkOrderStatusBadge status={w.status} />
                    </TD>
                    <TD>
                      {w.status === 'CANCELLED' ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <SlaIndicator sla={w.sla} status={SLA_STATUS(w.status)} compact />
                      )}
                    </TD>
                    <TD className="tabular text-xs whitespace-nowrap text-muted">
                      {formatDateTime(w.createdAt)}
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
