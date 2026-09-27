'use client';

import {
  PRIORITY_LABELS,
  Priority,
  type RequestDetail,
  type RequestTransitionOption,
} from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/components/domain/query-states';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import { listDepartments, queryKeys } from '@/lib/api/municipality-domain';
import {
  changeRequestDepartment,
  changeRequestPriority,
  requestKeys,
  transitionRequest,
} from '@/lib/api/requests';
import { useToast } from '@/providers/toast-provider';

export type RequestAction =
  | { kind: 'transition'; option: RequestTransitionOption }
  | { kind: 'priority' }
  | { kind: 'department' };

/**
 * One dialog for the staff actions on a request. The server decides what is allowed
 * (request.actions); this only collects the input and shows the server's answer.
 */
export function RequestActionDialog({
  request,
  action,
  onClose,
}: {
  request: RequestDetail;
  action: RequestAction;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<Priority>(request.priority);
  const [departmentId, setDepartmentId] = useState(request.department?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const departments = useQuery({
    queryKey: queryKeys.departments({ status: 'ACTIVE', pageSize: 100 }),
    queryFn: () => listDepartments({ status: 'ACTIVE', pageSize: 100 }),
    enabled: action.kind === 'department',
  });

  const reasonRequired = action.kind === 'transition' && action.option.requiresReason;

  const mutation = useMutation({
    mutationFn: () => {
      const trimmed = reason.trim() || undefined;
      if (action.kind === 'transition')
        return transitionRequest(request.id, action.option.to, trimmed);
      if (action.kind === 'priority') return changeRequestPriority(request.id, priority, trimmed);
      return changeRequestDepartment(request.id, departmentId, trimmed);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(requestKeys.detail(request.id), updated);
      void queryClient.invalidateQueries({ queryKey: ['requests', 'list'] });
      const messages = {
        transition: `${updated.publicNumber}: ${action.kind === 'transition' ? action.option.label.toLocaleLowerCase('tr-TR') : ''} işlemi tamamlandı.`,
        priority: `${updated.publicNumber} önceliği "${PRIORITY_LABELS[updated.priority]}" olarak güncellendi.`,
        department: `${updated.publicNumber}, ${updated.department?.name ?? 'yeni müdürlüğe'} yönlendirildi.`,
      };
      toast.success(messages[action.kind]);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, 'İşlem tamamlanamadı.')),
  });

  const title =
    action.kind === 'transition'
      ? action.option.label
      : action.kind === 'priority'
        ? 'Önceliği değiştir'
        : 'Başka müdürlüğe yönlendir';
  const unchanged =
    (action.kind === 'priority' && priority === request.priority) ||
    (action.kind === 'department' && (!departmentId || departmentId === request.department?.id));
  const blocked = mutation.isPending || unchanged || (reasonRequired && reason.trim() === '');

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${request.publicNumber} – ${title}`}
      description={
        action.kind === 'department'
          ? 'SLA süresi değişmez; talep oluşturulduğu anda başlayan süre geçerlidir.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant={
              action.kind === 'transition' && action.option.to === 'REJECTED' ? 'danger' : 'primary'
            }
            disabled={blocked}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {title}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.kind === 'priority' && (
          <Field label="Yeni öncelik">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {Object.values(Priority).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {action.kind === 'department' && (
          <Field label="Müdürlük" hint="Yalnızca aktif müdürlükler listelenir.">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— Seçin —</option>
              {departments.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label={reasonRequired ? 'Gerekçe' : 'Gerekçe (isteğe bağlı)'}
          hint="Süreç kaydında görünür; vatandaş da görebilir."
          required={reasonRequired}
        >
          <Textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-critical-soft p-3 text-[13px] text-critical">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
