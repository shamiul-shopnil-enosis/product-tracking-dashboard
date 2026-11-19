export interface AlertTileInput {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  previous: number | null;
  change: number | null;
  trend: string;
  /** Sessions behind a rate (the larger of the two periods). Rates built on a handful of sessions are noise. */
  sample?: number | null;
}

export interface AlertsResult {
  threshold: number;
  items: AlertTileInput[];
  /** Why no alerts are shown, when there is not enough data to judge */
  suppressed: string | null;
}

export const MIN_DAYS_FOR_ALERTS = 3;
export const MIN_SESSIONS_FOR_ALERTS = 200;
export const MIN_SAMPLE_FOR_RATE_ALERTS = 10;

/**
 * Flags metrics that moved by at least `threshold` percent against the previous period.
 * With too few days or too little traffic every percentage is noise, so nothing is flagged and the reason is given.
 */
export function findAlerts(
  tiles: AlertTileInput[],
  threshold: number,
  days: { current: number; previous: number },
  humanSessions: number,
): AlertsResult {
  if (days.current < MIN_DAYS_FOR_ALERTS || days.previous < MIN_DAYS_FOR_ALERTS) {
    return { threshold, items: [], suppressed: `Needs at least ${MIN_DAYS_FOR_ALERTS} days of data in both periods (now ${days.current} and ${days.previous}).` };
  }
  if (humanSessions < MIN_SESSIONS_FOR_ALERTS) {
    return { threshold, items: [], suppressed: `Too little traffic to judge (${Math.round(humanSessions)} human sessions, needs ${MIN_SESSIONS_FOR_ALERTS}).` };
  }
  const items = tiles
    .filter((t) => t.sample == null || t.sample >= MIN_SAMPLE_FOR_RATE_ALERTS)
    .filter((t) => t.change !== null && Math.abs(t.change) >= threshold)
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
  return { threshold, items, suppressed: null };
}

/**
 * Combine the alerts of two sources, each judged on its own coverage. Nothing is flagged only because one source has
 * too little history; the reason is shown only when neither source can be judged.
 */
export function mergeAlerts(a: AlertsResult, b: AlertsResult | null): AlertsResult {
  if (!b) return a;
  const items = [...a.items, ...b.items].sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0));
  const suppressed = items.length === 0 && a.suppressed && b.suppressed ? `${a.suppressed} GA4: ${b.suppressed}` : null;
  return { threshold: a.threshold, items, suppressed };
}
