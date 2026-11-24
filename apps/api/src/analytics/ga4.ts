/**
 * Plain functions for GA4 report responses. Shape (Google Analytics Data API v1beta runReport):
 *   dimensionHeaders: [{ name }], metricHeaders: [{ name }], rows: [{ dimensionValues: [{ value }], metricValues: [{ value }] }]
 * Dates come back as YYYYMMDD.
 */
import { GA4_REPORTS, OTHER_VALUES } from './ga4.constants';

export interface Ga4Response {
  /** Total rows the report has, across all pages */
  rowCount?: number | null;
  dimensionHeaders?: Array<{ name?: string | null }> | null;
  metricHeaders?: Array<{ name?: string | null }> | null;
  rows?: Array<{ dimensionValues?: Array<{ value?: string | null }> | null; metricValues?: Array<{ value?: string | null }> | null }> | null;
}

export type Ga4Row = { date: string } & Record<string, string | number>;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** GA4 gives 20261117; we store 2026-11-17. */
export function isoDate(ga: string): string {
  return /^\d{8}$/.test(ga) ? `${ga.slice(0, 4)}-${ga.slice(4, 6)}-${ga.slice(6, 8)}` : ga;
}

/** One flat object per row: dimensions as strings (date converted), metrics as numbers. */
export function rowsFromReport(res: Ga4Response): Ga4Row[] {
  const dims = (res.dimensionHeaders ?? []).map((h) => h.name ?? '');
  const mets = (res.metricHeaders ?? []).map((h) => h.name ?? '');
  return (res.rows ?? []).map((r) => {
    const o: Record<string, string | number> = {};
    dims.forEach((d, i) => {
      const v = r.dimensionValues?.[i]?.value ?? '';
      o[d] = d === 'date' ? isoDate(v) : v;
    });
    mets.forEach((m, i) => {
      o[m] = num(r.metricValues?.[i]?.value);
    });
    return o as Ga4Row;
  });
}

/** Group rows by their day, dropping the date field from each row. */
export function groupByDate(rows: Ga4Row[]): Map<string, Array<Record<string, string | number>>> {
  const out = new Map<string, Array<Record<string, string | number>>>();
  for (const { date, ...rest } of rows) {
    out.set(date, [...(out.get(date) ?? []), rest]);
  }
  return out;
}

/** Keep the busiest rows of a day's breakdown. */
export function topRows(rows: Array<Record<string, string | number>>, by: string, n: number) {
  return [...rows].sort((a, b) => num(b[by]) - num(a[by])).slice(0, n);
}

// ---- a day, and a stretch of days ----

export interface Ga4Day {
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  pageViews: number;
  events: number;
  engagementSeconds: number;
  /** null when the property did not return key events */
  keyEvents: number | null;
}

/** A stored 'none' snapshot is a single row of totals for the day. */
export function ga4Day(payload: unknown): Ga4Day | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const r = payload[0] as Record<string, unknown>;
  return {
    sessions: num(r.sessions),
    users: num(r.activeUsers),
    newUsers: num(r.newUsers),
    engagedSessions: num(r.engagedSessions),
    pageViews: num(r.screenPageViews),
    events: num(r.eventCount),
    engagementSeconds: num(r.userEngagementDuration),
    keyEvents: r.keyEvents === undefined ? null : num(r.keyEvents),
  };
}

export interface Ga4Aggregate {
  days: number;
  sessions: number;
  sessionsPerDay: number | null;
  usersPerDay: number | null;
  /** Percent of sessions that were engaged, from summed counts (not an average of daily rates) */
  engagementRate: number | null;
  keyEventsPerDay: number | null;
  /** Seconds of engagement per session */
  engagementTime: number | null;
}

export function aggregateGa4(days: Ga4Day[]): Ga4Aggregate {
  const n = days.length;
  const sessions = days.reduce((s, d) => s + d.sessions, 0);
  const engaged = days.reduce((s, d) => s + d.engagedSessions, 0);
  const withKey = days.filter((d) => d.keyEvents !== null);
  return {
    days: n,
    sessions,
    sessionsPerDay: n ? sessions / n : null,
    usersPerDay: n ? days.reduce((s, d) => s + d.users, 0) / n : null,
    engagementRate: sessions > 0 ? (engaged / sessions) * 100 : null,
    keyEventsPerDay: withKey.length ? withKey.reduce((s, d) => s + (d.keyEvents ?? 0), 0) / withKey.length : null,
    engagementTime: sessions > 0 ? days.reduce((s, d) => s + d.engagementSeconds, 0) / sessions : null,
  };
}

