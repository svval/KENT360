import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ComponentProps } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { Button } from './button';

/** Data table primitives: sticky header, horizontal scroll on small screens. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-[13px]', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('sticky top-0 bg-subtle/80 backdrop-blur', className)} {...props} />;
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-border px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('border-b border-border last:border-0 hover:bg-subtle/50', className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  return (
    <nav
      aria-label="Sayfalama"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted"
    >
      <span className="tabular">
        Toplam {formatNumber(total)} kayıt · Sayfa {page}/{totalPages}
      </span>
      <div className="flex gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Önceki sayfa"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Sonraki sayfa"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
