import type { SeoResponse } from './dashboard';

/** The order of the sections on the Google Analytics page. */
export const GROUP_ORDER = ['Visitors', 'Engagement', 'Traffic sources', 'Events', 'Pages', 'Audience', 'Search'] as const;

export const GROUP_HELP: Record<string, string> = {
  Visitors: 'Who comes: how many people, how many are new or returning, and how many are active over a week or a month.',
  Engagement: 'What they do: how long they stay, how many pages they open, whether they scroll, and how many leave at once.',
  'Traffic sources': 'Where visits come from: channels such as Direct, Organic Search or AI Assistant, and the exact sources behind them.',
  Events: 'Actions GA4 recorded: every event by name, the key events you marked, and clicks on links that leave the site.',
  Pages: 'Which pages are opened and which pages people arrive on.',
  Audience: 'Who the visitors are: device, country, city, browser and language.',
  Search: 'Visits that came from search engines, and the search engines and pages behind them.',
};

/** The four GA4 cards and the search cards that existed before the catalogue, placed into sections. */
export const BASE_GROUP: Record<string, (typeof GROUP_ORDER)[number]> = {
  ga4Sessions: 'Visitors', ga4Users: 'Visitors', ga4Engagement: 'Engagement', ga4KeyEvents: 'Events',
  orgSessions: 'Search', orgShare: 'Search', orgEngagement: 'Search', orgNew: 'Search', orgKeyEvents: 'Search',
};

/** Which daily value of the SEO report draws each search card's trend line. */
export const SEO_SERIES: Record<string, keyof SeoResponse['series'][number]> = {
  orgSessions: 'organicSessions', orgShare: 'organicShare', orgEngagement: 'organicEngagementRate', orgNew: 'newOrganicUsers', orgKeyEvents: 'organicKeyEvents',
};

export const seoSpark = (key: string, seo: SeoResponse | null | undefined): (number | null)[] | undefined => {
  const field = SEO_SERIES[key];
  return field && seo ? seo.series.map((p) => p[field] as number | null) : undefined;
};
