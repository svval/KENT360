'use client';

import {
  formatSlaMinutes,
  LOCATION_OUTSIDE_NEIGHBORHOODS,
  Permission,
  PRIORITY_LABELS,
  RecordStatus,
  REQUEST_MEDIA_LIMITS,
  type RequestCategoryNode,
  type RequestDetail,
} from '@kent360/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Clock,
  Crosshair,
  ImagePlus,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { GeometryPreview } from '@/components/domain/geometry-preview';
import { errorMessage, QueryError } from '@/components/domain/query-states';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getCategoryTree,
  getNeighborhoodGeoJson,
  queryKeys,
  resolveNeighborhood,
} from '@/lib/api/municipality-domain';
import { createRequest, requestKeys, uploadRequestPhoto } from '@/lib/api/requests';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { AiAssist } from './ai-assist';
import { useToast } from '@/providers/toast-provider';

/** Demo helper (development only): the story location of docs/DEMO_SCENARIO.md, in Karataş. */
const DEMO_LOCATION = { latitude: 37.0585, longitude: 37.371 };
const SHOW_DEMO_LOCATION = process.env.NODE_ENV !== 'production';

interface Photo {
  id: string;
  file: File;
  preview: string;
  state: 'pending' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
}

const MB = 1024 * 1024;

