import { buildHeadline } from './headline';

const t = (key: string, change: number | null, trend: string, sample?: number) => ({ key, change, trend, sample });

describe('buildHeadline', () => {
  it('says there is nothing to compare when no tile has a change', () => {
    expect(buildHeadline([t('sessions', null, 'unknown')], 14)).toMatch(/Not enough history/);
  });
  it('is empty without tiles', () => {
    expect(buildHeadline([], 14)).toBe('');
  });
  it('reports the good and the bad together', () => {
    const s = buildHeadline([t('sessions', 12, 'better'), t('quickback', 18, 'worse', 40), t('scrollDepth', -4.8, 'worse')], 14);
    expect(s).toBe('Human sessions up 12%. But watch quick backs up 18% and scroll depth down 5%.');
  });
  it('reports only good news', () => {
    expect(buildHeadline([t('sessions', 20, 'better'), t('users', 15, 'better')], 7)).toBe('Looking good: human sessions up 20% and visitors up 15%, with nothing getting worse.');
  });
  it('reports only bad news', () => {
    expect(buildHeadline([t('sessions', 1, 'flat'), t('dead', 25, 'worse', 50)], 14)).toBe('Watch dead clicks up 25%.');
  });
  it('ignores small moves and noisy rates', () => {
    expect(buildHeadline([t('sessions', 2, 'flat'), t('rage', 80, 'worse', 3)], 14)).toBe('Nothing moved much compared with the previous 14 days.');
  });
  it('mentions at most two items of each kind, biggest first', () => {
    const s = buildHeadline([t('sessions', 6, 'better'), t('users', 30, 'better'), t('pagesPerSession', 10, 'better'), t('dead', 9, 'worse', 99)], 14);
    expect(s).toBe('Visitors up 30% and pages per session up 10%. But watch dead clicks up 9%.');
  });
});

describe('buildHeadline with GA4 tiles', () => {
  it('names GA4 metrics as GA4', () => {
    const s = buildHeadline([t('ga4Sessions', 90, 'better'), t('ga4Engagement', -22, 'worse')], 30);
    expect(s).toBe('GA4 sessions up 90%. But watch GA4 engagement rate down 22%.');
  });
});

import { buildInsight } from './headline';
describe('buildInsight', () => {
  const t = (key: string, change: number) => ({ key, change, trend: 'flat' });
  it('warns when traffic grows but engagement falls', () => {
    expect(buildInsight([t('ga4Sessions', 190), t('ga4Engagement', -22)])).toContain('automated traffic');
  });
  it('says nothing for healthy growth', () => {
    expect(buildInsight([t('ga4Sessions', 30), t('ga4Engagement', 5)])).toBe('');
  });
  it('flags a bot jump without real growth', () => {
    expect(buildInsight([t('botShare', 40), t('sessions', 0)])).toContain('bot share rose');
  });
});
