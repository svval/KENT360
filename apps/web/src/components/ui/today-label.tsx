'use client';

import { useSyncExternalStore } from 'react';

const formatter = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const noopSubscribe = () => () => {};

/**
 * Rendered from the client snapshot so the date follows the viewer's timezone;
 * the server snapshot is empty, which avoids a hydration mismatch.
 */
export function TodayLabel({ className }: { className?: string }) {
  const label = useSyncExternalStore(
    noopSubscribe,
    () => formatter.format(new Date()),
    () => null,
  );

  return <span className={className}>{label ?? ' '}</span>;
}
