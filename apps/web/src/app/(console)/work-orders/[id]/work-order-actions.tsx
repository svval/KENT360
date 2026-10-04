'use client';

import {
  WORK_ORDER_MEDIA_LIMITS,
  WORK_ORDER_REQUIRED_AFTER_PHOTOS,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderDetail,
  type WorkOrderTransitionOption,
} from '@kent360/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, MapPin, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/components/domain/query-states';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import {
  assignWorkOrder,
  fieldTeamKeys,
  getFieldTeam,
  listFieldTeams,
  transitionWorkOrder,
  uploadWorkOrderPhoto,
  workOrderKeys,
} from '@/lib/api/work-orders';
import { useToast } from '@/providers/toast-provider';

export type WorkOrderAction =
  { kind: 'transition'; option: WorkOrderTransitionOption } | { kind: 'assign' };

/** The device position for the proximity check (ARCHITECTURE §6.4). */
function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Bu tarayıcı konum paylaşımını desteklemiyor.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? 'Konum izni verilmedi. Tarayıcı ayarlarından bu site için konum iznini açın.'
              : 'Konumunuz alınamadı. Açık bir alanda tekrar deneyin.',
          ),
        ),
      // Always a fresh fix: a cached position from the road must not pass the on-site check.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/**
 * Work order operations. The server decides what is allowed (workOrder.actions) and
 * re-checks everything; this collects input (reason, position, completion) and shows
 * the server's answer.
 */
export function WorkOrderActionDialog({
  workOrder,
  action,
  onClose,
}: {
  workOrder: WorkOrderDetail;
  action: WorkOrderAction;
  onClose: () => void;
}) {
  if (action.kind === 'assign') return <AssignDialog workOrder={workOrder} onClose={onClose} />;
  if (action.option.requiresCompletion)
    return <CompleteDialog workOrder={workOrder} option={action.option} onClose={onClose} />;
  return <TransitionDialog workOrder={workOrder} option={action.option} onClose={onClose} />;
}

function useApply(workOrder: WorkOrderDetail, onClose: () => void) {
  const queryClient = useQueryClient();
  return (updated: WorkOrderDetail) => {
    queryClient.setQueryData(workOrderKeys.detail(workOrder.id), updated);
    void queryClient.invalidateQueries({ queryKey: ['work-orders', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    onClose();
  };
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-critical-soft p-3 text-[13px] text-critical">
      {message}
    </p>
  );
}

function TransitionDialog({
  workOrder,
  option,
  onClose,
}: {
  workOrder: WorkOrderDetail;
  option: WorkOrderTransitionOption;
  onClose: () => void;
}) {
  const toast = useToast();
  const apply = useApply(workOrder, onClose);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      let position: { latitude: number; longitude: number } | undefined;
      if (option.requiresLocation) {
        setLocating(true);
        try {
          position = await currentPosition();
        } catch (err) {
          // Development/demo bypass: the server accepts the step without a position.
          if (!workOrder.proximity.bypass) throw err;
        } finally {
          setLocating(false);
        }
      }
      return transitionWorkOrder(workOrder.id, {
        to: option.to,
        from: workOrder.status,
        ...(reason.trim() && { reason: reason.trim() }),
        ...position,
      });
    },
    onSuccess: (updated) => {
      toast.success(
        `${updated.publicNumber}: durum "${WORK_ORDER_STATUS_LABELS[updated.status]}" olarak güncellendi.`,
      );
      apply(updated);
    },
    onError: (err) =>
      setError(
        err instanceof Error && !('status' in err)
          ? err.message
          : errorMessage(err, 'İşlem tamamlanamadı.'),
      ),
  });
  const blocked = mutation.isPending || (option.requiresReason && reason.trim() === '');

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${workOrder.publicNumber} – ${option.label}`}
      description={`${WORK_ORDER_STATUS_LABELS[workOrder.status]} → ${WORK_ORDER_STATUS_LABELS[option.to]}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant={option.to === 'CANCELLED' ? 'danger' : 'primary'}
            disabled={blocked}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {locating ? 'Konum alınıyor…' : option.label}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {option.requiresLocation && (
          <p className="flex gap-2 rounded-lg bg-info-soft p-3 text-[13px] text-primary">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Bu adımda cihaz konumunuz alınır ve iş emri noktasına uzaklığı kontrol edilir (en
              fazla {workOrder.proximity.radiusMeters} m).
              {workOrder.proximity.bypass && ' Geliştirme modunda konum kontrolü atlanır.'}
            </span>
          </p>
        )}
        {(option.requiresReason || option.to === 'IN_PROGRESS') && (
          <Field
            label={option.requiresReason ? 'Gerekçe' : 'Not (isteğe bağlı)'}
            hint="İş emri geçmişinde görünür."
            required={option.requiresReason}
          >
            <Textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <ErrorNote message={error} />
      </div>
    </Dialog>
  );
}

