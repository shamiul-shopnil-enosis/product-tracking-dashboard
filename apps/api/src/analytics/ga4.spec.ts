import { aggregateGa4, ga4Day, groupByDate, isoDate, mergeKeyEvents, rowsFromReport, topRows } from './ga4';
import { errorForGrpc } from './ga4.client';

const res = {
  dimensionHeaders: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
  metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }],
  rows: [
    { dimensionValues: [{ value: '20261116' }, { value: 'Direct' }], metricValues: [{ value: '120' }, { value: '60' }] },
    { dimensionValues: [{ value: '20261116' }, { value: 'Organic Search' }], metricValues: [{ value: '300' }, { value: '210' }] },
    { dimensionValues: [{ value: '20261117' }, { value: 'Direct' }], metricValues: [{ value: '90' }, { value: '30' }] },
  ],
};

describe('rowsFromReport', () => {
  const rows = rowsFromReport(res);
  it('flattens dimensions and metrics, converting dates and numbers', () => {
    expect(rows[0]).toEqual({ date: '2026-11-16', sessionDefaultChannelGroup: 'Direct', sessions: 120, engagedSessions: 60 });
    expect(rows).toHaveLength(3);
  });
  it('copes with an empty report', () => {
    expect(rowsFromReport({})).toEqual([]);
    expect(rowsFromReport({ rows: null })).toEqual([]);
  });
  it('treats missing or non-numeric metrics as zero', () => {
    const r = rowsFromReport({ metricHeaders: [{ name: 'sessions' }], dimensionHeaders: [{ name: 'date' }], rows: [{ dimensionValues: [{ value: '20261101' }], metricValues: [{ value: 'abc' }] }] });
    expect(r[0].sessions).toBe(0);
  });
  it('converts only well-formed dates', () => {
    expect(isoDate('20261117')).toBe('2026-11-17');
    expect(isoDate('(not set)')).toBe('(not set)');
  });
});

describe('groupByDate and topRows', () => {
  it('groups rows by day without the date field', () => {
    const g = groupByDate(rowsFromReport(res));
    expect([...g.keys()]).toEqual(['2026-11-16', '2026-11-17']);
    expect(g.get('2026-11-16')).toHaveLength(2);
    expect(g.get('2026-11-16')?.[0]).not.toHaveProperty('date');
  });
  it('keeps the busiest rows', () => {
    const top = topRows([{ p: 'a', sessions: 1 }, { p: 'b', sessions: 9 }, { p: 'c', sessions: 5 }], 'sessions', 2);
    expect(top.map((r) => r.p)).toEqual(['b', 'c']);
  });
});

describe('ga4Day and aggregateGa4', () => {
  const day = (s: number, e: number, u: number, k?: number) =>
    ga4Day([{ sessions: s, engagedSessions: e, activeUsers: u, newUsers: 1, screenPageViews: s * 2, eventCount: s * 5, userEngagementDuration: s * 40, ...(k === undefined ? {} : { keyEvents: k }) }])!;
  it('reads a stored day and survives junk', () => {
    expect(day(100, 50, 80, 2)).toMatchObject({ sessions: 100, users: 80, keyEvents: 2 });
    expect(ga4Day([])).toBeNull();
    expect(ga4Day('nope')).toBeNull();
  });
  it('computes the engagement rate from summed counts', () => {
    const a = aggregateGa4([day(100, 50, 80), day(300, 240, 200)]);
    expect(a.engagementRate).toBeCloseTo((290 / 400) * 100);
    expect(a.sessionsPerDay).toBe(200);
    expect(a.usersPerDay).toBe(140);
    expect(a.engagementTime).toBeCloseTo(40);
  });
  it('averages key events only over days that report them', () => {
    expect(aggregateGa4([day(10, 5, 8, 4), day(10, 5, 8)]).keyEventsPerDay).toBe(4);
    expect(aggregateGa4([day(10, 5, 8)]).keyEventsPerDay).toBeNull();
  });
  it('is empty without days', () => {
    expect(aggregateGa4([]).sessionsPerDay).toBeNull();
    expect(aggregateGa4([]).engagementRate).toBeNull();
  });
});

describe('mergeKeyEvents', () => {
  it('adds key events by day, and records 0 for days GA4 left out', () => {
    const daily = [{ date: '2026-11-16', sessions: 5 }, { date: '2026-11-17', sessions: 6 }];
    const merged = mergeKeyEvents(daily, [{ date: '2026-11-17', keyEvents: 3 }]);
    expect(merged[0].keyEvents).toBe(0);
    expect(merged[1].keyEvents).toBe(3);
  });
});

describe('errorForGrpc', () => {
  it('maps gRPC codes to kinds', () => {
    expect(errorForGrpc({ code: 7 }).kind).toBe('auth');
    expect(errorForGrpc({ code: 16 }).kind).toBe('auth');
    expect(errorForGrpc({ code: 8 }).kind).toBe('quota');
    expect(errorForGrpc({ code: 3 }).kind).toBe('bad_request');
    expect(errorForGrpc({ code: 14 }).kind).toBe('network');
    expect(errorForGrpc(new Error('x')).kind).toBe('server');
  });
});

