'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

/** Clarity keeps recordings for 30 days, so a longer window shows nothing more. */
export const CLARITY_MAX_DAYS = 30;

/**
 * The project's recordings, filtered to one page, in the address format Clarity itself uses:
 *   .../projects/view/<project>/impressions?date=Last 3 days&URL=2;4;<page address>
 * where `URL=2;4;` is Clarity's "Visited URL is exactly" filter. Kept in this one place in case Clarity changes it.
 */
export function recordingsUrl(projectId: string, pageUrl: string, lastDays: number): string {
  const days = Math.min(CLARITY_MAX_DAYS, Math.max(1, Math.round(lastDays)));
  const date = encodeURIComponent(`Last ${days} day${days === 1 ? '' : 's'}`);
  return `https://clarity.microsoft.com/projects/view/${encodeURIComponent(projectId)}/impressions?date=${date}&URL=${encodeURIComponent(`2;4;${pageUrl}`)}`;
}

/** How many days back from today reach the first day of the chosen range (so recordings from the whole range are included). */
export function daysBackTo(from: string, today = new Date()): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(1, Math.round((now - start) / 86_400_000) + 1);
}

// One lookup shared by every row of every table.
let cached: string | null | undefined;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  if (inflight) return;
  inflight = api<{ clarity?: { projectId?: string | null } }>('/dashboard/status')
    .then((s) => { cached = s.clarity?.projectId ?? null; })
    .catch(() => { cached = null; })
    .finally(() => { inflight = null; listeners.forEach((l) => l()); });
}

/** Call after an admin changes the project ID, so open tables pick it up. */
export function refreshClarityProject() {
  cached = undefined;
  load();
}

/** The Clarity project code: a string, null when none is set, undefined while it is being looked up. */
export function useClarityProject(): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(cached);
  useEffect(() => {
    const sync = () => setValue(cached);
    listeners.add(sync);
    if (cached === undefined) load(); else sync();
    return () => { listeners.delete(sync); };
  }, []);
  return value;
}
