/**
 * PageSpeed Insights (PSI) results, reduced to what the dashboard keeps. PSI returns two kinds of data:
 *  - field data: what real Chrome users experienced over the last 28 days (Google's CrUX), updated daily
 *  - lab data: one fresh Lighthouse test run on a simulated phone or desktop
 * The full Lighthouse report is hundreds of KB, so only a small summary is stored.
 */

export type Strategy = 'mobile' | 'desktop';
export type Grade = 'good' | 'needs-improvement' | 'poor';

/** Google's published thresholds: [good up to, poor above]. Times in ms; CLS has no unit. */
export const THRESHOLDS = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  fcp: [1800, 3000],
  ttfb: [800, 1800],
  tbt: [200, 600],
  si: [3400, 5800],
} as const;
export type MetricKey = keyof typeof THRESHOLDS;

export function grade(metric: MetricKey, value: number | null | undefined): Grade | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const [good, poor] = THRESHOLDS[metric];
  return value <= good ? 'good' : value > poor ? 'poor' : 'needs-improvement';
}

export const gradeScore = (score: number | null): Grade | null =>
  score === null ? null : score >= 90 ? 'good' : score >= 50 ? 'needs-improvement' : 'poor';

// ---- days ----

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

/** The calendar day in Bangladesh time (UTC+6, no daylight saving). The daily check runs at 12:00 there. */
export const bdDay = (d: Date) => new Date(d.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- addresses ----

export class BadUrl extends Error {}

/** One page, one spelling: http(s) only, no #fragment, no trailing slash (except the home page), no credentials. */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new BadUrl('Enter a full web address, for example https://example.com/page');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadUrl('Only http and https addresses can be tested');
  if (u.username || u.password) throw new BadUrl('Remove the user name and password from the address');
  const host = u.hostname;
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) {
    throw new BadUrl('PageSpeed can only test a public website address, not localhost or an IP address');
  }
  u.hash = '';
  let out = u.toString();
  if (u.pathname !== '/' && out.endsWith('/') && !u.search) out = out.slice(0, -1);
  if (out.length > 500) throw new BadUrl('That address is too long');
  return out;
}

// ---- reading a PSI response ----

export interface FieldMetric {
  /** 75th percentile: three in four visits were at least this good */
  p75: number;
  grade: Grade;
  /** share of visits in the good / needs improvement / poor bands, as fractions that sum to about 1 */
  dist: [number, number, number] | null;
}
export interface FieldData {
  /** where the real-user numbers come from: this page, the whole site, or not enough traffic for either */
  scope: 'url' | 'origin' | 'none';
  lcp?: FieldMetric; inp?: FieldMetric; cls?: FieldMetric; fcp?: FieldMetric; ttfb?: FieldMetric;
}
export interface LabData {
  fcp: number | null; lcp: number | null; tbt: number | null; cls: number | null; si: number | null; ttfb: number | null;
}
export interface AuditItem { label: string; value: string | null }
export interface AuditSummary {
  id: string; title: string; description: string; displayValue: string | null; score: number | null;
  kind: 'opportunity' | 'diagnostic'; savingsMs: number | null; savingsBytes: number | null;
  /** which metrics this audit can improve (FCP, LCP, TBT, CLS, INP); empty when Google does not say */
  metrics: string[]; items: AuditItem[];
}
export type Verdict = 'pass' | 'fail' | 'none';
export interface ParsedRun {
  perfScore: number | null; lab: LabData; field: FieldData; verdict: Verdict;
  finalUrl: string | null; lighthouseVersion: string | null; audits: AuditSummary[];
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** CrUX keys in a PSI response. CLS is reported times 100 in `percentile`. */
const FIELD_KEYS: Record<Exclude<keyof FieldData, 'scope'>, string> = {
  lcp: 'LARGEST_CONTENTFUL_PAINT_MS',
  inp: 'INTERACTION_TO_NEXT_PAINT',
  cls: 'CUMULATIVE_LAYOUT_SHIFT_SCORE',
  fcp: 'FIRST_CONTENTFUL_PAINT_MS',
  ttfb: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE',
};

function readField(experience: Obj | undefined): Omit<FieldData, 'scope'> {
  const out: Omit<FieldData, 'scope'> = {};
  const metrics: Obj = experience?.metrics ?? {};
  for (const [key, apiKey] of Object.entries(FIELD_KEYS) as [Exclude<keyof FieldData, 'scope'>, string][]) {
    const m = metrics[apiKey];
    const raw = num(m?.percentile);
    if (raw === null) continue;
    const p75 = key === 'cls' ? raw / 100 : raw;
    const d = Array.isArray(m?.distributions) ? m.distributions.map((x: Obj) => num(x?.proportion)) : [];
    const dist = d.length === 3 && d.every((x: number | null) => x !== null) ? (d as [number, number, number]) : null;
    out[key] = { p75, grade: grade(key, p75) as Grade, dist };
  }
  return out;
}

/**
 * Google's Core Web Vitals assessment: passed when LCP, INP and CLS are all in the "good" band for 75% of
 * visits. INP is missing on lower-traffic pages, so it is judged only when present. With no LCP or CLS there
 * is no assessment.
 */
export function cwvVerdict(field: FieldData): Verdict {
  const { lcp, cls, inp } = field;
  if (!lcp || !cls) return 'none';
  return [lcp, cls, inp].every((m) => !m || m.grade === 'good') ? 'pass' : 'fail';
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, n) : '');

