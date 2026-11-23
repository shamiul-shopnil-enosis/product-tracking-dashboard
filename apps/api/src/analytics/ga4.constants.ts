export interface Ga4ReportDef {
  dimensions: readonly string[];
  metrics: readonly string[];
  /** Only sessions whose default channel group is Organic Search */
  organic?: boolean;
  /** Keep the busiest values of each day and fold the rest into one row, so shares stay measured against the real total */
  remainder?: { key: string; keep: number };
}

/** The demographic cuts: our name for it and GA4's dimension. */
export const GA4_DEMOGRAPHICS = {
  country: 'country',
  city: 'city',
  device: 'deviceCategory',
  browser: 'browser',
  language: 'language',
} as const;
export type DemographicKey = keyof typeof GA4_DEMOGRAPHICS;
export const DEMOGRAPHIC_KEYS = Object.keys(GA4_DEMOGRAPHICS) as DemographicKey[];
/** Values kept per day for a demographic cut; the rest is folded into "(other)" */
export const GA4_DEMOGRAPHIC_PER_DAY = 50;
export const OTHER_VALUES = '(other)';

const SESSION_METRICS = ['sessions', 'engagedSessions'] as const;
const demographic = (organic: boolean) =>
  Object.fromEntries(
    DEMOGRAPHIC_KEYS.map((k) => [
      `${organic ? 'org' : 'all'}_${k}`,
      { dimensions: ['date', GA4_DEMOGRAPHICS[k]], metrics: SESSION_METRICS, organic, remainder: { key: GA4_DEMOGRAPHICS[k], keep: GA4_DEMOGRAPHIC_PER_DAY } },
    ]),
  ) as Record<string, Ga4ReportDef>;

/** What we ask GA4 for. Each report becomes one stored breakdown, split into one snapshot per day. */
export const GA4_REPORTS: Record<string, Ga4ReportDef> = {
  none: {
    dimensions: ['date'],
    metrics: ['sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'eventCount', 'userEngagementDuration'],
  },
  channel: {
    dimensions: ['date', 'sessionDefaultChannelGroup'],
    metrics: ['sessions', 'engagedSessions', 'activeUsers'],
  },
  landing: {
    dimensions: ['date', 'landingPage'],
    metrics: ['sessions', 'engagedSessions'],
  },
  /** How many times each key event happened, per day. Only events marked as key events have a non-zero count. */
  event: {
    dimensions: ['date', 'eventName'],
    metrics: ['keyEvents'],
  },
  // ---- SEO: organic search visits only ----
  organic: {
    dimensions: ['date'],
    metrics: ['sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'keyEvents'],
    organic: true,
  },
  org_engine: {
    dimensions: ['date', 'sessionSource'],
    metrics: SESSION_METRICS,
    organic: true,
    remainder: { key: 'sessionSource', keep: 20 },
  },
  org_landing: {
    dimensions: ['date', 'landingPage'],
    metrics: SESSION_METRICS,
    organic: true,
  },
  // ---- audience: who the visitors are, for everyone and for organic visitors only ----
  ...demographic(false),
  ...demographic(true),
};

/** Key events are requested on their own: if a property names the metric differently the rest still works. */
export const GA4_KEY_EVENTS = { dimensions: ['date'], metrics: ['keyEvents'] } as const;

export type Ga4Breakdown = string;
export const GA4_BREAKDOWNS = Object.keys(GA4_REPORTS) as Ga4Breakdown[];

/** Pages kept per day for the landing page breakdown */
export const GA4_LANDING_PER_DAY = 50;
/** First sync pulls this much history; GA4 can return past dates, unlike Clarity */
export const GA4_BACKFILL_DAYS = 90;
/** Nightly sync re-reads this many recent days, because GA4 revises the latest days */
export const GA4_RECENT_DAYS = 3;
/** Days this recent may still change in GA4 */
export const GA4_SETTLE_DAYS = 2;
