'use client';

import {
  REQUEST_MEDIA_LIMITS,
  REQUEST_SOURCE_LABELS,
  type RequestDetail,
} from '@kent360/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CircleAlert,
  ImageOff,
  ImagePlus,
  LoaderCircle,
  MapPin,
  SearchX,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { GeometryPreview } from '@/components/domain/geometry-preview';
import { errorMessage, QueryError } from '@/components/domain/query-states';
import { RequestTimeline } from '@/components/domain/request-timeline';
import { SlaIndicator } from '@/components/domain/sla-indicator';
import {
  PriorityBadge,
  RequestStatusBadge,
  WorkOrderStatusBadge,
} from '@/components/domain/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api-client';
import { getNeighborhoodGeoJson, queryKeys } from '@/lib/api/municipality-domain';
import { getRequest, requestKeys, uploadRequestPhoto } from '@/lib/api/requests';
import { cn, formatDateTime } from '@/lib/utils';
import { PrivateImage } from '@/components/domain/private-image';
import { useToast } from '@/providers/toast-provider';
import { type RequestAction, RequestActionDialog } from './request-actions';

/** Presigned photo URLs live 5 minutes; refresh the detail a little before they expire. */
const REFRESH_MS = 4 * 60_000;

export function RequestDetailView({ id }: { id: string }) {
  const query = useQuery({
    queryKey: requestKeys.detail(id),
    queryFn: () => getRequest(id),
    refetchInterval: REFRESH_MS,
    retry: (count, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && count < 1,
  });
  const geojson = useQuery({
    queryKey: queryKeys.neighborhoodGeoJson,
    queryFn: getNeighborhoodGeoJson,
  });
  const [action, setAction] = useState<RequestAction | null>(null);

  if (query.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Talep yükleniyor">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiRequestError && query.error.status === 404) {
      return (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Talep bulunamadı"
            description="Talep mevcut değil ya da görüntüleme yetkiniz yok."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="/requests">Taleplere dön</Link>
              </Button>
            }
          />
        </Card>
      );
    }
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }

  const r = query.data;
  const staffActions =
    r.actions.transitions.length > 0 ||
    r.actions.canChangePriority ||
    r.actions.canChangeDepartment ||
    r.actions.canCreateWorkOrder;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Talepler
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-[26px] leading-9 font-bold tracking-tight">
                {r.publicNumber}
              </h1>
              <RequestStatusBadge status={r.status} />
              <PriorityBadge priority={r.priority} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {r.title} · <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time>
            </p>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Açıklama</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[14px] leading-relaxed whitespace-pre-line">{r.description}</p>
              {r.rejectionReason && (
                <p className="mt-4 rounded-lg bg-critical-soft p-3 text-[13px] text-critical">
                  <span className="font-medium">Ret gerekçesi: </span>
                  {r.rejectionReason}
                </p>
              )}
            </CardContent>
          </Card>

          <PhotosCard request={r} />

          <Card>
            <CardHeader>
              <CardTitle>Konum</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
              <dl className="space-y-3 text-[13.5px]">
                <InfoRow label="Mahalle">
                  {r.neighborhood ? (
                    r.neighborhood.name
                  ) : (
                    <span className="flex gap-1.5 text-warning-strong">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {r.locationNotice}
                    </span>
                  )}
                </InfoRow>
                <InfoRow label="Adres">
                  {r.address ?? <span className="text-muted">Belirtilmedi</span>}
                </InfoRow>
                <InfoRow label="Koordinat">
                  <span className="tabular inline-flex items-center gap-1">
                    <MapPin className="size-3.5 text-muted" aria-hidden="true" />
                    {r.location.latitude.toFixed(6)}, {r.location.longitude.toFixed(6)}
                  </span>
                </InfoRow>
              </dl>
              {geojson.data && (
                <GeometryPreview
                  collection={geojson.data}
                  marker={r.location}
                  highlightId={r.neighborhood?.id ?? null}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Süreç</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestTimeline events={r.timeline} status={r.status} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24">
          <Card>
            <CardHeader>
              <CardTitle>Talep bilgileri</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-[13.5px]">
                <InfoRow label="Kategori">
                  {r.category ? (
                    <>
                      {r.category.parent && (
                        <span className="text-muted">{r.category.parent.name} › </span>
                      )}
                      {r.category.name}
                    </>
                  ) : (
                    '—'
                  )}
                </InfoRow>
                <InfoRow label="İlgili müdürlük">
                  {r.department?.name ?? '—'}
                  {r.department?.status === 'INACTIVE' && (
                    <span className="ml-1 text-xs text-muted">(pasif)</span>
                  )}
                </InfoRow>
                <InfoRow label="SLA">
                  <div className="space-y-1">
                    <SlaIndicator sla={r.sla} status={r.status} />
                    {r.sla.dueAt && (
                      <p className="tabular text-xs text-muted">
                        Hedef: {formatDateTime(r.sla.dueAt)}
                      </p>
                    )}
                  </div>
                </InfoRow>
                <InfoRow label="Kaynak">{REQUEST_SOURCE_LABELS[r.source]}</InfoRow>
                <InfoRow label="Oluşturulma">{formatDateTime(r.createdAt)}</InfoRow>
                {r.reporter && (
                  <InfoRow label="Bildiren">
                    <span className="block">{r.reporter.fullName}</span>
                    {r.reporter.email && (
                      <span className="block text-xs text-muted">{r.reporter.email}</span>
                    )}
                    {r.reporter.phone && (
                      <span className="block text-xs text-muted">{r.reporter.phone}</span>
                    )}
                  </InfoRow>
                )}
              </dl>
            </CardContent>
          </Card>

          {r.workOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>İş emirleri</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-[13.5px]">
                  {r.workOrders.map((wo) => (
                    <li key={wo.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`/work-orders/${wo.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {wo.publicNumber}
                      </Link>
                      <WorkOrderStatusBadge status={wo.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {staffActions && (
            <Card>
              <CardHeader>
                <CardTitle>İşlemler</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {r.actions.canCreateWorkOrder && (
                  <Button onClick={() => setAction({ kind: 'workOrder' })}>İş Emri Oluştur</Button>
                )}
                {r.actions.transitions.map((option) => (
                  <Button
                    key={option.to}
                    variant={option.to === 'REJECTED' ? 'secondary' : 'primary'}
                    className={cn(option.to === 'REJECTED' && 'text-critical')}
                    onClick={() => setAction({ kind: 'transition', option })}
                  >
                    {option.label}
                  </Button>
                ))}
                {r.actions.canChangePriority && (
                  <Button variant="secondary" onClick={() => setAction({ kind: 'priority' })}>
                    Önceliği değiştir
                  </Button>
                )}
                {r.actions.canChangeDepartment && (
                  <Button variant="secondary" onClick={() => setAction({ kind: 'department' })}>
                    Başka müdürlüğe yönlendir
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {action && (
        <RequestActionDialog request={r} action={action} onClose={() => setAction(null)} />
      )}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function PhotosCard({ request }: { request: RequestDetail }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const remaining = REQUEST_MEDIA_LIMITS.maxPerRequest - request.media.length;

  const upload = async (files: FileList) => {
    const list = Array.from(files).slice(0, remaining);
    let added = 0;
    for (const file of list) {
      setUploading(file.name);
      try {
        await uploadRequestPhoto(request.id, file, () => undefined);
        added += 1;
      } catch (error) {
        toast.error(`${file.name} yüklenemedi.`, errorMessage(error, ''));
      }
    }
    setUploading(null);
    if (added > 0) {
      toast.success(`${request.publicNumber} talebine ${added} fotoğraf eklendi.`);
      await queryClient.invalidateQueries({ queryKey: requestKeys.detail(request.id) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotoğraflar</CardTitle>
        {request.actions.canAddMedia && remaining > 0 && (
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-medium hover:bg-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-4" aria-hidden="true" />
            )}
            Fotoğraf ekle
            <input
              type="file"
              multiple
              accept={REQUEST_MEDIA_LIMITS.mimeTypes.join(',')}
              className="sr-only"
              disabled={uploading !== null}
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </CardHeader>
      <CardContent>
        {request.media.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <ImageOff className="size-4" aria-hidden="true" />
            Bu talebe fotoğraf eklenmemiş.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {request.media.map((m, i) => (
              <li key={m.id}>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <PrivateImage
                    src={m.url}
                    alt={`Talep fotoğrafı ${i + 1}`}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
