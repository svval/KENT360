'use client';

import {
  PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  SLA_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from '@kent360/shared-types';
import { ArrowRight, Layers, X } from 'lucide-react';
import Link from 'next/link';
import {
  PriorityBadge,
  RequestStatusBadge,
  WorkOrderStatusBadge,
} from '@/components/domain/status-badges';
import { percentText, RISK_RAMP, RiskBadge } from '@/components/domain/pulse-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MARKER_COLORS } from './map-icons';
import { type MapLayersState, type MapSelection, type MapStats } from './operations-map';

const LAYER_LABELS: Record<keyof MapLayersState, string> = {
  requests: 'Talepler',
  critical: 'Kritik',
  workOrders: 'İş Emirleri',
  neighborhoods: 'Mahalleler',
  heatmap: 'Talep yoğunluğu',
  risk: 'Mahalle riski',
};

const gradient = (stops: [number, string][]) =>
  `linear-gradient(90deg, ${stops.map(([at, color]) => `${color} ${at}%`).join(', ')})`;
const HEAT_STOPS: [number, string][] = [
  [0, '#DBEAFE'],
  [45, '#60A5FA'],
  [70, '#2563EB'],
  [100, '#1E3A8A'],
];

/** Legend swatch: the same shape as the marker, so identity is not colour-only. */
function Swatch({ layer }: { layer: keyof MapLayersState }) {
  if (layer === 'heatmap' || layer === 'risk')
    return (
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-3.5 shrink-0 rounded-[3px]"
        style={{ background: gradient(layer === 'heatmap' ? HEAT_STOPS : RISK_RAMP) }}
      />
    );
  const common =
    'inline-block shrink-0 border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.15)]';
  if (layer === 'requests')
    return (
      <span
        aria-hidden="true"
        className={cn(common, 'size-3.5 rounded-full')}
        style={{ background: MARKER_COLORS.request }}
      />
    );
  if (layer === 'critical')
    return (
      <span
        aria-hidden="true"
        className={cn(common, 'size-3 rotate-45')}
        style={{ background: MARKER_COLORS.critical }}
      />
    );
  if (layer === 'workOrders')
    return (
      <span
        aria-hidden="true"
        className={cn(common, 'size-3.5 rounded-[3px]')}
        style={{ background: MARKER_COLORS.workOrder }}
      />
    );
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 rounded-[3px] border"
      style={{ borderColor: MARKER_COLORS.request, background: `${MARKER_COLORS.request}1a` }}
    />
  );
}

