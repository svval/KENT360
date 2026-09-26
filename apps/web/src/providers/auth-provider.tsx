'use client';

import { type AuthUserProfile, type Permission } from '@kent360/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as authApi from '@/lib/auth-api';
import { onSessionChange, refreshSession } from '@/lib/session';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUserProfile | null;
  login: (email: string, password: string) => Promise<AuthUserProfile>;
  logout: () => Promise<void>;
  /** UI gating only – the API enforces every permission itself. */
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    // Every renewal or loss of the session (refresh, reuse detection, logout in
    // another code path) flows through here.
    const unsubscribe = onSessionChange((session) => {
      setUser(session?.user ?? null);
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });
    // Restore the session after a reload from the httpOnly refresh cookie.
    void refreshSession().then((session) => {
      if (!session) setStatus('unauthenticated');
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Cached data of the previous user must not survive into the next session.
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set<string>(user?.permissions ?? []);
    return {
      status,
      user,
      login,
      logout,
      hasPermission: (permission) => permissions.has(permission),
    };
  }, [status, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
