/**
 * Every number GA4 gives us, as cards. Pure functions over the stored daily snapshots, so they are easy to test.
 *
 * A card is "per day" (average of the days in the range), a ratio of totals (so a busy day counts more than a quiet one),
 * or the value on the last day (for rolling numbers such as "active in the last 28 days").
 * The same card is worked out for the period before, which gives the change.
 */
import { pctChange, trendOf, Trend } from './aggregate';
import { OTHER_VALUES } from './ga4.constants';
import { OTHER_PAGES } from './ga4';

export type CardUnit = 'count' | 'percent' | 'seconds' | 'ratio';
export type Rows = Array<Record<string, string | number>>;
/** breakdown name -> date -> that day's stored rows */
export type DayIndex = Map<string, Map<string, Rows>>;
type Bag = Record<string, Rows | undefined>;

export interface CardTile {
  key: string; group: string; source: 'ga4'; label: string; unit: CardUnit;
  value: number | null; previous: number | null; change: number | null; trend: Trend; help: string; sample: null;
}

export interface CardSpec {
  key: string; group: string; label: string; unit: CardUnit; help: string;
  good: 'up' | 'down' | 'neutral';
  /** stored breakdowns this card reads; a day counts only when all of them have that day */
  needs: string[];
  mode: 'mean' | 'ratio' | 'last';
  /** ratio multiplier, 100 for a percentage */
  scale?: number;
  day: (bag: Bag) => { n: number; d?: number } | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const first = (rows: Rows | undefined) => rows?.[0];

export const slugify = (s: string): string => s.trim() === '/' ? 'home' : s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'x';

// ---- fixed cards, from the daily totals ----

const fromNone = (pick: (r: Record<string, string | number>) => { n: number; d?: number }) => (b: Bag) => {
  const r = first(b.none);
  return r ? pick(r) : null;
};

const STATIC: CardSpec[] = [
  // Visitors
  { key: 'ga4NewUsers', group: 'Visitors', label: 'New users per day', unit: 'count', good: 'up', needs: ['none'], mode: 'mean',
    help: 'People who visited the site for the first time, per day, per Google Analytics. Higher means more first-time reach. Many new users with few returning ones is typical of automated traffic.',
    day: fromNone((r) => ({ n: num(r.newUsers) })) },
  { key: 'ga4NewShare', group: 'Visitors', label: 'New-user share', unit: 'percent', good: 'neutral', needs: ['none'], mode: 'ratio', scale: 100,
    help: 'Out of all active users, the share who are new. Near 100% means almost nobody comes back.',
    day: fromNone((r) => ({ n: num(r.newUsers), d: num(r.activeUsers) })) },
  { key: 'ga4SessionsPerUser', group: 'Visitors', label: 'Sessions per user', unit: 'ratio', good: 'up', needs: ['none'], mode: 'ratio',
    help: 'How many visits each person makes in a day on average. Above 1 means people come back the same day.',
    day: fromNone((r) => ({ n: num(r.sessions), d: num(r.activeUsers) })) },
  { key: 'ga4ReturningUsers', group: 'Visitors', label: 'Returning users per day', unit: 'count', good: 'up', needs: ['visitor_type'], mode: 'mean',
    help: 'People who had visited before and came back, per day. Higher means the site gives people a reason to return.',
    day: (b) => ({ n: (b.visitor_type ?? []).filter((r) => r.newVsReturning === 'returning').reduce((s, r) => s + num(r.activeUsers), 0) }) },
  { key: 'ga4ReturningShare', group: 'Visitors', label: 'Returning-visitor share', unit: 'percent', good: 'up', needs: ['visitor_type'], mode: 'ratio', scale: 100,
    help: 'Out of all users, the share who had visited before. A healthy product usually has a growing share.',
    day: (b) => {
      const rows = b.visitor_type ?? [];
      const all = rows.reduce((s, r) => s + num(r.activeUsers), 0);
      return { n: rows.filter((r) => r.newVsReturning === 'returning').reduce((s, r) => s + num(r.activeUsers), 0), d: all };
    } },
  { key: 'ga4Active7', group: 'Visitors', label: 'Active users, last 7 days', unit: 'count', good: 'up', needs: ['reach'], mode: 'last',
    help: 'Different people who used the site in the 7 days up to the last day of the range. Not averaged: it is the number on the final day.',
    day: (b) => ({ n: num(first(b.reach)?.active7DayUsers) }) },
  { key: 'ga4Active28', group: 'Visitors', label: 'Active users, last 28 days', unit: 'count', good: 'up', needs: ['reach'], mode: 'last',
    help: 'Different people who used the site in the 28 days up to the last day of the range: the monthly audience.',
    day: (b) => ({ n: num(first(b.reach)?.active28DayUsers) }) },
  { key: 'ga4Stickiness', group: 'Visitors', label: 'Daily users as share of monthly users', unit: 'percent', good: 'up', needs: ['none', 'reach'], mode: 'ratio', scale: 100,
    help: 'How much of the month’s audience shows up on an average day. Higher means people use the site more often.',
    day: (b) => { const r = first(b.none); const x = first(b.reach); return r && x ? { n: num(r.activeUsers), d: num(x.active28DayUsers) } : null; } },
  // Engagement
  { key: 'ga4EngagedSessions', group: 'Engagement', label: 'Engaged sessions per day', unit: 'count', good: 'up', needs: ['none'], mode: 'mean',
    help: 'Visits that were more than a glance: longer than 10 seconds, or 2+ pages, or a key event.',
    day: fromNone((r) => ({ n: num(r.engagedSessions) })) },
  { key: 'ga4Bounce', group: 'Engagement', label: 'Bounce rate', unit: 'percent', good: 'down', needs: ['none'], mode: 'ratio', scale: 100,
    help: 'Share of visits that were not engaged (the opposite of engagement rate). Lower is better; a very high number suggests automated visits.',
    day: fromNone((r) => ({ n: num(r.sessions) - num(r.engagedSessions), d: num(r.sessions) })) },
  { key: 'ga4EngTime', group: 'Engagement', label: 'Engagement time per session', unit: 'seconds', good: 'up', needs: ['none'], mode: 'ratio',
    help: 'How long the site was in front of the visitor, per visit. Higher means more attention.',
    day: fromNone((r) => ({ n: num(r.userEngagementDuration), d: num(r.sessions) })) },
  { key: 'ga4PageViews', group: 'Engagement', label: 'Page views per day', unit: 'count', good: 'up', needs: ['none'], mode: 'mean',
    help: 'How many pages were opened per day, counting repeats.',
    day: fromNone((r) => ({ n: num(r.screenPageViews) })) },
  { key: 'ga4PagesPerSession', group: 'Engagement', label: 'Pages per session', unit: 'ratio', good: 'up', needs: ['none'], mode: 'ratio',
    help: 'How many pages a person opens in one visit. Near 1 means they leave after the first page.',
    day: fromNone((r) => ({ n: num(r.screenPageViews), d: num(r.sessions) })) },
  { key: 'ga4ViewsPerUser', group: 'Engagement', label: 'Page views per user', unit: 'ratio', good: 'up', needs: ['none'], mode: 'ratio',
    help: 'How many pages each person opens in a day.',
    day: fromNone((r) => ({ n: num(r.screenPageViews), d: num(r.activeUsers) })) },
  { key: 'ga4Events', group: 'Engagement', label: 'Events per day', unit: 'count', good: 'neutral', needs: ['none'], mode: 'mean',
    help: 'Every action GA4 recorded per day: page views, scrolls, clicks and so on. A busy site has many; the mix matters more than the total.',
    day: fromNone((r) => ({ n: num(r.eventCount) })) },
  { key: 'ga4EventsPerSession', group: 'Engagement', label: 'Events per session', unit: 'ratio', good: 'up', needs: ['none'], mode: 'ratio',
    help: 'How many actions happen in one visit. Higher means visitors do more than load a page.',
    day: fromNone((r) => ({ n: num(r.eventCount), d: num(r.sessions) })) },
  { key: 'ga4Scrolled', group: 'Engagement', label: 'Users who scrolled, per day', unit: 'count', good: 'up', needs: ['reach'], mode: 'mean',
    help: 'People who scrolled most of the way down a page (GA4 counts 90%).',
    day: (b) => ({ n: num(first(b.reach)?.scrolledUsers) }) },
  { key: 'ga4ScrollRate', group: 'Engagement', label: 'Share of users who scrolled', unit: 'percent', good: 'up', needs: ['none', 'reach'], mode: 'ratio', scale: 100,
    help: 'Out of all active users, the share who scrolled most of the way down a page.',
    day: (b) => { const r = first(b.none); const x = first(b.reach); return r && x ? { n: num(x.scrolledUsers), d: num(r.activeUsers) } : null; } },
  // Traffic and events that are not a list of values
  { key: 'ga4DirectShare', group: 'Traffic sources', label: 'Direct share of sessions', unit: 'percent', good: 'neutral', needs: ['channel'], mode: 'ratio', scale: 100,
    help: 'Out of all visits, the share where GA4 saw no referrer. It includes people typing the address, but also much automated traffic, so a very high number is a warning.',
    day: (b) => {
      const rows = b.channel ?? [];
      return { n: rows.filter((r) => r.sessionDefaultChannelGroup === 'Direct').reduce((s, r) => s + num(r.sessions), 0), d: rows.reduce((s, r) => s + num(r.sessions), 0) };
    } },
  { key: 'ga4OutboundClicks', group: 'Events', label: 'Outbound link clicks per day', unit: 'count', good: 'up', needs: ['links'], mode: 'mean',
    help: 'Clicks on links that take people away from the site (to a company’s own website, for example).',
    day: (b) => ({ n: (b.links ?? []).reduce((s, r) => s + num(r.eventCount), 0) }) },
];

// ---- cards made from a list of values: one per channel, event, page and so on ----

export interface Family {
  prefix: string; group: string; breakdown: string; dim: string; metric: string; max: number;
  /** a value to group by (for links: the destination site, not the whole address) */
  norm?: (v: string) => string;
  label: (v: string) => string; help: (v: string) => string; good?: 'up' | 'down' | 'neutral';
}

const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u.slice(0, 40); } };
const pageName = (v: string) => (v === '/' ? 'the home page' : v);
const sessionsHelp = (what: string) => `Visits per day ${what}, per Google Analytics.`;

