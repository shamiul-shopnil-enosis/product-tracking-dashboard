'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { Delta } from '@/components/Delta';
import { ErrorState } from '@/components/ErrorState';
import { PageSkeleton } from '@/components/Skeleton';
import { TrendChart } from '@/components/TrendChart';
import { filterQuery, useFilters } from '@/lib/filters';
import { COMPARE_MODES } from '@/lib/range';
import { formatValue, type Ga4CardsResponse, type Overview, type Point, type SeoResponse, type Tile, type Unit } from '@/lib/dashboard';
import { useApiData } from '@/lib/useApi';

type Day = Record<string, string | number | null>;
type Def = { unit: Unit; color: string; pick: (p: Point, all: boolean) => number | null; seo?: false } | { unit: Unit; color: string; seoKey: keyof SeoResponse['series'][number]; seo: true };

const ratio = (n: number | null, d: number | null) => (n !== null && d !== null && d > 0 ? (n / d) * 100 : null);
const field = (k: keyof Point) => (p: Point) => p[k] as number | null;

// Where each metric's daily values come from. Keys match the tiles on the Overview.
const DEFS: Record<string, Def> = {
  sessions: { unit: 'count', color: 'var(--s1)', pick: (p, all) => (all && p.humanSessions !== null ? p.humanSessions + (p.botSessions ?? 0) : p.humanSessions) },
  botShare: { unit: 'percent', color: 'var(--s2)', pick: (p) => ratio(p.botSessions, (p.humanSessions ?? 0) + (p.botSessions ?? 0)) },
  users: { unit: 'count', color: 'var(--s1)', pick: field('users') },
  pagesPerSession: { unit: 'ratio', color: 'var(--s1)', pick: field('pagesPerSession') },
  scrollDepth: { unit: 'percent', color: 'var(--s1)', pick: field('scrollDepth') },
  activeTime: { unit: 'seconds', color: 'var(--s1)', pick: field('activeTime') },
  quickback: { unit: 'percent', color: 'var(--s2)', pick: field('quickback') },
  dead: { unit: 'percent', color: 'var(--s2)', pick: field('dead') },
  rage: { unit: 'percent', color: 'var(--s2)', pick: field('rage') },
  scriptError: { unit: 'percent', color: 'var(--s2)', pick: field('scriptError') },
  ga4Sessions: { unit: 'count', color: 'var(--s3)', pick: field('ga4Sessions') },
  ga4Users: { unit: 'count', color: 'var(--s3)', pick: field('ga4Users') },
  ga4Engagement: { unit: 'percent', color: 'var(--s3)', pick: field('ga4EngagementRate') },
  ga4KeyEvents: { unit: 'count', color: 'var(--s3)', pick: field('ga4KeyEvents') },
  orgSessions: { unit: 'count', color: 'var(--s3)', seo: true, seoKey: 'organicSessions' },
  orgShare: { unit: 'percent', color: 'var(--s3)', seo: true, seoKey: 'organicShare' },
  orgEngagement: { unit: 'percent', color: 'var(--s3)', seo: true, seoKey: 'organicEngagementRate' },
  orgNew: { unit: 'count', color: 'var(--s3)', seo: true, seoKey: 'newOrganicUsers' },
  orgKeyEvents: { unit: 'count', color: 'var(--s3)', seo: true, seoKey: 'organicKeyEvents' },
};

