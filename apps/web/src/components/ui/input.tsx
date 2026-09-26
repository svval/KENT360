import { type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-9 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted/80',
        'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25',
        'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-critical',
        className,
      )}
      {...props}
    />
  );
}
