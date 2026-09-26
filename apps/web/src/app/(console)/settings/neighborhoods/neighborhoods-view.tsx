'use client';

import { type NeighborhoodSummary, Permission, RecordStatus } from '@kent360/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, LandPlot, Pencil, Power, PowerOff, Search } from 'lucide-react';
import { useState } from 'react';
import { GeometryPreview } from '@/components/domain/geometry-preview';
import { errorMessage, QueryError, TableSkeleton } from '@/components/domain/query-states';
import { RecordStatusBadge } from '@/components/domain/status-badges';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, Table, TD, TH, THead, TR } from '@/components/ui/table';
import { useUrlState } from '@/hooks/use-url-state';
import {
  getNeighborhoodGeoJson,
  listNeighborhoods,
  queryKeys,
  updateNeighborhood,
} from '@/lib/api/municipality-domain';
import { cn, formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { ImportDialog } from './import-dialog';
import { NeighborhoodDialog } from './neighborhood-dialog';

const PAGE_SIZE = 20;
const areaFormatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export function NeighborhoodsView() {
  const item = getNavItem('/settings/neighborhoods');
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.NEIGHBORHOODS_MANAGE);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useUrlState(['search', 'status', 'page'] as const);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [editing, setEditing] = useState<NeighborhoodSummary | null>(null);
  const [importing, setImporting] = useState(false);

  const params = {
    search: filters.search || undefined,
    status: filters.status || undefined,
    page: Number(filters.page) || 1,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: queryKeys.neighborhoods(params),
    queryFn: () => listNeighborhoods(params),
    placeholderData: keepPreviousData,
  });
  const geojson = useQuery({
    queryKey: queryKeys.neighborhoodGeoJson,
    queryFn: getNeighborhoodGeoJson,
  });

  const toggle = useMutation({
    mutationFn: (n: NeighborhoodSummary) =>
      updateNeighborhood(n.id, {
        status: n.status === RecordStatus.ACTIVE ? RecordStatus.INACTIVE : RecordStatus.ACTIVE,
      }),
    onSuccess: (n) => {
      void queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
      toast.success(
        n.status === RecordStatus.ACTIVE
          ? `${n.name} aktifleştirildi.`
          : `${n.name} pasifleştirildi.`,
        n.status === RecordStatus.INACTIVE
          ? 'Haritada ve konumdan mahalle bulmada artık kullanılmayacak.'
          : undefined,
      );
    },
    onError: (error, n) => toast.error(`${n.name} güncellenemedi.`, errorMessage(error, '')),
  });

  const filtered = Boolean(filters.search || filters.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.label}
        description={item.description}
        actions={
          canManage && (
            <Button onClick={() => setImporting(true)}>
              <FileUp aria-hidden="true" />
              GeoJSON İçe Aktar
            </Button>
          )
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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
              <label htmlFor="neighborhood-search" className="sr-only">
                Mahalle adı veya kodu ile ara
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="neighborhood-search"
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
            <label htmlFor="neighborhood-status" className="sr-only">
              Duruma göre filtrele
            </label>
            <Select
              id="neighborhood-status"
              className="sm:w-44"
              value={filters.status}
              onChange={(e) => setFilters({ status: e.target.value, page: undefined })}
            >
              <option value="">Tüm durumlar</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Pasif</option>
            </Select>
          </div>

          {list.isPending ? (
            <TableSkeleton />
          ) : list.isError ? (
            <div className="p-4">
              <QueryError error={list.error} onRetry={() => void list.refetch()} />
            </div>
          ) : list.data.data.length === 0 ? (
            <EmptyState
              icon={LandPlot}
              title={filtered ? 'Filtreye uyan mahalle yok' : 'Henüz mahalle tanımlanmamış'}
              description={
                filtered
                  ? 'Arama veya durum filtresini değiştirerek tekrar deneyin.'
                  : 'Mahalle sınırlarını bir GeoJSON dosyasından içe aktarın.'
              }
              action={
                canManage && !filtered ? (
                  <Button size="sm" onClick={() => setImporting(true)}>
                    <FileUp aria-hidden="true" />
                    GeoJSON İçe Aktar
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <TH>Mahalle</TH>
                    <TH>Kod</TH>
                    <TH>Geometri</TH>
                    <TH className="text-right">Alan (km²)</TH>
                    <TH>Durum</TH>
                    {canManage && <TH className="text-right">İşlem</TH>}
                  </tr>
                </THead>
                <tbody>
                  {list.data.data.map((n) => (
                    <TR
                      key={n.id}
                      onMouseEnter={() => setHighlight(n.id)}
                      onMouseLeave={() => setHighlight(null)}
                      className={cn(highlight === n.id && 'bg-primary-soft/60')}
                    >
                      <TD>
                        <p className="font-medium text-foreground">{n.name}</p>
                        {n.district && <p className="text-xs text-muted">{n.district}</p>}
                      </TD>
                      <TD className="font-mono text-xs">{n.code}</TD>
                      <TD>
                        {n.geometryType ? (
                          <Badge tone={n.geometryType === 'MultiPolygon' ? 'accent' : 'neutral'}>
                            {n.geometryType}
                            {n.partCount > 1 && ` · ${n.partCount} parça`}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted">Sınır yok</span>
                        )}
                      </TD>
                      <TD className="tabular text-right">
                        {n.areaKm2 !== null ? areaFormatter.format(n.areaKm2) : '—'}
                      </TD>
                      <TD>
                        <RecordStatusBadge status={n.status} />
                      </TD>
                      {canManage && (
                        <TD>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(n)}
                              aria-label={`${n.name} düzenle`}
                            >
                              <Pencil aria-hidden="true" />
                              Düzenle
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={toggle.isPending}
                              onClick={() => toggle.mutate(n)}
                              aria-label={
                                n.status === 'ACTIVE'
                                  ? `${n.name} pasifleştir`
                                  : `${n.name} aktifleştir`
                              }
                            >
                              {n.status === 'ACTIVE' ? (
                                <PowerOff aria-hidden="true" />
                              ) : (
                                <Power aria-hidden="true" />
                              )}
                              {n.status === 'ACTIVE' ? 'Pasifleştir' : 'Aktifleştir'}
                            </Button>
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
              {list.data.meta && list.data.meta.totalPages > 1 && (
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

        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <div>
              <CardTitle>Sınır önizlemesi</CardTitle>
              <CardDescription>
                Aktif mahallelerin şematik görünümü (
                {formatNumber(geojson.data?.features.length ?? 0)} mahalle). Etkileşimli harita
                Canlı Harita modülünde (Phase 9).
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {geojson.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : geojson.isError ? (
              <p className="text-[13px] text-critical">
                {errorMessage(geojson.error, 'Önizleme yüklenemedi.')}
              </p>
            ) : geojson.data.features.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">Gösterilecek sınır yok.</p>
            ) : (
              <GeometryPreview
                collection={geojson.data}
                highlightId={highlight}
                onSelect={setHighlight}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {editing && <NeighborhoodDialog neighborhood={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
