import type { Point, Tile } from './dashboard';

type Num = number | null;

/** The daily values behind a tile, for its trend line. */
export function sparkFor(key: Tile['key'], points: Point[], traffic: 'human' | 'all' = 'human'): Num[] {
  switch (key) {
    case 'sessions':
      return points.map((p) => (p.humanSessions === null ? null : traffic === 'all' ? p.humanSessions + (p.botSessions ?? 0) : p.humanSessions));
    case 'users':
      return points.map((p) => p.users);
    case 'botShare':
      return points.map((p) => {
        if (p.humanSessions === null || p.botSessions === null) return null;
        const all = p.humanSessions + p.botSessions;
        return all > 0 ? (p.botSessions / all) * 100 : null;
      });
    case 'pagesPerSession':
      return points.map((p) => p.pagesPerSession);
    case 'scrollDepth':
      return points.map((p) => p.scrollDepth);
    case 'activeTime':
      return points.map((p) => p.activeTime);
    case 'quickback':
      return points.map((p) => p.quickback);
    case 'dead':
      return points.map((p) => p.dead);
    case 'rage':
      return points.map((p) => p.rage);
    case 'scriptError':
      return points.map((p) => p.scriptError);
    case 'ga4Sessions':
      return points.map((p) => p.ga4Sessions);
    case 'ga4Users':
      return points.map((p) => p.ga4Users);
    case 'ga4Engagement':
      return points.map((p) => p.ga4EngagementRate);
    case 'ga4KeyEvents':
      return points.map((p) => p.ga4KeyEvents);
    default:
      return [];
  }
}
