'use client';

import { useMemo, useState } from 'react';
import { AnalyticsPage } from '@/components/FilterBar';
import { ErrorState } from '@/components/ErrorState';
import { HubLinks } from '@/components/HubLinks';
import { Icon } from '@/components/Icon';
import { KeyEventsBlock, LiveTile } from '@/components/OverviewBlocks';
import { PageHead } from '@/components/PageHead';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { Tip } from '@/components/Tip';
import { BASE_GROUP, GROUP_HELP, GROUP_ORDER, seoSpark } from '@/lib/cards';
import type { Ga4CardsResponse, Overview, SeoResponse, Tile as TileData } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { useLayout } from '@/lib/layout';
import { sparkFor } from '@/lib/series';
import { useApiData } from '@/lib/useApi';

type Entry = { tile: TileData; group: string; spark?: (number | null)[] };

export default function Ga4Page() {
  const f = useFilters();
  const layout = useLayout();
  const { data, error, reload } = useApiData<Overview>(`/dashboard/overview?${f.rangeQs}&traffic=${f.traffic}&threshold=${f.threshold}`);
  const seo = useApiData<SeoResponse>(`/dashboard/seo?${f.rangeQs}`).data;
  const cards = useApiData<Ga4CardsResponse>(`/dashboard/ga4-cards?${f.rangeQs}`).data;
  const [q, setQ] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);

  // Every GA4 card in one list: the original four, the search cards, and the catalogue.
  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    const seen = new Set<string>();
    const push = (e: Entry) => { if (!seen.has(e.tile.key)) { seen.add(e.tile.key); out.push(e); } };
    for (const t of data?.tiles.filter((x) => x.source === 'ga4') ?? []) push({ tile: t, group: BASE_GROUP[t.key] ?? 'Visitors', spark: sparkFor(t.key, data?.series ?? [], f.traffic) });
    for (const t of seo?.connected ? seo.tiles : []) push({ tile: t, group: BASE_GROUP[t.key] ?? 'Search', spark: seoSpark(t.key, seo) });
    for (const t of cards?.tiles ?? []) push({ tile: t, group: t.group, spark: cards?.series[t.key] });
    return out;
  }, [data, seo, cards, f.traffic]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (e: Entry) => words.every((w) => `${e.tile.label} ${e.tile.help} ${e.group}`.toLowerCase().includes(w));
  const shown = entries.filter((e) => matches(e) && (!onlyNew || !layout.has(e.tile.key)));
  const liveShown = (!words.length || words.every((w) => 'active right now live users ga4 visitors'.includes(w))) && (!onlyNew || !layout.has('live'));
  const groups = [...GROUP_ORDER, ...[...new Set(entries.map((e) => e.group))].filter((g) => !(GROUP_ORDER as readonly string[]).includes(g))];
  const onOverview = entries.filter((e) => layout.has(e.tile.key)).length;

  return (
    <AnalyticsPage quiet show={{ compare: true }}>
      <PageHead title="Google Analytics">Everything from Google Analytics (GA4): who visits, where they come from and what they do. Press + on a card to put it on your Overview.</PageHead>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <>
          {!data.ga4.connected && <div className="notice">GA4 is not connected yet, or has no stored days in this range.</div>}

          <div className="card-tools" role="search">
            <label className="field search">
              <span>Find a card</span>
              <input data-search type="search" placeholder="for example bounce, scroll, claim_link, google, mobile" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Hide cards already on my Overview
            </label>
            <p className="muted card-count" role="status">
              {shown.length + (liveShown ? 1 : 0)} of {entries.length + 1} cards{words.length > 0 && ` match “${q.trim()}”`} · {onOverview + (layout.has('live') ? 1 : 0)} on your Overview
            </p>
          </div>

          {groups.map((g) => {
            const list = shown.filter((e) => e.group === g);
            const live = g === 'Visitors' && liveShown;
            if (list.length === 0 && !live) return null;
            return (
              <details className="card-section" key={g} open>
                <summary><h2 className="eyebrow">{g} <span className="muted">· {list.length + (live ? 1 : 0)}</span> <Tip label={g}>{GROUP_HELP[g] ?? ''}</Tip></h2></summary>
                <div className="tiles">
                  {live && <LiveTile />}
                  {list.map((e) => <Tile key={e.tile.key} tile={e.tile} spark={e.spark} />)}
                </div>
              </details>
            );
          })}
          {shown.length === 0 && !liveShown && (
            <div className="empty"><b>No card matches</b>{onlyNew ? 'Every card that matches is already on your Overview. ' : ''}Try fewer words, or clear the search.</div>
          )}

          {!cards && <p className="muted" role="status"><Icon name="time" size={14} /> Loading the rest of the Google Analytics cards…</p>}
          {cards && cards.tiles.length === 0 && <p className="muted">The extra cards fill in once the new Google Analytics reports have been read (the first read takes a few minutes after an update).</p>}

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
