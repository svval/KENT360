import { type VariantProps, cva } from 'class-variance-authority';
import { type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Badges always carry text; colour is a secondary cue (WCAG 1.4.1).
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-subtle text-muted ring-1 ring-inset ring-border',
        info: 'bg-info-soft text-primary',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning-strong',
        critical: 'bg-critical-soft text-critical',
        accent: 'bg-accent-soft text-accent',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
