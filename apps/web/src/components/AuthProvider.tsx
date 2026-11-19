'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, type User } from '@/lib/api';

type AuthState = { user: User | null; loading: boolean; logout: () => Promise<void> };
const Ctx = createContext<AuthState>({ user: null, loading: true, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<User>('/auth/me')
      .then((u) => !cancelled && setUser(u))
      .catch((e) => {
        if (cancelled) return;
        setUser(null);
        if (e instanceof ApiError && e.status === 401 && pathname !== '/login') router.replace('/login');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    router.replace('/login');
  }, [router]);

  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>;
}
