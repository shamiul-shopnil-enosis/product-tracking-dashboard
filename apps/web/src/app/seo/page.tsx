'use client';

import Link from 'next/link';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { Guide, Hint } from '@/components/Hint';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { Tip } from '@/components/Tip';
import { TrendChart } from '@/components/TrendChart';
import { formatChange, formatValue, type SeoResponse } from '@/lib/dashboard';
import { G } from '@/lib/glossary';
import { useFilters } from '@/lib/filters';
import { useApiData } from '@/lib/useApi';

const SPARK_KEY: Record<string, 'organicSessions'> = { orgSessions: 'organicSessions' };

export default function SeoPage() {
  const { rangeQs } = useFilters();
  const { data, error, loading, reload } = useApiData<SeoResponse>(`/dashboard/seo?${rangeQs}`);
  return (
    <AnalyticsPage>
      <div className="page-head">
        <h1>SEO <Tip label="SEO from GA4">Everything here is measured with Google Analytics: how many visits search engines send and what those visitors do. It cannot show which words people typed, where pages rank, how often the site appeared in results, or page speed. Those need Google Search Console.</Tip></h1>
        <p>How much traffic comes from search engines, and whether it is growing.</p>
      </div>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton variant="table" />}
      {data && !data.connected && (
        <div className="notice">No organic search data stored yet. GA4 reads it after the next sync, and an admin can start one under <Link href="/admin/data">Data sources</Link>.</div>
      )}
      {data && data.connected && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />
          <div className="tiles key-tiles">
            {data.tiles.map((t) => (
              <Tile key={t.key} tile={t} color="var(--s3)" spark={SPARK_KEY[t.key] ? data.series.map((p) => p[SPARK_KEY[t.key]]) : undefined} />
            ))}
          </div>
          <TrendChart
            compactHint title="Organic sessions per day"
            hint="Visits per day that arrived from a search engine result. A line that climbs means search is sending more people."
            unit="count" points={data.series} markers={data.annotations}
            series={[{ key: 'organicSessions', label: 'Organic sessions (GA4)', color: 'var(--s3)' }]}
          />

          <h2>Search engines <Tip label="Search engines">Which search engine sent the visits. Google is usually the largest. “(other)” adds up the small ones.</Tip></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Search engine</th><th className="num">Sessions</th><th className="num">Share</th><th className="num">Per day vs before</th><th className="num">Engagement rate</th></tr></thead>
              <tbody>
                {data.engines.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name || '(not set)'}</td><td className="num">{formatValue(r.sessions, 'count')}</td><td className="num">{formatValue(r.share, 'percent')}</td>
                    <td className="num">{formatChange(r.change)}</td><td className="num">{formatValue(r.engagementRate, 'percent')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Pages that bring search visitors <Tip label="Organic landing pages">The first page a visitor saw after clicking a search result. Pages near the top are the ones search engines send people to. It shows visits, not ranking position.</Tip></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Landing page</th><th className="num">Sessions</th><th className="num">Share</th><th className="num">Per day vs before</th><th className="num">Engagement rate</th></tr></thead>
              <tbody>
                {data.landing.map((r) => (
                  <tr key={r.page}>
                    <td style={{ wordBreak: 'break-all', minWidth: 180 }}>{r.page || '(not set)'}</td><td className="num">{formatValue(r.sessions, 'count')}</td>
                    <td className="num">{formatValue(r.share, 'percent')}</td><td className="num">{formatChange(r.change)}</td><td className="num">{formatValue(r.engagementRate, 'percent')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Guide items={[G.sessions, G.share, G.change, G.engagement]} />
          <Hint>{data.notes.source}</Hint>
        </div>
      )}
    </AnalyticsPage>
  );
}
