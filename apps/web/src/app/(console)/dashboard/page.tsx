import type { Metadata } from 'next';
import {
  AlarmClock,
  ChartNoAxesCombined,
  CircleAlert,
  ClipboardList,
  Inbox,
  MapPinned,
  ShieldCheck,
  Siren,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { getNavItem } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { TodayLabel } from '@/components/ui/today-label';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

interface Kpi {
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
}

const KPIS: Kpi[] = [
  {
    label: 'Bugünkü Talepler',
    hint: 'Bugün oluşturulan',
    icon: Inbox,
    tone: 'bg-primary-soft text-primary',
  },
  {
    label: 'Açık Talepler',
    hint: 'Kapanmamış toplam',
    icon: CircleAlert,
    tone: 'bg-accent-soft text-accent',
  },
  {
    label: 'Kritik Talepler',
    hint: 'KRİTİK öncelikli, açık',
    icon: Siren,
    tone: 'bg-critical-soft text-critical',
  },
  {
    label: 'Açık İş Emirleri',
    hint: 'Sahada bekleyen',
    icon: ClipboardList,
    tone: 'bg-warning-soft text-warning-strong',
  },
  {
    label: 'Ort. Çözüm Süresi',
    hint: 'Son 30 gün',
    icon: Timer,
    tone: 'bg-subtle text-foreground',
  },
  {
    label: 'SLA İçinde Çözüm',
    hint: 'Son 30 gün',
    icon: ShieldCheck,
    tone: 'bg-success-soft text-success',
  },
];

const RECENT_COLUMNS = [
  'Talep No',
  'Kategori',
  'Mahalle',
  'Öncelik',
  'Durum',
  'SLA',
  'Oluşturulma',
];

export default function DashboardPage() {
  const nav = getNavItem('/dashboard');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kent Operasyon Merkezi"
        description={nav.description}
        actions={<TodayLabel className="text-[13px] text-muted capitalize" />}
      />

      <section
        aria-label="Temel göstergeler"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6"
      >
        {KPIS.map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-medium text-muted">{kpi.label}</p>
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg',
                  kpi.tone,
                )}
              >
                <kpi.icon className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p
              className="tabular mt-2 text-[26px] leading-8 font-bold text-foreground"
              aria-label="Veri henüz yok"
            >
              —
            </p>
            <p className="mt-1 text-xs text-muted">{kpi.hint}</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-4">
          <div>
            <CardTitle>Canlı Kent Haritası</CardTitle>
            <CardDescription>Açık talepler, kritik olaylar ve aktif iş emirleri</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">Talepler</Badge>
            <Badge tone="critical">Kritik</Badge>
            <Badge tone="warning">İş Emirleri</Badge>
          </div>
        </CardHeader>
        <div className="relative h-[420px] bg-[#eef2f6]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-60 [background-image:linear-gradient(#dfe5ec_1px,transparent_1px),linear-gradient(90deg,#dfe5ec_1px,transparent_1px)] [background-size:48px_48px]"
          />
          <EmptyState
            icon={MapPinned}
            title="Harita katmanı hazırlanıyor"
            description="MapLibre tabanlı canlı harita; kümeleme, yoğunluk ve mahalle görünümleriyle Phase 9'da etkinleşecek."
            className="relative h-full"
          />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Talep Trendi</CardTitle>
              <CardDescription>Son 30 gün – oluşturulan ve çözülen talepler</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={ChartNoAxesCombined}
              title="Henüz trend verisi yok"
              description="Talep kayıtları oluştukça günlük eğilim burada görünecek."
              className="py-14"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Kritik Talepler</CardTitle>
              <CardDescription>SLA süresi en yakın olanlar önce</CardDescription>
            </div>
            <AlarmClock className="size-4 text-critical" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Siren}
              title="Açık kritik talep bulunmuyor"
              description="Kritik öncelikli yeni bir bildirim geldiğinde burada listelenir."
              className="py-14"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Son Talepler</CardTitle>
            <CardDescription>Sisteme en son iletilen bildirimler</CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-y border-border bg-subtle/60 text-xs font-semibold text-muted">
              <tr>
                {RECENT_COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-5 py-2.5">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={RECENT_COLUMNS.length}>
                  <EmptyState
                    icon={Inbox}
                    title="Henüz talep bulunmuyor"
                    description="Vatandaş bildirimleri ve belediye kayıtları burada listelenecek."
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
