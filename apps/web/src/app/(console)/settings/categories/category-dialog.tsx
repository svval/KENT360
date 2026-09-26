'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Priority,
  RecordStatus,
  type RequestCategoryNode,
  SLA_MAX_MINUTES,
  formatSlaMinutes,
} from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '@/components/domain/query-states';
import { PRIORITY_LABELS } from '@/components/domain/status-badges';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  type CategoryInput,
  createCategory,
  listDepartments,
  queryKeys,
  updateCategory,
} from '@/lib/api/municipality-domain';
import { useToast } from '@/providers/toast-provider';

export type CategoryDialogState =
  | { mode: 'create'; parent: RequestCategoryNode | null }
  | { mode: 'edit'; category: RequestCategoryNode; parent: RequestCategoryNode | null };

const UNITS = { minutes: 1, hours: 60, days: 1440 } as const;
type Unit = keyof typeof UNITS;

/** Shows an SLA in the largest whole unit: 1440 → 1 gün, 90 → 90 dakika. */
function splitSla(minutes: number | null): { amount: string; unit: Unit } {
  if (minutes === null) return { amount: '', unit: 'hours' };
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: 'days' };
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: 'hours' };
  return { amount: String(minutes), unit: 'minutes' };
}

const schema = z
  .object({
    name: z.string().trim().min(2, 'En az 2 karakter.').max(120),
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'BÜYÜK_HARF, rakam ve alt çizgi (ör. ROAD_POTHOLE).'),
    parentId: z.string(),
    departmentId: z.string(),
    defaultPriority: z.enum(Object.values(Priority) as [Priority, ...Priority[]]),
    slaAmount: z.string(),
    slaUnit: z.enum(['minutes', 'hours', 'days']),
    keywords: z.string().max(1200),
    icon: z
      .string()
      .refine((v) => v === '' || /^[a-z0-9-]{1,60}$/.test(v), 'Küçük harf, rakam ve "-".'),
    sortOrder: z.coerce.number().int().min(0).max(10000),
    description: z.string().max(1000),
  })
  .superRefine((v, ctx) => {
    if (v.parentId && !v.departmentId) {
      ctx.addIssue({
        code: 'custom',
        path: ['departmentId'],
        message: 'Alt kategoriler bir müdürlüğe yönlendirilmelidir.',
      });
    }
    if (v.slaAmount.trim() !== '') {
      const minutes = Number(v.slaAmount) * UNITS[v.slaUnit];
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > SLA_MAX_MINUTES) {
        ctx.addIssue({
          code: 'custom',
          path: ['slaAmount'],
          message: 'SLA 1 dakika ile 365 gün arasında, tam dakika olmalı.',
        });
      }
    }
  });

type FormValues = z.input<typeof schema>;

