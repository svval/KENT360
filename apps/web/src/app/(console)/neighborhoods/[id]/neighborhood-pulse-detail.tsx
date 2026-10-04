'use client';

import { formatDurationShort, Permission } from '@kent360/shared-types';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  AnomalyList,
  CategoryBars,
  percentText,
  RiskBadge,
  RiskFactors,
  riskColor,
} from '@/components/domain/pulse-parts';
import { QueryError } from '@/components/domain/query-states';
import { SlaIndicator } from '@/components/domain/sla-indicator';
import {
  PriorityBadge,
  RequestStatusBadge,
  WorkOrderStatusBadge,
} from '@/components/domain/status-badges';
import { TrendChart } from '@/components/domain/trend-chart';
import { SelectionCard } from '@/components/map/map-panels';
import { type MapSelection, OperationsMap } from '@/components/map/operations-map';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api-client';
import { getNeighborhoodPulse, pulseKeys } from '@/lib/api/operations';
import { cn, formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { changeText } from '../pulse-view';

const MAP_LAYERS = {
  requests: true,
  critical: true,
  workOrders: true,
  neighborhoods: true,
  heatmap: false,
  risk: false,
};

export function NeighborhoodPulseDetailView({ id }: { id: string }) {
  const { hasPermission } = useAuth();
  const [days, setDays] = useState<30 | 90>(30);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const query = useQuery({
    queryKey: pulseKeys.detail(id),
    queryFn: () => getNeighborhoodPulse(id),
    retry: (count, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && count < 1,
  });

  if (query.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Mahalle yükleniyor">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiRequestError && query.error.status === 404) {
      return (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Mahalle bulunamadı"
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="/neighborhoods">MahallePulse&apos;a dön</Link>
              </Button>
            }
          />
        </Card>
      );
    }
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }
  const n = query.data;
  const kpis: [string, string, string?][] = [
    ['Toplam talep', formatNumber(n.total)],
    ['Açık talep', formatNumber(n.open)],
    ['Kritik (açık)', formatNumber(n.critical)],
    ['Açık iş emri', formatNumber(n.openWorkOrders)],
    ['SLA aşım oranı', percentText(n.slaBreachPercent), 'son 90 gün'],
    [
      'Ort. çözüm süresi',
      n.avgResolutionMinutes === null ? '—' : formatDurationShort(n.avgResolutionMinutes),
      'son 90 gün',
    ],
    ['Son 7 gün', formatNumber(n.last7)],
    [
      'Son 30 gün',
      formatNumber(n.last30),
      `önceki 30 gün ${n.previous30} (${changeText(n.changePercent, n.last30, n.previous30)})`,
    ],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/neighborhoods"
          className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          MahallePulse
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight">{n.name}</h1>
          <RiskBadge level={n.riskLevel} score={n.riskScore} />
        </div>
      </div>

      <section aria-label="Mahalle göstergeleri" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(([label, value, hint]) => (
          <Card key={label} className="p-4">
            <p className="text-[13px] font-medium text-muted">{label}</p>
            <p className="tabular mt-1 text-[24px] leading-8 font-bold" data-kpi={label}>
              {value}
            </p>
            {hint && <p className="text-xs text-muted">{hint}</p>}
          </Card>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Risk skoru</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <span
                className="tabular text-[44px] leading-none font-bold"
                data-risk-score={n.riskScore}
              >
                {n.riskScore}
              </span>
              <span className="pb-1 text-sm text-muted">/ 100</span>
              <span
                className="mb-2 ml-auto h-2 w-24 rounded-full"
                style={{ background: riskColor(n.riskScore) }}
                aria-hidden="true"
              />
            </div>
            <p className="text-xs text-muted">
              Kural tabanlı ve açıklanabilir: her bileşenin puanı aşağıda.
            </p>
            <RiskFactors factors={n.riskFactors} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Talep trendi</CardTitle>
            <div className="flex gap-1" role="group" aria-label="Dönem">
              {([30, 90] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={days === d ? 'primary' : 'ghost'}
                  aria-pressed={days === d}
                  onClick={() => setDays(d)}
                >
                  {d} gün
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart data={n.trend.slice(-days)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kategori dağılımı (son 90 gün)</CardTitle>
          </CardHeader>
          <CardContent>
            {n.categories.length === 0 ? (
              <p className="text-[13px] text-muted">Son 90 günde talep yok.</p>
            ) : (
              <CategoryBars items={n.categories} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Anomaliler</CardTitle>
          </CardHeader>
          <CardContent>
            {n.anomalies.length === 0 ? (
              <p className="text-[13px] text-muted">Son 7 günde olağan dışı artış yok.</p>
            ) : (
              <AnomalyList anomalies={n.anomalies} showNeighborhoodLink={false} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle>Mahalle haritası</CardTitle>
        </CardHeader>
        <div className="relative">
          <OperationsMap
            className="h-[380px]"
            layers={MAP_LAYERS}
            canSeeRequests={hasPermission(Permission.REQUESTS_READ)}
            center={n.center ? [n.center.longitude, n.center.latitude] : null}
            zoom={n.center ? 14.5 : null}
            onSelect={setSelection}
          />
          {selection && <SelectionCard selection={selection} onClose={() => setSelection(null)} />}
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Açık talepler</CardTitle>
          </CardHeader>
          <CardContent>
            {n.openRequests.length === 0 ? (
              <p className="text-[13px] text-muted">Açık talep yok.</p>
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {n.openRequests.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/requests/${r.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-subtle"
                    >
                      <span className="font-mono text-[13px] font-semibold text-primary">
                        {r.publicNumber}
                      </span>
                      <span className="text-[13px]">{r.category?.name}</span>
                      <span className="ml-auto flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={r.priority} />
                        <RequestStatusBadge status={r.status} />
                        <SlaIndicator sla={r.sla} status={r.status} compact />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Aktif iş emirleri</CardTitle>
          </CardHeader>
          <CardContent>
            {n.activeWorkOrders.length === 0 ? (
              <p className="text-[13px] text-muted">Aktif iş emri yok.</p>
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {n.activeWorkOrders.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/work-orders/${w.id}`}
                      className={cn(
                        'flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-subtle',
                      )}
                    >
                      <span className="font-mono text-[13px] font-semibold text-primary">
                        {w.publicNumber}
                      </span>
                      <span className="text-xs text-muted">
                        {w.requestNumber} · {w.team ?? 'Atanmadı'}
                      </span>
                      <span className="ml-auto flex items-center gap-1.5">
                        <PriorityBadge priority={w.priority} />
                        <WorkOrderStatusBadge status={w.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
