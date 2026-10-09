import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

/**
 * Full-page status screen (404, unexpected error) in the console's visual language:
 * brand mark, one heading, a short explanation and a way back.
 */
export function StatusPage({
  code,
  icon: Icon,
  title,
  description,
  actions,
}: {
  code?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-white"
        >
          K
        </span>
        <span className="text-[15px] font-bold tracking-tight text-navy">KENT360</span>
      </div>
      <div className="mt-10 w-full max-w-md rounded-[var(--radius-card)] border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        {code && (
          <p className="tabular mt-4 text-xs font-semibold tracking-wider text-muted">{code}</p>
        )}
        <h1 className="mt-1 text-xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </main>
  );
}
