import { normalizeUrl, periodsFor } from './aggregate';
import { buildRows, collectDimension, collectPages } from './explore';

const fr = (n: number, pct: number) => ({ sessionsCount: n, sessionsWithMetricPercentage: pct, sessionsWithoutMetricPercentage: 100 - pct, pagesViews: 0, subTotal: 0 });
const day = (rows: Array<{ k: string; human: number; bots: number; quick: number }>, dim = 'Url') => [
  { metricName: 'Traffic', information: rows.map((r) => ({ totalSessionCount: r.human, totalBotSessionCount: r.bots, distinctUserCount: r.human, pagesPerSessionPercentage: 1.5, [dim]: r.k })) },
  { metricName: 'QuickbackClick', information: rows.map((r) => ({ ...fr(r.human, r.quick), [dim]: r.k })) },
];

describe('normalizeUrl', () => {
  it('merges query strings, fragments and trailing slashes', () => {
    expect(normalizeUrl('https://Example.com/a/?utm=1#x')).toBe('https://example.com/a');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });
  it('leaves junk alone', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('periodsFor', () => {
  it('ends on the latest full UTC day and compares with the period before', () => {
    const r = periodsFor(7, new Date('2026-11-18T07:55:00.000Z'));
    expect(r.to).toBe('2026-11-17');
    expect(r.from).toBe('2026-11-11');
    expect(r.previousTo).toBe('2026-11-10');
    expect(r.previousFrom).toBe('2026-11-04');
  });
});

describe('collectPages', () => {
  const docs = [
    { payload: day([{ k: 'https://example.com/a?x=1', human: 10, bots: 0, quick: 0 }, { k: 'http://localhost:8081/', human: 5, bots: 0, quick: 0 }]) },
    { payload: day([{ k: 'https://example.com/a/', human: 20, bots: 0, quick: 0 }]) },
  ];
  it('merges address variants, drops local hosts and counts them', () => {
    const c = collectPages(docs);
    expect([...c.pages.keys()]).toEqual(['https://example.com/a']);
    expect(c.pages.get('https://example.com/a')).toHaveLength(2);
    expect(c.excludedRows).toBe(1);
    expect(c.truncatedDays).toBe(0);
  });
  it('flags days that hit the 1,000 row limit', () => {
    const big = { payload: day(Array.from({ length: 1000 }, (_, i) => ({ k: `https://example.com/p${i}`, human: 1, bots: 0, quick: 0 }))) };
    expect(collectPages([big]).truncatedDays).toBe(1);
  });
});

describe('buildRows', () => {
  const cur = collectDimension([{ payload: day([{ k: 'google', human: 80, bots: 20, quick: 5 }, { k: 'bing', human: 20, bots: 80, quick: 0 }], 'Source') }], 'Source');
  const prev = collectDimension([{ payload: day([{ k: 'google', human: 40, bots: 0, quick: 0 }], 'Source') }], 'Source');
  const { rows, totalHuman } = buildRows(cur, prev, 1, 1);
  const g = rows.find((r) => r.value === 'google')!;
  const b = rows.find((r) => r.value === 'bing')!;
  it('computes share, bot share and quick-back rate', () => {
    expect(totalHuman).toBe(100);
    expect(g.share).toBe(80);
    expect(g.botShare).toBe(20);
    expect(b.botShare).toBe(80);
    expect(g.quickbackRate).toBeCloseTo(5);
  });
  it('compares sessions per day with data', () => {
    expect(g.change).toBeCloseTo(100); // 80 vs 40
    expect(b.change).toBeNull(); // no earlier period for this value
  });
  it('does not mistake missing days for a drop', () => {
    const r = buildRows(cur, prev, 1, 2).rows.find((x) => x.value === 'google')!;
    expect(r.previousPerDay).toBe(20); // 40 sessions over 2 days with data
  });
});

