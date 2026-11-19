export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = 'viewer' | 'editor' | 'admin';
export type User = { id: string; name: string; email: string; role: Role; active?: boolean };
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
