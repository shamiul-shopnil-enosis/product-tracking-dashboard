export type Strategy = 'mobile' | 'desktop';
export type Grade = 'good' | 'needs-improvement' | 'poor';
export type Verdict = 'pass' | 'fail' | 'none';

export type FieldMetric = { p75: number; grade: Grade; dist?: [number, number, number] | null };
export type Field = { scope: 'url' | 'origin' | 'none'; lcp?: FieldMetric; inp?: FieldMetric; cls?: FieldMetric; fcp?: FieldMetric; ttfb?: FieldMetric };
export type Lab = { fcp?: number | null; lcp?: number | null; tbt?: number | null; cls?: number | null; si?: number | null; ttfb?: number | null };
export type SpeedPoint = { day: string; runAt: string; trigger: string; perfScore: number | null; verdict: Verdict; lab: Lab; field: Field };
export type Audit = {
  id: string; title: string; description: string; displayValue: string | null; score: number | null; kind: 'opportunity' | 'diagnostic';
  savingsMs: number | null; savingsBytes: number | null; metrics: string[]; items: { label: string; value: string | null }[];
};
export type SpeedSummary = {
  url: string; strategy: Strategy; tracked: boolean; label: string | null; range: { from: string; to: string }; compareDay: string;
  latest: SpeedPoint | null; lastTry: { ok: boolean; error: string | null; runAt: string; trigger: string } | null;
  compare: SpeedPoint | null; series: SpeedPoint[]; audits: Audit[]; auditsRunAt: string | null; configured: boolean; problem: string | null;
};
export type SpeedTargets = { targets: { id: string; url: string; label: string | null }[]; configured: boolean; problem: string | null; dailyTime: string };

/** "15:30" -> "3:30 PM" */
export function clock12(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
}
export type JobPoint = Omit<SpeedPoint, 'day' | 'trigger'>;
export type SpeedJob = { id: string; url: string; strategies: Strategy[]; status: 'queued' | 'running' | 'done' | 'failed'; results: { strategy: string; ok: boolean; error?: string; point?: JobPoint }[]; error: string | null };

export type MetricKey = 'f_lcp' | 'f_inp' | 'f_cls' | 'f_fcp' | 'f_ttfb' | 'l_score' | 'l_fcp' | 'l_lcp' | 'l_tbt' | 'l_cls' | 'l_si';

export type MetricDef = {
  key: MetricKey; kind: 'field' | 'lab'; short: string; label: string; unit: 'ms' | 'cls' | 'score'; help: string;
  /** which Lighthouse metric's recommendations this tile opens */
  focus?: 'FCP' | 'LCP' | 'TBT' | 'INP' | 'CLS' | 'SI';
  read: (p: SpeedPoint) => number | null;
  grade: (p: SpeedPoint) => Grade | null;
};

