import { isPublicPath } from './publicPaths';
import { getActiveProfileId, type ProfileSummary } from './profile';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = 'viewer' | 'editor' | 'admin';
export type Membership = { profileId: string; role: Role };
export type User = {
  id: string; name: string; email: string; role: Role; active?: boolean;
  superAdmin?: boolean; memberships?: Membership[];
  /** From /auth/me: the profiles this person may open and the one in use. */
  profiles?: ProfileSummary[]; activeProfileId?: string | null;
};
export type UserStatus = 'active' | 'invited' | 'deactivated';
export type AdminUser = User & {
  status: UserStatus;
  lastLoginAt: string | null;
  link: { purpose: 'invite' | 'reset'; expiresAt: string; expired: boolean } | null;
};
export type LinkResult = { user: AdminUser; token: string; purpose: 'invite' | 'reset' };
export type LoginContext = { dataUpdatedAt: string | null; accessContact: string | null };
export type Health = { status: 'ok' | 'degraded'; db: 'up' | 'down' };

// Requests in flight, so a progress bar can show while data loads. Background polling is left out: it would flash the bar.
const QUIET = ['/speed/jobs/', '/dashboard/ga4-realtime', '/dashboard/status', '/findings/summary', '/auth/me', '/health/context'];
let inflight = 0;
const watchers = new Set<(count: number) => void>();
export function onActivity(cb: (count: number) => void): () => void {
  watchers.add(cb);
  return () => { watchers.delete(cb); };
}
const track = (delta: number) => { inflight = Math.max(0, inflight + delta); watchers.forEach((w) => w(inflight)); };

export async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const tracked = (init.method ?? 'GET') === 'GET' && !QUIET.some((q) => path.startsWith(q));
  if (tracked) track(1);
  try {
    return await request<T>(path, init);
  } finally {
    if (tracked) track(-1);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(getActiveProfileId() ? { 'X-Profile': getActiveProfileId() as string } : {}),
    },
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
