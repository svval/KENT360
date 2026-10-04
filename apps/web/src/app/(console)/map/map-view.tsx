'use client';

import {
  Permission,
  PRIORITY_LABELS,
  Priority,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@kent360/shared-types';
import { useQuery } from '@tanstack/react-query';
import { FilterX } from 'lucide-react';
import { useState } from 'react';
import { LayerControl, SelectionCard } from '@/components/map/map-panels';
import {
  type MapLayersState,
  type MapSelection,
  type MapStats,
  OperationsMap,
} from '@/components/map/operations-map';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useUrlState } from '@/hooks/use-url-state';
import { getCategoryTree, listDepartments, queryKeys } from '@/lib/api/municipality-domain';
import { mapConfig } from '@/lib/map-config';
import { useAuth } from '@/providers/auth-provider';

const FILTER_KEYS = [
  'status',
  'priority',
  'departmentId',
  'categoryId',
  'createdFrom',
  'createdTo',
] as const;

const dayStart = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined);
const dayEnd = (day: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined);

export function MapView() {
  const item = getNavItem('/map');
  const { hasPermission, user } = useAuth();
  const canSeeRequests = hasPermission(Permission.REQUESTS_READ);
  const canSeeRisk = canSeeRequests && hasPermission(Permission.ANALYTICS_READ);
  const [filters, setFilters] = useUrlState(FILTER_KEYS);
  const [layers, setLayers] = useState<MapLayersState>({
    requests: true,
    critical: true,
    workOrders: true,
    neighborhoods: true,
    heatmap: false,
    risk: false,
  });
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [stats, setStats] = useState<MapStats | null>(null);

  const categories = useQuery({
    queryKey: queryKeys.categoryTree,
    queryFn: getCategoryTree,
    enabled: canSeeRequests,
  });
  const departments = useQuery({
    queryKey: queryKeys.departments({ pageSize: 100 }),
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: hasPermission(Permission.DEPARTMENTS_READ),
  });
  const municipality = user?.municipality;
  const center =
    municipality?.mapCenterLng != null && municipality.mapCenterLat != null
      ? ([municipality.mapCenterLng, municipality.mapCenterLat] as [number, number])
      : null;
  const filtered = FILTER_KEYS.some((key) => filters[key]);
  const set = (key: (typeof FILTER_KEYS)[number]) => (value: string) =>
    setFilters({ [key]: value });

  return (
    <div className="space-y-4">
      <PageHeader
        title={item.label}
        description={
          canSeeRequests ? item.description : 'Size ve ekibinize atanmış iş emirlerinin konumları.'
        }
      />
      <Card className="overflow-hidden">
        {canSeeRequests && (
          <div className="grid grid-cols-2 gap-3 border-b border-border p-3 md:grid-cols-3 xl:grid-cols-7">
            <MapFilter label="Durum" value={filters.status} onChange={set('status')}>
              {Object.values(RequestStatus).map((s) => (
                <option key={s} value={s}>
                  {REQUEST_STATUS_LABELS[s]}
                </option>
              ))}
            </MapFilter>
            <MapFilter label="Öncelik" value={filters.priority} onChange={set('priority')}>
              {Object.values(Priority).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </MapFilter>
            {departments.data && (
              <MapFilter
                label="Müdürlük"
                value={filters.departmentId}
                onChange={set('departmentId')}
              >
                {departments.data.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </MapFilter>
            )}
            <MapFilter label="Kategori" value={filters.categoryId} onChange={set('categoryId')}>
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
            </MapFilter>
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
                <Button
                  variant="ghost"
                  onClick={() =>
                    setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])))
                  }
                >
                  <FilterX aria-hidden="true" />
                  Temizle
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <OperationsMap
            className="h-[calc(100dvh-17rem)] min-h-[480px]"
            layers={layers}
            canSeeRequests={canSeeRequests}
            canSeeRisk={canSeeRisk}
            filters={{
              status: filters.status || undefined,
              priority: filters.priority || undefined,
              departmentId: filters.departmentId || undefined,
              categoryId: filters.categoryId || undefined,
              createdFrom: dayStart(filters.createdFrom),
              createdTo: dayEnd(filters.createdTo),
            }}
            center={center}
            zoom={municipality?.mapZoom ?? null}
            onSelect={setSelection}
            onStats={setStats}
          />
          <LayerControl
            layers={layers}
            onChange={setLayers}
            available={
              canSeeRequests
                ? [
                    'requests',
                    'critical',
                    'workOrders',
                    'neighborhoods',
                    'heatmap',
                    ...(canSeeRisk ? (['risk'] as const) : []),
                  ]
                : ['workOrders', 'neighborhoods']
            }
            stats={stats}
            demoNotice={mapConfig.showDemoBoundaryNotice}
          />
          {selection && <SelectionCard selection={selection} onClose={() => setSelection(null)} />}
        </div>
      </Card>
    </div>
  );
}

function MapFilter({
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
