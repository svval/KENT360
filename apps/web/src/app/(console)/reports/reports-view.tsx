'use client';

import {
  formatDurationShort,
  type PerformanceRow,
  PRIORITY_LABELS,
  Priority,
  REPORT_LABELS,
  REPORT_TYPES,
  REQUEST_STATUS_LABELS,
  RequestStatus,
  type ReportType,
} from '@kent360/shared-types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FilterX, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { percentText } from '@/components/domain/pulse-parts';
import { errorMessage, QueryError } from '@/components/domain/query-states';
import { getNavItem } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { useUrlState } from '@/hooks/use-url-state';
import { downloadReport, getReportSummary, reportKeys } from '@/lib/api/console';
import {
  getCategoryTree,
  listDepartments,
  listNeighborhoods,
  queryKeys,
} from '@/lib/api/municipality-domain';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';

const FILTER_KEYS = [
  'dateFrom',
  'dateTo',
  'departmentId',
  'categoryId',
  'status',
  'priority',
  'neighborhoodId',
] as const;

const duration = (minutes: number | null) =>
  minutes === null ? '—' : formatDurationShort(minutes);

export function ReportsView() {
  const item = getNavItem('/reports');
  const toast = useToast();
  const { user } = useAuth();
  // A manager's reports are always their own department (the API enforces it).
  const departmentWide = !user?.departmentId;
  const [filters, setFilters] = useUrlState(FILTER_KEYS);
  const [downloading, setDownloading] = useState<ReportType | null>(null);
  const params = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, filters[key] || undefined]),
  ) as Record<(typeof FILTER_KEYS)[number], string | undefined>;

  const summary = useQuery({
    queryKey: reportKeys.summary(params),
    queryFn: () => getReportSummary(params),
    placeholderData: keepPreviousData,
  });
  const departments = useQuery({
    queryKey: queryKeys.departments({ pageSize: 100 }),
    queryFn: () => listDepartments({ pageSize: 100 }),
    enabled: departmentWide,
  });
  const categories = useQuery({ queryKey: queryKeys.categoryTree, queryFn: getCategoryTree });
  const neighborhoods = useQuery({
    queryKey: queryKeys.neighborhoods({ pageSize: 100, status: 'ACTIVE' }),
    queryFn: () => listNeighborhoods({ pageSize: 100, status: 'ACTIVE' }),
  });

  const filtered = FILTER_KEYS.some((key) => filters[key]);
  const clear = () => setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])));
  const range = summary.data?.range;

  const download = async (type: ReportType) => {
    setDownloading(type);
    try {
      const filename = await downloadReport(type, params);
      toast.success(`${REPORT_LABELS[type].title} indirildi: ${filename}`);
    } catch (error) {
      toast.error('Rapor indirilemedi.', errorMessage(error, 'Lütfen tekrar deneyin.'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={item.label} description={item.description} />

      <Card>
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-8">
          <label className="text-xs text-muted">
            <span className="mb-1 block">Başlangıç</span>
            <Input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => setFilters({ dateFrom: e.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Bitiş</span>
            <Input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilters({ dateTo: e.target.value })}
            />
          </label>
          {departmentWide && (
            <FilterSelect
              label="Müdürlük"
              value={filters.departmentId}
              onChange={(v) => setFilters({ departmentId: v })}
            >
              {departments.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </FilterSelect>
          )}
          <FilterSelect
            label="Kategori"
            value={filters.categoryId}
            onChange={(v) => setFilters({ categoryId: v })}
          >
            {categories.data?.map((root) => [
              <option key={root.id} value={root.id}>
                {root.name} (tümü)
              </option>,
              ...root.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {`  ${child.name}`}
                </option>
              )),
            ])}
          </FilterSelect>
          <FilterSelect
            label="Durum"
            value={filters.status}
            onChange={(v) => setFilters({ status: v })}
          >
            {Object.values(RequestStatus).map((s) => (
              <option key={s} value={s}>
                {REQUEST_STATUS_LABELS[s]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Öncelik"
            value={filters.priority}
            onChange={(v) => setFilters({ priority: v })}
          >
            {Object.values(Priority).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Mahalle"
            value={filters.neighborhoodId}
            onChange={(v) => setFilters({ neighborhoodId: v })}
          >
            {neighborhoods.data?.data.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </FilterSelect>
          {filtered && (
            <div className="flex items-end">
              <Button variant="ghost" onClick={clear}>
                <FilterX aria-hidden="true" />
                Temizle
              </Button>
            </div>
          )}
        </div>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          {range
            ? `Dönem: ${formatDay(range.from)} – ${formatDay(range.to)} (oluşturulma tarihine göre${
                filters.dateFrom ? '' : ', varsayılan son 30 gün'
              }).`
            : 'Dönem: son 30 gün.'}
          {!departmentWide && ' Raporlar müdürlüğünüzün kayıtlarıyla sınırlıdır.'}
        </p>
      </Card>

      {summary.isError ? (
        <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <section aria-label="Rapor özeti" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {(
            [
              ['Toplam talep', summary.data && formatNumber(summary.data.totals.requests), null],
              [
                'Çözülen',
                summary.data && formatNumber(summary.data.totals.resolved),
                summary.data && `${formatNumber(summary.data.totals.open)} açık`,
              ],
              [
                'SLA içinde',
                summary.data && percentText(summary.data.totals.slaCompliancePercent),
                summary.data &&
                  `${formatNumber(summary.data.totals.slaResolvedWithin)} talep süresinde çözüldü`,
              ],
              [
                'Ort. çözüm süresi',
                summary.data && duration(summary.data.totals.avgResolutionMinutes),
                null,
              ],
              [
                'Açık iş emri',
                summary.data && formatNumber(summary.data.totals.openWorkOrders),
                summary.data && `dönemde ${formatNumber(summary.data.totals.workOrders)} iş emri`,
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <Card key={label} className="p-4">
              <p className="text-[13px] font-medium text-muted">{label}</p>
              {value === undefined ? (
                <Skeleton className="mt-2 h-7 w-20" />
              ) : (
                <p className="tabular mt-1 text-[24px] leading-8 font-bold" data-kpi={label}>
                  {value}
                </p>
              )}
              {hint && <p className="text-xs text-muted">{hint}</p>}
            </Card>
          ))}
        </section>
      )}

      {summary.data && (
        <div className="grid items-start gap-6 2xl:grid-cols-2">
          <PerformanceTable
            title="Müdürlük performansı"
            column="Müdürlük"
            rows={summary.data.departments}
          />
          <PerformanceTable
            title="Mahalle performansı"
            column="Mahalle"
            rows={summary.data.neighborhoods}
          />
        </div>
      )}

      <section aria-labelledby="exports-title" className="space-y-3">
        <div>
          <h2 id="exports-title" className="text-lg font-semibold">
            Dışa aktar
          </h2>
          <p className="text-[13px] text-muted">
            Seçili filtrelerle CSV (Excel uyumlu, Türkçe karakterler korunur). Kişisel veri ve
            açıklama metni dışa aktarılmaz.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {REPORT_TYPES.map((type) => (
            <Card key={type} className="flex flex-col p-4">
              <FileSpreadsheet className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-2 text-[14px] font-semibold">{REPORT_LABELS[type].title}</h3>
              <p className="mt-1 flex-1 text-xs text-muted">{REPORT_LABELS[type].description}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={downloading !== null}
                onClick={() => void download(type)}
                aria-label={`${REPORT_LABELS[type].title} CSV indir`}
              >
                {downloading === type ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                CSV indir
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

function PerformanceTable({
  title,
  column,
  rows,
}: {
  title: string;
  column: string;
  rows: PerformanceRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Seçili dönemde oluşturulan talepler.</CardDescription>
        </div>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent>
          <EmptyState
            icon={FileSpreadsheet}
            title="Bu filtrelere uygun talep yok."
            className="py-6"
          />
        </CardContent>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{column}</TH>
              <TH className="text-right">Toplam</TH>
              <TH className="text-right">Açık</TH>
              <TH className="text-right">Çözülen</TH>
              <TH className="text-right">SLA uyumu</TH>
              <TH className="text-right">Ort. çözüm</TH>
            </tr>
          </THead>
          <tbody>
            {rows.slice(0, 10).map((row) => (
              <TR key={row.id ?? 'none'}>
                <TD className="max-w-48 truncate font-medium">{row.name}</TD>
                <TD className="tabular text-right">{formatNumber(row.total)}</TD>
                <TD className="tabular text-right">{formatNumber(row.open)}</TD>
                <TD className="tabular text-right">{formatNumber(row.resolved)}</TD>
                <TD className="tabular text-right">{percentText(row.slaCompliancePercent)}</TD>
                <TD className="tabular text-right whitespace-nowrap">
                  {duration(row.avgResolutionMinutes)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function FilterSelect({
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
