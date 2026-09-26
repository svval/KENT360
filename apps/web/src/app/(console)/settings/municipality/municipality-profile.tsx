'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type MunicipalityProfile, Permission } from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, LoaderCircle, Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage, QueryError } from '@/components/domain/query-states';
import { PageHeader } from '@/components/layout/page-header';
import { getNavItem } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getMunicipality,
  type MunicipalityUpdate,
  queryKeys,
  updateMunicipality,
} from '@/lib/api/municipality-domain';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const optionalUrl = z.union([z.literal(''), z.url('Geçerli bir adres girin (https://…).')]);
const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), {
      message: `${min} ile ${max} arasında bir sayı girin.`,
    });

const schema = z.object({
  name: z.string().trim().min(2, 'En az 2 karakter.').max(160),
  city: z.string().trim().min(2, 'En az 2 karakter.').max(80),
  timezone: z.string().min(1),
  contactEmail: z.union([z.literal(''), z.email('Geçerli bir e-posta adresi girin.')]),
  contactPhone: z
    .string()
    .refine((v) => v === '' || /^\+?[0-9 ()-]{7,32}$/.test(v), 'Telefon numarası geçersiz.'),
  website: optionalUrl,
  address: z.string().max(500),
  logoUrl: optionalUrl,
  primaryColor: z.string().regex(HEX, '#RRGGBB biçiminde olmalı.'),
  secondaryColor: z.string().regex(HEX, '#RRGGBB biçiminde olmalı.'),
  mapCenterLat: optionalNumber(-90, 90),
  mapCenterLng: optionalNumber(-180, 180),
  mapZoom: optionalNumber(1, 20),
});

type FormValues = z.infer<typeof schema>;

const TIMEZONES = Intl.supportedValuesOf('timeZone');

function toForm(m: MunicipalityProfile): FormValues {
  return {
    name: m.name,
    city: m.city,
    timezone: m.timezone,
    contactEmail: m.contactEmail ?? '',
    contactPhone: m.contactPhone ?? '',
    website: m.website ?? '',
    address: m.address ?? '',
    logoUrl: m.logoUrl ?? '',
    primaryColor: m.primaryColor.toUpperCase(),
    secondaryColor: m.secondaryColor.toUpperCase(),
    mapCenterLat: m.mapCenterLat?.toString() ?? '',
    mapCenterLng: m.mapCenterLng?.toString() ?? '',
    mapZoom: m.mapZoom?.toString() ?? '',
  };
}

/** Only changed fields are sent; empty strings clear optional values. */
function toUpdate(
  values: FormValues,
  dirty: Partial<Record<keyof FormValues, unknown>>,
): MunicipalityUpdate {
  const text = (v: string) => (v.trim() === '' ? null : v.trim());
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const all: MunicipalityUpdate = {
    name: values.name.trim(),
    city: values.city.trim(),
    timezone: values.timezone,
    contactEmail: text(values.contactEmail),
    contactPhone: text(values.contactPhone),
    website: text(values.website),
    address: text(values.address),
    logoUrl: text(values.logoUrl),
    primaryColor: values.primaryColor,
    secondaryColor: values.secondaryColor,
    mapCenterLat: num(values.mapCenterLat),
    mapCenterLng: num(values.mapCenterLng),
    mapZoom: num(values.mapZoom),
  };
  return Object.fromEntries(
    Object.entries(all).filter(([key]) => dirty[key as keyof FormValues]),
  ) as MunicipalityUpdate;
}

