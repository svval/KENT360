'use client';

import {
  Permission,
  WORK_ORDER_MEDIA_LIMITS,
  WORK_ORDER_MEDIA_TYPE_LABELS,
  type RequestMediaItem,
  type WorkOrderDetail,
  type WorkOrderMediaType,
  type WorkOrderTimelineEvent,
} from '@kent360/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ImageOff,
  ImagePlus,
  LoaderCircle,
  MapPin,
  SearchX,
  ZoomIn,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { GeometryPreview } from '@/components/domain/geometry-preview';
import { errorMessage, QueryError } from '@/components/domain/query-states';
import { SlaIndicator } from '@/components/domain/sla-indicator';
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/domain/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api-client';
import { getNeighborhoodGeoJson, queryKeys } from '@/lib/api/municipality-domain';
import { getWorkOrder, uploadWorkOrderPhoto, workOrderKeys } from '@/lib/api/work-orders';
import { cn, formatDateTime } from '@/lib/utils';
import { PrivateImage } from '@/components/domain/private-image';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { type WorkOrderAction, WorkOrderActionDialog } from './work-order-actions';

/** Presigned photo URLs live 5 minutes; refresh the detail a little before they expire. */
const REFRESH_MS = 4 * 60_000;

interface Photo {
  id: string;
  url: string;
  label: string;
}

