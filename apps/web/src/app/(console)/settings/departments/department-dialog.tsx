'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type DepartmentSummary } from '@kent360/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '@/components/domain/query-states';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createDepartment, updateDepartment } from '@/lib/api/municipality-domain';
import { useToast } from '@/providers/toast-provider';

const schema = z.object({
  name: z.string().trim().min(2, 'En az 2 karakter.').max(160),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'BÜYÜK_HARF, rakam ve alt çizgi (ör. PUBLIC_WORKS).'),
  description: z.string().max(1000),
  contactEmail: z.union([z.literal(''), z.email('Geçerli bir e-posta adresi girin.')]),
});

type FormValues = z.infer<typeof schema>;

/** Create (department = null) or edit. The code is fixed after creation. */
export function DepartmentDialog({
  department,
  onClose,
}: {
  department: DepartmentSummary | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isNew = department === null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: department?.name ?? '',
      code: department?.code ?? '',
      description: department?.description ?? '',
      contactEmail: department?.contactEmail ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const common = {
        name: values.name.trim(),
        description: values.description.trim() || null,
        contactEmail: values.contactEmail.trim() || null,
      };
      return isNew
        ? createDepartment({ ...common, code: values.code.trim() })
        : updateDepartment(department.id, common);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(isNew ? `${saved.name} oluşturuldu.` : `${saved.name} güncellendi.`);
      onClose();
    },
    onError: (error) =>
      toast.error(
        isNew ? 'Müdürlük oluşturulamadı.' : 'Müdürlük güncellenemedi.',
        errorMessage(error, ''),
      ),
  });

  const formId = 'department-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? 'Yeni müdürlük' : `${department.name} – düzenle`}
      description={isNew ? 'Talepleri karşılayacak yeni bir müdürlük tanımlayın.' : undefined}
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
        className="space-y-4"
      >
        <Field label="Müdürlük adı" error={errors.name?.message} required>
          <Input placeholder="Fen İşleri Müdürlüğü" {...register('name')} />
        </Field>
        <Field
          label="Kod"
          error={errors.code?.message}
          hint={
            isNew
              ? 'Sistem ve entegrasyonlar bu kodu kullanır; sonradan değiştirilemez.'
              : 'Kod değiştirilemez.'
          }
          required
        >
          {/* readOnly, not disabled: disabled inputs drop out of the submitted values. */}
          <Input
            className="font-mono uppercase read-only:bg-subtle read-only:text-muted"
            placeholder="PUBLIC_WORKS"
            readOnly={!isNew}
            {...register('code')}
          />
        </Field>
        <Field label="Açıklama" error={errors.description?.message}>
          <Textarea {...register('description')} />
        </Field>
        <Field label="İletişim e-postası" error={errors.contactEmail?.message}>
          <Input
            type="email"
            placeholder="fenisleri@belediye.bel.tr"
            {...register('contactEmail')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
