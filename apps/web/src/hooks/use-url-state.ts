'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * List filters live in the URL (UI_UX_GUIDE §10): reloads and shared links keep the view.
 * Returns the current values and a setter that merges changes (empty → removed).
 */
export function useUrlState<K extends string>(
  keys: readonly K[],
): [Record<K, string>, (changes: Partial<Record<K, string | number | undefined>>) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = Object.fromEntries(
    keys.map((key) => [key, searchParams.get(key) ?? '']),
  ) as Record<K, string>;

  const update = useCallback(
    (changes: Partial<Record<K, string | number | undefined>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return [values, update];
}
