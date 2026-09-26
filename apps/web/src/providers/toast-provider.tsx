'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

interface ToastApi {
  /**
   * Specific messages only (UI_UX_GUIDE §8): say what happened to what –
   * "Fen İşleri Müdürlüğü oluşturuldu.", never "İşlem başarılı".
   */
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS: Record<Tone, number> = { success: 5000, info: 5000, error: 8000 };

const TONES: Record<Tone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleAlert, className: 'text-critical' },
  info: { icon: Info, className: 'text-primary' },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, title: string, description?: string) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), DURATION_MS[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push('success', title, description),
      error: (title, description) => push('error', title, description),
      info: (title, description) => push('info', title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Live regions exist before any toast so screen readers announce additions. */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        <div role="status" aria-live="polite" className="contents">
          {toasts
            .filter((t) => t.tone !== 'error')
            .map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {toasts
            .filter((t) => t.tone === 'error')
            .map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { icon: Icon, className } = TONES[toast.tone];
  return (
    <div className="pointer-events-auto flex gap-3 rounded-[var(--radius-card)] border border-border bg-card p-3.5 shadow-[var(--shadow-popover)] animate-in fade-in-0 slide-in-from-bottom-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 h-fit rounded-md p-1 text-muted hover:bg-subtle hover:text-foreground"
        aria-label="Bildirimi kapat"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
