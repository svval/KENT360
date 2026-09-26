import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** API timestamps are UTC ISO strings; display happens in the viewer's timezone. */
export function formatDateTime(iso: string | Date): string {
  return dateTimeFormatter.format(typeof iso === 'string' ? new Date(iso) : iso);
}

const numberFormatter = new Intl.NumberFormat('tr-TR');

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
