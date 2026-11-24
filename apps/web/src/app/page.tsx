'use client';

import { AlertsCard } from '@/components/AlertsCard';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { KeyEventsBlock, LiveTile, TopFindingsBlock, TopPagesBlock } from '@/components/OverviewBlocks';
import { Tip } from '@/components/Tip';
import { MarkersPanel } from '@/components/MarkersPanel';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { TrendChart } from '@/components/TrendChart';
import { formatValue, type Ga4CardsResponse, type Overview, type SeoResponse } from '@/lib/dashboard';
import { seoSpark } from '@/lib/cards';
import { useLayout } from '@/lib/layout';
import { useFilters } from '@/lib/filters';
import { sparkFor } from '@/lib/series';
import { useApiData } from '@/lib/useApi';
import { PageHead } from '@/components/PageHead';
import { fmtDate, fmtDateTime } from '@/lib/date';
import { COMPARE_MODES } from '@/lib/range';
import { DismissibleAlert } from '@/components/DismissibleAlert';
import { SourceIcon } from '@/components/SourceIcon';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { downloadOverviewPdf, type ReportCard } from '@/lib/overviewReport';
import { compareText } from '@/lib/range';
import { useSiteName } from '@/lib/site';

type Status = { clarity: { lastRunAt: string | null; lastRunStatus: string | null }; ga4: { configured: boolean; lastRunAt: string | null } };

