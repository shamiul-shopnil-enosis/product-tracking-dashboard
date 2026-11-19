import { aggregate, daysBetween, isProductionUrl, pctChange, trendOf } from './aggregate';
import { dimensionKey, hasDimension, parseBreakdown, parseOverall } from './normalize';

// Same shape as a live response (values are made up).
const fr = (count: number, pct: number, events: number) => ({
  sessionsCount: count, sessionsWithMetricPercentage: pct, sessionsWithoutMetricPercentage: 100 - pct, pagesViews: 0, subTotal: events,
});
const overall = [
  { metricName: 'Traffic', information: [{ totalSessionCount: 1000, totalBotSessionCount: 4000, distinctUserCount: 900, pagesPerSessionPercentage: 1.5 }] },
  { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 40 }] },
  { metricName: 'EngagementTime', information: [{ totalTime: 50, activeTime: 10 }] },
  { metricName: 'RageClickCount', information: [fr(1000, 0.2, 3)] },
  { metricName: 'DeadClickCount', information: [fr(1000, 1.5, 30)] },
  { metricName: 'QuickbackClick', information: [fr(1000, 2, 25)] },
];
const byUrl = [
  { metricName: 'Traffic', information: [
    { totalSessionCount: 6, totalBotSessionCount: 40, distinctUserCount: 3, pagesPerSessionPercentage: 1.7, Url: 'http://localhost:8081/' },
    { totalSessionCount: 20, totalBotSessionCount: 1, distinctUserCount: 18, pagesPerSessionPercentage: null, Url: 'https://example.com/a' },
  ] },
  { metricName: 'DeadClickCount', information: [{ ...fr(6, 0, 0), Url: 'http://localhost:8081/' }, { ...fr(20, 10, 4), Url: 'https://example.com/a' }] },
];

describe('parseOverall', () => {
  const d = parseOverall(overall)!;
  it('reads sessions, bots, users and engagement', () => {
    expect(d.humanSessions).toBe(1000);
    expect(d.botSessions).toBe(4000);
    expect(d.users).toBe(900);
    expect(d.pagesPerSession).toBe(1.5);
    expect(d.scrollDepth).toBe(40);
    expect(d.activeTime).toBe(10);
  });
  it('turns percentages into affected sessions without rounding them', () => {
    expect(parseOverall([{ metricName: 'Traffic', information: [{ totalSessionCount: 1 }] }, { metricName: 'RageClickCount', information: [fr(500, 0.1, 1)] }])?.friction.rage.affected).toBeCloseTo(0.5);
    expect(d.friction.dead).toEqual({ sessions: 1000, affected: 15, events: 30 });
    expect(d.friction.rage.affected).toBe(2);
  });
  it('gives zeros for a metric that is missing', () => {
    expect(d.friction.scriptError).toEqual({ sessions: 0, affected: 0, events: 0 });
  });
  it('returns null without Traffic and survives junk', () => {
    expect(parseOverall([])).toBeNull();
    expect(parseOverall({ nope: 1 })).toBeNull();
    expect(parseOverall([{ metricName: 'Traffic', information: [{ totalSessionCount: '12' }] }])?.humanSessions).toBe(12);
  });
});

describe('breakdowns', () => {
  it('finds the dimension key ignoring case', () => {
    expect(dimensionKey(byUrl, 'URL')).toBe('Url');
    expect(hasDimension(byUrl, 'Country')).toBe(false);
    expect(hasDimension(overall, 'URL')).toBe(false);
  });
  it('joins metrics per dimension value', () => {
    const m = parseBreakdown(byUrl, 'URL');
    expect(m.size).toBe(2);
    expect(m.get('https://example.com/a')?.humanSessions).toBe(20);
    expect(m.get('https://example.com/a')?.friction.dead.affected).toBe(2);
    expect(m.get('https://example.com/a')?.pagesPerSession).toBeNull();
  });
});

describe('aggregate', () => {
  const a = parseOverall(overall)!;
  const b = { ...a, humanSessions: 3000, scrollDepth: 20, friction: { ...a.friction, dead: { sessions: 3000, affected: 30, events: 60 } } };
  const agg = aggregate([a, b]);
  it('sums sessions and averages per day', () => {
    expect(agg.humanSessions).toBe(4000);
    expect(agg.sessionsPerDay).toBe(2000);
    expect(agg.days).toBe(2);
  });
  it('weights engagement by sessions', () => {
    expect(agg.scrollDepth).toBe(25); // (40*1000 + 20*3000) / 4000
  });
  it('computes friction rate from summed counts, not an average of rates', () => {
    expect(agg.friction.dead.rate).toBeCloseTo((45 / 4000) * 100, 5);
  });
  it('computes the bot share', () => {
    expect(agg.botShare).toBeCloseTo((8000 / 12000) * 100, 5);
  });
  it('copes with no days', () => {
    const e = aggregate([]);
    expect(e.sessionsPerDay).toBeNull();
    expect(e.pagesPerSession).toBeNull();
    expect(e.botShare).toBeNull();
  });
});

describe('change and trend', () => {
  it('computes relative change', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(50, 100)).toBeCloseTo(-50);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(null, 5)).toBeNull();
  });
  it('judges the direction against what is good', () => {
    expect(trendOf(10, 'up')).toBe('better');
    expect(trendOf(10, 'down')).toBe('worse');
    expect(trendOf(-10, 'down')).toBe('better');
    expect(trendOf(1, 'up')).toBe('flat');
    expect(trendOf(30, 'neutral')).toBe('flat');
    expect(trendOf(null, 'up')).toBe('unknown');
  });
});

describe('daysBetween', () => {
  it('lists inclusive UTC days across a month end', () => {
    expect(daysBetween('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });
});

describe('isProductionUrl', () => {
  it('drops local and private hosts', () => {
    expect(isProductionUrl('http://localhost:8081/')).toBe(false);
    expect(isProductionUrl('http://192.168.1.5/x')).toBe(false);
    expect(isProductionUrl('http://127.0.0.1:3000/')).toBe(false);
    expect(isProductionUrl('not a url')).toBe(false);
  });
  it('keeps real hosts and honours extra exclusions', () => {
    expect(isProductionUrl('https://enosisoutsourcing.com/a')).toBe(true);
    expect(isProductionUrl('https://stage.enosisoutsourcing.com/a', ['stage.enosisoutsourcing.com'])).toBe(false);
  });
});
