import { type ComponentProps, type ReactElement, type ReactNode, cloneElement, useId } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  /** Validation message; wires aria-invalid + aria-describedby onto the control. */
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Label + control + hint/error, accessibly connected (UI_UX_GUIDE §11). */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const generated = useId();
  const id = children.props.id ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && (
          <span className="ml-0.5 text-critical" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [errorId, hintId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

const controlClass = cn(
  'w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted/80',
  'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25',
  'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-critical',
);

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClass, 'h-9 pr-8', className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(controlClass, 'py-2', className)} {...props} />;
}