export default function MetricPage() {
  const { key } = useParams<{ key: string }>();
  const f = useFilters();
  const sp = useSearchParams();
  const back = `/${filterQuery(new URLSearchParams(sp.toString()))}`;
  const def = DEFS[key];
  // The newer GA4 cards (a channel, an event, a page...) have no entry above: they come from the cards endpoint.
  const isCard = !def;
  const overview = useApiData<Overview>(def && !def.seo ? `/dashboard/overview?${f.rangeQs}&traffic=${f.traffic}&threshold=${f.threshold}` : null);
  const seo = useApiData<SeoResponse>(def?.seo ? `/dashboard/seo?${f.rangeQs}` : null);
  const cards = useApiData<Ga4CardsResponse>(isCard ? `/dashboard/ga4-cards?${f.rangeQs}&keys=${encodeURIComponent(key)}&only=1` : null);
  const loaded = isCard ? cards : def?.seo ? seo : overview;
  const data = loaded.data;

  const tile: Tile | undefined = isCard ? cards.data?.tiles.find((t) => t.key === key) : def?.seo ? seo.data?.tiles.find((t) => t.key === key) : overview.data?.tiles.find((t) => t.key === key);
  const unit: Unit = tile?.unit ?? def?.unit ?? 'count';
  const color = def?.color ?? 'var(--s3)';
  const points: Day[] = isCard
    ? (cards.data?.dates ?? []).map((date, i) => ({ date, v: cards.data?.series[key]?.[i] ?? null }))
    : !data || !def ? [] : def.seo
      ? (seo.data?.series ?? []).map((p) => ({ date: p.date, v: p[def.seoKey] as number | null }))
      : (overview.data?.series ?? []).map((p) => ({ date: p.date, v: def.pick(p, f.traffic === 'all') }));
  const values = points.map((p) => p.v as number | null).filter((v): v is number => v !== null);
  const high = values.length ? Math.max(...values) : null;
  const low = values.length ? Math.min(...values) : null;
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const dateOf = (v: number | null) => points.find((p) => p.v === v)?.date as string | undefined;
  const coverage = isCard ? undefined : def?.seo ? seo.data?.coverage : overview.data?.coverage;
  const compareLabel = COMPARE_MODES.find((m) => m.id === f.range.compareMode)?.label ?? 'Previous period';
  const prev = isCard && f.compare && cards.data?.previousSeries[key]
    ? { label: compareLabel, values: cards.data.previousSeries[key] }
    : key === 'sessions' && f.compare && f.traffic === 'human' && overview.data ? { label: compareLabel, values: overview.data.previousSessions } : undefined;

  return (
    <AnalyticsPage>
      <p style={{ margin: '0 0 8px' }}><Link href={back}>← Overview</Link></p>
      {isCard && data && !tile && <div className="empty"><b>No data for this card in this range</b>Nothing is stored for it yet, or it did not happen in these dates. <Link href={back}>Back to the Overview</Link>.</div>}
      {loaded.error && !data && <ErrorState message={loaded.error} onRetry={loaded.reload} />}
      {!data && !loaded.error && <PageSkeleton />}
      {data && tile && (
        <div style={{ opacity: loaded.loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div className="page-head"><h1>{tile.label}</h1><p>{tile.help}</p></div>
          <div className="metric-hero">
            <span className="metric-big">{formatValue(tile.value, tile.unit)}</span>
            <Delta change={tile.change} trend={tile.trend} />
            {tile.previous !== null && <span className="muted">before: {formatValue(tile.previous, tile.unit)}</span>}
          </div>
          {coverage && <CoverageNotice current={coverage.current} previous={coverage.previous} />}
          <TrendChart
            title={/per day/i.test(tile.label) ? tile.label : `${tile.label}, per day`} unit={unit} height={340} points={points as never}
            markers={overview.data?.annotations ?? seo.data?.annotations ?? []} prev={prev}
            series={[{ key: 'v', label: tile.label, color }]}
          />
          <div className="tiles" style={{ marginTop: 16 }}>
            {[['Highest day', high], ['Lowest day', low], ['Daily average', avg]].map(([label, v]) => (
              <div className="tile" key={label as string}>
                <div className="tile-top"><span>{label}</span></div>
                <div className="tile-value">{formatValue(v as number | null, unit)}</div>
                {label !== 'Daily average' && <div className="prev">{dateOf(v as number | null) ?? ''}</div>}
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 12 }}>Use “View as table” on the chart for every day’s value. The range and filters at the top change this chart too.</p>
        </div>
      )}
    </AnalyticsPage>
  );
}
