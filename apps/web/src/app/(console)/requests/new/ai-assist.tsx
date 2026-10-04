'use client';

import {
  type DuplicateCandidate,
  Permission,
  PRIORITY_LABELS,
  type RequestAnalysisResult,
} from '@kent360/shared-types';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Copy, LoaderCircle, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorMessage } from '@/components/domain/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeRequest, joinRequest } from '@/lib/api/operations';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';

/**
 * "AI önerisi" + similar reports for the new-request form. Runs only on demand (button,
 * not on every keystroke); nothing is saved. The suggestion is applied only when the
 * user chooses to; duplicates offer joining the existing request instead.
 */
export function AiAssist({
  description,
  latitude,
  longitude,
  categoryId,
  onApply,
}: {
  description: string;
  latitude: number | null;
  longitude: number | null;
  categoryId: string | null;
  onApply: (category: { id: string; parentId: string | null }) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const isCitizen = !hasPermission(Permission.REQUESTS_READ);
  const [result, setResult] = useState<RequestAnalysisResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = useMutation({
    mutationFn: () =>
      analyzeRequest({
        description: description.trim(),
        ...(latitude !== null && longitude !== null && { latitude, longitude }),
        ...(categoryId && { categoryId }),
      }),
    onSuccess: (data) => {
      setResult(data);
      setDismissed(false);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err, 'Analiz yapılamadı.')),
  });
  const join = useMutation({
    mutationFn: (candidate: DuplicateCandidate) => joinRequest(candidate.requestId),
    onSuccess: (detail) => {
      toast.success(
        `${detail.publicNumber} talebine katıldınız; gelişmeleri buradan izleyebilirsiniz.`,
      );
      router.push(`/requests/${detail.id}`);
    },
    onError: (err) => toast.error('Talebe katılınamadı.', errorMessage(err, '')),
  });

  const ready = description.trim().length >= 10;
  const s = result?.suggestion;
  const alreadyApplied = s?.category && s.category.id === categoryId;
  const duplicates = result?.possibleDuplicates.filter((d) => d.possibleDuplicate) ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            AI önerisi
          </CardTitle>
          <CardDescription>
            Açıklamaya göre kategori ve öncelik önerir, yakındaki benzer bildirimleri bulur.
            Öneridir; karar sizindir. Kişisel bilgiler analize gönderilmez.
          </CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!ready || analysis.isPending}
          onClick={() => analysis.mutate()}
          title={ready ? undefined : 'Önce en az 10 karakterlik bir açıklama yazın'}
        >
          {analysis.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          AI ile analiz et
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && !error && (
          <p className="text-[13px] text-muted">
            {ready
              ? 'Hazır olduğunuzda "AI ile analiz et"e basın. Konumu girdiyseniz benzer bildirimler de aranır.'
              : 'Analiz için önce açıklamayı yazın.'}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-critical-soft p-3 text-[13px] text-critical">
            {error}
          </p>
        )}
        {s && result && (
          <section aria-label="AI önerisi" className="rounded-lg border border-border p-4">
            <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Kategori</dt>
                <dd className="font-medium">
                  {s.category
                    ? `${s.category.parent ? `${s.category.parent.name} › ` : ''}${s.category.name}`
                    : 'Önerilemedi – lütfen seçin'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Müdürlük</dt>
                <dd>{s.department?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Öncelik</dt>
                <dd>{PRIORITY_LABELS[s.priority]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Güven</dt>
                <dd className="tabular" data-confidence={s.confidence}>
                  %{Math.round(s.confidence * 100)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">{s.reasoning}</p>
            <p className="mt-1 text-[11px] text-muted">
              Kaynak: {result.provider === 'mock' ? 'kural tabanlı sınıflandırıcı' : result.model}
              {result.fallback && ' (AI servisine ulaşılamadı, kural tabanlı yedek kullanıldı)'}
            </p>
            {s.category && (
              <Button
                size="sm"
                className="mt-3"
                disabled={Boolean(alreadyApplied)}
                onClick={() => {
                  onApply({ id: s.category!.id, parentId: s.category!.parent?.id ?? null });
                  toast.success(`Kategori "${s.category!.name}" olarak seçildi.`);
                }}
              >
                {alreadyApplied ? 'Öneri uygulandı' : 'Öneriyi uygula'}
              </Button>
            )}
          </section>
        )}

        {result && duplicates.length > 0 && !dismissed && (
          <section
            aria-label="Benzer bildirimler"
            className="rounded-lg border border-warning/40 bg-warning-soft/40 p-4"
          >
            <p className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Copy className="size-4 text-warning-strong" aria-hidden="true" />
              Benzer bildirimler bulundu
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Aynı sorun zaten bildirilmiş olabilir. Yeni talep yerine mevcut talebe katılırsanız
              ekipler tek iş üzerinde çalışır.
            </p>
            <ul className="mt-3 space-y-2">
              {duplicates.map((d) => (
                <li
                  key={d.requestId}
                  className="flex flex-col gap-2 rounded-lg bg-card p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold">{d.publicNumber}</span>
                      <Badge tone="warning">%{Math.round(d.score * 100)} benzer</Badge>
                      {d.supporterCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <Users className="size-3.5" aria-hidden="true" />
                          {d.supporterCount} kişi katıldı
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {d.categoryName ?? '—'} · {d.explanation}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {d.canView && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/requests/${d.requestId}`}>
                          Detayı gör
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                    {isCitizen && !d.canView && (
                      <Button size="sm" disabled={join.isPending} onClick={() => join.mutate(d)}>
                        {join.isPending && join.variables?.requestId === d.requestId && (
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                        )}
                        Bu talebe katıl
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDismissed(true)}>
              Yine de yeni talep oluştur
            </Button>
          </section>
        )}
        {result && duplicates.length === 0 && latitude !== null && (
          <p className="text-[13px] text-muted">Yakında benzer bir açık bildirim bulunmadı.</p>
        )}
      </CardContent>
    </Card>
  );
}
