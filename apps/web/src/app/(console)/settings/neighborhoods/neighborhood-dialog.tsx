'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type NeighborhoodSummary } from '@kent360/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '@/components/domain/query-states';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { updateNeighborhood } from '@/lib/api/municipality-domain';
import { useToast } from '@/providers/toast-provider';

const schema = z.object({
  name: z.string().trim().min(2, 'En az 2 karakter.').max(120),
  district: z.string().max(80),
  population: z
    .string()
    .refine(
      (v) => v.trim() === '' || /^\d+$/.test(v.trim()),
      'Negatif olmayan bir tam sayı girin.',
    ),
});

type FormValues = z.infer<typeof schema>;

/** Attributes only; the boundary is replaced through the GeoJSON import or the API. */
export function NeighborhoodDialog({
  neighborhood,
  onClose,
}: {
  neighborhood: NeighborhoodSummary;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: neighborhood.name,
      district: neighborhood.district ?? '',
      population: neighborhood.population?.toString() ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      updateNeighborhood(neighborhood.id, {
        name: v.name.trim(),
        district: v.district.trim() || null,
        population: v.population.trim() === '' ? null : Number(v.population),
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
      toast.success(`${saved.name} mahallesi güncellendi.`);
      onClose();
    },
    onError: (error) => toast.error('Mahalle güncellenemedi.', errorMessage(error, '')),
  });

  const formId = 'neighborhood-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${neighborhood.name} – düzenle`}
      description="Sınır geometrisini değiştirmek için GeoJSON içe aktarmayı kullanın."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form={formId} disabled={mutation.isPending}>
            {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Kaydet
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4"
      >
        <Field label="Mahalle adı" error={errors.name?.message} required>
          <Input {...register('name')} />
        </Field>
        <Field label="Kod" hint="Kod değiştirilemez.">
          <Input value={neighborhood.code} readOnly className="bg-subtle font-mono text-muted" />
        </Field>
        <Field label="İlçe" error={errors.district?.message}>
          <Input placeholder="Şahinbey" {...register('district')} />
        </Field>
        <Field label="Nüfus" error={errors.population?.message}>
          <Input inputMode="numeric" className="tabular" {...register('population')} />
        </Field>
      </form>
    </Dialog>
  );
}
