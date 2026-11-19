'use client';

import { AlertsCard } from '@/components/AlertsCard';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { GlanceBlock, KeyEventsBlock, LiveTile, TopFindingsBlock, TopPagesBlock } from '@/components/OverviewBlocks';
import { Tip } from '@/components/Tip';
import { MarkersPanel } from '@/components/MarkersPanel';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { TrendChart } from '@/components/TrendChart';
import { formatValue, type Overview } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { sparkFor } from '@/lib/series';
import { useApiData } from '@/lib/useApi';
import { PageHead } from '@/components/PageHead';

const GROUP_HINTS: Record<string, string> = {
  Audience: 'How many people visit. Each tile is a per-day average, with the change against the previous period.',
  Engagement: 'What visitors do once they arrive: how many pages they view, how far they scroll and how long they stay. Higher is usually better.',
  Friction: 'Signs that visitors struggled. Each number is the share of visits affected. Lower is better, so a down arrow is good news.',
  'Google Analytics': 'The same period as seen by Google Analytics. Numbers differ from Clarity because the two tools count and filter differently.',
};
const KEY_TILES = ['sessions', 'ga4Users', 'ga4Engagement', 'ga4KeyEvents'];
const GROUPS = ['Audience', 'Engagement', 'Friction', 'Google Analytics'] as const;
type Status = { clarity: { lastRunAt: string | null; lastRunStatus: string | null }; ga4: { configured: boolean; lastRunAt: string | null } };