/**
 * Merge key event rows (date to count) into daily total rows, matching by date.
 * GA4 leaves out days that had no key events instead of reporting 0, so when the key events report succeeded
 * a day without a row means 0. (If the report fails, this is not called and the days carry no key events at all.)
 */
export function mergeKeyEvents(daily: Ga4Row[], keyEvents: Ga4Row[]): Ga4Row[] {
  const byDate = new Map(keyEvents.map((r) => [r.date, num(r.keyEvents)]));
  return daily.map((r) => ({ ...r, keyEvents: byDate.get(r.date) ?? 0 }));
}

// ---- what to store ----

export interface StoredDay {
  date: string;
  payload: Array<Record<string, string | number>>;
  /** Recent days can still change in GA4, so they are flagged and re-read by the next runs */
  approximate: boolean;
}

function payloadFor(breakdown: string, dayRows: Array<Record<string, string | number>>, landingPerDay: number) {
  if (breakdown === 'landing' || breakdown === 'org_landing') return landingWithRemainder(dayRows, landingPerDay);
  if (breakdown === 'event') return dayRows.filter((r) => num(r.keyEvents) > 0);
  const rem = GA4_REPORTS[breakdown]?.remainder;
  return rem ? withRemainder(dayRows, rem.key, rem.keep, rem.by, rem.sum) : dayRows;
}

/**
 * The busiest values of a day plus one "(other)" row. Only sessions and engaged sessions are summed into it:
 * users would double count, and those are the only numbers the tables show.
 */
export function withRemainder(
  rows: Array<Record<string, string | number>>, nameKey: string, keep: number,
  by = 'sessions', sum: readonly string[] = ['sessions', 'engagedSessions'],
) {
  const top = topRows(rows, by, keep);
  const rest = rows.filter((r) => !top.includes(r));
  if (rest.length === 0) return top;
  return [
    ...top,
    { [nameKey]: OTHER_VALUES, ...Object.fromEntries(sum.map((m) => [m, rest.reduce((s, r) => s + num(r[m]), 0)])) },
  ];
}

/** Turn one report's rows into one stored snapshot per day. */
export function buildSnapshots(
  breakdown: string,
  rows: Ga4Row[],
  todayUtc: string,
  opts: { settleDays: number; landingPerDay: number },
): StoredDay[] {
  const settledBefore = addDaysIso(todayUtc, -opts.settleDays);
  return [...groupByDate(rows).entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, dayRows]) => ({
      date,
      payload: payloadFor(breakdown, dayRows, opts.landingPerDay),
      approximate: date >= settledBefore,
    }));
}

/**
 * The busiest landing pages of a day, plus one row holding everything else. Traffic spread over many pages
 * (for example automated visits) would otherwise vanish, and every share would be measured against too small a total.
 */
export function landingWithRemainder(rows: Array<Record<string, string | number>>, keep: number) {
  const top = topRows(rows, 'sessions', keep);
  const rest = rows.filter((r) => !top.includes(r));
  if (rest.length === 0) return top;
  return [
    ...top,
    {
      landingPage: OTHER_PAGES,
      sessions: rest.reduce((s, r) => s + num(r.sessions), 0),
      engagedSessions: rest.reduce((s, r) => s + num(r.engagedSessions), 0),
    },
  ];
}

export const OTHER_PAGES = '(other pages)';

export function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- rows per value (landing pages, channels) ----

export interface DimensionRow {
  name: string;
  sessions: number;
  share: number | null;
  /** Percent of the row's sessions that were engaged, from summed counts */
  engagementRate: number | null;
  perDay: number | null;
  previousPerDay: number | null;
  change: number | null;
}