/** Floating layer switcher (top right) – also the legend. */
export function LayerControl({
  layers,
  onChange,
  available,
  stats,
  demoNotice,
}: {
  layers: MapLayersState;
  onChange: (layers: MapLayersState) => void;
  available: (keyof MapLayersState)[];
  stats?: MapStats | null;
  demoNotice?: boolean;
}) {
  const count = (key: keyof MapLayersState) =>
    key === 'requests'
      ? stats?.requests
      : key === 'critical'
        ? stats?.critical
        : key === 'workOrders'
          ? stats?.workOrders
          : undefined;
  return (
    <fieldset className="absolute top-3 right-3 z-10 w-52 rounded-[var(--radius-card)] border border-border bg-card/95 p-3 shadow-[var(--shadow-popover)]">
      <legend className="sr-only">Harita katmanları</legend>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Layers className="size-3.5" aria-hidden="true" />
        Katmanlar
      </p>
      <ul className="space-y-1.5">
        {available.map((key) => (
          <li key={key}>
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={layers[key]}
                onChange={(e) => onChange({ ...layers, [key]: e.target.checked })}
              />
              <Swatch layer={key} />
              <span className="flex-1">{LAYER_LABELS[key]}</span>
              {count(key) !== undefined && (
                <span className="tabular text-xs text-muted">{count(key)}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      {stats?.truncated && (
        <p className="mt-2 text-xs text-warning-strong">Bu alanda çok kayıt var; yakınlaştırın.</p>
      )}
      {layers.risk && available.includes('risk') && (
        <div className="mt-2" aria-label="Risk skoru lejantı">
          <span
            className="block h-2 rounded-full"
            style={{ background: gradient(RISK_RAMP) }}
            aria-hidden="true"
          />
          <span className="mt-0.5 flex justify-between text-[11px] text-muted">
            <span>0 düşük</span>
            <span>50</span>
            <span>100 kritik</span>
          </span>
        </div>
      )}
      {demoNotice && available.includes('neighborhoods') && (
        <p className="mt-2 text-[11px] text-muted">Demo sınır geometrisi – resmi sınır değildir.</p>
      )}
    </fieldset>
  );
}

/** Detail card of the selected marker (bottom left on the map). */
export function SelectionCard({
  selection,
  onClose,
}: {
  selection: MapSelection;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Seçilen kayıt"
      className="absolute bottom-3 left-3 z-10 w-[min(340px,calc(100%-24px))] rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-popover)]"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 rounded-md p-1 text-muted hover:bg-subtle hover:text-foreground"
        aria-label="Kapat"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      {selection.kind === 'neighborhood' && (
        <>
          <p className="text-xs text-muted">Mahalle</p>
          <p className="text-base font-semibold">{selection.name}</p>
          {selection.risk && (
            <>
              <div className="mt-2">
                <RiskBadge level={selection.risk.riskLevel} score={selection.risk.riskScore} />
              </div>
              <dl className="mt-3 space-y-1">
                <Row label="Açık talep">{selection.risk.open}</Row>
                <Row label="SLA aşım oranı">{percentText(selection.risk.slaBreachPercent)}</Row>
              </dl>
              {selection.id && (
                <Button asChild size="sm" className="mt-3 w-full">
                  <Link href={`/neighborhoods/${selection.id}`}>
                    MahallePulse detayı
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </>
          )}
        </>
      )}
      {selection.kind === 'request' && <RequestCard p={selection.properties} />}
      {selection.kind === 'workOrder' && <WorkOrderCard p={selection.properties} />}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function RequestCard({ p }: { p: Extract<MapSelection, { kind: 'request' }>['properties'] }) {
  return (
    <>
      <p className="text-xs text-muted">Talep{p.critical ? ' · kritik' : ''}</p>
      <p className="font-mono text-base font-semibold">{p.publicNumber}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <RequestStatusBadge status={p.status} />
        <PriorityBadge priority={p.priority} />
        {p.slaStatus && (
          <Badge
            tone={
              p.slaStatus === 'BREACHED'
                ? 'critical'
                : p.slaStatus === 'AT_RISK'
                  ? 'warning'
                  : 'success'
            }
          >
            {SLA_STATUS_LABELS[p.slaStatus]}
          </Badge>
        )}
      </div>
      <dl className="mt-3 space-y-1">
        <Row label="Kategori">{p.category || '—'}</Row>
        <Row label="Mahalle">{p.neighborhood || '—'}</Row>
        <Row label="Müdürlük">{p.department || '—'}</Row>
      </dl>
      <Button asChild size="sm" className="mt-3 w-full">
        <Link href={`/requests/${p.id}`}>
          Detaya git
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <span className="sr-only">
        {REQUEST_STATUS_LABELS[p.status]}, {PRIORITY_LABELS[p.priority]}
      </span>
    </>
  );
}

function WorkOrderCard({ p }: { p: Extract<MapSelection, { kind: 'workOrder' }>['properties'] }) {
  return (
    <>
      <p className="text-xs text-muted">İş emri</p>
      <p className="font-mono text-base font-semibold">{p.publicNumber}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <WorkOrderStatusBadge status={p.status} />
        <PriorityBadge priority={p.priority} />
      </div>
      <dl className="mt-3 space-y-1">
        <Row label="Kaynak talep">
          <span className="font-mono">{p.requestNumber || '—'}</span>
        </Row>
        <Row label="Ekip">{p.team || 'Atanmadı'}</Row>
        <Row label="Personel">{p.assignedUser || '—'}</Row>
        <Row label="Müdürlük">{p.department}</Row>
      </dl>
      <Button asChild size="sm" className="mt-3 w-full">
        <Link href={`/work-orders/${p.id}`}>
          İş emrine git
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <span className="sr-only">{WORK_ORDER_STATUS_LABELS[p.status]}</span>
    </>
  );
}