function AssignDialog({ workOrder, onClose }: { workOrder: WorkOrderDetail; onClose: () => void }) {
  const toast = useToast();
  const apply = useApply(workOrder, onClose);
  const [teamId, setTeamId] = useState(workOrder.fieldTeam?.id ?? '');
  const [userId, setUserId] = useState(workOrder.assignedUser?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const teamParams = { departmentId: workOrder.department.id, status: 'ACTIVE', pageSize: 100 };
  const teams = useQuery({
    queryKey: fieldTeamKeys.list(teamParams),
    queryFn: () => listFieldTeams(teamParams),
  });
  const team = useQuery({
    queryKey: fieldTeamKeys.detail(teamId),
    queryFn: () => getFieldTeam(teamId),
    enabled: teamId !== '',
  });
  const members = team.data?.members.filter((m) => m.active) ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      assignWorkOrder(workOrder.id, {
        ...(teamId && { fieldTeamId: teamId }),
        ...(userId && { assignedUserId: userId }),
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: (updated) => {
      const who = [updated.fieldTeam?.name, updated.assignedUser?.fullName]
        .filter(Boolean)
        .join(' / ');
      toast.success(`${updated.publicNumber}, ${who} için atandı.`);
      apply(updated);
    },
    onError: (err) => setError(errorMessage(err, 'Atama yapılamadı.')),
  });
  const unchanged =
    teamId === (workOrder.fieldTeam?.id ?? '') && userId === (workOrder.assignedUser?.id ?? '');

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${workOrder.publicNumber} – Atama`}
      description="Önceki atama geçmişte kalır. Kabul edilmiş bir iş yeniden atanırsa yeni personelin kabul etmesi gerekir."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            disabled={mutation.isPending || !teamId || unchanged}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Ata
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Saha ekibi" required hint={`${workOrder.department.name} ekipleri`}>
          <Select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setUserId('');
            }}
          >
            <option value="">— Seçin —</option>
            {teams.data?.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.activeWorkOrders} açık iş)
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Personel (isteğe bağlı)"
          hint="Boş bırakılırsa işi ekibin herhangi bir üyesi yürütebilir."
        >
          <Select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={!teamId || team.isPending}
          >
            <option value="">Tüm ekip</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.fullName}
                {m.role === 'LEADER' ? ' (sorumlu)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Not (isteğe bağlı)">
          <Textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
      </div>
    </Dialog>
  );
}

/** "İşi Tamamla": completion note + AFTER photos with preview; enabled when both are there. */
function CompleteDialog({
  workOrder,
  option,
  onClose,
}: {
  workOrder: WorkOrderDetail;
  option: WorkOrderTransitionOption;
  onClose: () => void;
}) {
  const toast = useToast();
  const apply = useApply(workOrder, onClose);
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const existingAfter = workOrder.media.filter((m) => m.type === 'AFTER').length;
  const room = WORK_ORDER_MEDIA_LIMITS.maxPerType - existingAfter;

  // Object URLs of the previews are released when removed and when the dialog closes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const remove = (index: number) => {
    URL.revokeObjectURL(files[index].preview);
    previews.current.delete(files[index].preview);
    setFiles(files.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      for (const [index, item] of files.entries()) {
        setStep(`Fotoğraf yükleniyor (${index + 1}/${files.length})…`);
        await uploadWorkOrderPhoto(workOrder.id, 'AFTER', item.file);
      }
      if (files.length > 0) {
        setFiles([]);
        await queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(workOrder.id) });
      }
      setStep('İş emri tamamlanıyor…');
      return transitionWorkOrder(workOrder.id, {
        to: option.to,
        from: workOrder.status,
        completionDescription: description.trim(),
      });
    },
    onSuccess: (updated) => {
      toast.success('İş emri tamamlandı.');
      apply(updated);
    },
    onError: (err) => setError(errorMessage(err, 'İş emri tamamlanamadı.')),
    onSettled: () => setStep(null),
  });
  const photos = existingAfter + files.length;
  const ready =
    description.trim().length > 0 &&
    photos >= WORK_ORDER_REQUIRED_AFTER_PHOTOS &&
    !mutation.isPending;

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title={`${workOrder.publicNumber} – İşi Tamamla`}
      description="Tamamlanan işin açıklaması ve en az bir “sonra” fotoğrafı zorunludur. Tamamlandıktan sonra değiştirilemez."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {step ?? 'İşi tamamla'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Yapılan çalışma"
          required
          hint="Vatandaşa dönük özet değil; iş emri kaydında ve doğrulamada kullanılır."
          error={mutation.isError && description.trim() === '' ? 'Açıklama zorunludur.' : undefined}
        >
          <Textarea
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ör. Hasarlı bölüm kesildi, sıcak asfaltla kapatıldı."
          />
        </Field>

        <div className="space-y-2">
          <p className="text-[13px] font-medium">
            “Sonra” fotoğrafları<span className="ml-0.5 text-critical">*</span>
          </p>
          <p className="text-xs text-muted">
            {existingAfter > 0
              ? `${existingAfter} fotoğraf daha önce yüklendi. `
              : 'Henüz “sonra” fotoğrafı yok. '}
            JPEG, PNG veya WEBP; fotoğraf başına en fazla 10 MB. Konum ve cihaz bilgileri sunucuda
            silinir.
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {files.map((item, index) => (
              <li key={item.preview} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.preview}
                  alt={`Seçilen sonra fotoğrafı ${index + 1}`}
                  className="aspect-square w-full rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 rounded-md bg-navy/70 p-0.5 text-white"
                  aria-label={`Seçilen fotoğraf ${index + 1}'i kaldır`}
                  onClick={() => remove(index)}
                  disabled={mutation.isPending}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
            {files.length < room && (
              <li>
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted hover:bg-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
                  <ImagePlus className="size-5" aria-hidden="true" />
                  Fotoğraf seç
                  <input
                    type="file"
                    multiple
                    accept={WORK_ORDER_MEDIA_LIMITS.mimeTypes.join(',')}
                    className="sr-only"
                    disabled={mutation.isPending}
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? [])
                        .slice(0, room - files.length)
                        .map((file) => {
                          const preview = URL.createObjectURL(file);
                          previews.current.add(preview);
                          return { file, preview };
                        });
                      setFiles([...files, ...picked]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </li>
            )}
          </ul>
        </div>
        <ErrorNote message={error} />
      </div>
    </Dialog>
  );
}