export default function OverviewPage() {
  const f = useFilters();
  const [alertHidden, setAlertHidden] = useState(false);
  const layout = useLayout();
  const { user } = useAuth();
  const siteName = useSiteName();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const seo = useApiData<SeoResponse>(`/dashboard/seo?${f.rangeQs}`).data;
  // Cards the person added from the Google Analytics page that the Overview report does not carry (a channel, an event, a page...)
  const cardKeys = layout.cards.filter((k) => k !== 'live').join(',');
  const extra = useApiData<Ga4CardsResponse>(cardKeys ? `/dashboard/ga4-cards?${f.rangeQs}&only=1&keys=${encodeURIComponent(cardKeys)}` : null).data;
  const { data, error, loading, reload } = useApiData<Overview>(`/dashboard/overview?${f.rangeQs}&traffic=${f.traffic}&threshold=${f.threshold}`);
  const status = useApiData<Status>('/dashboard/status').data;
  // The orange alert appears only when something got worse by a noticeable amount.
  const showAlert = !!data && f.compare && !!data.headline && data.alerts.items.some((i) => i.trend === 'worse');
  // The cards this person chose, in their order. A card whose data is not there yet is simply skipped.
  const cards = layout.cards.map((key) => {
    if (key === 'live') return <LiveTile key="live" />;
    const t = data?.tiles.find((x) => x.key === key);
    if (t) return <Tile key={key} tile={t} spark={sparkFor(key, data?.series ?? [], f.traffic)} />;
    const st = seo?.connected ? seo.tiles.find((x) => x.key === key) : undefined;
    if (st) return <Tile key={key} tile={st} spark={seoSpark(key, seo)} />;
    const ct = extra?.tiles.find((x) => x.key === key);
    if (ct) return <Tile key={key} tile={ct} spark={extra?.series[key]} />;
    return null;
  });

  /** A PDF of what is on screen: this person's cards, the chosen dates and comparison, Needs attention and the sessions chart. */
  async function exportPdf() {
    if (!data) return;
    setExporting(true); setExportError('');
    try {
      const reportCards: ReportCard[] = [];
      for (const key of layout.cards) {
        if (key === 'live') {
          const live = await api<{ available: boolean; activeUsers?: number; windowMinutes?: number }>('/dashboard/ga4-realtime').catch(() => null);
          if (live?.available && live.activeUsers !== undefined) reportCards.push({ label: 'Active right now', source: 'ga4', value: formatValue(live.activeUsers, 'count'), change: null, trend: 'unknown', before: null });
          continue;
        }
        const t = data.tiles.find((x) => x.key === key) ?? (seo?.connected ? seo.tiles.find((x) => x.key === key) : undefined) ?? extra?.tiles.find((x) => x.key === key);
        if (t) reportCards.push({ label: t.label.replace(/\s*\((GA4|Clarity)\)$/i, ''), source: t.source, value: formatValue(t.value, t.unit), change: t.change, trend: t.trend, before: t.previous !== null ? formatValue(t.previous, t.unit) : null });
      }
      await downloadOverviewPdf({
        siteName, from: data.range.from, to: data.range.to, compare: f.compare, compareText: compareText(f.range), traffic: f.traffic, threshold: f.threshold,
        generatedBy: user?.name ?? 'you', headline: data.headline, insight: data.insight, cards: reportCards, alerts: data.alerts.items,
        chart: {
          title: f.traffic === 'all' ? 'Sessions per day (human and bot)' : 'Human sessions per day',
          dates: data.series.map((p) => p.date),
          values: f.traffic === 'all' ? data.series.map((p) => (p.humanSessions === null ? null : p.humanSessions + (p.botSessions ?? 0))) : data.series.map((p) => p.humanSessions),
          previous: f.compare && f.traffic === 'human' ? { label: COMPARE_MODES.find((m) => m.id === f.range.compareMode)?.label ?? 'Previous period', values: data.previousSessions } : undefined,
        },
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not make the PDF');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AnalyticsPage quiet show={{ traffic: true, compare: true, threshold: true }}>
      <PageHead title="Overview" actions={data && (
        <button type="button" onClick={exportPdf} disabled={exporting}><Icon name="download" size={15} />{exporting ? 'Making the PDF…' : 'Export PDF'}</button>
      )}>Is the product improving? The short answer, then the numbers behind it.</PageHead>
      {exportError && <p className="error" role="alert">{exportError}</p>}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <div className="two-col" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div>
            <section className="card headcard flush" aria-label="Summary">
              <div className="block-head" style={{ marginBottom: 0 }}><span className="eyebrow" style={{ margin: 0 }}>Summary <Tip label="Summary">What changed most in the chosen range compared with the equal range just before it, in one sentence.</Tip></span></div>
              <div className="chips">
                <span className="chip">{fmtDate(data.range.from)} to {fmtDate(data.range.to)}</span>
                <span className="chip"><SourceIcon source="clarity" size={14} />Clarity</span>
                {data.ga4.connected && <span className="chip" title={data.ga4.approximateDays.length ? `Recent days can still change: ${data.ga4.approximateDays.join(', ')}` : undefined}><SourceIcon source="ga4" size={14} />GA4 · {data.ga4.daysWithData} days</span>}
              </div>
              {!f.compare ? <p className="headline muted">Comparison is off. Turn on Compare in the date picker to see what changed.</p>
                : !data.headline ? <p className="headline muted">The summary appears once there are full days to compare.</p>
                : showAlert && !alertHidden ? null
                : <p className="headline">{data.headline}</p>}
              {f.compare && data.insight && <p className="insight"><b>What it means:</b> {data.insight}</p>}
            </section>
            {showAlert && (
              <DismissibleAlert id="overview-headline" signature={`${data.headline}|${data.range.from}|${data.range.to}|${data.range.previousFrom}|${data.range.previousTo}`} onHidden={setAlertHidden}>
                <b>Worth a look.</b> {data.headline}
              </DismissibleAlert>
            )}
            {data.tiles.length > 0 && (
              <>
                {layout.cards.length > 0 ? <div className="tiles" style={{ marginTop: 16 }}>{cards}</div> : (
                  <div className="empty" style={{ marginTop: 16 }}><b>Your dashboard is empty</b>Open Google Analytics or Clarity in the sidebar and press + on the cards you want here.</div>
                )}
                <p className="muted dash-foot">
                  {layout.isDefault ? 'This is the standard view. Press + on any card in the sidebar pages to add it here.' : 'This is your own view.'}
                  {!layout.isDefault && <> <button type="button" className="linkish" onClick={layout.reset}>Go back to the standard view</button></>}
                  {layout.error && <span className="error" role="alert"> {layout.error}</span>}
                </p>
              </>
            )}
            <TrendChart
              compactHint
              title={f.traffic === 'all' ? 'Sessions per day (human and bot)' : 'Human sessions per day'}
              hint={f.traffic === 'all' ? 'Each line is visits per day. Human = real people, Bot = automated programs. A big bot line means much of the traffic is not real visitors.' : 'Each point is the number of visits by real people on that day (Clarity). The dashed line is the previous period, day for day; if the solid line is above it, traffic grew. GA4 counts more because it only removes bots it recognises.'}
              unit="count" points={data.series} markers={data.annotations}
              series={f.traffic === 'all'
                ? [{ key: 'humanSessions', label: 'Human', color: 'var(--s1)' }, { key: 'botSessions', label: 'Bot', color: 'var(--s2)' }]
                : [{ key: 'humanSessions', label: 'Human sessions (Clarity)', color: 'var(--s1)' }, ...(data.ga4.connected ? [{ key: 'ga4Sessions', label: 'All sessions (GA4)', color: 'var(--s3)' }] : [])]}
              prev={f.compare && f.traffic === 'human' ? { label: COMPARE_MODES.find((m) => m.id === f.range.compareMode)?.label ?? 'Previous period', values: data.previousSessions } : undefined}
            />
            {data.coverage.current.daysWithData === 0 && <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />}

            <div className="blocks">
              <KeyEventsBlock qs={f.rangeQs} />
              <TopPagesBlock qs={f.rangeQs} />
              <TopFindingsBlock />
            </div>
            {data.tiles.length === 0 && data.latest && (
              <section className="card" style={{ marginTop: 16 }}>
                <h2>{data.latest.label} (latest manual refresh)</h2>
                <p className="sub">{data.latest.note} Refreshed {fmtDateTime(data.latest.fetchedAt)}.</p>
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
            )}
            <div style={{ marginTop: 16 }}><MarkersPanel markers={data.annotations} onChanged={reload} /></div>
          </div>

          <div className="rail">
            {f.compare && <AlertsCard alerts={data.alerts} />}
            <section className="card flush" aria-label="Data health">
              <h2>Data health <Tip label="Data health">Is the data complete and fresh? Missing or approximate days make comparisons less reliable.</Tip></h2>
              <div className="kv" style={{ marginTop: 8 }}>
                <span>Days stored</span><span className="num">{data.coverage.current.daysWithData} of {data.coverage.current.requestedDays}</span>
                <span>Last sync</span><span className="num">{status?.clarity.lastRunAt ? fmtDateTime(status.clarity.lastRunAt) : '–'}</span>
                {data.coverage.current.approximateDays.length > 0 && (
                  <><span title="A 24-hour window taken after a restart, not a clean day">Approximate days</span><span className="num">{data.coverage.current.approximateDays.map((d) => fmtDate(d)).join(', ')}</span></>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </AnalyticsPage>
  );
}
