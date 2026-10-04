'use client';

import {
  formatDurationShort,
  type KpiValue,
  Permission,
  type RequestSummary,
} from '@kent360/shared-types';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleAlert,
  ClipboardList,
  Inbox,
  Map as MapIcon,
  ShieldCheck,
  Siren,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AnomalyList } from '@/components/domain/pulse-parts';
import { QueryError } from '@/components/domain/query-states';
import { SlaIndicator } from '@/components/domain/sla-indicator';
import { PriorityBadge, RequestStatusBadge } from '@/components/domain/status-badges';
import { TrendChart } from '@/components/domain/trend-chart';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { LayerControl, SelectionCard } from '@/components/map/map-panels';
import {
  type MapLayersState,
  type MapSelection,
  type MapStats,
  OperationsMap,
} from '@/components/map/operations-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { TodayLabel } from '@/components/ui/today-label';
import {
  getDashboardOverview,
  listAnomalies,
  operationsKeys,
  pulseKeys,
} from '@/lib/api/operations';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** KPIs refresh every minute – an operations centre should not need a manual reload. */
const REFRESH_MS = 60_000;

type Better = 'higher' | 'lower' | 'none';

interface KpiDef {
  key: keyof DashboardKpis;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  format: (value: number) => string;
  compare?: { label: string; better: Better };
}
type DashboardKpis = Awaited<ReturnType<typeof getDashboardOverview>>['kpis'];

const percentText = (v: number) =>
  `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(v)}`;

const KPIS: KpiDef[] = [
  {
    key: 'todayRequests',
    label: 'Bugünkü Talepler',
    hint: 'Bugün oluşturulan',
    icon: Inbox,
    tone: 'bg-primary-soft text-primary',
    format: formatNumber,
    compare: { label: 'Dün', better: 'none' },
  },
  {
    key: 'openRequests',
    label: 'Açık Talepler',
    hint: 'Henüz çözülmemiş',
    icon: CircleAlert,
    tone: 'bg-accent-soft text-accent',
    format: formatNumber,
  },
  {
    key: 'criticalRequests',
    label: 'Kritik Talepler',
    hint: 'Kritik öncelikli, açık',
    icon: Siren,
    tone: 'bg-critical-soft text-critical',
    format: formatNumber,
  },
  {
    key: 'openWorkOrders',
    label: 'Açık İş Emirleri',
    hint: 'Sahada süren işler',
    icon: ClipboardList,
    tone: 'bg-warning-soft text-warning-strong',
    format: formatNumber,
  },
  {
    key: 'avgResolutionMinutes',
    label: 'Ort. Çözüm Süresi',
    hint: 'Son 30 günde çözülenler',
    icon: Timer,
    tone: 'bg-subtle text-foreground',
    format: formatDurationShort,
    compare: { label: 'Önceki 30 gün', better: 'lower' },
  },
  {
    key: 'slaCompliancePercent',
    label: 'SLA İçinde Çözüm',
    hint: 'Son 30 günde çözülenler',
    icon: ShieldCheck,
    tone: 'bg-success-soft text-success',
    format: percentText,
    compare: { label: 'Önceki 30 gün', better: 'higher' },
  },
];

const REASON: Record<
  'CRITICAL' | 'BREACHED' | 'AT_RISK',
  { label: string; tone: 'critical' | 'warning' }
> = {
  CRITICAL: { label: 'Kritik', tone: 'critical' },
  BREACHED: { label: 'SLA aşıldı', tone: 'critical' },
  AT_RISK: { label: 'SLA riskte', tone: 'warning' },
};

const ageText = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return `${formatDurationShort(minutes)} önce`;
};

export function DashboardView() {
  const nav = getNavItem('/dashboard');
  const { hasPermission } = useAuth();
  const isOperations = hasPermission(Permission.REQUESTS_READ);
  if (!isOperations) return <StartPanel />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kent Operasyon Merkezi"
        description={nav.description}
        actions={<TodayLabel className="text-[13px] text-muted capitalize" />}
      />
      <OperationsDashboard />
    </div>
  );
}

