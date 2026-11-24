import { breakdownsFor, buildCards, catalog, slugify, specForKey, type DayIndex, type Rows } from './ga4-cards';

const idx = (data: Record<string, Record<string, Rows>>): DayIndex =>
  new Map(Object.entries(data).map(([b, days]) => [b, new Map(Object.entries(days))]));
const none = (o: Partial<Record<string, number>>): Rows => [{ sessions: 100, activeUsers: 90, newUsers: 80, engagedSessions: 20, screenPageViews: 150, eventCount: 400, userEngagementDuration: 3000, ...o }];
const D = ['2026-11-10', '2026-11-11'];
const P = ['2026-11-08', '2026-11-09'];
const tile = (built: ReturnType<typeof buildCards>, key: string) => built.tiles.find((t) => t.key === key);

describe('fixed cards', () => {
  const cur = idx({ none: { [D[0]]: none({}), [D[1]]: none({ sessions: 300, engagedSessions: 30, newUsers: 100, activeUsers: 150 }) } });
  const prev = idx({ none: { [P[0]]: none({ sessions: 100, engagedSessions: 40 }), [P[1]]: none({ sessions: 100, engagedSessions: 40 }) } });
  const built = (key: string) => buildCards(catalog(cur).filter((s) => s.key === key), cur, prev, D, P);

  it('averages "per day" cards over the days that have data', () => {
    expect(tile(built('ga4NewUsers'), 'ga4NewUsers')?.value).toBe(90); // (80 + 100) / 2
    expect(tile(built('ga4PageViews'), 'ga4PageViews')?.value).toBe(150);
  });

  it('weights ratios by size, not by day', () => {
    // bounce: (sessions - engaged) / sessions over both days = (80 + 270) / 400 = 87.5%
    expect(tile(built('ga4Bounce'), 'ga4Bounce')?.value).toBeCloseTo(87.5);
    // pages per session: 300 views / 400 sessions
    expect(tile(built('ga4PagesPerSession'), 'ga4PagesPerSession')?.value).toBeCloseTo(0.75);
    expect(tile(built('ga4EngTime'), 'ga4EngTime')?.value).toBeCloseTo(6000 / 400);
  });

  it('compares with the period before and says whether it is better', () => {
    const t = tile(built('ga4Bounce'), 'ga4Bounce')!;
    expect(t.previous).toBeCloseTo(60); // (60 + 60) / 200
    expect(t.change).toBeGreaterThan(40);
    expect(t.trend).toBe('worse'); // bounce rose, and lower is better
    expect(tile(built('ga4NewUsers'), 'ga4NewUsers')?.trend).toBe('better');
  });

  it('gives one trend value per day, and one for the previous period', () => {
    const b = built('ga4Bounce');
    expect(b.series.ga4Bounce).toHaveLength(2);
    expect(b.series.ga4Bounce[0]).toBeCloseTo(80);
    expect(b.previousSeries.ga4Bounce).toHaveLength(2);
  });

  it('leaves a card out when its report has no stored days in the range', () => {
    const b = buildCards(catalog(cur).filter((s) => s.key === 'ga4Scrolled'), cur, prev, D, P);
    expect(b.tiles).toHaveLength(0);
  });
});

describe('cards that need two reports, and rolling numbers', () => {
  const cur = idx({
    none: { [D[0]]: none({ activeUsers: 100 }), [D[1]]: none({ activeUsers: 100 }) },
    reach: { [D[0]]: [{ scrolledUsers: 10, active7DayUsers: 500, active28DayUsers: 1000 }], [D[1]]: [{ scrolledUsers: 20, active7DayUsers: 600, active28DayUsers: 1000 }] },
  });
  const run = (key: string) => buildCards(catalog(cur).filter((s) => s.key === key), cur, idx({}), D, P);
  it('stickiness is daily users over monthly users', () => expect(tile(run('ga4Stickiness'), 'ga4Stickiness')?.value).toBeCloseTo(10));
  it('scroll rate is people who scrolled over active users', () => expect(tile(run('ga4ScrollRate'), 'ga4ScrollRate')?.value).toBeCloseTo(15));
  it('rolling numbers use the last day, not an average', () => {
    expect(tile(run('ga4Active7'), 'ga4Active7')?.value).toBe(600);
    expect(tile(run('ga4Active28'), 'ga4Active28')?.value).toBe(1000);
  });
  it('a day missing one of the needed reports is skipped', () => {
    const partial = idx({ none: { [D[0]]: none({ activeUsers: 100 }), [D[1]]: none({ activeUsers: 100 }) }, reach: { [D[0]]: [{ scrolledUsers: 10, active7DayUsers: 1, active28DayUsers: 1000 }] } });
    expect(tile(buildCards(catalog(partial).filter((s) => s.key === 'ga4Stickiness'), partial, idx({}), D, P), 'ga4Stickiness')?.value).toBeCloseTo(10);
  });
});

