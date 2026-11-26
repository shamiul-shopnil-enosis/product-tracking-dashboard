'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, type User } from '@/lib/api';
import { isPublicPath } from '@/lib/publicPaths';
import { getActiveProfileId, rememberProfile } from '@/lib/profile';

type AuthState = { user: User | null; loading: boolean; logout: () => Promise<void> };
const Ctx = createContext<AuthState>({ user: null, loading: true, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const wasSignedIn = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    // The first check shows a loading screen. Later checks (one per page change) run quietly, so the window does not blank on every click.
    if (!wasSignedIn.current) setLoading(true);
    api<User>('/auth/me')
      .then((u) => {
        if (cancelled) return;
        wasSignedIn.current = true;
        // The server says which profile is in use (it falls back to the first one when the remembered one is gone or no longer allowed).
        if (u.activeProfileId && getActiveProfileId() !== u.activeProfileId) rememberProfile(u.activeProfileId);
        setUser(u);
      })
      .catch((e) => {
        if (cancelled) return;
        setUser(null);
        if (e instanceof ApiError && e.status === 401 && !isPublicPath(pathname)) {
          // Someone who was signed in and got cut off is told why; a first visit just lands on sign-in.
          router.replace(wasSignedIn.current ? '/login?reason=ended' : '/login');
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      wasSignedIn.current = false;
      setUser(null);
      router.replace('/login?reason=signedout');
    }
  }, [router]);

  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>;
}
