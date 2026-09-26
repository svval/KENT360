'use client';

import { type DepartmentSummary, Permission, RecordStatus } from '@kent360/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Pencil, Plus, Power, PowerOff, Search } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, QueryError, TableSkeleton } from '@/components/domain/query-states';
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
import { listDepartments, queryKeys, updateDepartment } from '@/lib/api/municipality-domain';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { DepartmentDialog } from './department-dialog';

const PAGE_SIZE = 20;

export function DepartmentsView() {
  const item = getNavItem('/settings/departments');
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.DEPARTMENTS_MANAGE);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useUrlState(['search', 'status', 'page'] as const);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [editing, setEditing] = useState<DepartmentSummary | 'new' | null>(null);

  const params = {
    search: filters.search || undefined,
    status: filters.status || undefined,
    page: Number(filters.page) || 1,
    pageSize: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: queryKeys.departments(params),
    queryFn: () => listDepartments(params),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (d: DepartmentSummary) =>
      updateDepartment(d.id, {
        status: d.status === RecordStatus.ACTIVE ? RecordStatus.INACTIVE : RecordStatus.ACTIVE,
      }),
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(
        d.status === RecordStatus.ACTIVE
          ? `${d.name} aktifleştirildi.`
          : `${d.name} pasifleştirildi.`,
      );
    },
    onError: (error, d) => toast.error(`${d.name} güncellenemedi.`, errorMessage(error, '')),
  });

  const filtered = Boolean(filters.search || filters.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.label}
        description={item.description}
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              Yeni Müdürlük
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <form
            role="search"
            className="relative flex-1 sm:max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters({ search: searchDraft.trim(), page: undefined });
            }}
          >
            <label htmlFor="department-search" className="sr-only">
              Müdürlük adı veya kodu ile ara
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="department-search"
              type="search"
              placeholder="Ad veya kod ara…"
              className="pl-9"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() =>
                searchDraft.trim() !== filters.search &&
                setFilters({ search: searchDraft.trim(), page: undefined })
              }
            />
          </form>
          <label htmlFor="department-status" className="sr-only">
            Duruma göre filtrele
          </label>
          <Select
            id="department-status"
            className="sm:w-44"
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value, page: undefined })}
          >
            <option value="">Tüm durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Pasif</option>
          </Select>
        </div>

        {query.isPending ? (
          <TableSkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <QueryError error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : query.data.data.length === 0 ? (
          <EmptyState
            icon={Network}
            title={filtered ? 'Filtreye uyan müdürlük yok' : 'Henüz müdürlük tanımlanmamış'}
            description={
              filtered
                ? 'Arama veya durum filtresini değiştirerek tekrar deneyin.'
                : 'Talepleri yönlendirmek için önce müdürlükleri tanımlayın.'
            }
            action={
              canManage && !filtered ? (
                <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus aria-hidden="true" />
                  Yeni Müdürlük
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Müdürlük</TH>
                  <TH>Kod</TH>
                  <TH className="text-right">Kullanıcı</TH>
                  <TH className="text-right">Aktif kategori</TH>
                  <TH>Durum</TH>
                  {canManage && <TH className="text-right">İşlem</TH>}
                </tr>
              </THead>
              <tbody>
                {query.data.data.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <p className="font-medium text-foreground">{d.name}</p>
                      {d.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{d.description}</p>
                      )}
                    </TD>
                    <TD className="font-mono text-xs">{d.code}</TD>
                    <TD className="tabular text-right">{formatNumber(d.userCount)}</TD>
                    <TD className="tabular text-right">{formatNumber(d.categoryCount)}</TD>
                    <TD>
                      <RecordStatusBadge status={d.status} />
                    </TD>
                    {canManage && (
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(d)}
                            aria-label={`${d.name} düzenle`}
                          >
                            <Pencil aria-hidden="true" />
                            Düzenle
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate(d)}
                            aria-label={
                              d.status === 'ACTIVE'
                                ? `${d.name} pasifleştir`
                                : `${d.name} aktifleştir`
                            }
                          >
                            {d.status === 'ACTIVE' ? (
                              <PowerOff aria-hidden="true" />
                            ) : (
                              <Power aria-hidden="true" />
                            )}
                            {d.status === 'ACTIVE' ? 'Pasifleştir' : 'Aktifleştir'}
                          </Button>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </Table>
            {query.data.meta && query.data.meta.totalPages > 1 && (
              <Pagination
                page={query.data.meta.page}
                totalPages={query.data.meta.totalPages}
                total={query.data.meta.total}
                onPageChange={(page) => setFilters({ page })}
              />
            )}
          </>
        )}
      </Card>

      {editing && (
        <DepartmentDialog
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
