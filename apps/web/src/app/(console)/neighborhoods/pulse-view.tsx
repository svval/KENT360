'use client';

import { formatDurationShort } from '@kent360/shared-types';
import { useQuery } from '@tanstack/react-query';
import { Info, MapPinned, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AnomalyList, percentText, RiskBadge, RiskMeter } from '@/components/domain/pulse-parts';
import { QueryError, TableSkeleton } from '@/components/domain/query-states';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { listAnomalies, listNeighborhoodPulse, pulseKeys } from '@/lib/api/operations';
import { cn, formatNumber } from '@/lib/utils';

export function changeText(change: number | null, last30: number, previous30: number) {
  if (change === null) return previous30 === 0 && last30 > 0 ? 'yeni' : '—';
  return `${change > 0 ? '+' : ''}%${change}`;
}

export function PulseView() {
  const item = getNavItem('/neighborhoods');
  const list = useQuery({ queryKey: pulseKeys.list, queryFn: listNeighborhoodPulse });
  const anomalies = useQuery({ queryKey: pulseKeys.anomalies, queryFn: listAnomalies });

  return (
    <div className="space-y-6">
      <PageHeader title="MahallePulse" description={item.description} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              Kent Zekâsı – öne çıkan artışlar
            </CardTitle>
            <CardDescription>
              Son 7 gün, önceki 4 haftanın haftalık ortalamasıyla karşılaştırılır; en az 3 bildirim
              olmadan uyarı üretilmez.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {anomalies.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : anomalies.isError ? (
            <QueryError error={anomalies.error} onRetry={() => void anomalies.refetch()} />
          ) : anomalies.data.length === 0 ? (
            <p className="text-[13px] text-muted">Son 7 günde olağan dışı bir artış görünmüyor.</p>
          ) : (
            <AnomalyList anomalies={anomalies.data} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Mahalleler – risk sırasına göre</CardTitle>
            <CardDescription>
              Risk skoru kural tabanlıdır (yapay zekâ değildir): açık talep yoğunluğu, SLA aşımı,
              kritik oran, son dönem artışı ve çözüm süresi.
            </CardDescription>
          </div>
          <Info className="size-4 text-muted" aria-hidden="true" />
        </CardHeader>
        {list.isPending ? (
          <TableSkeleton rows={5} />
        ) : list.isError ? (
          <div className="p-4">
            <QueryError error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title="Aktif mahalle yok"
            description="Mahalle sınırları tanımlandığında metrikler burada görünür."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Mahalle</TH>
                <TH>Risk</TH>
                <TH className="text-right">Açık</TH>
                <TH className="text-right">Kritik</TH>
                <TH className="text-right">Açık iş emri</TH>
                <TH className="text-right">SLA aşımı</TH>
                <TH className="text-right">Ort. çözüm</TH>
                <TH className="text-right">Son 30 gün</TH>
                <TH>En sık kategori</TH>
              </tr>
            </THead>
            <tbody>
              {list.data.map((n) => (
                <TR key={n.id}>
                  <TD>
                    <Link
                      href={`/neighborhoods/${n.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {n.name}
                    </Link>
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <RiskBadge level={n.riskLevel} score={n.riskScore} />
                      <RiskMeter score={n.riskScore} />
                    </div>
                  </TD>
                  <TD className="tabular text-right">{formatNumber(n.open)}</TD>
                  <TD className="tabular text-right">{formatNumber(n.critical)}</TD>
                  <TD className="tabular text-right">{formatNumber(n.openWorkOrders)}</TD>
                  <TD className="tabular text-right">{percentText(n.slaBreachPercent)}</TD>
                  <TD className="tabular text-right whitespace-nowrap">
                    {n.avgResolutionMinutes === null
                      ? '—'
                      : formatDurationShort(n.avgResolutionMinutes)}
                  </TD>
                  <TD className="tabular text-right whitespace-nowrap">
                    {n.last30}{' '}
                    <span
                      className={cn(
                        'text-xs',
                        (n.changePercent ?? 0) > 0 ? 'text-critical' : 'text-muted',
                      )}
                    >
                      ({changeText(n.changePercent, n.last30, n.previous30)})
                    </span>
                  </TD>
                  <TD className="max-w-44 truncate">
                    {n.topCategory ? `${n.topCategory.name} (${n.topCategory.count})` : '—'}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
