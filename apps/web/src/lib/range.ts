import { fmtDate } from './date';

/** Dates are plain "YYYY-MM-DD" days in UTC, the same days the server uses. */
export type Day = string;

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 400;

export function isDay(v: string | null | undefined): v is Day {
  if (!v || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function addDays(day: Day, n: number): Day {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInclusive(from: Day, to: Day): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** The latest finished day. Today is never included because it is not complete. */
export function yesterdayOf(now = new Date()): Day {
  return addDays(now.toISOString().slice(0, 10), -1);
}

export function yearBefore(day: Day): Day {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export type PresetId = 'yesterday' | '7' | '14' | '30' | '90' | 'month' | 'lastmonth' | 'custom';
export type CompareMode = 'prev' | 'year' | 'custom';

export const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7', label: 'Last 7 days' },
  { id: '14', label: 'Last 14 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'month', label: 'This month so far' },
  { id: 'lastmonth', label: 'Last month' },
];

export const COMPARE_MODES: { id: CompareMode; label: string }[] = [
  { id: 'prev', label: 'Previous period' },
  { id: 'year', label: 'Same dates last year' },
  { id: 'custom', label: 'Custom' },
];

/** The dates a preset stands for, or null when it cannot be shown yet (for example "this month" on the 1st). */
export function presetRange(id: Exclude<PresetId, 'custom'>, now = new Date()): { from: Day; to: Day } | null {
  const to = yesterdayOf(now);
  switch (id) {
    case 'yesterday': return { from: to, to };
    case '7': case '14': case '30': case '90': return { from: addDays(to, -(Number(id) - 1)), to };
    case 'month': {
      const from = `${to.slice(0, 7)}-01`;
      return from <= to ? { from, to } : null;
    }
    case 'lastmonth': {
      const firstOfThisMonth = `${now.toISOString().slice(0, 7)}-01`;
      const to2 = addDays(firstOfThisMonth, -1);
      return { from: `${to2.slice(0, 7)}-01`, to: to2 };
    }
  }
}

/** The comparison dates for a range: the equal period before it, the same dates a year earlier, or the dates typed in. */
export function deriveCompare(from: Day, to: Day, mode: CompareMode, customFrom: Day, customTo: Day): { from: Day; to: Day } {
  if (mode === 'year') return { from: yearBefore(from), to: yearBefore(to) };
  if (mode === 'custom') return { from: customFrom, to: customTo };
  const n = daysInclusive(from, to);
  const end = addDays(from, -1);
  return { from: addDays(end, -(n - 1)), to: end };
}

export type ResolvedRange = {
  from: Day; to: Day; days: number;
  /** Which preset these dates are, or "custom". */
  preset: PresetId;
  compare: boolean; compareMode: CompareMode;
  compareFrom: Day; compareTo: Day;
};

type Raw = { days?: string | null; from?: string | null; to?: string | null; compare?: string | null; cmp?: string | null; cmpFrom?: string | null; cmpTo?: string | null };

/** Turns the address parameters into real dates, ignoring anything that is not a valid finished day. */
export function resolveRange(raw: Raw, now = new Date()): ResolvedRange {
  const yesterday = yesterdayOf(now);
  let from: Day; let to: Day; let preset: PresetId;
  if (isDay(raw.from) && isDay(raw.to) && raw.from <= raw.to && raw.to <= yesterday && daysInclusive(raw.from, raw.to) <= MAX_RANGE_DAYS) {
    from = raw.from; to = raw.to; preset = 'custom';
    for (const p of PRESETS) {
      const r = presetRange(p.id, now);
      if (r && r.from === from && r.to === to) { preset = p.id; break; }
    }
  } else {
    const n = [7, 14, 30, 90].includes(Number(raw.days)) ? Number(raw.days) : 14;
    ({ from, to } = presetRange(String(n) as '7', now)!);
    preset = String(n) as PresetId;
  }
  const days = daysInclusive(from, to);
  const compare = raw.compare !== '0';
  let compareMode: CompareMode = raw.cmp === 'year' ? 'year' : raw.cmp === 'custom' ? 'custom' : 'prev';
  if (compareMode === 'custom' && !(isDay(raw.cmpFrom) && isDay(raw.cmpTo) && raw.cmpFrom <= raw.cmpTo && raw.cmpTo <= yesterday)) compareMode = 'prev';
  const c = deriveCompare(from, to, compareMode, raw.cmpFrom ?? '', raw.cmpTo ?? '');
  return { from, to, days, preset, compare, compareMode, compareFrom: c.from, compareTo: c.to };
}

/** The query string the server needs. A plain "last N days" stays short; anything else sends the dates. */
export function rangeQuery(r: ResolvedRange): string {
  const customCompare = r.compare && r.compareMode !== 'prev';
  if (['7', '14', '30', '90'].includes(r.preset) && !customCompare) return `days=${r.preset}`;
  const p = new URLSearchParams({ from: r.from, to: r.to });
  if (customCompare) { p.set('compareFrom', r.compareFrom); p.set('compareTo', r.compareTo); }
  return p.toString();
}

export function presetLabel(r: ResolvedRange): string {
  return PRESETS.find((p) => p.id === r.preset)?.label ?? 'Custom range';
}

/** "9 Nov 2026 to 22 Nov 2026", or one date for a single day. */
export function spanText(from: Day, to: Day): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)} to ${fmtDate(to)}`;
}

/** The comparison period in words, for tooltips and chips. */
export function compareText(r: ResolvedRange): string {
  return r.compare ? `Compared with ${spanText(r.compareFrom, r.compareTo)}` : 'Not compared';
}

/** Weeks of a month as rows of Sunday-first days; days outside the month are null. */
export function monthGrid(year: number, month: number): (Day | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Day | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= last; d++) cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  while (cells.length % 7) cells.push(null);
  const rows: (Day | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
