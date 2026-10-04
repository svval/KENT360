'use client';

import { useId, useMemo, useState } from 'react';
import { cn, formatNumber } from '@/lib/utils';

export interface TrendPoint {
  date: string;
  created: number;
  resolved: number;
}

/**
 * Two-series daily line chart (created vs resolved), dependency-free SVG.
 * Palette validated (dataviz validate_palette: light surface, all checks pass); the
 * second series is also dashed and both are direct-labelled, so identity never rests
 * on colour alone. One y-axis, recessive grid, crosshair + tooltip on hover/focus,
 * and a table view for screen readers and exact values.
 */
const SERIES = [
  { key: 'created', label: 'Oluşturulan', color: '#2563EB', dash: undefined },
  { key: 'resolved', label: 'Çözülen', color: '#0891B2', dash: '5 4' },
] as const;

const W = 720;
const H = 240;
const PAD = { top: 16, right: 92, bottom: 28, left: 36 };

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / step) * step;
}

export function TrendChart({ data, className }: { data: TrendPoint[]; className?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(
    () => niceMax(Math.max(1, ...data.flatMap((d) => [d.created, d.resolved]))),
    [data],
  );
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const path = (key: 'created' | 'resolved') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  const totals = {
    created: data.reduce((s, d) => s + d.created, 0),
    resolved: data.reduce((s, d) => s + d.resolved, 0),
  };
  const last = data.length - 1;
  const point = hover === null ? null : data[hover];

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(last, Math.round(ratio * last))));
  };

  return (
    <figure className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="22" height="8">
              <line
                x1="0"
                x2="22"
                y1="4"
                y2="4"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dash}
              />
            </svg>
            <span className="text-foreground">{s.label}</span>
            <span className="tabular">({formatNumber(totals[s.key])})</span>
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-labelledby={`${id}-title`}
        >
          <title id={`${id}-title`}>
            Son {data.length} gün: {totals.created} talep oluşturuldu, {totals.resolved} talep
            çözüldü.
          </title>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="#e5e9f0"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-[#64748b] text-[11px] tabular-nums"
              >
                {formatNumber(Math.round(t))}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % 7 === last % 7 ? (
              <text
                key={d.date}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-[#64748b] text-[11px]"
              >
                {dayLabel(d.date)}
              </text>
            ) : null,
          )}
          {SERIES.map((s) => (
            <path
              key={s.key}
              d={path(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash}
            />
          ))}
          {/* Direct labels at the line ends (text in ink colour, mark in series colour). */}
          {SERIES.map((s, index) => {
            const yy = y(data[last]?.[s.key] ?? 0);
            const other = y(data[last]?.[SERIES[1 - index].key] ?? 0);
            const nudge = Math.abs(yy - other) < 14 ? (index === 0 ? -7 : 7) : 0;
            return (
              <g key={s.key}>
                <circle cx={x(last)} cy={yy} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
                <text x={x(last) + 10} y={yy + 4 + nudge} className="fill-[#0f172a] text-[11px]">
                  {s.label}
                </text>
              </g>
            );
          })}
          {point && hover !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="#94a3b8"
                strokeWidth="1"
              />
              {SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={x(hover)}
                  cy={y(point[s.key])}
                  r="4.5"
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {point && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-[var(--shadow-popover)]"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: hover > last / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            }}
          >
            <p className="font-semibold text-foreground">{dayLabel(point.date)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="mt-1 flex items-center justify-between gap-3 text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-3"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  {s.label}
                </span>
                <span className="tabular font-semibold text-foreground">
                  {formatNumber(point[s.key])}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none">Tablo görünümü</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-1 font-medium">Gün</th>
                <th className="py-1 text-right font-medium">Oluşturulan</th>
                <th className="py-1 text-right font-medium">Çözülen</th>
              </tr>
            </thead>
            <tbody className="tabular text-foreground">
              {data.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-1">{dayLabel(d.date)}</td>
                  <td className="py-1 text-right">{d.created}</td>
                  <td className="py-1 text-right">{d.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
