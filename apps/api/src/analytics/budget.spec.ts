import { callsAllowed, previousUtcDay, summarize, usageIn, utcDay } from './budget';

describe('callsAllowed', () => {
  it('lets the nightly job use 7 of 10 calls', () => {
    expect(callsAllowed(0, 'cron')).toBe(7);
    expect(callsAllowed(6, 'cron')).toBe(1);
    expect(callsAllowed(7, 'cron')).toBe(0);
    expect(callsAllowed(9, 'cron')).toBe(0);
  });

  it('lets manual runs and probes use the reserve', () => {
    expect(callsAllowed(7, 'manual')).toBe(3);
    expect(callsAllowed(9, 'probe')).toBe(1);
    expect(callsAllowed(10, 'manual')).toBe(0);
    expect(callsAllowed(25, 'manual')).toBe(0);
  });
});

describe('utc days', () => {
  it('uses UTC, not local time', () => {
    const d = new Date('2026-11-18T00:05:00.000Z');
    expect(utcDay(d)).toBe('2026-11-18');
    expect(previousUtcDay(d)).toBe('2026-11-17');
  });
  it('rolls over month ends', () => {
    expect(previousUtcDay(new Date('2026-12-01T00:05:00.000Z'))).toBe('2026-11-30');
  });
});

describe('summarize', () => {
  it('lists metric names and counts rows', () => {
    const payload = [
      { metricName: 'Traffic', information: [{ a: 1 }, { a: 2 }] },
      { metricName: 'ScrollDepth', information: [{ a: 1 }] },
    ];
    expect(summarize(payload)).toEqual({ metricNames: ['Traffic', 'ScrollDepth'], rowCount: 3 });
  });
  it('copes with unexpected shapes', () => {
    expect(summarize({ nope: true })).toEqual({ metricNames: [], rowCount: 0 });
    expect(summarize([{ metricName: 5 }, null])).toEqual({ metricNames: [], rowCount: 0 });
  });
});

describe('usageIn (rolling window)', () => {
  const now = new Date('2026-11-19T00:05:00.000Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);

  it('counts calls from the last 24 hours, minus a margin', () => {
    const runs = [
      { startedAt: hoursAgo(1), callsUsed: 3, rateLimited: false },
      { startedAt: hoursAgo(16), callsUsed: 2, rateLimited: false },
      { startedAt: hoursAgo(30), callsUsed: 9, rateLimited: false },
    ];
    expect(usageIn(runs, now).used).toBe(5);
  });

  it('does not count last night\'s own run against tonight\'s', () => {
    // started 24 hours ago, to the second
    expect(usageIn([{ startedAt: hoursAgo(24), callsUsed: 7, rateLimited: false }], now).used).toBe(0);
  });

  it('pauses for an hour after a refusal, then relies on the count', () => {
    const refused = { startedAt: hoursAgo(0.5), callsUsed: 3, rateLimited: true };
    expect(usageIn([refused], now).paused).toBe(true);
    expect(usageIn([{ ...refused, startedAt: hoursAgo(2) }], now).paused).toBe(false);
  });
});
