'use client';

import { type NeighborhoodImportError } from '@kent360/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, FileJson, LoaderCircle, Upload } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/components/domain/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { ApiRequestError } from '@/lib/api-client';
import { importNeighborhoods } from '@/lib/api/municipality-domain';
import { formatNumber } from '@/lib/utils';
import { useToast } from '@/providers/toast-provider';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the API body limit
const PREVIEW_ROWS = 50;

interface PreviewRow {
  index: number;
  name: string;
  code: string;
  geometryType: string;
  issue: string | null;
}

interface ParsedFile {
  fileName: string;
  collection: unknown;
  rows: PreviewRow[];
  total: number;
}

type ServerResult =
  | { kind: 'ok'; dryRun: boolean; count: number }
  | { kind: 'failed'; message: string; errors: NeighborhoodImportError[] };

/** Quick client-side look at the file; the API performs the authoritative validation. */
function inspect(fileName: string, text: string): ParsedFile | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'Dosya geçerli bir JSON değil.';
  }
  const fc = data as { type?: unknown; features?: unknown };
  if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    return 'Dosya bir GeoJSON FeatureCollection olmalı (type: "FeatureCollection", features: [...]).';
  }
  if (fc.features.length === 0) return 'Dosyada hiç mahalle (Feature) yok.';
  const rows = fc.features.map((raw, index): PreviewRow => {
    const f = (raw ?? {}) as {
      properties?: Record<string, unknown>;
      geometry?: { type?: unknown };
    };
    const name = typeof f.properties?.name === 'string' ? f.properties.name : '';
    const code = typeof f.properties?.code === 'string' ? f.properties.code : '';
    const geometryType = typeof f.geometry?.type === 'string' ? f.geometry.type : '—';
    const issue = !name
      ? 'properties.name eksik'
      : !code
        ? 'properties.code eksik'
        : geometryType !== 'Polygon' && geometryType !== 'MultiPolygon'
          ? `Desteklenmeyen geometri: ${geometryType}`
          : null;
    return { index, name, code, geometryType, issue };
  });
  return { fileName, collection: data, rows, total: rows.length };
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<ServerResult | null>(null);

  const onFile = async (selected: File | undefined) => {
    setFile(null);
    setResult(null);
    setFileError(null);
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setFileError('Dosya 10 MB sınırını aşıyor. Geometrileri sadeleştirip tekrar deneyin.');
      return;
    }
    const parsed = inspect(selected.name, await selected.text());
    if (typeof parsed === 'string') setFileError(parsed);
    else setFile(parsed);
  };

  const mutation = useMutation({
    mutationFn: ({ dryRun }: { dryRun: boolean }) => importNeighborhoods(file!.collection, dryRun),
    onSuccess: (res) => {
      if (res.dryRun) {
        setResult({ kind: 'ok', dryRun: true, count: res.codes.length });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
      toast.success(`${formatNumber(res.imported)} mahalle başarıyla içe aktarıldı.`);
      onClose();
    },
    onError: (error) => {
      const details =
        error instanceof ApiRequestError
          ? (error.details as { errors?: NeighborhoodImportError[] } | null)
          : null;
      setResult({
        kind: 'failed',
        message: errorMessage(error, 'İçe aktarma başarısız oldu.'),
        errors: details?.errors ?? [],
      });
    },
  });

  const clientIssues = file?.rows.filter((r) => r.issue).length ?? 0;
  const types = file
    ? Object.entries(
        file.rows.reduce<Record<string, number>>(
          (acc, r) => ({ ...acc, [r.geometryType]: (acc[r.geometryType] ?? 0) + 1 }),
          {},
        ),
      )
    : [];

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title="GeoJSON içe aktar"
      description="Mahalle sınırlarını bir FeatureCollection dosyasından toplu olarak ekleyin. Dosyadaki bir mahalle bile hatalıysa hiçbir kayıt eklenmez."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="secondary"
            disabled={!file || mutation.isPending}
            onClick={() => mutation.mutate({ dryRun: true })}
          >
            Yalnızca doğrula
          </Button>
          <Button
            disabled={!file || mutation.isPending}
            onClick={() => mutation.mutate({ dryRun: false })}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            İçe aktar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border-strong bg-subtle/60 p-4">
          <label htmlFor="geojson-file" className="flex items-center gap-2 text-[13px] font-medium">
            <FileJson className="size-4 text-muted" aria-hidden="true" />
            GeoJSON dosyası (.geojson / .json, en fazla 10 MB)
          </label>
          <input
            id="geojson-file"
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="mt-3 block w-full text-[13px] file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-[13px] file:font-medium hover:file:bg-subtle"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <p className="mt-3 text-xs text-muted">
            Her Feature için <code className="font-mono">properties.name</code> ve{' '}
            <code className="font-mono">properties.code</code> (belediye içinde tekil) zorunlu;{' '}
            <code className="font-mono">district</code> ve{' '}
            <code className="font-mono">population</code> isteğe bağlı. Geometri Polygon veya
            MultiPolygon, koordinatlar WGS84 (EPSG:4326) olmalı. Aynı kodla kayıtlı mahalle varsa
            içe aktarma reddedilir.
          </p>
        </div>

        {fileError && (
          <p
            role="alert"
            className="flex gap-2 rounded-lg bg-critical-soft p-3 text-[13px] text-critical"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {fileError}
          </p>
        )}

        {file && (
          <section aria-label="Dosya önizlemesi" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-medium">{file.fileName}</span>
              <Badge tone="info">{formatNumber(file.total)} mahalle</Badge>
              {types.map(([type, count]) => (
                <Badge key={type} tone="neutral">
                  {type}: {count}
                </Badge>
              ))}
              {clientIssues > 0 && <Badge tone="warning">{clientIssues} öğede eksik bilgi</Badge>}
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              <Table>
                <THead>
                  <tr>
                    <TH>#</TH>
                    <TH>Ad</TH>
                    <TH>Kod</TH>
                    <TH>Geometri</TH>
                    <TH>Ön kontrol</TH>
                  </tr>
                </THead>
                <tbody>
                  {file.rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <TR key={r.index}>
                      <TD className="tabular text-muted">{r.index + 1}</TD>
                      <TD>{r.name || '—'}</TD>
                      <TD className="font-mono text-xs">{r.code || '—'}</TD>
                      <TD>{r.geometryType}</TD>
                      <TD>
                        {r.issue ? (
                          <span className="text-critical">{r.issue}</span>
                        ) : (
                          <span className="text-success">Uygun</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            {file.total > PREVIEW_ROWS && (
              <p className="text-xs text-muted">İlk {PREVIEW_ROWS} öğe gösteriliyor.</p>
            )}
          </section>
        )}

        {result?.kind === 'ok' && (
          <p
            role="status"
            className="flex gap-2 rounded-lg bg-success-soft p-3 text-[13px] text-success"
          >
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Doğrulama başarılı: {formatNumber(result.count)} mahalle içe aktarılmaya hazır. Henüz
            hiçbir kayıt eklenmedi.
          </p>
        )}
        {result?.kind === 'failed' && (
          <div
            role="alert"
            className="space-y-2 rounded-lg bg-critical-soft p-3 text-[13px] text-critical"
          >
            <p className="flex gap-2 font-medium">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {result.message}
            </p>
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto pl-6 text-xs">
                {result.errors.map((e, i) => (
                  <li key={`${e.index}-${i}`}>
                    {e.index >= 0 ? `${e.index + 1}. öğe` : 'Dosya'}
                    {e.code && <span className="font-mono"> ({e.code})</span>}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