function OperationsDashboard() {
  const { user, hasPermission } = useAuth();
  const canSeeAnalytics = hasPermission(Permission.ANALYTICS_READ);
  const anomalies = useQuery({
    queryKey: pulseKeys.anomalies,
    queryFn: listAnomalies,
    enabled: canSeeAnalytics,
    refetchInterval: REFRESH_MS,
  });
  const query = useQuery({
    queryKey: operationsKeys.dashboard,
    queryFn: getDashboardOverview,
    refetchInterval: REFRESH_MS,
  });
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
  const municipality = user?.municipality;
  const center =
    municipality?.mapCenterLng != null && municipality.mapCenterLat != null
      ? ([municipality.mapCenterLng, municipality.mapCenterLat] as [number, number])
      : null;

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }
  const data = query.data;

  return (
    <>
      <section
        aria-label="Temel göstergeler"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6"
      >
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.key} def={kpi} value={data?.kpis[kpi.key]} />
        ))}
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-4">
          <div>
            <CardTitle>Canlı Kent Haritası</CardTitle>
            <CardDescription>Açık talepler, kritik olaylar ve aktif iş emirleri</CardDescription>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/map">
              <MapIcon aria-hidden="true" />
              Haritayı aç
            </Link>
          </Button>
        </CardHeader>
        <div className="relative">
          <OperationsMap
            className="h-[420px]"
            layers={layers}
            canSeeRequests
            canSeeRisk={canSeeAnalytics}
            openOnly
            center={center}
            zoom={municipality?.mapZoom ?? null}
            onSelect={setSelection}
            onStats={setStats}
          />
          <LayerControl
            layers={layers}
            onChange={setLayers}
            available={[
              'requests',
              'critical',
              'workOrders',
              'neighborhoods',
              ...(canSeeAnalytics ? (['risk'] as const) : []),
            ]}
            stats={stats}
          />
          {selection && <SelectionCard selection={selection} onClose={() => setSelection(null)} />}
        </div>
      </Card>

      {canSeeAnalytics && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent" aria-hidden="true" />
                Kent Zekâsı
              </CardTitle>
              <CardDescription>
                MahallePulse: son 7 günde olağan dışı artan sorunlar (kural tabanlı)
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/neighborhoods">
                MahallePulse
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {anomalies.isPending ? (
              <Skeleton className="h-16 w-full" role="status" aria-label="Anomaliler yükleniyor" />
            ) : anomalies.isError ? (
              <p className="text-[13px] text-critical">Kent zekâsı verisi yüklenemedi.</p>
            ) : anomalies.data.length === 0 ? (
              <p className="text-[13px] text-muted">
                Son 7 günde olağan dışı bir artış görünmüyor.
              </p>
            ) : (
              <AnomalyList anomalies={anomalies.data} limit={3} />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Talep Trendi</CardTitle>
              <CardDescription>Son 30 gün – günlük oluşturulan ve çözülen talepler</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data ? (
              <TrendChart data={data.trend} />
            ) : (
              <Skeleton className="h-64 w-full" role="status" aria-label="Trend yükleniyor" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Kritik Talepler</CardTitle>
              <CardDescription>Kritik öncelik, ardından SLA aşımı ve riski</CardDescription>
            </div>
            <Siren className="size-4 text-critical" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {!data ? (
              <div className="space-y-2" role="status" aria-label="Kritik talepler yükleniyor">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : data.criticalRequests.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Kritik veya SLA'sı riskte talep yok"
                description="Yeni bir kritik bildirim ya da SLA riski oluştuğunda burada listelenir."
                className="py-10"
              />
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {data.criticalRequests.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/requests/${r.id}`}
                      className="block rounded-lg px-2 py-2.5 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-semibold text-primary">
                          {r.publicNumber}
                        </span>
                        <Badge tone={REASON[r.reason].tone}>{REASON[r.reason].label}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-foreground">
                        {r.category?.name ?? '—'}
                        <span className="text-muted">
                          {' '}
                          · {r.neighborhood?.name ?? 'Sınır dışı'}
                        </span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <PriorityBadge priority={r.priority} />
                        <SlaIndicator sla={r.sla} status={r.status} compact />
                        <span className="tabular text-xs text-muted">{ageText(r.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Son Talepler</CardTitle>
            <CardDescription>Sisteme en son iletilen bildirimler</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/requests">
              Tümünü gör
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        {!data ? (
          <div className="space-y-2 p-4" role="status" aria-label="Son talepler yükleniyor">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data.recentRequests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Henüz talep bulunmuyor"
            description="Vatandaş bildirimleri ve belediye kayıtları burada listelenecek."
          />
        ) : (
          <RecentTable rows={data.recentRequests} />
        )}
      </Card>
    </>
  );
}

function KpiCard({ def, value }: { def: KpiDef; value: KpiValue | undefined }) {
  const current = value?.value ?? null;
  const previous = value?.previous ?? null;
  let trend: { text: string; tone: string } | null = null;
  if (def.compare && previous !== null) {
    const diff = current === null ? 0 : current - previous;
    const good =
      def.compare.better === 'none'
        ? null
        : diff === 0
          ? null
          : (def.compare.better === 'higher') === diff > 0;
    trend = {
      text: `${def.compare.label}: ${def.format(previous)}`,
      tone: good === null ? 'text-muted' : good ? 'text-success' : 'text-critical',
    };
  }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{def.label}</p>
        <span
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', def.tone)}
        >
          <def.icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-20" role="status" aria-label={`${def.label} yükleniyor`} />
      ) : (
        <p
          className="tabular mt-2 text-[26px] leading-8 font-bold text-foreground"
          data-kpi={def.key}
        >
          {current === null ? '—' : def.format(current)}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">{def.hint}</p>
      {trend && <p className={cn('tabular mt-0.5 text-xs', trend.tone)}>{trend.text}</p>}
    </Card>
  );
}

function RecentTable({ rows }: { rows: RequestSummary[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Talep No</TH>
          <TH>Kategori</TH>
          <TH>Mahalle</TH>
          <TH>Öncelik</TH>
          <TH>Durum</TH>
          <TH>SLA</TH>
          <TH>Oluşturulma</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-mono text-xs whitespace-nowrap">
              <Link href={`/requests/${r.id}`} className="font-medium text-primary hover:underline">
                {r.publicNumber}
              </Link>
            </TD>
            <TD className="font-medium">{r.category?.name ?? '—'}</TD>
            <TD>
              {r.neighborhood?.name ?? <span className="text-xs text-muted">Sınır dışı</span>}
            </TD>
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
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

/** Citizens and field staff land here too – they get shortcuts, not operations data. */
function StartPanel() {
  const { user, hasPermission } = useAuth();
  const links = [
    hasPermission(Permission.REQUESTS_READ_OWN) && {
      href: '/requests',
      title: 'Taleplerim',
      text: 'Bildirimlerinizin durumunu takip edin.',
      icon: Inbox,
    },
    hasPermission(Permission.REQUESTS_CREATE) && {
      href: '/requests/new',
      title: 'Yeni Talep',
      text: 'Fotoğraf ve konumla yeni bir sorun bildirin.',
      icon: CircleAlert,
    },
    hasPermission(Permission.WORK_ORDERS_READ_ASSIGNED) && {
      href: '/work-orders',
      title: 'Görevlerim',
      text: 'Size ve ekibinize atanan iş emirleri.',
      icon: ClipboardList,
    },
    hasPermission(Permission.WORK_ORDERS_READ_ASSIGNED) && {
      href: '/map',
      title: 'Görev haritası',
      text: 'İş emirlerinizin konumları.',
      icon: MapIcon,
    },
  ].filter(Boolean) as { href: string; title: string; text: string; icon: LucideIcon }[];
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hoş geldiniz${user ? `, ${user.firstName}` : ''}`}
        description="Size açık olan işlemlere buradan ulaşabilirsiniz."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-[var(--radius-card)] border border-border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <link.icon className="size-5 text-primary" aria-hidden="true" />
            <p className="mt-3 font-semibold">{link.title}</p>
            <p className="mt-1 text-[13px] text-muted">{link.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