function itemsOf(details: Obj | undefined): AuditItem[] {
  const rows: Obj[] = Array.isArray(details?.items) ? details!.items : [];
  return rows.slice(0, 8).map((r) => {
    const label = r.url ?? r.node?.snippet ?? r.node?.nodeLabel ?? r.label ?? r.source?.url ?? r.groupLabel ?? r.name ?? '';
    const bytes = num(r.wastedBytes) ?? num(r.totalBytes);
    const ms = num(r.wastedMs) ?? num(r.duration) ?? num(r.total);
    const value = bytes !== null ? `${Math.round(bytes / 1024)} KiB` : ms !== null ? `${Math.round(ms)} ms` : null;
    return { label: clip(typeof label === 'string' ? label : JSON.stringify(label), 160), value };
  }).filter((i) => i.label);
}

/** Lab metrics whose "savings" are milliseconds; CLS and INP savings are not time. */
const MS_METRICS = ['FCP', 'LCP', 'TBT'];

/** The audits Google would show under "Diagnostics" and "Opportunities", most useful first. */
function readAudits(lh: Obj): AuditSummary[] {
  const audits: Obj = lh.audits ?? {};
  const refs: Obj[] = lh.categories?.performance?.auditRefs ?? [];
  // Older reports list, per metric, the audits that can improve it. Newer ones put the metrics on each audit
  // as `metricSavings`. Both are read, so the "show fixes for LCP" filter works either way.
  const forMetric = new Map<string, string[]>();
  for (const ref of refs) {
    if (ref.group !== 'metrics' || !ref.acronym || !Array.isArray(ref.relevantAudits)) continue;
    for (const id of ref.relevantAudits as string[]) forMetric.set(id, [...(forMetric.get(id) ?? []), String(ref.acronym)]);
  }
  const out: AuditSummary[] = [];
  for (const ref of refs) {
    if (ref.group === 'metrics' || ref.group === 'hidden' || ref.group === 'budgets') continue;
    const a = audits[ref.id];
    if (!a) continue;
    const mode = a.scoreDisplayMode;
    if (mode === 'notApplicable' || mode === 'manual' || mode === 'error') continue;
    const ms: Obj = a.metricSavings && typeof a.metricSavings === 'object' ? a.metricSavings : {};
    const timeSaved = Math.max(0, num(a.details?.overallSavingsMs) ?? 0, ...MS_METRICS.map((m) => num(ms[m]) ?? 0));
    const items = itemsOf(a.details);
    const wasted = Array.isArray(a.details?.items) ? (a.details.items as Obj[]).reduce((sum, r) => sum + (num(r.wastedBytes) ?? 0), 0) : 0;
    const bytesSaved = num(a.details?.overallSavingsBytes) ?? (wasted > 0 ? Math.round(wasted) : null);
    const score = num(a.score);
    const failing = (score !== null && score < 0.9) || timeSaved > 0 || (bytesSaved ?? 0) > 0;
    if (!failing) continue;
    const metrics = [...new Set([...Object.keys(ms), ...(forMetric.get(String(ref.id)) ?? [])])];
    out.push({
      id: String(ref.id), title: clip(a.title, 140), description: clip(a.description, 320), displayValue: clip(a.displayValue, 80) || null,
      score, kind: a.details?.type === 'opportunity' || timeSaved > 0 || (bytesSaved ?? 0) > 0 ? 'opportunity' : 'diagnostic',
      savingsMs: timeSaved > 0 ? timeSaved : null, savingsBytes: bytesSaved && bytesSaved > 0 ? bytesSaved : null, metrics, items,
    });
  }
  // biggest time savings first, then the lowest scores
  out.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0) || (a.score ?? 1) - (b.score ?? 1));
  return out.slice(0, 40);
}

