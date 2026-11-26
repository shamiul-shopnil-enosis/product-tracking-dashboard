import type { Role } from './api';

export type ProfileSummary = { id: string; name: string; isDefault: boolean; role: Role };

const KEY = 'pt.profile';

/** The profile this browser is looking at. Sent with every request; the server checks the person may open it. */
export function getActiveProfileId(): string | null {
  try { return typeof window === 'undefined' ? null : window.localStorage.getItem(KEY); } catch { return null; }
}

export function rememberProfile(id: string | null) {
  try { if (id) window.localStorage.setItem(KEY, id); else window.localStorage.removeItem(KEY); } catch { /* not remembered in a private window */ }
}

/** Switching reloads the page on purpose: every number, chart and form on screen belongs to the old profile. */
export function switchProfile(id: string, to?: string) {
  rememberProfile(id);
  if (to) window.location.assign(to); else window.location.reload();
}