export const FAMILIES: Family[] = [
  { prefix: 'ch', group: 'Traffic sources', breakdown: 'channel', dim: 'sessionDefaultChannelGroup', metric: 'sessions', max: 10,
    label: (v) => `${v} sessions per day`, help: (v) => sessionsHelp(`that GA4 puts in the “${v}” channel group`) },
  { prefix: 'sm', group: 'Traffic sources', breakdown: 'source_medium', dim: 'sessionSourceMedium', metric: 'sessions', max: 10,
    label: (v) => `${v} sessions per day`, help: (v) => sessionsHelp(`from “${v}” (source / medium)`) },
  { prefix: 'evt', group: 'Events', breakdown: 'events_all', dim: 'eventName', metric: 'eventCount', max: 15, good: 'neutral',
    label: (v) => `“${v}” events per day`, help: (v) => `How many times GA4 recorded the event “${v}” per day.` },
  { prefix: 'kev', group: 'Events', breakdown: 'event', dim: 'eventName', metric: 'keyEvents', max: 10, good: 'up',
    label: (v) => `Key event “${v}” per day`, help: (v) => `How often per day visitors did “${v}”, which is marked as a key event in Google Analytics.` },
  { prefix: 'lk', group: 'Events', breakdown: 'links', dim: 'customEvent:link_url', metric: 'eventCount', max: 8, norm: hostOf,
    label: (v) => `Clicks to ${v} per day`, help: (v) => `Clicks per day on links that lead to ${v}.` },
  { prefix: 'pg', group: 'Pages', breakdown: 'pages_views', dim: 'pagePath', metric: 'screenPageViews', max: 12,
    label: (v) => `Views of ${pageName(v)} per day`, help: (v) => `How many times ${v === '/' ? 'the home page' : `the page ${v}`} was opened per day.` },
  { prefix: 'ld', group: 'Pages', breakdown: 'landing', dim: 'landingPage', metric: 'sessions', max: 8,
    label: (v) => `Visits starting on ${pageName(v)} per day`, help: (v) => `Visits per day that began on ${pageName(v)} (the first page people saw).` },
  { prefix: 'dv', group: 'Audience', breakdown: 'all_device', dim: 'deviceCategory', metric: 'sessions', max: 5,
    label: (v) => `${v} sessions per day`, help: (v) => sessionsHelp(`on a ${v} device`) },
  { prefix: 'cn', group: 'Audience', breakdown: 'all_country', dim: 'country', metric: 'sessions', max: 8,
    label: (v) => `Sessions from ${v} per day`, help: (v) => sessionsHelp(`from ${v}`) },
  { prefix: 'ct', group: 'Audience', breakdown: 'all_city', dim: 'city', metric: 'sessions', max: 6,
    label: (v) => `Sessions from ${v} per day`, help: (v) => sessionsHelp(`from ${v}`) },
  { prefix: 'br', group: 'Audience', breakdown: 'all_browser', dim: 'browser', metric: 'sessions', max: 5,
    label: (v) => `${v} browser sessions per day`, help: (v) => sessionsHelp(`using ${v}`) },
  { prefix: 'lg', group: 'Audience', breakdown: 'all_language', dim: 'language', metric: 'sessions', max: 5,
    label: (v) => `Sessions in language ${v} per day`, help: (v) => sessionsHelp(`from people whose browser language is ${v}`) },
  { prefix: 'en', group: 'Search', breakdown: 'org_engine', dim: 'sessionSource', metric: 'sessions', max: 5,
    label: (v) => `Organic sessions from ${v} per day`, help: (v) => sessionsHelp(`that came from ${v} search results`) },
  { prefix: 'ol', group: 'Search', breakdown: 'org_landing', dim: 'landingPage', metric: 'sessions', max: 6,
    label: (v) => `Organic visits starting on ${pageName(v)} per day`, help: (v) => `Visits per day from search results that began on ${pageName(v)}.` },
];

