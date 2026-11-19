import { findAlerts, mergeAlerts } from './alerts';

const tile = (key: string, change: number | null, sample?: number) => ({ key, label: key, unit: 'count', value: 1, previous: 1, change, trend: 'flat', sample });
const enough = { current: 7, previous: 7 };

describe('findAlerts', () => {
  it('flags metrics that moved at least the threshold, biggest first', () => {
    const r = findAlerts([tile('a', 5), tile('b', -35), tile('c', 22), tile('d', null)], 20, enough, 5000);
    expect(r.suppressed).toBeNull();
    expect(r.items.map((i) => i.key)).toEqual(['b', 'c']);
  });
  it('counts a change of exactly the threshold', () => {
    expect(findAlerts([tile('a', 20)], 20, enough, 5000).items).toHaveLength(1);
  });
  it('says why nothing is flagged when there are too few days', () => {
    const r = findAlerts([tile('a', 90)], 20, { current: 2, previous: 7 }, 5000);
    expect(r.items).toEqual([]);
    expect(r.suppressed).toMatch(/at least 3 days/);
  });
  it('says why nothing is flagged when traffic is too low', () => {
    const r = findAlerts([tile('a', 90)], 20, enough, 50);
    expect(r.items).toEqual([]);
    expect(r.suppressed).toMatch(/Too little traffic/);
  });
  it('ignores rates built on very few sessions', () => {
    const r = findAlerts([tile('rage', -54, 2), tile('dead', 40, 25), tile('plain', 30)], 20, enough, 5000);
    expect(r.items.map((i) => i.key)).toEqual(['dead', 'plain']);
  });
});

describe('mergeAlerts', () => {
  const ok = (keys: Array<[string, number]>) => findAlerts(keys.map(([k, c]) => tile(k, c)), 20, enough, 5000);
  const thin = () => findAlerts([tile('x', 90)], 20, { current: 1, previous: 0 }, 5000);

  it('judges each source on its own coverage', () => {
    const merged = mergeAlerts(thin(), ok([['ga4Sessions', 192]]));
    expect(merged.items.map((i) => i.key)).toEqual(['ga4Sessions']);
    expect(merged.suppressed).toBeNull();
  });
  it('sorts the combined items by size of change', () => {
    const merged = mergeAlerts(ok([['a', 25]]), ok([['b', -60]]));
    expect(merged.items.map((i) => i.key)).toEqual(['b', 'a']);
  });
  it('gives the reason only when neither source can be judged', () => {
    expect(mergeAlerts(thin(), thin()).suppressed).toMatch(/GA4:/);
    expect(mergeAlerts(thin(), ok([])).suppressed).toBeNull();
  });
  it('passes the first through when there is no second source', () => {
    expect(mergeAlerts(thin(), null).suppressed).toMatch(/at least 3 days/);
  });
});