export function CategoryDialog({
  state,
  roots,
  onClose,
  onSaved,
}: {
  state: CategoryDialogState;
  roots: RequestCategoryNode[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isNew = state.mode === 'create';
  const existing = state.mode === 'edit' ? state.category : null;
  const isRootWithChildren =
    existing !== null && existing.parentId === null && existing.childCount > 0;
  const parentLocked = isRootWithChildren || (state.mode === 'create' && state.parent !== null);

  // Only active departments can receive new routing (the API enforces the same).
  const departments = useQuery({
    queryKey: queryKeys.departments({ status: 'ACTIVE', pageSize: 100 }),
    queryFn: () => listDepartments({ status: 'ACTIVE', pageSize: 100 }),
  });

  const sla = splitSla(existing?.defaultSlaMinutes ?? null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? '',
      code: existing?.code ?? '',
      parentId: existing ? (existing.parentId ?? '') : (state.parent?.id ?? ''),
      departmentId: existing?.departmentId ?? state.parent?.departmentId ?? '',
      defaultPriority: existing?.defaultPriority ?? Priority.NORMAL,
      slaAmount: sla.amount,
      slaUnit: sla.unit,
      keywords: existing?.keywords.join(', ') ?? '',
      icon: existing?.icon ?? '',
      sortOrder: existing?.sortOrder ?? 0,
      description: existing?.description ?? '',
    },
  });
  const [parentId, slaAmount, slaUnit] = useWatch({
    control,
    name: ['parentId', 'slaAmount', 'slaUnit'],
  });
  const parentName = roots.find((r) => r.id === parentId)?.name;
  const inheritedSla = roots.find((r) => r.id === parentId)?.effectiveSlaMinutes ?? null;
  const previewMinutes = slaAmount?.trim() ? Number(slaAmount) * UNITS[slaUnit ?? 'hours'] : null;

  const mutation = useMutation({
    mutationFn: (raw: FormValues) => {
      const v = schema.parse(raw);
      const input: CategoryInput = {
        name: v.name,
        parentId: v.parentId || null,
        departmentId: v.departmentId || null,
        defaultPriority: v.defaultPriority,
        defaultSlaMinutes: v.slaAmount.trim() ? Number(v.slaAmount) * UNITS[v.slaUnit] : null,
        keywords: v.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        icon: v.icon || null,
        sortOrder: v.sortOrder,
        description: v.description.trim() || null,
      };
      if (isNew) {
        return createCategory({
          ...input,
          code: v.code,
          parentId: input.parentId ?? undefined,
          departmentId: input.departmentId ?? undefined,
        });
      }
      return updateCategory(existing!.id, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['request-categories'] });
      toast.success(
        isNew ? `${saved.name} kategorisi oluşturuldu.` : `${saved.name} kategorisi güncellendi.`,
      );
      onSaved(saved.id);
      onClose();
    },
    onError: (error) =>
      toast.error(
        isNew ? 'Kategori oluşturulamadı.' : 'Kategori güncellenemedi.',
        errorMessage(error, ''),
      ),
  });

  const title = isNew
    ? state.parent
      ? `${state.parent.name} – yeni alt kategori`
      : 'Yeni ana kategori'
    : `${existing!.name} – düzenle`;
  const formId = 'category-form';
  const rootOptions = roots.filter(
    (r) => r.id !== existing?.id && r.status === RecordStatus.ACTIVE,
  );

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description="Alt kategoriler vatandaşın seçtiği kategorilerdir ve talebin yönlendirileceği müdürlüğü belirler."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form={formId} disabled={mutation.isPending}>
            {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isNew ? 'Oluştur' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Kategori adı" error={errors.name?.message} required>
          <Input placeholder="Yol Çukuru" {...register('name')} />
        </Field>
        <Field
          label="Kod"
          error={errors.code?.message}
          hint={isNew ? 'Sonradan değiştirilemez.' : 'Kod değiştirilemez.'}
          required
        >
          <Input
            className="font-mono uppercase read-only:bg-subtle read-only:text-muted"
            placeholder="ROAD_POTHOLE"
            readOnly={!isNew}
            {...register('code')}
          />
        </Field>
        {parentLocked ? (
          // A locked select would drop out of the submitted values: show text, submit hidden.
          <Field
            label="Üst kategori"
            hint={
              isRootWithChildren ? 'Alt kategorileri olan bir ana kategori taşınamaz.' : undefined
            }
          >
            <Input
              readOnly
              value={parentName ?? '— Ana kategori —'}
              className="bg-subtle text-muted"
            />
          </Field>
        ) : (
          <Field label="Üst kategori" error={errors.parentId?.message} hint="Boş: ana kategori.">
            <Select {...register('parentId')}>
              <option value="">— Ana kategori —</option>
              {rootOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {parentLocked && <input type="hidden" {...register('parentId')} />}
        <Field
          label="Yönlendirilen müdürlük"
          error={errors.departmentId?.message}
          hint={
            parentId
              ? `${parentName ?? 'Alt kategori'} altındaki talepler bu müdürlüğe gider.`
              : 'Ana kategoride isteğe bağlı.'
          }
          required={Boolean(parentId)}
        >
          <Select {...register('departmentId')}>
            <option value="">— Seçilmedi —</option>
            {existing?.department && existing.department.status === RecordStatus.INACTIVE && (
              <option value={existing.department.id}>{existing.department.name} (pasif)</option>
            )}
            {departments.data?.data.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Varsayılan öncelik" error={errors.defaultPriority?.message}>
          <Select {...register('defaultPriority')}>
            {Object.values(Priority).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="SLA (çözüm süresi)"
          error={errors.slaAmount?.message}
          hint={
            previewMinutes && Number.isFinite(previewMinutes) && previewMinutes > 0
              ? `= ${formatSlaMinutes(previewMinutes)} (${previewMinutes} dakika)`
              : parentId && inheritedSla
                ? `Boş bırakılırsa ana kategorinin süresi kullanılır: ${formatSlaMinutes(inheritedSla)}.`
                : 'Boş: SLA takibi yok.'
          }
        >
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              className="tabular"
              placeholder="24"
              {...register('slaAmount')}
            />
            <Select aria-label="SLA birimi" className="w-32 shrink-0" {...register('slaUnit')}>
              <option value="minutes">dakika</option>
              <option value="hours">saat</option>
              <option value="days">gün</option>
            </Select>
          </div>
        </Field>
        <Field
          label="Anahtar kelimeler"
          error={errors.keywords?.message}
          hint="Virgülle ayırın. Otomatik sınıflandırmada kullanılır."
          className="sm:col-span-2"
        >
          <Input placeholder="çukur, asfalt, göçük" {...register('keywords')} />
        </Field>
        <Field label="İkon (Lucide adı)" error={errors.icon?.message}>
          <Input placeholder="construction" {...register('icon')} />
        </Field>
        <Field label="Sıra" error={errors.sortOrder?.message}>
          <Input inputMode="numeric" className="tabular" {...register('sortOrder')} />
        </Field>
        <Field label="Açıklama" error={errors.description?.message} className="sm:col-span-2">
          <Textarea {...register('description')} />
        </Field>
      </form>
    </Dialog>
  );
}
