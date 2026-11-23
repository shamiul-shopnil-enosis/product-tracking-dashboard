import type { Ga4Aggregate } from './ga4';
import { pctChange, trendOf } from './aggregate';

type Unit = 'count' | 'percent';

export interface SeoTile {
  key: string; group: string; source: 'ga4'; label: string; unit: Unit;
  value: number | null; previous: number | null; change: number | null; trend: string; help: string; sample: null;
}

/**
 * Tiles for the SEO view. "Organic sessions per day" carries the better/worse signal. The share of traffic is neutral:
 * it moves whenever other traffic (such as automated visits) rises or falls, with no change in search at all.
 */
export function buildSeoTiles(
  org: Ga4Aggregate, orgPrev: Ga4Aggregate, all: Ga4Aggregate, allPrev: Ga4Aggregate, newPerDay: number | null, newPerDayPrev: number | null,
): SeoTile[] {
  const share = (o: Ga4Aggregate, a: Ga4Aggregate) => (a.sessions > 0 ? (o.sessions / a.sessions) * 100 : null);
  const t = (key: string, label: string, unit: Unit, help: string, v: number | null, p: number | null, goodWhen: 'up' | 'neutral' = 'up'): SeoTile => {
    const change = pctChange(v, p);
    return { key, group: 'Search', source: 'ga4', label, unit, value: v, previous: p, change, trend: trendOf(change, goodWhen), help, sample: null };
  };
  return [
    t('orgSessions', 'Organic sessions per day', 'count', 'Visits per day that came from a search engine result, as counted by Google Analytics. Higher means search sends more visitors.', org.sessionsPerDay, orgPrev.sessionsPerDay),
    t('orgShare', 'Organic share of traffic', 'percent', 'The part of all visits that came from search. It moves when other traffic changes too, for example a wave of automated visits makes it fall even if search did not change, so it is shown without a good or bad colour.', share(org, all), share(orgPrev, allPrev), 'neutral'),
    t('orgEngagement', 'Organic engagement rate', 'percent', 'Share of organic visits that were more than a glance: over 10 seconds, 2 or more pages, or a key event. Higher means search brings visitors who find what they wanted.', org.engagementRate, orgPrev.engagementRate),
    t('orgNew', 'New organic users per day', 'count', 'People visiting for the first time who found the site through search, per day. A sign of reaching new audiences.', newPerDay, newPerDayPrev),
    t('orgKeyEvents', 'Organic key events per day', 'count', 'Important actions (such as starting a project) taken by visitors who came from search, per day.', org.keyEventsPerDay, orgPrev.keyEventsPerDay),
  ];
}