import { addDaysIso, buildSnapshots } from './ga4';

describe('buildSnapshots', () => {
  const rows = rowsFromReport({
    dimensionHeaders: [{ name: 'date' }, { name: 'landingPage' }],
    metricHeaders: [{ name: 'sessions' }],
    rows: [
      { dimensionValues: [{ value: '20261110' }, { value: '/a' }], metricValues: [{ value: '5' }] },
      { dimensionValues: [{ value: '20261110' }, { value: '/b' }], metricValues: [{ value: '50' }] },
      { dimensionValues: [{ value: '20261110' }, { value: '/c' }], metricValues: [{ value: '20' }] },
      { dimensionValues: [{ value: '20261117' }, { value: '/a' }], metricValues: [{ value: '7' }] },
    ],
  });
  const opts = { settleDays: 2, landingPerDay: 2 };

  it('makes one snapshot per day, oldest first', () => {
    const s = buildSnapshots('landing', rows, '2026-11-18', opts);
    expect(s.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-17']);
  });
  it('keeps the busiest landing pages per day and folds the rest into one row', () => {
    const s = buildSnapshots('landing', rows, '2026-11-18', opts);
    expect(s[0].payload.map((r) => r.landingPage)).toEqual(['/b', '/c', '(other pages)']);
    expect(s[0].payload[2].sessions).toBe(5); // /a, the page that did not make the top 2
    // nothing is lost: the day's total is unchanged
    expect(s[0].payload.reduce((t, r) => t + Number(r.sessions), 0)).toBe(75);
  });
  it('adds no remainder row when every page fits', () => {
    const s = buildSnapshots('landing', rows, '2026-11-18', { ...opts, landingPerDay: 10 });
    expect(s[0].payload.map((r) => r.landingPage)).not.toContain('(other pages)');
  });
  it('flags the last two days as still able to change', () => {
    const s = buildSnapshots('landing', rows, '2026-11-18', opts);
    expect(s[0].approximate).toBe(false);
    expect(s[1].approximate).toBe(true);
    expect(buildSnapshots('landing', rows, '2026-11-18', { ...opts, settleDays: 0 })[1].approximate).toBe(false);
  });
  it('keeps every row of other breakdowns', () => {
    expect(buildSnapshots('channel', rows, '2026-11-18', opts)[0].payload).toHaveLength(3);
  });
  it('does month arithmetic on UTC days', () => {
    expect(addDaysIso('2026-12-01', -1)).toBe('2026-11-30');
  });
});

import { dailySeries, dimensionRows, landingRows } from './ga4';
import { pctChange } from './aggregate';

describe('landingRows', () => {
  const day = (rows: Array<[string, number, number]>) => ({ payload: rows.map(([landingPage, sessions, engagedSessions]) => ({ landingPage, sessions, engagedSessions })) });
  const cur = [day([['/', 100, 60], ['/a', 20, 5]]), day([['/', 140, 90]])];
  const prev = [day([['/', 100, 50]])];
  const { rows, totalSessions } = landingRows(cur, prev, pctChange);
  const home = rows.find((r) => r.page === '/')!;
  const a = rows.find((r) => r.page === '/a')!;

  it('sums sessions per page over the days', () => {
    expect(totalSessions).toBe(260);
    expect(home.sessions).toBe(240);
  });
  it('computes engagement from summed counts and the share of sessions', () => {
    expect(home.engagementRate).toBeCloseTo((150 / 240) * 100);
    expect(home.share).toBeCloseTo((240 / 260) * 100);
  });
  it('compares sessions per day with the earlier period', () => {
    expect(home.change).toBeCloseTo(20); // 120 per day vs 100
    expect(a.change).toBeNull(); // not a landing page before
  });
});

import { ConfigService } from '@nestjs/config';
import { Ga4Client, Ga4Error } from './ga4.client';

describe('Ga4Client.reportAll', () => {
  const client = (pages: Array<unknown[]>, rowCount: number) => {
    const c = new Ga4Client({ get: (k: string) => (k === 'GA4_PROPERTY_ID' ? '1' : undefined) } as unknown as ConfigService);
    const asked: number[] = [];
    c.useRunner({
      runReport: async (req) => {
        const r = req as { offset: number };
        asked.push(r.offset);
        return [{ dimensionHeaders: [{ name: 'date' }], metricHeaders: [{ name: 'sessions' }], rowCount, rows: pages[r.offset / 2] ?? [] }];
      },
    });
    return { c, asked };
  };
  const row = (d: string) => ({ dimensionValues: [{ value: d }], metricValues: [{ value: '1' }] });
  const req = { dimensions: ['date'], metrics: ['sessions'], startDate: '90daysAgo', endDate: 'yesterday' };

  it('fetches every page, so the newest days are not cut off', async () => {
    const { c, asked } = client([[row('20260101'), row('20260102')], [row('20260103'), row('20260104')], [row('20260105')]], 5);
    const res = await c.reportAll(req, 2);
    expect(res.rows).toHaveLength(5);
    expect(asked).toEqual([0, 2, 4]);
  });
  it('makes one request when everything fits', async () => {
    const { c, asked } = client([[row('20260101')]], 1);
    expect((await c.reportAll(req, 2)).rows).toHaveLength(1);
    expect(asked).toEqual([0]);
  });
  it('refuses to loop without end', async () => {
    const forever = Array.from({ length: 20 }, () => [row('20260101'), row('20260102')]);
    const { c } = client(forever, 1000);
    await expect(c.reportAll(req, 2)).rejects.toBeInstanceOf(Ga4Error);
  });
});

describe('dimensionRows and dailySeries', () => {
  const day = (date: string, rows: Array<[string, number, number]>) => ({ date, payload: rows.map(([c, sessions, engagedSessions]) => ({ sessionDefaultChannelGroup: c, sessions, engagedSessions })) });
  const cur = [day('2026-11-16', [['Direct', 100, 8], ['Organic Search', 30, 20]]), day('2026-11-17', [['Direct', 300, 24], ['Organic Search', 30, 20], ['Social', 5, 2]])];
  const prev = [day('2026-11-02', [['Direct', 100, 10]])];

  it('computes channel rows the same way as landing pages', () => {
    const { rows, totalSessions } = dimensionRows('sessionDefaultChannelGroup', cur, prev, pctChange);
    const direct = rows.find((r) => r.name === 'Direct')!;
    expect(totalSessions).toBe(465);
    expect(direct.sessions).toBe(400);
    expect(direct.engagementRate).toBeCloseTo(8);
    expect(direct.change).toBeCloseTo(100); // 200 per day vs 100
    expect(rows.find((r) => r.name === 'Social')!.change).toBeNull();
  });
  it('builds daily series for the biggest values, with gaps for missing days', () => {
    const s = dailySeries('sessionDefaultChannelGroup', cur, ['2026-11-15', '2026-11-16', '2026-11-17'], 2);
    expect(s.series.map((x) => x.label)).toEqual(['Direct', 'Organic Search']);
    expect(s.points[0]).toEqual({ date: '2026-11-15', v0: null, v1: null });
    expect(s.points[2]).toEqual({ date: '2026-11-17', v0: 300, v1: 30 });
  });
  it('shows 0 when a day was stored but the value was absent', () => {
    const s = dailySeries('sessionDefaultChannelGroup', [day('2026-11-16', [['Direct', 5, 1]])], ['2026-11-16'], 2);
    expect(s.series).toHaveLength(1);
  });
});

import { eventRows } from './ga4';
describe('eventRows and event snapshots', () => {
  const pct = (c: number | null, p: number | null) => (c === null || p === null || p === 0 ? null : ((c - p) / p) * 100);
  const doc = (rows: Array<[string, number]>) => ({ payload: rows.map(([eventName, keyEvents]) => ({ eventName, keyEvents })) });

  it('sums each event over the period and compares per-day counts', () => {
    const { rows, total } = eventRows([doc([['sign_up', 4], ['purchase', 1]]), doc([['sign_up', 2]])], [doc([['sign_up', 3]])], pct);
    expect(total).toBe(7);
    expect(rows[0]).toMatchObject({ name: 'sign_up', count: 6, perDay: 3, previousPerDay: 3, change: 0 });
    expect(rows[1]).toMatchObject({ name: 'purchase', count: 1, change: null });
  });

  it('drops events with no key event counts', () => {
    expect(eventRows([doc([['page_view', 0]])], [], pct).rows).toEqual([]);
  });
});

describe('Ga4Client.realtimeUsers', () => {
  const make = () => {
    const calls: unknown[] = [];
    const client = new Ga4Client({ get: (k: string) => (k === 'GA4_PROPERTY_ID' ? '123' : undefined) } as never);
    client.useRunner({
      runReport: async () => [{}],
      runRealtimeReport: async (req) => { calls.push(req); return [{ rows: [{ metricValues: [{ value: '17' }] }] }]; },
    });
    return { client, calls };
  };

  it('returns the active users number', async () => {
    const { client } = make();
    expect(await client.realtimeUsers(1000)).toMatchObject({ activeUsers: 17, windowMinutes: 30 });
  });

  it('caches for a minute so many viewers make one call', async () => {
    const { client, calls } = make();
    await client.realtimeUsers(1000);
    await client.realtimeUsers(30_000);
    expect(calls).toHaveLength(1);
    await client.realtimeUsers(70_000);
    expect(calls).toHaveLength(2);
  });

  it('maps a GA4 failure to a readable error', async () => {
    const client = new Ga4Client({ get: (k: string) => (k === 'GA4_PROPERTY_ID' ? '123' : undefined) } as never);
    client.useRunner({ runReport: async () => [{}], runRealtimeReport: async () => { throw { code: 7 }; } });
    await expect(client.realtimeUsers()).rejects.toThrow('refused the service account');
  });
});
