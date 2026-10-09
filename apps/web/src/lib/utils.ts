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

/** "az önce", "5 dk önce", "3 saat önce", "2 gün önce"; older → date and time. */
export function formatRelative(iso: string | Date, now = Date.now()): string {
  const time = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return formatDateTime(new Date(time));
}
