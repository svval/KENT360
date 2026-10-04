'use client';

import { PRIORITY_LABELS, type RequestAiAnalysis } from '@kent360/shared-types';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';

/** Stored AI analysis – municipal staff only (the API returns null to citizens). */
export function AiPanel({ ai }: { ai: RequestAiAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          AI Analizi
        </CardTitle>
        <Badge tone="accent">Öneri</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-[13.5px]">
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-muted">Kategori önerisi</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {ai.category?.name ?? 'Önerilemedi'}
              {ai.accepted === true && <Badge tone="success">Seçilen kategoriyle aynı</Badge>}
              {ai.accepted === false && <Badge tone="warning">Farklı kategori seçildi</Badge>}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-muted">Müdürlük</dt>
              <dd>{ai.department?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Öncelik önerisi</dt>
              <dd>{ai.priority ? PRIORITY_LABELS[ai.priority] : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Güven</dt>
              <dd className="tabular">%{Math.round(ai.confidence * 100)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Analiz</dt>
              <dd className="tabular text-xs">{formatDateTime(ai.createdAt)}</dd>
            </div>
          </div>
          {ai.summary && (
            <div>
              <dt className="text-xs text-muted">Özet</dt>
              <dd>{ai.summary}</dd>
            </div>
          )}
          {ai.reasoning && (
            <div>
              <dt className="text-xs text-muted">Gerekçe</dt>
              <dd className="text-xs text-muted">{ai.reasoning}</dd>
            </div>
          )}
        </dl>
        {ai.duplicates.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted">Olası benzer talepler</p>
            <ul className="mt-1 space-y-1">
              {ai.duplicates.map((d) => (
                <li key={d.requestId} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/requests/${d.requestId}`}
                    className="font-mono text-[13px] text-primary hover:underline"
                  >
                    {d.publicNumber}
                  </Link>
                  <span className="tabular text-xs text-muted">
                    {d.distanceMeters} m · %{Math.round(d.score * 100)}
                    {d.score >= 0.6 && ' · olası mükerrer'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-muted">
          {ai.provider === 'mock' ? 'Kural tabanlı sınıflandırıcı' : `${ai.provider} · ${ai.model}`}
          {ai.latencyMs !== null && ` · ${ai.latencyMs} ms`}. AI karar vermez; yönlendirme ve
          öncelik personelindir.
        </p>
      </CardContent>
    </Card>
  );
}
