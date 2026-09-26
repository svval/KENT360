import { CircleAlert, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api-client';

/** Error state: the server's Turkish message + "Tekrar dene" (UI_UX_GUIDE §7). */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message =
    error instanceof ApiRequestError ? error.message : 'Veriler yüklenirken bir hata oluştu.';
  return (
    <Card>
      <EmptyState
        icon={CircleAlert}
        title="Veriler yüklenemedi"
        description={message}
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Tekrar dene
          </Button>
        }
      />
    </Card>
  );
}

/** Loading placeholder shaped like a table. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="Yükleniyor">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

/** Message of an API error for toasts; details (validation list) joined. */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (Array.isArray(error.details) && error.details.length > 0) {
    return `${error.message} ${error.details.join(' · ')}`;
  }
  return error.message;
}
