'use client';

import {
  NEIGHBORHOOD_RISK_LABELS,
  type NeighborhoodRiskLevel,
  type PulseAnomaly,
  type RiskFactor,
} from '@kent360/shared-types';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn, formatNumber } from '@/lib/utils';

/** Risk levels are states → status tones, always with the label (never colour alone). */
const RISK_TONE: Record<NeighborhoodRiskLevel, 'success' | 'info' | 'warning' | 'critical'> = {
  LOW: 'success',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

export function RiskBadge({ level, score }: { level: NeighborhoodRiskLevel; score?: number }) {
  return (
    <Badge tone={RISK_TONE[level]}>
      {score !== undefined && <span className="tabular font-semibold">{score}</span>}
      {NEIGHBORHOOD_RISK_LABELS[level]} risk
    </Badge>
  );
}

/**
 * Sequential ramp for the 0–100 risk magnitude (map choropleth + score bars): one hue
 * family, light → dark. Shared by the map layer and its legend.
 */
export const RISK_RAMP: [number, string][] = [
  [0, '#FEF3C7'],
  [25, '#FCD34D'],
  [50, '#F59E0B'],
  [75, '#DC2626'],
  [100, '#991B1B'],
];

export function riskColor(score: number): string {
  let color = RISK_RAMP[0][1];
  for (const [stop, value] of RISK_RAMP) if (score >= stop) color = value;
  return color;
}

/** Score bar (0–100) with the number as text. */
export function RiskMeter({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        <span
          className="block h-full rounded-full"
          style={{ width: `${score}%`, background: riskColor(score) }}
        />
      </span>
      <span className="tabular text-xs text-muted">{score}/100</span>
    </span>
  );
}

/** Why the score is what it is: each factor, its points and the plain-language detail. */
export function RiskFactors({ factors }: { factors: RiskFactor[] }) {
  return (
    <ul className="space-y-2.5">
      {factors.map((factor) => (
        <li key={factor.key}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="font-medium">{factor.label}</span>
            <span className="tabular text-xs text-muted">+{formatNumber(factor.points)} puan</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(factor.value * 100)}%` }}
            />
          </div>
          <p className="mt-0.5 text-xs text-muted">{factor.detail}</p>
        </li>
      ))}
    </ul>
  );
}

/** Rule-based anomalies (never "AI" wording – the rule is stated in the caption). */
export function AnomalyList({
  anomalies,
  limit,
  showNeighborhoodLink = true,
}: {
  anomalies: PulseAnomaly[];
  limit?: number;
  showNeighborhoodLink?: boolean;
}) {
  const items = limit ? anomalies.slice(0, limit) : anomalies;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={`${a.neighborhoodId}-${a.categoryId}`} className="flex gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg',
              a.severity === 'HIGH'
                ? 'bg-critical-soft text-critical'
                : 'bg-warning-soft text-warning-strong',
            )}
          >
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] leading-snug">{a.message}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <Badge tone={a.severity === 'HIGH' ? 'critical' : 'warning'}>
                {a.severity === 'HIGH' ? 'Güçlü artış' : 'Artış'}
              </Badge>
              {showNeighborhoodLink && (
                <Link
                  href={`/neighborhoods/${a.neighborhoodId}`}
                  className="text-primary hover:underline"
                >
                  {a.neighborhoodName} detayı
                </Link>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars, one hue (magnitude); values printed next to each bar. */
export function CategoryBars({ items }: { items: { id: string; name: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((sum, i) => sum + i.count, 0);
  return (
    <ul className="space-y-2" aria-label="Kategori dağılımı">
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-[13px]">{item.name}</span>
          <span className="h-2 overflow-hidden rounded-r-[4px] bg-subtle" aria-hidden="true">
            <span
              className="block h-full rounded-r-[4px] bg-primary"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </span>
          <span className="tabular w-16 text-right text-xs text-muted">
            {item.count} · %{Math.round((item.count / Math.max(1, total)) * 100)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "%60,7" – Turkish decimal comma. */
export function percentText(value: number | null): string {
  return value === null
    ? '—'
    : `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value)}`;
}