describe('new and returning visitors', () => {
  const cur = idx({ visitor_type: {
    [D[0]]: [{ newVsReturning: 'new', activeUsers: 90 }, { newVsReturning: 'returning', activeUsers: 10 }],
    [D[1]]: [{ newVsReturning: 'new', activeUsers: 100 }],
  } });
  const run = (key: string) => buildCards(catalog(cur).filter((s) => s.key === key), cur, idx({}), D, P);
  it('counts returning users per day, and zero on a day with none', () => expect(tile(run('ga4ReturningUsers'), 'ga4ReturningUsers')?.value).toBe(5));
  it('works out the returning share from sums', () => expect(tile(run('ga4ReturningShare'), 'ga4ReturningShare')?.value).toBeCloseTo((10 / 200) * 100));
});

describe('cards made from lists of values', () => {
  const channel = (rows: Array<[string, number]>): Rows => rows.map(([g, s]) => ({ sessionDefaultChannelGroup: g, sessions: s, engagedSessions: 0, activeUsers: 0 }));
  const cur = idx({
    channel: { [D[0]]: channel([['Direct', 90], ['Organic Search', 7], ['Referral', 3], ['(other)', 50]]), [D[1]]: channel([['Direct', 110], ['Organic Search', 3]]) },
    links: { [D[0]]: [{ 'customEvent:link_url': 'https://www.acme.com/?utm_source=x', eventCount: 4 }, { 'customEvent:link_url': 'https://acme.com/about', eventCount: 2 }, { 'customEvent:link_url': 'https://other.io/', eventCount: 1 }], [D[1]]: [] },
  });

  it('makes one card per channel, busiest first, and never one for the "(other)" row', () => {
    const keys = catalog(cur).map((s) => s.key).filter((k) => k.startsWith('ch_'));
    expect(keys).toEqual(['ch_direct', 'ch_organic_search', 'ch_referral']);
  });

  it('works out sessions per day for a channel, with 0 on days it was absent', () => {
    const b = buildCards(catalog(cur), cur, idx({}), D, P);
    expect(tile(b, 'ch_direct')?.value).toBe(100);
    expect(tile(b, 'ch_referral')?.value).toBe(1.5); // 3 on one day, 0 on the other
    expect(tile(b, 'ch_direct')?.label).toBe('Direct sessions per day');
  });

  it('groups outbound links by the site they lead to', () => {
    const keys = catalog(cur).map((s) => s.key).filter((k) => k.startsWith('lk_'));
    expect(keys).toEqual(['lk_acme_com', 'lk_other_io']);
    const b = buildCards(catalog(cur), cur, idx({}), D, P);
    expect(tile(b, 'lk_acme_com')?.value).toBe(3); // 6 clicks over 2 days
    expect(tile(b, 'ga4OutboundClicks')?.value).toBe(3.5);
  });

  it('turns a saved key back into its card even when it is not among the busiest', () => {
    const merged = idx({ channel: { [D[0]]: channel([['AI Assistant', 5]]) } });
    expect(specForKey('ch_ai_assistant', merged)?.label).toBe('AI Assistant sessions per day');
    expect(specForKey('ch_nope', merged)).toBeNull();
    expect(specForKey('zz_anything', merged)).toBeNull();
    expect(specForKey('ga4Bounce', merged)?.key).toBe('ga4Bounce');
  });
});

describe('pages', () => {
  it('calls the root page the home page', () => {
    const cur = idx({ pages_views: { [D[0]]: [{ pagePath: '/', screenPageViews: 50, userEngagementDuration: 0 }, { pagePath: '/blog', screenPageViews: 5, userEngagementDuration: 0 }] } });
    const b = buildCards(catalog(cur), cur, idx({}), D, P);
    expect(tile(b, 'pg_home')?.label).toBe('Views of the home page per day');
    expect(tile(b, 'pg_blog')?.label).toBe('Views of /blog per day');
  });
});

describe('helpers', () => {
  it('makes short safe slugs', () => {
    expect(slugify('google / organic')).toBe('google_organic');
    expect(slugify('/auth/sign-in')).toBe('auth_sign_in');
    expect(slugify('???')).toBe('x');
    expect(slugify('/')).toBe('home');
    expect(slugify('a'.repeat(100))).toHaveLength(40);
  });
  it('reads only the stored reports a set of keys needs', () => {
    expect(breakdownsFor(['ga4Stickiness']).sort()).toEqual(['none', 'reach']);
    expect(breakdownsFor(['ch_direct', 'pg_home']).sort()).toEqual(['channel', 'pages_views']);
    expect(breakdownsFor(['unknown'])).toEqual([]);
    expect(breakdownsFor(null).length).toBeGreaterThan(10);
  });
});
