import { DayMetrics, FRICTION_KEYS, Friction, FrictionKey } from './normalize';

export interface Aggregate {
  days: number;
  humanSessions: number;
  botSessions: number;
  sessionsPerDay: number | null;
  botShare: number | null; // percent of all sessions
  avgDailyUsers: number | null;
  pagesPerSession: number | null;
  scrollDepth: number | null;
  activeTime: number | null;
  totalTime: number | null;
  friction: Record<FrictionKey, Friction & { rate: number | null }>; // rate = percent of sessions
}

/** Average of values weighted by human sessions, skipping days without a value. */
function weighted(days: DayMetrics[], pick: (d: DayMetrics) => number | null): number | null {
  let sum = 0;
  let weight = 0;
  for (const d of days) {
    const v = pick(d);
    if (v === null || d.humanSessions <= 0) continue;
    sum += v * d.humanSessions;
    weight += d.humanSessions;
  }
  return weight > 0 ? sum / weight : null;
}

export function aggregate(days: DayMetrics[]): Aggregate {
  const humanSessions = days.reduce((s, d) => s + d.humanSessions, 0);
  const botSessions = days.reduce((s, d) => s + d.botSessions, 0);
  const all = humanSessions + botSessions;
  const friction = {} as Aggregate['friction'];
  for (const k of FRICTION_KEYS) {
    const sessions = days.reduce((s, d) => s + d.friction[k].sessions, 0);
    const affected = days.reduce((s, d) => s + d.friction[k].affected, 0);
    const events = days.reduce((s, d) => s + d.friction[k].events, 0);
    friction[k] = { sessions, affected, events, rate: sessions > 0 ? (affected / sessions) * 100 : null };
  }
  return {
    days: days.length,
    humanSessions,
    botSessions,
    sessionsPerDay: days.length ? humanSessions / days.length : null,
    botShare: all > 0 ? (botSessions / all) * 100 : null,
    avgDailyUsers: days.length ? days.reduce((s, d) => s + d.users, 0) / days.length : null,
    pagesPerSession: weighted(days, (d) => d.pagesPerSession),
    scrollDepth: weighted(days, (d) => d.scrollDepth),
    activeTime: weighted(days, (d) => d.activeTime),
    totalTime: weighted(days, (d) => d.totalTime),
    friction,
  };
}

export type Trend = 'better' | 'worse' | 'flat' | 'unknown';

/** Relative change in percent, or null when there is nothing sensible to compare with. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Changes under 2 percent count as flat. `goodWhen` says which direction is an improvement. */
export function trendOf(change: number | null, goodWhen: 'up' | 'down' | 'neutral'): Trend {
  if (change === null) return 'unknown';
  if (Math.abs(change) < 2) return 'flat';
  if (goodWhen === 'neutral') return 'flat';
  return (change > 0) === (goodWhen === 'up') ? 'better' : 'worse';
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every UTC day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Pages on local or test hosts are not real visitors, so they are left out of page tables. */
export function isProductionUrl(url: string, extraExcluded: string[] = []): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (/^(127\.|10\.|192\.168\.|0\.0\.0\.0$)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '[::1]') return false;
  return !extraExcluded.some((h) => h && (host === h || host.endsWith(`.${h}`)));
}

/** Merge address variants of one page: drops the query string, the fragment and a trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/** A custom range chosen in the date picker, and optionally the period to compare it with. All days are YYYY-MM-DD. */
export interface PeriodSpec { from: string; to: string; compareFrom?: string; compareTo?: string }
/** Either "the last N full days" or a custom range. */
export type Span = number | PeriodSpec;

export function spanDays(span: Span): number {
  return typeof span === 'number' ? span : daysBetween(span.from, span.to).length;
}

/** The chosen period and the one to compare it with. Without a custom range: the latest full UTC day and the equal period before it. */
export function periodsFor(span: Span, now = new Date()) {
  if (typeof span !== 'number') {
    const days = spanDays(span);
    const previousTo = span.compareTo ?? addDays(span.from, -1);
    const previousFrom = span.compareFrom ?? addDays(previousTo, -(days - 1));
    return { days, from: span.from, to: span.to, previousFrom, previousTo };
  }
  const days = span;
  const to = addDays(now.toISOString().slice(0, 10), -1);
  const from = addDays(to, -(days - 1));
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return { days, from, to, previousFrom, previousTo };
}