export default function OverviewPage() {
  const f = useFilters();
  const { data, error, loading, reload } = useApiData<Overview>(`/dashboard/overview?days=${f.days}&traffic=${f.traffic}&threshold=${f.threshold}`);
  const status = useApiData<Status>('/dashboard/status').data;

  return (
    <AnalyticsPage quiet show={{ traffic: true, compare: true, threshold: true }}>
      <PageHead title="Overview">Is the product improving? The short answer, then the numbers behind it.</PageHead>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <div className="two-col" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div>
            <section className="card headcard flush" aria-label="Summary">
              <div className="block-head" style={{ marginBottom: 0 }}><span className="eyebrow" style={{ margin: 0 }}>Summary <Tip label="Summary">What changed most in the chosen range compared with the equal range just before it, in one sentence.</Tip></span></div>
              <div className="chips">
                <span className="chip">{data.range.from} to {data.range.to}</span>
                <span className="chip"><i className="dot" style={{ background: 'var(--s1)' }} />Clarity</span>
                {data.ga4.connected && <span className="chip" title={data.ga4.approximateDays.length ? `Recent days can still change: ${data.ga4.approximateDays.join(', ')}` : undefined}><i className="dot" style={{ background: 'var(--s3)' }} />GA4 · {data.ga4.daysWithData} days</span>}
                <span className="chip">{data.coverage.current.daysWithData} of {data.coverage.current.requestedDays} days</span>
                {data.coverage.current.approximateDays.length > 0 && (
                  <span className="chip" title="A 24-hour window taken after a restart, not a clean day">
                    approximate: {data.coverage.current.approximateDays.map((d) => d.slice(5)).join(', ')}
                  </span>
                )}
              </div>
              {data.headline ? <p className="headline">{data.headline}</p> : <p className="headline muted">The summary appears once there are full days to compare.</p>}
              {data.insight && <p className="insight"><b>What it means:</b> {data.insight}</p>}
            </section>
            {data.tiles.length > 0 && (
              <div className="tiles key-tiles" style={{ marginTop: 16 }}>
                <LiveTile />
                {KEY_TILES.map((k) => data.tiles.find((t) => t.key === k)).filter((t): t is NonNullable<typeof t> => !!t).map((t) => (
                  <Tile key={t.key} compact tile={t} spark={sparkFor(t.key, data.series, f.traffic)} color={t.source === 'ga4' ? 'var(--s3)' : 'var(--s1)'} />
                ))}
              </div>
            )}
            <TrendChart
              compactHint
              title={f.traffic === 'all' ? 'Sessions per day (human and bot)' : 'Human sessions per day'}
              hint={f.traffic === 'all' ? 'Each line is visits per day. Human = real people, Bot = automated programs. A big bot line means much of the traffic is not real visitors.' : 'Each point is the number of visits by real people on that day (Clarity). The dashed line is the previous period, day for day; if the solid line is above it, traffic grew. GA4 counts more because it only removes bots it recognises.'}
              unit="count" points={data.series} markers={data.annotations}
              series={f.traffic === 'all'
                ? [{ key: 'humanSessions', label: 'Human', color: 'var(--s1)' }, { key: 'botSessions', label: 'Bot', color: 'var(--s2)' }]
                : [{ key: 'humanSessions', label: 'Human sessions (Clarity)', color: 'var(--s1)' }, ...(data.ga4.connected ? [{ key: 'ga4Sessions', label: 'All sessions (GA4)', color: 'var(--s3)' }] : [])]}
              prev={f.compare && f.traffic === 'human' ? { label: 'Previous period', values: data.previousSessions } : undefined}
            />
            {data.coverage.current.daysWithData === 0 && <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />}

            <div className="blocks">
              <KeyEventsBlock days={f.days} />
              <TopPagesBlock days={f.days} />
              <TopFindingsBlock />
            </div>
            <div style={{ marginTop: 12 }}><GlanceBlock /></div>

            <details className="more" open>
              <summary>More detail</summary>
              {data.tiles.length > 0 ? (
                GROUPS.filter((g) => data.tiles.some((t) => t.group === g)).map((g) => (
                  <div key={g}>
                    <h2 className="eyebrow">{g} <Tip label={g}>{GROUP_HINTS[g]}</Tip></h2>
                    <div className="tiles">
                      {data.tiles.filter((t) => t.group === g).map((t) => (
                        <Tile key={t.key} compact tile={t} spark={sparkFor(t.key, data.series, f.traffic)} color={g === 'Friction' ? 'var(--s2)' : g === 'Google Analytics' ? 'var(--s3)' : 'var(--s1)'} />
                      ))}
                    </div>
                    {g === 'Friction' && (
                      <TrendChart
                        compactHint title="Share of sessions with friction"
                        hint="Each line is the share of that day’s visits where visitors hit that problem. Lower is better."
                        unit="percent" points={data.series} markers={data.annotations}
                        series={[
                          { key: 'quickback', label: 'Quick backs', color: 'var(--s1)' }, { key: 'dead', label: 'Dead clicks', color: 'var(--s2)' },
                          { key: 'rage', label: 'Rage clicks', color: 'var(--s3)' }, { key: 'scriptError', label: 'Script errors', color: 'var(--s4)' },
                        ]}
                      />
                    )}
                  </div>
                ))
              ) : (
                data.latest && (
                  <section className="card">
                    <h2>{data.latest.label} (latest manual refresh)</h2>
                    <p className="sub">{data.latest.note} Refreshed {new Date(data.latest.fetchedAt).toLocaleString()}.</p>
                    <div className="tiles">
                      {[
                        ['Human sessions', formatValue(data.latest.metrics.humanSessions, 'count')],
                        ['Bot share', formatValue(data.latest.botShare, 'percent')],
                        ['Visitors', formatValue(data.latest.metrics.users, 'count')],
                        ['Pages per session', formatValue(data.latest.metrics.pagesPerSession, 'ratio')],
                        ['Scroll depth', formatValue(data.latest.metrics.scrollDepth, 'percent')],
                        ['Active time per session', formatValue(data.latest.metrics.activeTime, 'seconds')],
                      ].map(([label, value]) => (
                        <div className="tile" key={label}><div className="tile-top">{label}</div><div className="tile-value">{value}</div></div>
                      ))}
                    </div>
                  </section>
                )
              )}
              {data.sourceComparison && (
                <section className="card flush" aria-label="GA4 and Clarity" style={{ marginTop: 16 }}>
                  <h2>GA4 and Clarity <Tip label="GA4 and Clarity">GA4 only removes bots it recognises; Clarity also spots bots from page behaviour. Use Clarity for how people behave and GA4 for where visits start and what they achieve.</Tip></h2>
                  <div className="kv" style={{ marginTop: 8 }}>
                    <span>GA4 sessions per day</span><span className="num">{formatValue(data.sourceComparison.ga4SessionsPerDay, 'count')}</span>
                    <span>Clarity human</span><span className="num">{formatValue(data.sourceComparison.clarityHumanSessionsPerDay, 'count')}</span>
                    <span>Clarity human and bot</span><span className="num">{formatValue(data.sourceComparison.clarityAllSessionsPerDay, 'count')}</span>
                  </div>
                </section>
              )}
              <MarkersPanel markers={data.annotations} onChanged={reload} />
            </details>
          </div>

          <div className="rail">
            <AlertsCard alerts={data.alerts} />
            <section className="card flush" aria-label="Data health">
              <h2>Data health <Tip label="Data health">Is the data complete and fresh? Missing or approximate days make comparisons less reliable.</Tip></h2>
              <div className="kv" style={{ marginTop: 8 }}>
                <span>Days stored</span><span className="num">{data.coverage.current.daysWithData} of {data.coverage.current.requestedDays}</span>
                <span>Last sync</span><span className="num">{status?.clarity.lastRunAt ? new Date(status.clarity.lastRunAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '–'}</span>
              </div>
            </section>
          </div>
        </div>
      )}
    </AnalyticsPage>
  );
}
