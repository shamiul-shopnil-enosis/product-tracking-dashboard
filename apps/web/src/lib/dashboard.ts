export type Unit = 'count' | 'percent' | 'seconds' | 'ratio';
export type Trend = 'better' | 'worse' | 'flat' | 'unknown';

export type Tile = {
  key: string; group: string; source: 'clarity' | 'ga4'; label: string; unit: Unit; value: number | null; previous: number | null;
  change: number | null; trend: Trend; help: string;
};
export type Point = {
  date: string; humanSessions: number | null; botSessions: number | null; users: number | null;
  pagesPerSession: number | null; scrollDepth: number | null; activeTime: number | null;
  quickback: number | null; dead: number | null; rage: number | null; scriptError: number | null;
  ga4Sessions: number | null; ga4Users: number | null; ga4EngagementRate: number | null; ga4KeyEvents: number | null;
};
export type Coverage = {
  daysWithData: number; requestedDays: number; firstDay: string | null; lastDay: string | null; approximateDays: string[];
};
export type Range = { days: number; from: string; to: string; previousFrom: string; previousTo: string };

export type Marker = { id: string; date: string; label: string; kind: string; createdBy: string };
export type Alerts = {
  threshold: number;
  items: { key: string; label: string; unit: Unit; value: number | null; previous: number | null; change: number | null; trend: Trend }[];
  suppressed: string | null;
};

export type Overview = {
  range: Range;
  traffic: 'human' | 'all';
  annotations: Marker[];
  alerts: Alerts;
  headline: string;
  previousSessions: (number | null)[];
  ga4: { connected: boolean; daysWithData: number; approximateDays: string[] };
  sourceComparison: { ga4SessionsPerDay: number | null; clarityHumanSessionsPerDay: number | null; clarityAllSessionsPerDay: number | null } | null;
  coverage: { current: Coverage; previous: Coverage };
  tiles: Tile[];
  series: Point[];
  latest: null | {
    label: string; fetchedAt: string; note: string; botShare: number | null;
    metrics: {
      humanSessions: number; botSessions: number; users: number; pagesPerSession: number | null;
      scrollDepth: number | null; activeTime: number | null; totalTime: number | null;
      friction: Record<string, { sessions: number; affected: number; events: number }>;
    };
  };
};

export type PageRow = {
  url: string; openFindings: number; sessions: number; scrollDepth: number | null; activeTime: number | null; totalAffected: number;
  rage: { affected: number; rate: number | null }; dead: { affected: number; rate: number | null };
  quickback: { affected: number; rate: number | null }; scriptError: { affected: number; rate: number | null };
};
export type Friction = {
  range: Range;
  annotations: Marker[];
  coverage: { current: Coverage; previous: Coverage; pageDays: number };
  tiles: Tile[];
  series: Point[];
  pages: PageRow[];
  notes: { minSessions: number; excludedLocalRows: number; truncatedDays: number; totalPages: number; sessionNote: string };
};

export function formatValue(v: number | null, unit: Unit): string {
  if (v === null || Number.isNaN(v)) return '–';
  switch (unit) {
    case 'count': return v >= 100 ? Math.round(v).toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
    case 'percent': return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    case 'seconds': return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
    case 'ratio': return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

export type ExploreRow = {
  value: string; humanSessions: number; botSessions: number; share: number | null; botShare: number | null;
  perDay: number | null; previousPerDay: number | null; change: number | null;
  pagesPerSession: number | null; scrollDepth: number | null; activeTime: number | null;
  quickbackRate: number | null; deadRate: number | null;
};
export type Breakdown = {
  dimension: string; label: string; range: Range; annotations: Marker[];
  coverage: { current: Coverage; previous: Coverage };
  totalHumanSessions: number; totalValues: number; rows: ExploreRow[];
  chart: { series: { id: string; label: string }[]; points: Record<string, string | number | null>[] };
  notes: { truncated: boolean };
};
export type PagesResponse = {
  range: Range; coverage: { current: Coverage; previous: Coverage };
  pages: (ExploreRow & { url: string; openFindings: number })[];
  notes: { minSessions: number; totalPages: number; totalPageSessions: number; excludedLocalRows: number; truncatedDays: number; sessionNote: string; landingNote: string };
};

export function formatChange(change: number | null): string {
  if (change === null) return '–';
  const arrow = change > 0.5 ? '▲' : change < -0.5 ? '▼' : '■';
  return `${arrow} ${change > 0 ? '+' : ''}${change.toFixed(0)}%`;
}

export type LandingRow = {
  page: string; sessions: number; share: number | null; engagementRate: number | null;
  perDay: number | null; previousPerDay: number | null; change: number | null;
};
export type LandingResponse = {
  connected: boolean; range: Range; coverage: { current: Coverage; previous: Coverage };
  pages: LandingRow[];
  notes: { minSessions: number; totalPages: number; totalSessions: number; source: string };
};

export type Ga4ChannelsResponse = {
  connected: boolean; range: Range; annotations: Marker[];
  coverage: { current: Coverage; previous: Coverage };
  rows: { name: string; sessions: number; share: number | null; engagementRate: number | null; perDay: number | null; previousPerDay: number | null; change: number | null }[];
  totalSessions: number;
  chart: { series: { id: string; label: string }[]; points: Record<string, string | number | null>[] };
  notes: { source: string };
};

export type KeyEventRow = { name: string; count: number; share: number | null; perDay: number | null; previousPerDay: number | null; change: number | null };
export type KeyEventsResponse = { connected: boolean; range: Range; rows: KeyEventRow[]; total: number; perDay: number | null };