export function MunicipalityProfileView() {
  const item = getNavItem('/settings/municipality');
  const { hasPermission, refreshProfile } = useAuth();
  const canEdit = hasPermission(Permission.MUNICIPALITY_UPDATE);
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: queryKeys.municipality, queryFn: getMunicipality });
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, dirtyFields, isDirty },
  } = form;

  useEffect(() => {
    if (query.data) reset(toForm(query.data));
  }, [query.data, reset]);

  const mutation = useMutation({
    mutationFn: updateMunicipality,
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.municipality, updated);
      reset(toForm(updated));
      toast.success('Belediye profili güncellendi.', `${updated.name} bilgileri kaydedildi.`);
      await refreshProfile(); // applies new branding immediately
    },
    onError: (error) => toast.error('Belediye profili kaydedilemedi.', errorMessage(error, '')),
  });

  const [primary, secondary, logoUrl, name] = useWatch({
    control,
    name: ['primaryColor', 'secondaryColor', 'logoUrl', 'name'],
  });

  const header = (
    <PageHeader
      title={item.label}
      description={item.description}
      actions={
        !canEdit && (
          <Badge tone="neutral">
            <Eye className="size-3" aria-hidden="true" />
            Salt okunur
          </Badge>
        )
      }
    />
  );

  if (query.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <div
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
          role="status"
          aria-label="Yükleniyor"
        >
          <Skeleton className="h-[640px]" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="space-y-6">
        {header}
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const municipality = query.data;
  const onSubmit = (values: FormValues) => mutation.mutate(toUpdate(values, dirtyFields));

  return (
    <div className="space-y-6">
      {header}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset
          disabled={!canEdit || mutation.isPending}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Genel bilgiler</CardTitle>
                  <CardDescription>
                    Uygulamanın her yerinde görünen belediye kimliği.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Belediye adı" error={errors.name?.message} required>
                  <Input {...register('name')} />
                </Field>
                <Field label="Kod" hint="Belediyenin sabit sistem kodu; değiştirilemez.">
                  <Input value={municipality.slug} readOnly disabled className="font-mono" />
                </Field>
                <Field label="İl" error={errors.city?.message} required>
                  <Input {...register('city')} />
                </Field>
                <Field label="Saat dilimi" error={errors.timezone?.message}>
                  <Select {...register('timezone')}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>İletişim</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="E-posta" error={errors.contactEmail?.message}>
                  <Input
                    type="email"
                    placeholder="bilgi@belediye.bel.tr"
                    {...register('contactEmail')}
                  />
                </Field>
                <Field label="Telefon" error={errors.contactPhone?.message}>
                  <Input type="tel" placeholder="+90 342 000 00 00" {...register('contactPhone')} />
                </Field>
                <Field label="Web sitesi" error={errors.website?.message} className="sm:col-span-2">
                  <Input
                    type="url"
                    placeholder="https://www.belediye.bel.tr"
                    {...register('website')}
                  />
                </Field>
                <Field label="Adres" error={errors.address?.message} className="sm:col-span-2">
                  <Textarea {...register('address')} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Marka</CardTitle>
                  <CardDescription>
                    Logo ve renkler tüm konsola uygulanır. Başarı / uyarı / kritik renkleri
                    anlamlarını korumak için değişmez.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Logo adresi"
                  error={errors.logoUrl?.message}
                  hint="PNG/SVG, https adresi."
                  className="sm:col-span-2"
                >
                  <Input type="url" placeholder="https://…/logo.svg" {...register('logoUrl')} />
                </Field>
                {(['primaryColor', 'secondaryColor'] as const).map((key) => (
                  <Field
                    key={key}
                    label={key === 'primaryColor' ? 'Ana renk' : 'Vurgu rengi'}
                    error={errors[key]?.message}
                  >
                    <div className="flex gap-2">
                      <input
                        type="color"
                        aria-label={
                          key === 'primaryColor' ? 'Ana renk seçici' : 'Vurgu rengi seçici'
                        }
                        value={
                          HEX.test((key === 'primaryColor' ? primary : secondary) ?? '')
                            ? key === 'primaryColor'
                              ? primary
                              : secondary
                            : '#000000'
                        }
                        onChange={(e) =>
                          setValue(key, e.target.value.toUpperCase(), {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        className="h-9 w-11 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-border bg-card p-1"
                      />
                      <Input className="font-mono uppercase" {...register(key)} />
                    </div>
                  </Field>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Harita varsayılanı</CardTitle>
                  <CardDescription>
                    Canlı harita açıldığında gösterilecek merkez ve yakınlaştırma.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field label="Enlem" error={errors.mapCenterLat?.message}>
                  <Input inputMode="decimal" className="tabular" {...register('mapCenterLat')} />
                </Field>
                <Field label="Boylam" error={errors.mapCenterLng?.message}>
                  <Input inputMode="decimal" className="tabular" {...register('mapCenterLng')} />
                </Field>
                <Field label="Yakınlaştırma" error={errors.mapZoom?.message}>
                  <Input inputMode="decimal" className="tabular" {...register('mapZoom')} />
                </Field>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <BrandPreview
              name={name || municipality.name}
              logoUrl={logoUrl}
              primary={HEX.test(primary ?? '') ? primary : municipality.primaryColor}
              secondary={HEX.test(secondary ?? '') ? secondary : municipality.secondaryColor}
            />
            <p className="text-xs text-muted">
              Son güncelleme: {formatDateTime(municipality.updatedAt)}
            </p>
            {canEdit && (
              <div className="flex gap-2 xl:sticky xl:top-24">
                <Button type="submit" disabled={!isDirty || mutation.isPending} className="flex-1">
                  {mutation.isPending ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                  Değişiklikleri kaydet
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!isDirty}
                  onClick={() => reset(toForm(municipality))}
                >
                  Geri al
                </Button>
              </div>
            )}
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function BrandPreview({
  name,
  logoUrl,
  primary,
  secondary,
}: {
  name: string;
  logoUrl: string;
  primary: string;
  secondary: string;
}) {
  const showLogo = /^https?:\/\//.test(logoUrl ?? '');
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Önizleme</CardTitle>
          <CardDescription>Kaydetmeden önce görünümü kontrol edin.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg bg-navy p-3">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-9 rounded-lg bg-white object-contain p-1" />
          ) : (
            <span
              className="flex size-9 items-center justify-center rounded-lg text-[13px] font-bold text-white"
              style={{ backgroundColor: primary }}
            >
              K
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-white">KENT360</p>
            <p className="truncate text-xs text-slate-400">{name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] font-medium text-white"
            style={{ backgroundColor: primary }}
          >
            Birincil aksiyon
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ color: secondary, backgroundColor: `${secondary}1A` }}
          >
            Vurgu
          </span>
          <span className="text-[13px] font-medium underline" style={{ color: primary }}>
            Bağlantı
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
