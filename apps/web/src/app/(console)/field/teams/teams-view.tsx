'use client';

import { type FieldTeamSummary, Permission, RecordStatus } from '@kent360/shared-types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilterX, Plus, Search, Truck } from 'lucide-react';
import { useState } from 'react';
import { QueryError, TableSkeleton } from '@/components/domain/query-states';
import { RecordStatusBadge } from '@/components/domain/status-badges';
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
import { fieldTeamKeys, listFieldTeams } from '@/lib/api/work-orders';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { MembersDialog, TeamDialog } from './team-dialogs';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['search', 'departmentId', 'status', 'page'] as const;

export function TeamsView() {
  const item = getNavItem('/field/teams');
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission(Permission.FIELD_TEAMS_MANAGE);
  const [filters, setFilters] = useUrlState(FILTER_KEYS);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [editing, setEditing] = useState<FieldTeamSummary | 'new' | null>(null);
  const [membersOf, setMembersOf] = useState<FieldTeamSummary | null>(null);

  const params = {
    search: filters.search || undefined,
    departmentId: filters.departmentId || undefined,
    status: filters.status || undefined,
    page: Number(filters.page) || 1,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: fieldTeamKeys.list(params),
    queryFn: () => listFieldTeams(params),
    placeholderData: keepPreviousData,
  });
  const departments = useQuery({
    queryKey: queryKeys.departments({ pageSize: 100 }),
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: hasPermission(Permission.DEPARTMENTS_READ),
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
        title={item.label}
        description={item.description}
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              Yeni Ekip
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-end">
          <form
            role="search"
            className="relative flex-1 lg:max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters({ search: searchDraft.trim(), page: undefined });
            }}
          >
            <label htmlFor="team-search" className="sr-only">
              Ekip adı veya kodu ile ara
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="team-search"
              type="search"
              className="pl-9"
              placeholder="Ekip adı veya kodu…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() =>
                searchDraft.trim() !== filters.search &&
                setFilters({ search: searchDraft.trim(), page: undefined })
              }
            />
          </form>
          <div className="grid flex-1 grid-cols-2 gap-3 lg:max-w-xl">
            {departments.data && (
              <label className="text-xs text-muted">
                <span className="mb-1 block">Müdürlük</span>
                <Select
                  value={filters.departmentId}
                  onChange={(e) => set('departmentId')(e.target.value)}
                >
                  <option value="">Tümü</option>
                  {departments.data.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="text-xs text-muted">
              <span className="mb-1 block">Durum</span>
              <Select value={filters.status} onChange={(e) => set('status')(e.target.value)}>
                <option value="">Tümü</option>
                <option value={RecordStatus.ACTIVE}>Aktif</option>
                <option value={RecordStatus.INACTIVE}>Pasif</option>
              </Select>
            </label>
          </div>
          {filtered && (
            <Button variant="ghost" size="md" onClick={clear}>
              <FilterX aria-hidden="true" />
              Filtreleri temizle
            </Button>
          )}
        </div>

        {list.isPending ? (
          <TableSkeleton rows={5} />
        ) : list.isError ? (
          <div className="p-4">
            <QueryError error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={filtered ? 'Bu filtrelere uygun ekip yok.' : 'Henüz saha ekibi yok.'}
            description={
              filtered
                ? 'Filtreleri değiştirerek tekrar deneyin.'
                : 'Müdürlüğünüzün saha ekiplerini oluşturup personel ekleyin.'
            }
            action={
              canManage && !filtered ? (
                <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus aria-hidden="true" />
                  Yeni Ekip
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Ekip</TH>
                  <TH>Müdürlük</TH>
                  <TH>Sorumlu</TH>
                  <TH className="text-right">Üye</TH>
                  <TH className="text-right">Açık iş</TH>
                  <TH className="text-right">Tamamlanan</TH>
                  <TH>Durum</TH>
                  <TH className="text-right">İşlem</TH>
                </tr>
              </THead>
              <tbody>
                {list.data.data.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="font-mono text-xs text-muted">{t.code}</p>
                    </TD>
                    <TD className="max-w-48 truncate">{t.department.name}</TD>
                    <TD>{t.leader?.fullName ?? <span className="text-xs text-muted">—</span>}</TD>
                    <TD className="tabular text-right">{formatNumber(t.memberCount)}</TD>
                    <TD className="tabular text-right">{formatNumber(t.activeWorkOrders)}</TD>
                    <TD className="tabular text-right">{formatNumber(t.completedWorkOrders)}</TD>
                    <TD>
                      <RecordStatusBadge status={t.status} />
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setMembersOf(t)}>
                        Üyeler
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                          Düzenle
                        </Button>
                      )}
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

      {editing && (
        <TeamDialog
          team={editing === 'new' ? null : editing}
          defaultDepartmentId={filters.departmentId || user?.departmentId || ''}
          onClose={() => setEditing(null)}
        />
      )}
      {membersOf && (
        <MembersDialog team={membersOf} canManage={canManage} onClose={() => setMembersOf(null)} />
      )}
    </div>
  );
}