const isOther = (v: string) => v === OTHER_VALUES || v === OTHER_PAGES || v === '(not set)' || v === '';

function familySpec(f: Family, value: string): CardSpec {
  return {
    key: `${f.prefix}_${slugify(value)}`, group: f.group, label: f.label(value), unit: 'count', help: f.help(value),
    good: f.good ?? 'up', needs: [f.breakdown], mode: 'mean',
    day: (b) => ({ n: (b[f.breakdown] ?? []).filter((r) => (f.norm ? f.norm(String(r[f.dim] ?? '')) : String(r[f.dim] ?? '')) === value).reduce((s, r) => s + num(r[f.metric]), 0) }),
  };
}

/** The values of a family, busiest first, found in the current and previous days. */
function valuesOf(f: Family, idx: DayIndex): Array<{ value: string; total: number }> {
  const totals = new Map<string, number>();
  for (const rows of idx.get(f.breakdown)?.values() ?? []) {
    for (const r of rows) {
      const raw = String(r[f.dim] ?? '');
      if (isOther(raw)) continue;
      const v = f.norm ? f.norm(raw) : raw;
      totals.set(v, (totals.get(v) ?? 0) + num(r[f.metric]));
    }
  }
  return [...totals.entries()].map(([value, total]) => ({ value, total })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
}

/** All the cards that can be made from what is stored: the fixed ones and the busiest values of each family. */
export function catalog(cur: DayIndex): CardSpec[] {
  const specs = [...STATIC];
  for (const f of FAMILIES) {
    const seen = new Set<string>(specs.map((s) => s.key));
    for (const { value } of valuesOf(f, cur).slice(0, f.max)) {
      const s = familySpec(f, value);
      if (!seen.has(s.key)) { specs.push(s); seen.add(s.key); }
    }
  }
  return specs;
}

/** Turn a requested key back into a card, even if its value is not among the busiest right now. */
export function specForKey(key: string, idx: DayIndex): CardSpec | null {
  const fixed = STATIC.find((s) => s.key === key);
  if (fixed) return fixed;
  const m = /^([a-z]+)_(.+)$/.exec(key);
  const f = m && FAMILIES.find((x) => x.prefix === m[1]);
  if (!m || !f) return null;
  const hit = valuesOf(f, idx).find(({ value }) => slugify(value) === m[2]);
  return hit ? familySpec(f, hit.value) : null;
}

/** Which stored breakdowns a set of keys needs, so only those are read. */
export function breakdownsFor(keys: string[] | null): string[] {
  const all = new Set<string>();
  const wanted = (k: string) => (keys === null ? true : keys.includes(k));
  for (const s of STATIC) if (wanted(s.key)) s.needs.forEach((n) => all.add(n));
  for (const f of FAMILIES) if (keys === null || keys.some((k) => k.startsWith(`${f.prefix}_`))) all.add(f.breakdown);
  return [...all];
}

// ---- working the numbers out ----

function dayValue(spec: CardSpec, idx: DayIndex, date: string): { n: number; d?: number } | null {
  const bag: Bag = {};
  for (const need of spec.needs) {
    const rows = idx.get(need)?.get(date);
    if (!rows) return null;
    bag[need] = rows;
  }
  return spec.day(bag);
}

function aggregate(spec: CardSpec, vals: Array<{ n: number; d?: number } | null>): number | null {
  const have = vals.filter((v): v is { n: number; d?: number } => v !== null);
  if (have.length === 0) return null;
  if (spec.mode === 'mean') return have.reduce((s, v) => s + v.n, 0) / have.length;
  if (spec.mode === 'last') return have[have.length - 1].n;
  const d = have.reduce((s, v) => s + (v.d ?? 0), 0);
  return d > 0 ? (have.reduce((s, v) => s + v.n, 0) / d) * (spec.scale ?? 1) : null;
}

const seriesPoint = (spec: CardSpec, v: { n: number; d?: number } | null): number | null => {
  if (v === null) return null;
  if (spec.mode !== 'ratio') return v.n;
  return v.d && v.d > 0 ? (v.n / v.d) * (spec.scale ?? 1) : null;
};

export interface BuiltCards {
  tiles: CardTile[];
  /** one value per day of the range, for the trend line */
  series: Record<string, Array<number | null>>;
  /** the same for the period before, for the dashed comparison line */
  previousSeries: Record<string, Array<number | null>>;
}

export function buildCards(specs: CardSpec[], cur: DayIndex, prev: DayIndex, dates: string[], prevDates: string[]): BuiltCards {
  const tiles: CardTile[] = []; const series: BuiltCards['series'] = {}; const previousSeries: BuiltCards['previousSeries'] = {};
  for (const spec of specs) {
    const curVals = dates.map((d) => dayValue(spec, cur, d));
    const prevVals = prevDates.map((d) => dayValue(spec, prev, d));
    const value = aggregate(spec, curVals);
    if (value === null) continue; // nothing stored for this card in the range
    const previous = aggregate(spec, prevVals);
    const change = pctChange(value, previous);
    tiles.push({ key: spec.key, group: spec.group, source: 'ga4', label: spec.label, unit: spec.unit, value, previous, change, trend: trendOf(change, spec.good), help: spec.help, sample: null });
    series[spec.key] = curVals.map((v) => seriesPoint(spec, v));
    previousSeries[spec.key] = prevVals.map((v) => seriesPoint(spec, v));
  }
  return { tiles, series, previousSeries };
}
