/** Clarity Data Export API limits (learn.microsoft.com/clarity, checked 2026-11-17). */
export const CLARITY_ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
export const DAILY_LIMIT = 10;
/** Calls the nightly job leaves unused so an admin can still refresh or probe by hand. */
export const RESERVE = 3;

/** Breakdown key -> Clarity dimension names (max three per request). */
export const BREAKDOWNS = {
  none: [],
  url: ['URL'],
  channel: ['Channel'],
  source: ['Source'],
  device: ['Device'],
  // The docs list 'Country/Region', but the API only splits on 'Country' (checked live 2026-11-17).
  country: ['Country'],
  os: ['OS'],
} as const satisfies Record<string, readonly string[]>;

export type BreakdownKey = keyof typeof BREAKDOWNS;
export const BREAKDOWN_KEYS = Object.keys(BREAKDOWNS) as BreakdownKey[];

/**
 * day          one clean UTC day, taken by the nightly job right after midnight UTC
 * rolling24h   the last 24 hours up to a manual call, so it never lines up with a day
 * baseline72h  one 72-hour window from the probe, kept for the shape and as a starting point
 */
export type SnapshotWindow = 'day' | 'rolling24h' | 'baseline72h';
export type SyncTrigger = 'cron' | 'manual' | 'probe';
