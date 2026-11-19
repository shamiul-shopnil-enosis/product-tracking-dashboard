import { DAILY_LIMIT, RESERVE, SyncTrigger } from './clarity.constants';

/**
 * Clarity says "10 requests per day", but a rejection on 2026-11-18 08:02 UTC, after 8 calls the afternoon before
 * and 2 that morning, points to a rolling 24 hours. We count over 24 hours less a 10 minute margin, so the
 * nightly job (exactly 24 hours apart) does not count last night's own calls against itself.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000 - 10 * 60 * 1000;
/** After Clarity answers 429 we stop trying for this long. */
export const RATE_LIMIT_PAUSE_MS = 60 * 60 * 1000;

export interface RunUsage {
  startedAt: Date;
  callsUsed: number;
  rateLimited: boolean;
}

/** Calls made in the window, and whether Clarity refused us recently (then we pause whatever the count says). */
export function usageIn(runs: RunUsage[], now: Date): { used: number; paused: boolean } {
  let used = 0;
  let paused = false;
  for (const r of runs) {
    const age = now.getTime() - r.startedAt.getTime();
    if (age < WINDOW_MS) used += r.callsUsed;
    if (r.rateLimited && age < RATE_LIMIT_PAUSE_MS) paused = true;
  }
  return { used, paused };
}

/** How many more Clarity calls this kind of run may make today. */
export function callsAllowed(usedToday: number, trigger: SyncTrigger): number {
  const cap = trigger === 'cron' ? DAILY_LIMIT - RESERVE : DAILY_LIMIT;
  return Math.max(0, cap - usedToday);
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function previousUtcDay(d: Date): string {
  return utcDay(new Date(d.getTime() - 24 * 60 * 60 * 1000));
}

export function startOfUtcDay(d: Date): Date {
  return new Date(`${utcDay(d)}T00:00:00.000Z`);
}

/** Metric names and total row count of a stored Clarity response, for listings. */
export function summarize(payload: unknown): { metricNames: string[]; rowCount: number } {
  if (!Array.isArray(payload)) return { metricNames: [], rowCount: 0 };
  let rowCount = 0;
  const metricNames: string[] = [];
  for (const m of payload as Array<{ metricName?: unknown; information?: unknown }>) {
    if (typeof m?.metricName === 'string') metricNames.push(m.metricName);
    if (Array.isArray(m?.information)) rowCount += m.information.length;
  }
  return { metricNames, rowCount };
}
