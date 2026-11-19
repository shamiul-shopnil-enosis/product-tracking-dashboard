/**
 * Turns stored Clarity responses into plain numbers.
 * Shapes checked against live responses on 2026-11-17:
 *  - Traffic: totalSessionCount (human only), totalBotSessionCount, distinctUserCount, pagesPerSessionPercentage (pages per session)
 *  - friction metrics: sessionsCount, sessionsWithMetricPercentage, pagesViews, subTotal (number of events)
 *  - ScrollDepth: averageScrollDepth (percent); EngagementTime: totalTime and activeTime (seconds per session)
 *  - with a dimension, every row also carries the dimension value under a key such as Url, Country, Source
 */
export const FRICTION_METRICS = {
  rage: 'RageClickCount',
  dead: 'DeadClickCount',
  quickback: 'QuickbackClick',
  excessiveScroll: 'ExcessiveScroll',
  scriptError: 'ScriptErrorCount',
  errorClick: 'ErrorClickCount',
} as const;
export type FrictionKey = keyof typeof FRICTION_METRICS;
export const FRICTION_KEYS = Object.keys(FRICTION_METRICS) as FrictionKey[];

export interface Friction {
  /** Human sessions the rate is measured against */
  sessions: number;
  /** Sessions that had at least one such event (a fraction, because it is derived from a rounded percentage) */
  affected: number;
  /** Total events */
  events: number;
}

export interface DayMetrics {
  humanSessions: number;
  botSessions: number;
  users: number;
  pagesPerSession: number | null;
  scrollDepth: number | null;
  activeTime: number | null;
  totalTime: number | null;
  friction: Record<FrictionKey, Friction>;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

function metricRows(payload: unknown, name: string): Row[] {
  if (!Array.isArray(payload)) return [];
  const m = (payload as Array<{ metricName?: unknown; information?: unknown }>).find((x) => x?.metricName === name);
  return Array.isArray(m?.information) ? (m!.information as Row[]) : [];
}

function build(traffic: Row | undefined, scroll: Row | undefined, engage: Row | undefined, fr: Partial<Record<FrictionKey, Row>>): DayMetrics {
  const friction = {} as Record<FrictionKey, Friction>;
  for (const k of FRICTION_KEYS) {
    const r = fr[k];
    const sessions = num(r?.sessionsCount);
    friction[k] = {
      sessions,
      // Kept fractional: Clarity gives a percentage, and rounding each day to whole sessions distorts small rates.
      affected: (sessions * num(r?.sessionsWithMetricPercentage)) / 100,
      events: num(r?.subTotal),
    };
  }
  return {
    humanSessions: num(traffic?.totalSessionCount),
    botSessions: num(traffic?.totalBotSessionCount),
    users: num(traffic?.distinctUserCount),
    pagesPerSession: numOrNull(traffic?.pagesPerSessionPercentage),
    scrollDepth: numOrNull(scroll?.averageScrollDepth),
    activeTime: numOrNull(engage?.activeTime),
    totalTime: numOrNull(engage?.totalTime),
    friction,
  };
}

/** A response without a dimension: one row per metric. Null when there is no Traffic data at all. */
export function parseOverall(payload: unknown): DayMetrics | null {
  const traffic = metricRows(payload, 'Traffic')[0];
  if (!traffic) return null;
  const fr: Partial<Record<FrictionKey, Row>> = {};
  for (const k of FRICTION_KEYS) fr[k] = metricRows(payload, FRICTION_METRICS[k])[0];
  return build(traffic, metricRows(payload, 'ScrollDepth')[0], metricRows(payload, 'EngagementTime')[0], fr);
}

/** The key a dimension value is stored under in the rows, matched ignoring case. */
export function dimensionKey(payload: unknown, dimension: string): string | null {
  const want = dimension.toLowerCase();
  for (const row of metricRows(payload, 'Traffic')) {
    const found = Object.keys(row).find((k) => k.toLowerCase() === want);
    if (found) return found;
  }
  return null;
}

/** True when a request that asked for a breakdown really got one. */
export const hasDimension = (payload: unknown, dimension: string) => dimensionKey(payload, dimension) !== null;

/** A response split by one dimension: metrics per dimension value, joined across metrics. */
export function parseBreakdown(payload: unknown, dimension: string): Map<string, DayMetrics> {
  const key = dimensionKey(payload, dimension);
  const out = new Map<string, DayMetrics>();
  if (!key) return out;
  const index = (name: string) => new Map(metricRows(payload, name).map((r) => [String(r[key] ?? ''), r] as const));
  const scroll = index('ScrollDepth');
  const engage = index('EngagementTime');
  const fr = Object.fromEntries(FRICTION_KEYS.map((k) => [k, index(FRICTION_METRICS[k])])) as Record<FrictionKey, Map<string, Row>>;
  for (const row of metricRows(payload, 'Traffic')) {
    const v = String(row[key] ?? '');
    const frictionRows: Partial<Record<FrictionKey, Row>> = {};
    for (const k of FRICTION_KEYS) frictionRows[k] = fr[k].get(v);
    out.set(v, build(row, scroll.get(v), engage.get(v), frictionRows));
  }
  return out;
}