const scoreGrade = (s: number | null): Grade | null => (s === null ? null : s >= 90 ? 'good' : s >= 50 ? 'needs-improvement' : 'poor');
const band = (v: number | null | undefined, good: number, poor: number): Grade | null => (v === null || v === undefined ? null : v <= good ? 'good' : v > poor ? 'poor' : 'needs-improvement');
const fieldRead = (k: 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb') => (p: SpeedPoint) => p.field?.[k]?.p75 ?? null;
const fieldGrade = (k: 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb') => (p: SpeedPoint) => p.field?.[k]?.grade ?? null;

export const FIELD_METRICS: MetricDef[] = [
  { key: 'f_lcp', kind: 'field', short: 'LCP', label: 'Largest Contentful Paint', unit: 'ms', focus: 'LCP', read: fieldRead('lcp'), grade: fieldGrade('lcp'),
    help: 'How long until the biggest thing on the page (usually the main image or heading) is on screen. Good is 2.5 seconds or less. Measured on real visitors.' },
  { key: 'f_inp', kind: 'field', short: 'INP', label: 'Interaction to Next Paint', unit: 'ms', focus: 'INP', read: fieldRead('inp'), grade: fieldGrade('inp'),
    help: 'How quickly the page reacts when someone clicks, taps or types. Good is 200 milliseconds or less. Measured on real visitors; small pages may not have enough data.' },
  { key: 'f_cls', kind: 'field', short: 'CLS', label: 'Cumulative Layout Shift', unit: 'cls', focus: 'CLS', read: fieldRead('cls'), grade: fieldGrade('cls'),
    help: 'How much the page jumps around while loading, for example a button moving just as you tap it. Good is 0.1 or less. Lower is better.' },
  { key: 'f_fcp', kind: 'field', short: 'FCP', label: 'First Contentful Paint', unit: 'ms', focus: 'FCP', read: fieldRead('fcp'), grade: fieldGrade('fcp'),
    help: 'How long until the first text or image appears. Good is 1.8 seconds or less. Measured on real visitors.' },
  { key: 'f_ttfb', kind: 'field', short: 'TTFB', label: 'Time to First Byte', unit: 'ms', read: fieldRead('ttfb'), grade: fieldGrade('ttfb'),
    help: 'How long the server takes to start answering. Good is 0.8 seconds or less. Slow answers delay everything else.' },
];

export const LAB_METRICS: MetricDef[] = [
  { key: 'l_score', kind: 'lab', short: 'Score', label: 'Performance score', unit: 'score', read: (p) => p.perfScore, grade: (p) => scoreGrade(p.perfScore),
    help: 'Lighthouse’s overall speed score out of 100 from one test run. 90 and above is good, 50 to 89 needs work, below 50 is poor. It can move 5 to 10 points between runs.' },
  { key: 'l_fcp', kind: 'lab', short: 'FCP', label: 'First Contentful Paint', unit: 'ms', focus: 'FCP', read: (p) => p.lab?.fcp ?? null, grade: (p) => band(p.lab?.fcp, 1800, 3000),
    help: 'In the test run: when the first text or image appears. Good is 1.8 seconds or less.' },
  { key: 'l_lcp', kind: 'lab', short: 'LCP', label: 'Largest Contentful Paint', unit: 'ms', focus: 'LCP', read: (p) => p.lab?.lcp ?? null, grade: (p) => band(p.lab?.lcp, 2500, 4000),
    help: 'In the test run: when the biggest thing on the page is on screen. Good is 2.5 seconds or less.' },
  { key: 'l_tbt', kind: 'lab', short: 'TBT', label: 'Total Blocking Time', unit: 'ms', focus: 'TBT', read: (p) => p.lab?.tbt ?? null, grade: (p) => band(p.lab?.tbt, 200, 600),
    help: 'In the test run: how long the page was too busy to react to clicks. A test run has no real clicks, so this is the lab stand-in for INP. Good is 200 milliseconds or less.' },
  { key: 'l_cls', kind: 'lab', short: 'CLS', label: 'Cumulative Layout Shift', unit: 'cls', focus: 'CLS', read: (p) => p.lab?.cls ?? null, grade: (p) => band(p.lab?.cls, 0.1, 0.25),
    help: 'In the test run: how much the page jumped around while loading. Good is 0.1 or less.' },
  { key: 'l_si', kind: 'lab', short: 'Speed Index', label: 'Speed Index', unit: 'ms', focus: 'SI', read: (p) => p.lab?.si ?? null, grade: (p) => band(p.lab?.si, 3400, 5800),
    help: 'In the test run: how quickly the page fills in visually. Good is 3.4 seconds or less.' },
];

export const ALL_METRICS = [...FIELD_METRICS, ...LAB_METRICS];

export function formatMetric(v: number | null | undefined, unit: MetricDef['unit']): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (unit === 'score') return String(Math.round(v));
  if (unit === 'cls') return v.toFixed(2);
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} s` : `${Math.round(v)} ms`;
}

export const GRADE_TEXT: Record<Grade, string> = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor' };

/** Percent change from `before` to `now`; null when either is missing or before is zero. */
export function pctChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

/** The Bangladesh calendar day (UTC+6), the same one the daily check uses. */
export const todayBd = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const FOCUS_CHIPS: { key: 'ALL' | 'FCP' | 'LCP' | 'TBT' | 'INP' | 'CLS'; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'FCP', label: 'FCP' }, { key: 'LCP', label: 'LCP' }, { key: 'TBT', label: 'TBT' }, { key: 'INP', label: 'INP' }, { key: 'CLS', label: 'CLS' },
];
