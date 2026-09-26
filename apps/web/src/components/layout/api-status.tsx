'use client';

import { type HealthStatus } from '@kent360/shared-types';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type Level = 'ok' | 'degraded' | 'down' | 'checking';

const LABELS: Record<Level, { text: string; detail: string; dot: string }> = {
  ok: { text: 'Sistem çevrimiçi', detail: 'API ve veritabanı erişilebilir.', dot: 'bg-success' },
  degraded: {
    text: 'Veritabanı yok',
    detail:
      'API çalışıyor ancak veritabanına ulaşamıyor. `npm run infra:up` ile altyapıyı başlatın.',
    dot: 'bg-warning',
  },
  down: {
    text: 'API çevrimdışı',
    detail: 'API sunucusuna ulaşılamıyor. `npm run dev:api` ile başlatın.',
    dot: 'bg-critical',
  },
  checking: {
    text: 'Kontrol ediliyor',
    detail: 'Sistem durumu kontrol ediliyor.',
    dot: 'bg-border-strong',
  },
};

/**
 * Operators should notice immediately when the console is not talking to live data.
 * /health/ready answers 503 with a body when the DB is down, so both paths are handled.
 */
export function ApiStatus() {
  const { data: level = 'checking' } = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: async (): Promise<Level> => {
      try {
        const health = await apiFetch<HealthStatus>('/health/ready');
        return health.status === 'ok' ? 'ok' : 'degraded';
      } catch (error) {
        const status = (error as { status?: number }).status;
        return status === 503 ? 'degraded' : 'down';
      }
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const label = LABELS[level];

  return (
    <div
      role="status"
      title={label.detail}
      className="hidden items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted md:flex"
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', label.dot)} />
      {label.text}
    </div>
  );
}