export function WorkOrderDetailView({ id }: { id: string }) {
  const { hasPermission } = useAuth();
  const query = useQuery({
    queryKey: workOrderKeys.detail(id),
    queryFn: () => getWorkOrder(id),
    refetchInterval: REFRESH_MS,
    retry: (count, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && count < 1,
  });
  const geojson = useQuery({
    queryKey: queryKeys.neighborhoodGeoJson,
    queryFn: getNeighborhoodGeoJson,
  });
  const [action, setAction] = useState<WorkOrderAction | null>(null);
  const [zoom, setZoom] = useState<Photo | null>(null);

  if (query.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="İş emri yükleniyor">
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
            title="İş emri bulunamadı"
            description="İş emri mevcut değil ya da görüntüleme yetkiniz yok."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="/work-orders">İş emirlerine dön</Link>
              </Button>
            }
          />
        </Card>
      );
    }
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }

  const w = query.data;
  const canReadRequests = hasPermission(Permission.REQUESTS_READ);
  const byType = (type: WorkOrderMediaType): Photo[] =>
    w.media
      .filter((m) => m.type === type)
      .map((m, i) => ({
        id: m.id,
        url: m.url,
        label: `${WORK_ORDER_MEDIA_TYPE_LABELS[type]} fotoğrafı ${i + 1}`,
      }));
  const requestPhotos: Photo[] = (w.source?.media ?? []).map((m: RequestMediaItem, i) => ({
    id: m.id,
    url: m.url,
    label: `Talep fotoğrafı ${i + 1}`,
  }));
  const hasActions = w.actions.transitions.length > 0 || w.actions.canAssign;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/work-orders"
          className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          İş emirleri
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[26px] leading-9 font-bold tracking-tight">
              {w.publicNumber}
            </h1>
            <WorkOrderStatusBadge status={w.status} />
            <PriorityBadge priority={w.priority} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {w.title}
            {w.source && (
              <>
                {' · Kaynak talep '}
                {canReadRequests ? (
                  <Link
                    href={`/requests/${w.source.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {w.source.publicNumber}
                  </Link>
                ) : (
                  <span className="font-mono">{w.source.publicNumber}</span>
                )}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sorun</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[14px] leading-relaxed whitespace-pre-line">
                {w.source?.description ?? '—'}
              </p>
              {w.description && (
                <div className="rounded-lg bg-subtle p-3 text-[13.5px]">
                  <p className="text-xs font-medium text-muted">İş emri talimatı</p>
                  <p className="mt-1 whitespace-pre-line">{w.description}</p>
                </div>
              )}
              {requestPhotos.length > 0 && <PhotoStrip photos={requestPhotos} onZoom={setZoom} />}
            </CardContent>
          </Card>

          <BeforeAfterCard
            workOrder={w}
            before={byType('BEFORE')}
            after={byType('AFTER')}
            fallbackBefore={requestPhotos[0]}
            onZoom={setZoom}
          />

          <Card>
            <CardHeader>
              <CardTitle>Çalışma sırasında</CardTitle>
              <UploadButton workOrder={w} type="DURING" />
            </CardHeader>
            <CardContent>
              {byType('DURING').length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <ImageOff className="size-4" aria-hidden="true" />
                  Çalışma sırasında fotoğraf eklenmemiş.
                </p>
              ) : (
                <PhotoStrip photos={byType('DURING')} onZoom={setZoom} />
              )}
            </CardContent>
          </Card>

          {(w.completionDescription || w.cancellationReason) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {w.cancellationReason ? 'İptal gerekçesi' : 'Yapılan çalışma'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[14px] leading-relaxed whitespace-pre-line">
                  {w.cancellationReason ?? w.completionDescription}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Konum</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
              <dl className="space-y-3 text-[13.5px]">
                <InfoRow label="Mahalle">{w.neighborhood?.name ?? '—'}</InfoRow>
                <InfoRow label="Adres">
                  {w.address ?? <span className="text-muted">Belirtilmedi</span>}
                </InfoRow>
                <InfoRow label="Koordinat">
                  <span className="tabular inline-flex items-center gap-1">
                    <MapPin className="size-3.5 text-muted" aria-hidden="true" />
                    {w.location.latitude.toFixed(6)}, {w.location.longitude.toFixed(6)}
                  </span>
                </InfoRow>
                <p className="text-xs text-muted">
                  Sahaya varış ve işe başlama adımlarında cihaz konumunuz bu noktaya en fazla{' '}
                  {w.proximity.radiusMeters} m uzaklıkta olmalı.
                  {w.proximity.bypass && ' (Geliştirme modu: konum kontrolü kapalı.)'}
                </p>
              </dl>
              {geojson.data && (
                <GeometryPreview
                  collection={geojson.data}
                  marker={w.location}
                  highlightId={w.neighborhood?.id ?? null}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>İş emri geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkOrderTimeline events={w.timeline} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24">
          <Card>
            <CardHeader>
              <CardTitle>İş emri bilgileri</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-[13.5px]">
                <InfoRow label="Durum">
                  <WorkOrderStatusBadge status={w.status} />
                </InfoRow>
                <InfoRow label="Kategori">{w.category?.name ?? '—'}</InfoRow>
                <InfoRow label="Müdürlük">{w.department.name}</InfoRow>
                <InfoRow label="Ekip">
                  {w.fieldTeam?.name ?? <span className="text-muted">Atanmadı</span>}
                </InfoRow>
                <InfoRow label="Personel">
                  {w.assignedUser?.fullName ?? <span className="text-muted">—</span>}
                </InfoRow>
                {w.status !== 'CANCELLED' && (
                  <InfoRow label="SLA (kaynak talep)">
                    <SlaIndicator
                      sla={w.sla}
                      status={
                        w.status === 'COMPLETED' || w.status === 'VERIFIED'
                          ? 'RESOLVED'
                          : 'IN_PROGRESS'
                      }
                    />
                  </InfoRow>
                )}
              </dl>
            </CardContent>
          </Card>

          {hasActions && (
            <Card>
              <CardHeader>
                <CardTitle>Operasyon</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {w.actions.transitions.map((option) => (
                  <Button
                    key={option.to}
                    variant={
                      option.to === 'CANCELLED' || option.requiresReason ? 'secondary' : 'primary'
                    }
                    className={cn(option.to === 'CANCELLED' && 'text-critical')}
                    onClick={() => setAction({ kind: 'transition', option })}
                  >
                    {option.label}
                  </Button>
                ))}
                {w.actions.canAssign && (
                  <Button variant="secondary" onClick={() => setAction({ kind: 'assign' })}>
                    {w.fieldTeam || w.assignedUser ? 'Yeniden ata' : 'Ekibe / personele ata'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Önemli tarihler</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-[13px]">
                {(
                  [
                    ['Oluşturuldu', w.dates.createdAt],
                    ['Kabul edildi', w.dates.acceptedAt],
                    ['Yola çıkıldı', w.dates.enRouteAt],
                    ['Sahaya varıldı', w.dates.arrivedAt],
                    ['Çalışma başladı', w.dates.startedAt],
                    ['Tamamlandı', w.dates.completedAt],
                    ['Doğrulandı', w.dates.verifiedAt],
                    ['İptal edildi', w.dates.cancelledAt],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted">{label}</dt>
                      <dd className="tabular">{formatDateTime(value!)}</dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>

          {w.assignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Atama geçmişi</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-[13px]">
                  {w.assignments.map((a) => (
                    <li key={a.id} className={cn(a.unassignedAt && 'text-muted')}>
                      <p className="font-medium text-foreground">
                        {[a.fieldTeam?.name, a.assignee?.fullName].filter(Boolean).join(' / ')}
                        {!a.unassignedAt && (
                          <span className="ml-1.5 text-xs font-normal text-success">(güncel)</span>
                        )}
                      </p>
                      <p className="tabular text-xs text-muted">
                        {formatDateTime(a.assignedAt)}
                        {a.assignedBy && ` · ${a.assignedBy}`}
                        {a.unassignedAt && ` → ${formatDateTime(a.unassignedAt)}`}
                      </p>
                      {a.note && <p className="mt-0.5 text-xs">Not: {a.note}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {action && (
        <WorkOrderActionDialog workOrder={w} action={action} onClose={() => setAction(null)} />
      )}
      {zoom && (
        <Dialog
          open
          size="lg"
          onOpenChange={(open) => !open && setZoom(null)}
          title={zoom.label}
          footer={
            <Button variant="secondary" asChild>
              <a href={zoom.url} target="_blank" rel="noopener noreferrer">
                Yeni sekmede aç
              </a>
            </Button>
          }
        >
          <PrivateImage
            src={zoom.url}
            alt={zoom.label}
            className="mx-auto max-h-[70dvh] rounded-lg"
          />
        </Dialog>
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

/** ÖNCE | SONRA – side by side on desktop, stacked on small screens. */
function BeforeAfterCard({
  workOrder,
  before,
  after,
  fallbackBefore,
  onZoom,
}: {
  workOrder: WorkOrderDetail;
  before: Photo[];
  after: Photo[];
  fallbackBefore: Photo | undefined;
  onZoom: (photo: Photo) => void;
}) {
  const side = (
    title: string,
    type: 'BEFORE' | 'AFTER',
    photos: Photo[],
    fallback?: Photo,
    empty?: string,
  ) => {
    const main = photos[0] ?? fallback;
    return (
      <figure className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <figcaption className="text-xs font-semibold tracking-wide text-muted uppercase">
            {title}
            {!photos[0] && fallback && (
              <span className="ml-1 font-normal normal-case">(talep fotoğrafı)</span>
            )}
          </figcaption>
          <UploadButton workOrder={workOrder} type={type} compact />
        </div>
        {main ? (
          <button
            type="button"
            onClick={() => onZoom(main)}
            className="group relative block w-full overflow-hidden rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={`${main.label} – büyüt`}
          >
            <PrivateImage
              src={main.url}
              alt={main.label}
              className="aspect-[4/3] w-full object-cover"
            />
            <span className="absolute right-2 bottom-2 rounded-md bg-navy/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ZoomIn className="size-4" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-border bg-subtle px-4 text-center text-[13px] text-muted">
            {empty}
          </div>
        )}
        {photos.length > 1 && <PhotoStrip photos={photos.slice(1)} onZoom={onZoom} small />}
      </figure>
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Önce / Sonra</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {side('Önce', 'BEFORE', before, fallbackBefore, 'Henüz "önce" fotoğrafı yok.')}
        {side(
          'Sonra',
          'AFTER',
          after,
          undefined,
          'İş tamamlanırken en az bir "sonra" fotoğrafı yüklenir.',
        )}
      </CardContent>
    </Card>
  );
}

function PhotoStrip({
  photos,
  onZoom,
  small = false,
}: {
  photos: Photo[];
  onZoom: (photo: Photo) => void;
  small?: boolean;
}) {
  return (
    <ul
      className={cn(
        'grid gap-2',
        small ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
      )}
    >
      {photos.map((photo) => (
        <li key={photo.id}>
          <button
            type="button"
            onClick={() => onZoom(photo)}
            className="block w-full overflow-hidden rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={`${photo.label} – büyüt`}
          >
            <PrivateImage
              src={photo.url}
              alt={photo.label}
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Adds evidence photos of one type – shown only when the server allows it now. */
function UploadButton({
  workOrder,
  type,
  compact = false,
}: {
  workOrder: WorkOrderDetail;
  type: WorkOrderMediaType;
  compact?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!workOrder.actions.canUploadMedia.includes(type)) return null;
  const existing = workOrder.media.filter((m) => m.type === type).length;
  const remaining = WORK_ORDER_MEDIA_LIMITS.maxPerType - existing;
  if (remaining <= 0) return null;
  const label = WORK_ORDER_MEDIA_TYPE_LABELS[type];

  const upload = async (files: FileList) => {
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files).slice(0, remaining)) {
      try {
        await uploadWorkOrderPhoto(workOrder.id, type, file);
        added += 1;
      } catch (error) {
        toast.error(`${file.name} yüklenemedi.`, errorMessage(error, ''));
      }
    }
    setBusy(false);
    if (added > 0) {
      toast.success(`${workOrder.publicNumber}: ${added} "${label}" fotoğrafı eklendi.`);
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(workOrder.id) });
    }
  };

  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-medium hover:bg-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
        compact ? 'h-7 text-xs' : 'h-8',
      )}
    >
      {busy ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <ImagePlus className="size-4" aria-hidden="true" />
      )}
      {compact ? 'Ekle' : 'Fotoğraf ekle'}
      <span className="sr-only">({label})</span>
      <input
        type="file"
        multiple
        accept={WORK_ORDER_MEDIA_LIMITS.mimeTypes.join(',')}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
}

/** Internal timeline (staff only): who did what, including refused location checks. */
function WorkOrderTimeline({ events }: { events: WorkOrderTimelineEvent[] }) {
  return (
    <ol className="relative" aria-label="İş emri geçmişi">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < events.length - 1 && (
            <span aria-hidden="true" className="absolute top-3 left-[5px] h-full w-px bg-border" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative mt-1.5 size-[11px] shrink-0 rounded-full border-2',
              event.type === 'LOCATION_CHECK_FAILED' || event.type === 'CANCELLED'
                ? 'border-critical bg-critical'
                : event.type === 'MEDIA_ADDED'
                  ? 'border-primary bg-card'
                  : 'border-primary bg-primary',
            )}
          />
          <div className="min-w-0">
            <p className="text-[13.5px] text-foreground">{event.description}</p>
            <p className="tabular mt-0.5 text-xs text-muted">
              <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              {event.performedBy && ` · ${event.performedBy}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
