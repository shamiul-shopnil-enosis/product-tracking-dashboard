'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { Guide, Hint } from '@/components/Hint';
import { G } from '@/lib/glossary';
import { PageSkeleton } from '@/components/Skeleton';
import { ShareDonut } from '@/components/ShareDonut';
import { TrendChart } from '@/components/TrendChart';
import { formatChange, formatValue, type Breakdown, type Ga4ChannelsResponse } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { useApiData } from '@/lib/useApi';
import { PageHead } from '@/components/PageHead';

const DIMENSIONS = [
  { value: 'channel', label: 'Channel' }, { value: 'source', label: 'Source' }, { value: 'country', label: 'Country' },
  { value: 'device', label: 'Device' }, { value: 'os', label: 'Operating system' },
];
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
const name = (v: string) => (v === '' ? '(none)' : v);

export default function TrafficPage() {
  const [source, setSource] = useState<'clarity' | 'ga4'>('clarity');
  return (
    <AnalyticsPage>
      <PageHead title="Traffic and sources" more="Use this page to see which channels bring visitors and whether they stay. “Channel” is the kind of source (search, direct, social, referral); pick Source, Country, Device or Operating system to slice the same visits another way. Two tools are available: Clarity shows how real people behave, GA4 shows the largest picture including where visits start.">Where visitors come from and what they use.</PageHead>
      <div className="row" role="group" aria-label="Data source" style={{ marginBottom: 8 }}>
        <span className="muted">Data from</span>
        <div className="seg">
          <button aria-pressed={source === 'clarity'} onClick={() => setSource('clarity')}>Clarity (human visitors)</button>
          <button aria-pressed={source === 'ga4'} onClick={() => setSource('ga4')}>Google Analytics (GA4)</button>
        </div>
      </div>
      {source === 'clarity' ? <ClarityTraffic /> : <Ga4Traffic />}
    </AnalyticsPage>
  );
}

function Ga4Traffic() {
  const { rangeQs } = useFilters();
  const { data, error, loading, reload } = useApiData<Ga4ChannelsResponse>(`/dashboard/ga4-channels?${rangeQs}`);
  const max = data ? Math.max(1, ...data.rows.map((r) => r.share ?? 0)) : 1;
  return (
    <>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton variant="table" />}
      {data && !data.connected && (
        <div className="notice">GA4 is not connected yet, or has no stored days. An admin can connect it under <Link href="/admin/data">Data sources</Link>.</div>
      )}
      {data && data.connected && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />
          <TrendChart title="Sessions per day by channel (top 4, GA4)" hint="One line per channel: visits per day. A line that rises sharply while engagement stays low often means automated traffic." unit="count" points={data.chart.points} markers={data.annotations}
            series={data.chart.series.map((s, i) => ({ key: s.id, label: s.label, color: COLORS[i] }))} />
          <ShareDonut rows={data.rows} />
          <h2>Channels</h2>
          <Hint>Every channel in the range, biggest first. “Direct” means GA4 could not tell where the visit came from (typed address, bookmark, or automated visits with no referrer).</Hint>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Channel</th><th className="num">Sessions</th><th>Share</th><th className="num">Per day vs before</th><th className="num">Engagement rate</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name || '(not set)'}</td>
                    <td className="num">{formatValue(r.sessions, 'count')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="bar" style={{ width: `${((r.share ?? 0) / max) * 80}px` }} aria-hidden />{formatValue(r.share, 'percent')}</td>
                    <td className="num">{formatChange(r.change)}</td>
                    <td className="num">{formatValue(r.engagementRate, 'percent')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Guide items={[G.sessions, G.share, G.change, G.engagement]} />
          <p className="muted">
            {data.notes.source} Engagement rate is the share of sessions that lasted over 10 seconds, had a key event or had two or more page views; a very low rate on a large channel is a sign of automated visits. Source, country, device and operating system breakdowns come from Clarity only.
          </p>
        </div>
      )}
    </>
  );
}

function ClarityTraffic() {
  const { rangeQs } = useFilters();
  const [dimension, setDimension] = useState('channel');
  const { data, error, loading, reload } = useApiData<Breakdown>(`/dashboard/breakdown?dimension=${dimension}&${rangeQs}`);
  const max = data ? Math.max(1, ...data.rows.map((r) => r.share ?? 0)) : 1;

  return (
    <>
      <Hint>Clarity, human visits only. Pick how to slice the visits with the tabs: <b>Channel</b> = kind of source, <b>Source</b> = the specific site or app, <b>Country</b>, <b>Device</b> (desktop, mobile, tablet) and <b>Operating system</b>. Each row also shows how much of its traffic was bots.</Hint>
      <div className="tabs" role="tablist" aria-label="Break down by">
        {DIMENSIONS.map((d) => (
          <button key={d.value} role="tab" aria-selected={d.value === dimension} className={d.value === dimension ? 'primary' : undefined} onClick={() => setDimension(d.value)}>{d.label}</button>
        ))}
      </div>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton variant="table" />}
      {data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />
          {data.chart.series.length > 0 && (
            <TrendChart title={`Human sessions per day by ${data.label.toLowerCase()} (top ${data.chart.series.length})`} unit="count" points={data.chart.points} markers={data.annotations}
              hint="One line per value: human visits per day. Use it to spot a source that is growing, shrinking or spiking." series={data.chart.series.map((s, i) => ({ key: s.id, label: name(s.label), color: COLORS[i] }))} />
          )}
          {data.rows.length > 0 && (
            <>
              <h2>{data.label}</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{data.label}</th><th className="num">Sessions</th><th>Share</th><th className="num">Per day vs before</th>
                      <th className="num">Bot share</th><th className="num">Pages / session</th><th className="num">Scroll</th><th className="num">Active time</th><th className="num">Quick backs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.value}>
                        <td>{name(r.value)}</td>
                        <td className="num">{formatValue(r.humanSessions, 'count')}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><span className="bar" style={{ width: `${((r.share ?? 0) / max) * 80}px` }} aria-hidden />{formatValue(r.share, 'percent')}</td>
                        <td className="num">{formatChange(r.change)}</td>
                        <td className="num">{formatValue(r.botShare, 'percent')}</td>
                        <td className="num">{formatValue(r.pagesPerSession, 'ratio')}</td>
                        <td className="num">{formatValue(r.scrollDepth, 'percent')}</td>
                        <td className="num">{formatValue(r.activeTime, 'seconds')}</td>
                        <td className="num">{formatValue(r.quickbackRate, 'percent')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Guide items={[G.sessions, G.share, G.change, G.botShare, G.pagesPerSession, G.scroll, G.activeTime, G.quickBacks]} />
              <p className="muted">
                Showing {data.rows.length} of {data.totalValues} values. Change compares sessions per day with data against the period before; a value with no earlier sessions shows a dash.
                {data.notes.truncated && ' Clarity hit its 1,000-row limit on some days, so rare values may be missing.'}
              </p>
            </>
          )}
          {data.rows.length === 0 && data.coverage.current.daysWithData > 0 && <div className="empty"><b>Nothing to show for this range</b>Try a longer range.</div>}
        </div>
      )}
    </>
  );
}