function parseCoordinate(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function NewRequestForm() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();

  const [rootId, setRootId] = useState('');
  const [leafId, setLeafId] = useState('');
  const [description, setDescription] = useState('');
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [address, setAddress] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<RequestDetail | null>(null);

  const tree = useQuery({ queryKey: queryKeys.categoryTree, queryFn: getCategoryTree });
  const geojson = useQuery({
    queryKey: queryKeys.neighborhoodGeoJson,
    queryFn: getNeighborhoodGeoJson,
  });

  const roots = useMemo(
    () =>
      (tree.data ?? [])
        .filter((root) => root.status === RecordStatus.ACTIVE)
        .map((root) => ({
          ...root,
          children: root.children.filter((c) => c.status === RecordStatus.ACTIVE),
        }))
        .filter((root) => root.children.length > 0 || root.departmentId),
    [tree.data],
  );
  const root = roots.find((r) => r.id === rootId) ?? null;
  // A root without sub-categories is itself the selectable (leaf) category.
  const leaf: RequestCategoryNode | null =
    root && root.children.length === 0
      ? root
      : (root?.children.find((c) => c.id === leafId) ?? null);

  const latitude = parseCoordinate(latText, -90, 90);
  const longitude = parseCoordinate(lngText, -180, 180);
  const hasLocation = latitude !== null && longitude !== null;
  const resolved = useQuery({
    queryKey: ['neighborhoods', 'resolve', latitude, longitude],
    queryFn: () => resolveNeighborhood(latitude!, longitude!),
    enabled: hasLocation,
  });

  // Release preview object URLs when photos go away.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | File[]) => {
    setPhotoError(null);
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (!REQUEST_MEDIA_LIMITS.mimeTypes.includes(file.type)) {
        setPhotoError(`${file.name}: yalnızca JPEG, PNG veya WEBP fotoğraf eklenebilir.`);
        continue;
      }
      if (file.size > REQUEST_MEDIA_LIMITS.maxBytes) {
        setPhotoError(
          `${file.name}: fotoğraf en fazla ${REQUEST_MEDIA_LIMITS.maxBytes / MB} MB olabilir.`,
        );
        continue;
      }
      if (next.length >= REQUEST_MEDIA_LIMITS.maxPerRequest) {
        setPhotoError(`En fazla ${REQUEST_MEDIA_LIMITS.maxPerRequest} fotoğraf ekleyebilirsiniz.`);
        break;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        state: 'pending',
        progress: 0,
      });
    }
    setPhotos(next);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const photo = current.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return current.filter((p) => p.id !== id);
    });
  };

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Tarayıcınız konum paylaşmayı desteklemiyor.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatText(position.coords.latitude.toFixed(6));
        setLngText(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(
          'Konumunuz alınamadı.',
          'Tarayıcı izinlerini kontrol edin veya koordinatları elle girin.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const errors = {
    category: !leaf ? 'Bir kategori seçin.' : null,
    description:
      description.trim().length < 10
        ? 'Açıklama en az 10 karakter olmalı.'
        : description.length > 2000
          ? 'Açıklama en fazla 2000 karakter olabilir.'
          : null,
    location: !hasLocation ? 'Geçerli bir konum girin (enlem −90…90, boylam −180…180).' : null,
  };
  const valid = !errors.category && !errors.description && !errors.location;

  const setPhoto = (id: string, patch: Partial<Photo>) =>
    setPhotos((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  /** Uploads one photo; the request already exists, so a failure never loses the report. */
  const uploadOne = async (requestId: string, photo: Photo): Promise<boolean> => {
    setPhoto(photo.id, { state: 'uploading', progress: 0, error: undefined });
    try {
      await uploadRequestPhoto(requestId, photo.file, (progress) =>
        setPhoto(photo.id, { progress }),
      );
      setPhoto(photo.id, { state: 'done', progress: 100 });
      return true;
    } catch (error) {
      setPhoto(photo.id, { state: 'failed', error: errorMessage(error, 'Yüklenemedi.') });
      return false;
    }
  };

  const finish = (request: RequestDetail) => {
    void queryClient.invalidateQueries({ queryKey: requestKeys.all });
    router.push(`/requests/${request.id}`);
  };

  const submit = async () => {
    setSubmitted(true);
    setFormError(null);
    if (!valid || !leaf || latitude === null || longitude === null) return;
    setSubmitting(true);
    try {
      const request = await createRequest({
        categoryId: leaf.id,
        description: description.trim(),
        latitude,
        longitude,
        address: address.trim() || null,
      });
      setCreated(request);
      let failures = 0;
      for (const photo of photos) {
        if (!(await uploadOne(request.id, photo))) failures += 1;
      }
      if (failures === 0) {
        toast.success(
          `${request.publicNumber} numaralı talebiniz alındı.`,
          'Durumunu "Talepler" ekranından izleyebilirsiniz.',
        );
        finish(request);
      } else {
        toast.error(
          `${request.publicNumber} oluşturuldu, ancak ${failures} fotoğraf yüklenemedi.`,
          'Başarısız fotoğrafları yeniden deneyebilir veya talebe devam edebilirsiniz.',
        );
      }
    } catch (error) {
      setFormError(errorMessage(error, 'Talep oluşturulamadı. Lütfen tekrar deneyin.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasPermission(Permission.REQUESTS_CREATE)) {
    return (
      <Card>
        <EmptyState icon={CircleAlert} title="Talep oluşturma yetkiniz yok" />
      </Card>
    );
  }

  // ─── After creation: photo upload status (retry failed ones) ───────────
  if (created) {
    const failed = photos.filter((p) => p.state === 'failed');
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title={`${created.publicNumber} oluşturuldu`}
          description="Talebiniz kaydedildi. Fotoğraflar yükleniyor."
        />
        <Card>
          <CardContent className="space-y-3 pt-5">
            {photos.map((photo) => (
              <div key={photo.id} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt="" className="size-12 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{photo.file.name}</p>
                  {photo.state === 'uploading' && (
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle"
                      role="progressbar"
                      aria-valuenow={photo.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${photo.file.name} yükleniyor`}
                    >
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${photo.progress}%` }}
                      />
                    </div>
                  )}
                  {photo.state === 'failed' && (
                    <p className="text-xs text-critical">{photo.error}</p>
                  )}
                </div>
                {photo.state === 'done' && (
                  <CircleCheck className="size-5 text-success" aria-label="Yüklendi" />
                )}
                {photo.state === 'uploading' && (
                  <LoaderCircle
                    className="size-5 animate-spin text-muted"
                    aria-label="Yükleniyor"
                  />
                )}
                {photo.state === 'failed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void uploadOne(created.id, photo)}
                  >
                    <RotateCcw aria-hidden="true" />
                    Tekrar dene
                  </Button>
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                onClick={() => finish(created)}
                disabled={photos.some((p) => p.state === 'uploading')}
              >
                {failed.length > 0 ? 'Fotoğraflar olmadan talebe git' : 'Talebe git'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tree.isError) return <QueryError error={tree.error} onRetry={() => void tree.refetch()} />;

  const show = (error: string | null) => (submitted ? error : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Yeni Talep"
        description="Sorunu tarif edin, konumunu ve fotoğraflarını ekleyin; ilgili birime otomatik iletilir."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* 1. Category */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>1. Sorun kategorisi</CardTitle>
                <CardDescription>
                  Önce ana kategoriyi, ardından sorunu en iyi tarif eden alt kategoriyi seçin.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {tree.isPending ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : (
                <fieldset>
                  <legend className="sr-only">Ana kategori</legend>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {roots.map((r) => (
                      <label
                        key={r.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-[13.5px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                          rootId === r.id
                            ? 'border-primary bg-primary-soft font-medium text-primary'
                            : 'border-border hover:bg-subtle',
                        )}
                      >
                        <input
                          type="radio"
                          name="root"
                          value={r.id}
                          checked={rootId === r.id}
                          onChange={() => {
                            setRootId(r.id);
                            setLeafId('');
                          }}
                          className="sr-only"
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {root && root.children.length > 0 && (
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium">
                    {root.name} – alt kategori
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {root.children.map((c) => (
                      <label
                        key={c.id}
                        className={cn(
                          'cursor-pointer rounded-full border px-3 py-1.5 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                          leafId === c.id
                            ? 'border-primary bg-primary text-white'
                            : 'border-border hover:bg-subtle',
                        )}
                      >
                        <input
                          type="radio"
                          name="leaf"
                          value={c.id}
                          checked={leafId === c.id}
                          onChange={() => setLeafId(c.id)}
                          className="sr-only"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {leaf && (
                <div
                  className="grid gap-3 rounded-lg bg-subtle p-3 text-[13px] sm:grid-cols-2"
                  aria-live="polite"
                >
                  <p className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted" aria-hidden="true" />
                    <span>
                      <span className="text-muted">İlgili birim: </span>
                      {leaf.department?.name ?? '—'}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="size-4 text-muted" aria-hidden="true" />
                    <span>
                      <span className="text-muted">Hedef çözüm süresi: </span>
                      {leaf.effectiveSlaMinutes
                        ? formatSlaMinutes(leaf.effectiveSlaMinutes)
                        : 'Tanımsız'}
                    </span>
                  </p>
                </div>
              )}
              {show(errors.category) && <p className="text-xs text-critical">{errors.category}</p>}
            </CardContent>
          </Card>

          {/* 2. Description */}
          <Card>
            <CardHeader>
              <CardTitle>2. Açıklama</CardTitle>
            </CardHeader>
            <CardContent>
              <Field
                label="Sorunu kısaca anlatın"
                error={show(errors.description) ?? undefined}
                hint={`${description.trim().length}/2000 · Ne, nerede, ne zamandan beri? Kişisel bilgi yazmayın.`}
                required
              >
                <Textarea
                  rows={5}
                  value={description}
                  maxLength={2000}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Örn. Okul önündeki yolda büyük bir çukur var, araçlar sürekli çarpıyor."
                />
              </Field>
            </CardContent>
          </Card>

          {/* 3. Location */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>3. Konum</CardTitle>
                <CardDescription>
                  Koordinatları girin veya cihaz konumunu kullanın. Haritadan nokta seçimi Canlı
                  Harita modülüyle birlikte gelecek.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={useMyLocation} disabled={locating}>
                  {locating ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Crosshair aria-hidden="true" />
                  )}
                  Konumumu kullan
                </Button>
                {SHOW_DEMO_LOCATION && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLatText(String(DEMO_LOCATION.latitude));
                      setLngText(String(DEMO_LOCATION.longitude));
                    }}
                  >
                    <MapPin aria-hidden="true" />
                    Demo konumu kullan
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Enlem"
                  error={show(latitude === null ? errors.location : null) ?? undefined}
                  required
                >
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    placeholder="37.0585"
                    value={latText}
                    onChange={(e) => setLatText(e.target.value)}
                  />
                </Field>
                <Field
                  label="Boylam"
                  error={show(longitude === null ? errors.location : null) ?? undefined}
                  required
                >
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    placeholder="37.3710"
                    value={lngText}
                    onChange={(e) => setLngText(e.target.value)}
                  />
                </Field>
                <Field
                  label="Adres tarifi"
                  hint="İsteğe bağlı: sokak, bina no, yakın bir yer."
                  className="sm:col-span-2"
                >
                  <Input
                    maxLength={500}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Karataş Mh. 12. Sk. No: 4 önü"
                  />
                </Field>
              </div>
              {hasLocation && (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div
                    className="rounded-lg border border-border p-3 text-[13px]"
                    aria-live="polite"
                  >
                    {resolved.isPending ? (
                      <span className="text-muted">Mahalle belirleniyor…</span>
                    ) : resolved.data ? (
                      <span className="flex items-center gap-2">
                        <CircleCheck className="size-4 text-success" aria-hidden="true" />
                        <span>
                          <span className="text-muted">Mahalle: </span>
                          <span className="font-medium">{resolved.data.name}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="flex gap-2 text-warning-strong">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {LOCATION_OUTSIDE_NEIGHBORHOODS} Talebiniz yine de alınır; belediye konumu
                          kontrol eder.
                        </span>
                      </span>
                    )}
                  </div>
                  {geojson.data && (
                    <GeometryPreview
                      collection={geojson.data}
                      marker={{ latitude: latitude!, longitude: longitude! }}
                      highlightId={resolved.data?.id ?? null}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <AiAssist
            description={description}
            latitude={latitude}
            longitude={longitude}
            categoryId={leaf?.id ?? null}
            onApply={({ id, parentId }) => {
              if (parentId) {
                setRootId(parentId);
                setLeafId(id);
              } else {
                setRootId(id);
                setLeafId('');
              }
            }}
          />

          {/* 4. Photos */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>4. Fotoğraflar</CardTitle>
                <CardDescription>
                  İsteğe bağlı · en fazla {REQUEST_MEDIA_LIMITS.maxPerRequest} fotoğraf, her biri en
                  fazla {REQUEST_MEDIA_LIMITS.maxBytes / MB} MB (JPEG, PNG, WEBP).
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                  dragging
                    ? 'border-primary bg-primary-soft'
                    : 'border-border-strong hover:bg-subtle',
                  photos.length >= REQUEST_MEDIA_LIMITS.maxPerRequest &&
                    'pointer-events-none opacity-50',
                )}
              >
                <ImagePlus className="size-6 text-muted" aria-hidden="true" />
                <span>
                  <span className="font-medium text-primary">Dosya seçin</span> veya fotoğrafları
                  buraya sürükleyin
                </span>
                <input
                  type="file"
                  accept={REQUEST_MEDIA_LIMITS.mimeTypes.join(',')}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {photoError && (
                <p role="alert" className="text-xs text-critical">
                  {photoError}
                </p>
              )}
              {photos.length > 0 && (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {photos.map((photo) => (
                    <li key={photo.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.preview}
                        alt={photo.file.name}
                        className="aspect-square w-full rounded-lg border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 rounded-full bg-navy/70 p-1 text-white hover:bg-navy"
                        aria-label={`${photo.file.name} kaldır`}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 5. Review & submit */}
        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle>5. Kontrol ve gönder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2.5 text-[13px]">
              <Summary
                label="Kategori"
                value={
                  leaf
                    ? root && root.id !== leaf.id
                      ? `${root.name} › ${leaf.name}`
                      : leaf.name
                    : null
                }
              />
              <Summary label="İlgili birim" value={leaf?.department?.name ?? null} />
              <Summary
                label="Varsayılan öncelik"
                value={leaf ? PRIORITY_LABELS[leaf.defaultPriority] : null}
              />
              <Summary
                label="Hedef süre"
                value={
                  leaf?.effectiveSlaMinutes ? formatSlaMinutes(leaf.effectiveSlaMinutes) : null
                }
              />
              <Summary
                label="Konum"
                value={
                  hasLocation
                    ? resolved.data
                      ? resolved.data.name
                      : 'Mahalle sınırları dışında'
                    : null
                }
              />
              <Summary label="Fotoğraf" value={`${photos.length} adet`} />
            </dl>
            <p className="text-xs text-muted">
              Birim, öncelik ve hedef süre kategori ayarlarından sunucuda belirlenir; burada bilgi
              amaçlı gösterilir.
            </p>
            {formError && (
              <p
                role="alert"
                className="flex gap-2 rounded-lg bg-critical-soft p-3 text-[13px] text-critical"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}
            {submitted && !valid && (
              <p role="alert" className="text-xs text-critical">
                Lütfen işaretli alanları tamamlayın.
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              Talebi gönder
            </Button>
            {photos.length > 0 && (
              <Badge tone="neutral" className="w-full justify-center">
                Fotoğraflar talep oluşturulduktan sonra yüklenir
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('text-right', !value && 'text-muted')}>{value ?? '—'}</dd>
    </div>
  );
}
