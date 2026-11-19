import { aggregate, isProductionUrl, normalizeUrl, pctChange } from './aggregate';
import { DayMetrics, parseBreakdown } from './normalize';

/** Clarity returns at most 1,000 rows per call and cannot page. */
export const CLARITY_ROW_LIMIT = 1000;

export interface PageCollection {
  pages: Map<string, DayMetrics[]>;
  excludedRows: number;
  truncatedDays: number;
}

/** Group the per-day URL rows into one list per page, merging address variants and dropping local hosts. */
export function collectPages(docs: Array<{ payload: unknown }>, excludedHosts: string[] = []): PageCollection {
  const pages = new Map<string, DayMetrics[]>();
  let excludedRows = 0;
  let truncatedDays = 0;
  for (const doc of docs) {
    const rows = parseBreakdown(doc.payload, 'URL');
    if (rows.size >= CLARITY_ROW_LIMIT) truncatedDays += 1;
    for (const [url, m] of rows) {
      if (!isProductionUrl(url, excludedHosts)) {
        excludedRows += 1;
        continue;
      }
      const key = normalizeUrl(url);
      pages.set(key, [...(pages.get(key) ?? []), m]);
    }
  }
  return { pages, excludedRows, truncatedDays };
}

/** Group per-day rows of any other dimension into one list per value. */
export function collectDimension(docs: Array<{ payload: unknown }>, dimension: string): Map<string, DayMetrics[]> {
  const out = new Map<string, DayMetrics[]>();
  for (const doc of docs) {
    for (const [value, m] of parseBreakdown(doc.payload, dimension)) {
      out.set(value, [...(out.get(value) ?? []), m]);
    }
  }
  return out;
}

export interface ExploreRow {
  value: string;
  humanSessions: number;
  botSessions: number;
  /** Share of all human sessions in the range */
  share: number | null;
  /** Bot sessions as a share of this row's sessions */
  botShare: number | null;
  /** Sessions per day with data, now and in the period before */
  perDay: number | null;
  previousPerDay: number | null;
  change: number | null;
  pagesPerSession: number | null;
  scrollDepth: number | null;
  activeTime: number | null;
  quickbackRate: number | null;
  deadRate: number | null;
}

/**
 * One row per value. Change compares sessions per day with data, so a period with a missing day is not
 * mistaken for a drop.
 */
export function buildRows(
  current: Map<string, DayMetrics[]>,
  previous: Map<string, DayMetrics[]>,
  currentDays: number,
  previousDays: number,
): { rows: ExploreRow[]; totalHuman: number } {
  const totalHuman = [...current.values()].reduce((s, list) => s + list.reduce((a, d) => a + d.humanSessions, 0), 0);
  const rows = [...current.entries()].map(([value, list]) => {
    const a = aggregate(list);
    const prev = previous.get(value);
    const perDay = currentDays > 0 ? a.humanSessions / currentDays : null;
    const previousPerDay = prev && previousDays > 0 ? aggregate(prev).humanSessions / previousDays : null;
    const all = a.humanSessions + a.botSessions;
    return {
      value,
      humanSessions: a.humanSessions,
      botSessions: a.botSessions,
      share: totalHuman > 0 ? (a.humanSessions / totalHuman) * 100 : null,
      botShare: all > 0 ? (a.botSessions / all) * 100 : null,
      perDay,
      previousPerDay,
      change: pctChange(perDay, previousPerDay),
      pagesPerSession: a.pagesPerSession,
      scrollDepth: a.scrollDepth,
      activeTime: a.activeTime,
      quickbackRate: a.friction.quickback.rate,
      deadRate: a.friction.dead.rate,
    };
  });
  return { rows, totalHuman };
}
