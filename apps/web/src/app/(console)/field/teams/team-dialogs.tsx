'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  FIELD_TEAM_MEMBER_ROLE_LABELS,
  type FieldTeamMemberRole,
  type FieldTeamSummary,
  RecordStatus,
} from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '@/components/domain/query-states';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { listDepartments, queryKeys } from '@/lib/api/municipality-domain';
import {
  createFieldTeam,
  fieldTeamKeys,
  getFieldTeam,
  listFieldStaffCandidates,
  setFieldTeamMembers,
  updateFieldTeam,
} from '@/lib/api/work-orders';
import { useToast } from '@/providers/toast-provider';

const schema = z.object({
  departmentId: z.string().min(1, 'Müdürlük seçin.'),
  name: z.string().trim().min(2, 'En az 2 karakter.').max(120),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'BÜYÜK_HARF, rakam ve alt çizgi (ör. PW_TEAM_1).'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

type FormValues = z.infer<typeof schema>;

/** Create (team = null) or edit. Code and department are fixed after creation. */
export function TeamDialog({
  team,
  defaultDepartmentId,
  onClose,
}: {
  team: FieldTeamSummary | null;
  defaultDepartmentId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isNew = team === null;
  const departments = useQuery({
    queryKey: queryKeys.departments({ status: 'ACTIVE', pageSize: 100 }),
    queryFn: () => listDepartments({ status: 'ACTIVE', pageSize: 100 }),
    enabled: isNew,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      departmentId: team?.department.id ?? defaultDepartmentId,
      name: team?.name ?? '',
      code: team?.code ?? '',
      status: team?.status ?? RecordStatus.ACTIVE,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      isNew
        ? createFieldTeam({
            departmentId: values.departmentId,
            name: values.name.trim(),
            code: values.code.trim(),
          })
        : updateFieldTeam(team.id, { name: values.name.trim(), status: values.status }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: fieldTeamKeys.all });
      toast.success(isNew ? `${saved.name} ekibi oluşturuldu.` : `${saved.name} güncellendi.`);
      onClose();
    },
    onError: (error) =>
      toast.error(isNew ? 'Ekip oluşturulamadı.' : 'Ekip güncellenemedi.', errorMessage(error, '')),
  });

  const formId = 'team-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? 'Yeni saha ekibi' : `${team.name} – düzenle`}
      description={
        isNew ? 'Ekip bir müdürlüğe bağlıdır; üyeler aynı müdürlüğün saha personelidir.' : undefined
      }
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
        <Field
          label="Müdürlük"
          error={errors.departmentId?.message}
          hint={isNew ? undefined : 'Ekibin müdürlüğü değiştirilemez.'}
          required
        >
          {isNew ? (
            <Select {...register('departmentId')}>
              <option value="">— Seçin —</option>
              {departments.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input readOnly value={team.department.name} className="read-only:bg-subtle" />
          )}
        </Field>
        <Field label="Ekip adı" error={errors.name?.message} required>
          <Input placeholder="Fen İşleri – Ekip 3" {...register('name')} />
        </Field>
        <Field
          label="Kod"
          error={errors.code?.message}
          hint={isNew ? 'Belediye içinde tekil; sonradan değiştirilemez.' : 'Kod değiştirilemez.'}
          required
        >
          <Input
            className="font-mono uppercase read-only:bg-subtle read-only:text-muted"
            placeholder="PW_TEAM_3"
            readOnly={!isNew}
            {...register('code')}
          />
        </Field>
        {!isNew && (
          <Field
            label="Durum"
            hint="Pasif ekibe yeni iş atanamaz. Açık işi olan ekip pasifleştirilemez."
          >
            <Select {...register('status')}>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Pasif</option>
            </Select>
          </Field>
        )}
      </form>
    </Dialog>
  );
}

/** Members of a team: add from the department's field staff, pick the leader, remove. */
export function MembersDialog({
  team,
  canManage,
  onClose,
}: {
  team: FieldTeamSummary;
  canManage: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: fieldTeamKeys.detail(team.id),
    queryFn: () => getFieldTeam(team.id),
  });
  const candidates = useQuery({
    queryKey: fieldTeamKeys.candidates(team.department.id),
    queryFn: () => listFieldStaffCandidates(team.department.id),
    enabled: canManage,
  });
  const [draft, setDraft] = useState<
    { userId: string; fullName: string; role: FieldTeamMemberRole }[] | null
  >(null);
  const [adding, setAdding] = useState('');
  const members =
    draft ??
    detail.data?.members.map((m) => ({ userId: m.userId, fullName: m.fullName, role: m.role })) ??
    [];

  const mutation = useMutation({
    mutationFn: () =>
      setFieldTeamMembers(
        team.id,
        members.map((m) => ({ userId: m.userId, role: m.role })),
      ),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: fieldTeamKeys.all });
      toast.success(`${saved.name} üyeleri güncellendi (${saved.memberCount} kişi).`);
      onClose();
    },
    onError: (error) => toast.error('Üyeler güncellenemedi.', errorMessage(error, '')),
  });

  const edit = (next: typeof members) => setDraft(next);
  const available = (candidates.data ?? []).filter((c) => !members.some((m) => m.userId === c.id));

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${team.name} – üyeler`}
      description={`${team.department.name} · ${team.activeWorkOrders} açık iş emri`}
      footer={
        canManage ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Vazgeç
            </Button>
            <Button disabled={!draft || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Kaydet
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
        )
      }
    >
      {detail.isPending ? (
        <div className="space-y-2" role="status" aria-label="Üyeler yükleniyor">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <div className="space-y-4">
          {members.length === 0 ? (
            <p className="text-[13px] text-muted">Bu ekipte henüz üye yok.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                  <span className="flex-1 font-medium">{m.fullName}</span>
                  {canManage ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${m.userId}`}>
                        {m.fullName} rolü
                      </label>
                      <Select
                        id={`role-${m.userId}`}
                        className="h-8 w-40"
                        value={m.role}
                        onChange={(e) => {
                          const role = e.target.value as FieldTeamMemberRole;
                          edit(
                            members.map((x) =>
                              x.userId === m.userId
                                ? { ...x, role }
                                : role === 'LEADER' && x.role === 'LEADER'
                                  ? { ...x, role: 'MEMBER' }
                                  : x,
                            ),
                          );
                        }}
                      >
                        <option value="MEMBER">{FIELD_TEAM_MEMBER_ROLE_LABELS.MEMBER}</option>
                        <option value="LEADER">{FIELD_TEAM_MEMBER_ROLE_LABELS.LEADER}</option>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${m.fullName} ekipten çıkar`}
                        onClick={() => edit(members.filter((x) => x.userId !== m.userId))}
                      >
                        <UserMinus aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted">
                      {FIELD_TEAM_MEMBER_ROLE_LABELS[m.role]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <div className="flex items-end gap-2">
              <Field
                label="Üye ekle"
                className="flex-1"
                hint="Yalnızca bu müdürlüğün aktif saha personeli listelenir."
              >
                <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">— Personel seçin —</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} · {c.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="secondary"
                className="mb-5"
                disabled={!adding}
                onClick={() => {
                  const person = available.find((c) => c.id === adding);
                  if (!person) return;
                  edit([
                    ...members,
                    { userId: person.id, fullName: person.fullName, role: 'MEMBER' },
                  ]);
                  setAdding('');
                }}
              >
                <UserPlus aria-hidden="true" />
                Ekle
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
