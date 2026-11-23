import { isPublicPath } from './publicPaths';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = 'viewer' | 'editor' | 'admin';
export type User = { id: string; name: string; email: string; role: Role; active?: boolean };
export type UserStatus = 'active' | 'invited' | 'deactivated';
export type AdminUser = User & {
  status: UserStatus;
  lastLoginAt: string | null;
  link: { purpose: 'invite' | 'reset'; expiresAt: string; expired: boolean } | null;
};
export type LinkResult = { user: AdminUser; token: string; purpose: 'invite' | 'reset' };
export type LoginContext = { dataUpdatedAt: string | null; accessContact: string | null };
export type Health = { status: 'ok' | 'degraded'; db: 'up' | 'down' };

export async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) {
    // The session ended (signed out elsewhere, password changed, deactivated, idle too long).
    // Sign-in and account endpoints answer 401/400 for their own reasons and are handled by their pages.
    if (res.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined' && !isPublicPath(window.location.pathname)) {
      window.location.assign('/login?reason=ended');
    }
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      const m = data?.message;
      message = Array.isArray(m) ? m.join(', ') : (m ?? message);
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
