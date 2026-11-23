import { buildSeoTiles } from './seo';
import type { Ga4Aggregate } from './ga4';

const agg = (sessions: number, days: number, extra: Partial<Ga4Aggregate> = {}): Ga4Aggregate => ({
  days, sessions, sessionsPerDay: sessions / days, usersPerDay: null, engagementRate: 50, keyEventsPerDay: 1, engagementTime: null, ...extra,
});

describe('buildSeoTiles', () => {
  it('judges organic sessions but keeps the share neutral', () => {
    const tiles = buildSeoTiles(agg(100, 10), agg(100, 10), agg(1000, 10), agg(10000, 10), 5, 5);
    const share = tiles.find((t) => t.key === 'orgShare')!;
    expect(share.value).toBe(10);
    expect(share.previous).toBe(1);
    expect(share.change).toBe(900);
    expect(share.trend).toBe('flat'); // a bot wave ending is not an SEO improvement
    expect(tiles.find((t) => t.key === 'orgSessions')!.trend).toBe('flat');
  });

  it('marks fewer organic sessions as worse', () => {
    const tiles = buildSeoTiles(agg(50, 10), agg(100, 10), agg(1000, 10), agg(1000, 10), 1, 1);
    expect(tiles.find((t) => t.key === 'orgSessions')!.trend).toBe('worse');
  });
});
