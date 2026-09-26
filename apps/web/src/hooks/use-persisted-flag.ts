'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Storage can be unavailable (privacy mode); fall back to the default.
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Boolean UI preference persisted in localStorage (per browser, non-critical). */
export function usePersistedFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(key, read(key) ? '0' : '1');
    } catch {
      // ignore – preference simply isn't persisted
    }
    listeners.forEach((listener) => listener());
  }, [key]);

  return [value, toggle];
}
