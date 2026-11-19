/** What we ask GA4 for. Each report becomes one stored breakdown, split into one snapshot per day. */
export const GA4_REPORTS = {
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
} as const;

/** Key events are requested on their own: if a property names the metric differently the rest still works. */
export const GA4_KEY_EVENTS = { dimensions: ['date'], metrics: ['keyEvents'] } as const;

export type Ga4Breakdown = keyof typeof GA4_REPORTS;
export const GA4_BREAKDOWNS = Object.keys(GA4_REPORTS) as Ga4Breakdown[];

/** Pages kept per day for the landing page breakdown */
export const GA4_LANDING_PER_DAY = 50;
/** First sync pulls this much history; GA4 can return past dates, unlike Clarity */
export const GA4_BACKFILL_DAYS = 90;
/** Nightly sync re-reads this many recent days, because GA4 revises the latest days */
export const GA4_RECENT_DAYS = 3;
/** Days this recent may still change in GA4 */
export const GA4_SETTLE_DAYS = 2;
