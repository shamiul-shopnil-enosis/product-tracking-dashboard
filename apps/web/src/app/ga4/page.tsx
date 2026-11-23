'use client';

import { AnalyticsPage } from '@/components/FilterBar';
import { ErrorState } from '@/components/ErrorState';
import { HubLinks } from '@/components/HubLinks';
import { KeyEventsBlock, LiveTile } from '@/components/OverviewBlocks';
import { PageHead } from '@/components/PageHead';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { Tip } from '@/components/Tip';
import type { Overview, SeoResponse } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { sparkFor } from '@/lib/series';
import { useApiData } from '@/lib/useApi';

export default function Ga4Page() {
  const f = useFilters();
  const { data, error, reload } = useApiData<Overview>(`/dashboard/overview?${f.rangeQs}&traffic=${f.traffic}&threshold=${f.threshold}`);
  const seo = useApiData<SeoResponse>(`/dashboard/seo?${f.rangeQs}`).data;
  const ga4Tiles = data?.tiles.filter((t) => t.source === 'ga4') ?? [];
  const searchTiles = seo?.connected ? seo.tiles : [];
  return (
    <AnalyticsPage quiet show={{ compare: true }}>
      <PageHead title="Google Analytics">Everything from Google Analytics (GA4): who visits, where they come from and what they do. Press + on a card to put it on your Overview.</PageHead>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <>
          {!data.ga4.connected && <div className="notice">GA4 is not connected yet, or has no stored days in this range.</div>}
          {ga4Tiles.length > 0 && (
            <section>
              <h2 className="eyebrow">Visitors and engagement <Tip label="Visitors and engagement">The same period as seen by Google Analytics. Numbers differ from Clarity because the two tools count and filter differently.</Tip></h2>
              <div className="tiles"><LiveTile />{ga4Tiles.map((t) => <Tile key={t.key} tile={t} spark={sparkFor(t.key, data.series, f.traffic)} />)}</div>
            </section>
          )}
          {searchTiles.length > 0 && (
            <section>
              <h2 className="eyebrow">Search <Tip label="Search">Visits that came from search engines, which is the number SEO work should move.</Tip></h2>
              <div className="tiles">{searchTiles.map((t) => <Tile key={t.key} tile={t} spark={t.key === 'orgSessions' ? seo!.series.map((p) => p.organicSessions) : undefined} />)}</div>
            </section>
          )}
          <div className="blocks" style={{ marginTop: 16 }}><KeyEventsBlock qs={f.rangeQs} /></div>
          <h2 className="eyebrow">Go deeper</h2>
          <HubLinks links={[
            { href: '/traffic', label: 'Traffic', text: 'Where visits come from: channels, sources, devices', icon: 'traffic' },
            { href: '/pages', label: 'Pages', text: 'Which pages get visits and where visits start', icon: 'pages' },
            { href: '/seo', label: 'SEO', text: 'Visits from search engines and the pages they land on', icon: 'seo' },
            { href: '/audience', label: 'Audience', text: 'Countries, cities, devices and languages', icon: 'audience' },
          ]} />
        </>
      )}
    </AnalyticsPage>
  );
}