/** One row per value of a dimension across the days of a period, with change in sessions per day against the period before. */
export function dimensionRows(
  key: string,
  current: Array<{ payload: unknown }>,
  previous: Array<{ payload: unknown }>,
  pctChange: (cur: number | null, prev: number | null) => number | null,
): { rows: DimensionRow[]; totalSessions: number } {
  const sum = (docs: Array<{ payload: unknown }>) => {
    const m = new Map<string, { sessions: number; engaged: number }>();
    for (const d of docs) {
      if (!Array.isArray(d.payload)) continue;
      for (const r of d.payload as Array<Record<string, unknown>>) {
        const name = String(r[key] ?? '');
        const e = m.get(name) ?? { sessions: 0, engaged: 0 };
        e.sessions += num(r.sessions);
        e.engaged += num(r.engagedSessions);
        m.set(name, e);
      }
    }
    return m;
  };
  const cur = sum(current);
  const prev = sum(previous);
  const totalSessions = [...cur.values()].reduce((s, v) => s + v.sessions, 0);
  const rows = [...cur.entries()].map(([name, v]) => {
    const perDay = current.length ? v.sessions / current.length : null;
    const p = prev.get(name);
    const previousPerDay = p && previous.length ? p.sessions / previous.length : null;
    return {
      name,
      sessions: v.sessions,
      share: totalSessions > 0 ? (v.sessions / totalSessions) * 100 : null,
      engagementRate: v.sessions > 0 ? (v.engaged / v.sessions) * 100 : null,
      perDay,
      previousPerDay,
      change: pctChange(perDay, previousPerDay),
    };
  });
  return { rows, totalSessions };
}

export interface LandingRow extends Omit<DimensionRow, 'name'> {
  page: string;
}

export function landingRows(
  current: Array<{ payload: unknown }>,
  previous: Array<{ payload: unknown }>,
  pctChange: (cur: number | null, prev: number | null) => number | null,
): { rows: LandingRow[]; totalSessions: number } {
  const { rows, totalSessions } = dimensionRows('landingPage', current, previous, pctChange);
  return { rows: rows.map(({ name, ...rest }) => ({ page: name, ...rest })), totalSessions };
}

/** Daily sessions of the biggest values, with a gap (null) on days that were not stored. */
export function dailySeries(
  key: string,
  docs: Array<{ date: string; payload: unknown }>,
  allDates: string[],
  top: number,
): { series: Array<{ id: string; label: string }>; points: Array<Record<string, string | number | null>> } {
  const totals = new Map<string, number>();
  const byDate = new Map<string, Map<string, number>>();
  for (const d of docs) {
    const m = new Map<string, number>();
    if (Array.isArray(d.payload)) {
      for (const r of d.payload as Array<Record<string, unknown>>) {
        const name = String(r[key] ?? '');
        m.set(name, (m.get(name) ?? 0) + num(r.sessions));
        totals.set(name, (totals.get(name) ?? 0) + num(r.sessions));
      }
    }
    byDate.set(d.date, m);
  }
  const names = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([n]) => n);
  return {
    series: names.map((label, i) => ({ id: `v${i}`, label })),
    points: allDates.map((date) => {
      const m = byDate.get(date);
      const p: Record<string, string | number | null> = { date };
      names.forEach((n, i) => {
        p[`v${i}`] = m ? (m.get(n) ?? 0) : null;
      });
      return p;
    }),
  };
}

// ---- key events by event name ----

export interface EventRow {
  name: string;
  count: number;
  share: number | null;
  perDay: number | null;
  previousPerDay: number | null;
  change: number | null;
}

/** How many times each key event happened in a period, with the change in per-day count against the period before. */
export function eventRows(
  current: Array<{ payload: unknown }>,
  previous: Array<{ payload: unknown }>,
  pctChange: (cur: number | null, prev: number | null) => number | null,
): { rows: EventRow[]; total: number } {
  const sum = (docs: Array<{ payload: unknown }>) => {
    const m = new Map<string, number>();
    for (const d of docs) {
      if (!Array.isArray(d.payload)) continue;
      for (const r of d.payload as Array<Record<string, unknown>>) {
        const name = String(r.eventName ?? '');
        m.set(name, (m.get(name) ?? 0) + num(r.keyEvents));
      }
    }
    return m;
  };
  const cur = sum(current);
  const prev = sum(previous);
  const total = [...cur.values()].reduce((s, v) => s + v, 0);
  const rows = [...cur.entries()].filter(([, c]) => c > 0).map(([name, count]) => {
    const perDay = current.length ? count / current.length : null;
    const p = prev.get(name);
    const previousPerDay = p !== undefined && previous.length ? p / previous.length : null;
    return { name, count, share: total > 0 ? (count / total) * 100 : null, perDay, previousPerDay, change: pctChange(perDay, previousPerDay) };
  });
  return { rows: rows.sort((a, b) => b.count - a.count), total };
}