export class LighthouseError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Reduce a PSI v5 response. Throws when Lighthouse itself failed (page unreachable, no paint, and so on). */
export function parsePsi(json: unknown): ParsedRun {
  const r = (json ?? {}) as Obj;
  const lh: Obj | undefined = r.lighthouseResult;
  if (!lh) throw new LighthouseError('NO_RESULT', 'PageSpeed returned no test result');
  if (lh.runtimeError?.code && lh.runtimeError.code !== 'NO_ERROR') {
    throw new LighthouseError(String(lh.runtimeError.code), clip(lh.runtimeError.message, 200) || 'The page could not be tested');
  }
  const audits: Obj = lh.audits ?? {};
  const v = (id: string) => num(audits[id]?.numericValue);
  const perf = num(lh.categories?.performance?.score);

  // Real-user data for this exact page when Google has enough visits, otherwise for the whole site.
  const own = readField(r.loadingExperience);
  const origin = readField(r.originLoadingExperience);
  const urlLevel = Object.keys(own).length > 0 && r.loadingExperience?.origin_fallback !== true;
  const field: FieldData = urlLevel ? { scope: 'url', ...own } : Object.keys(origin).length ? { scope: 'origin', ...origin } : { scope: 'none' };

  return {
    perfScore: perf === null ? null : Math.round(perf * 100),
    lab: {
      fcp: v('first-contentful-paint'), lcp: v('largest-contentful-paint'), tbt: v('total-blocking-time'),
      cls: v('cumulative-layout-shift'), si: v('speed-index'), ttfb: v('server-response-time'),
    },
    field,
    verdict: cwvVerdict(field),
    finalUrl: typeof lh.finalDisplayedUrl === 'string' ? lh.finalDisplayedUrl : typeof lh.finalUrl === 'string' ? lh.finalUrl : null,
    lighthouseVersion: typeof lh.lighthouseVersion === 'string' ? lh.lighthouseVersion : null,
    audits: readAudits(lh),
  };
}

// ---- reading stored results ----

export interface StoredPoint {
  day: string; runAt: Date; trigger: string; ok: boolean;
}

/**
 * The one result that stands for each day. The scheduled run wins; a manual run counts only on a day with no
 * scheduled one. Lab scores move by 5 to 10 points between runs, so a manual run must not replace the day's value.
 */
export function pickDaily<T extends StoredPoint>(results: T[]): T[] {
  const byDay = new Map<string, T>();
  const rank = (r: T) => (r.trigger === 'manual' ? 0 : 1);
  for (const r of results) {
    if (!r.ok) continue;
    const cur = byDay.get(r.day);
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && r.runAt > cur.runAt)) byDay.set(r.day, r);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}
